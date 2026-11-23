import { readdir, readFile, stat } from 'node:fs/promises'
import { createServer, type ServerResponse } from 'node:http'
import { basename, join, relative, resolve } from 'node:path'
import { JSDOM } from 'jsdom'
import { loadRepository, website, type Subscription } from '../src/repository'
import { parseFeed } from '../src/rss'
import type { IndexedSearchResponse } from '../src/indexed-search'
import { createFeedFetcher } from './feed-fetch'
import { createSearchIndex } from './search'

const defaultFeed = 'https://feeds.npr.org/510289/podcast.xml'

async function scan(root: string) {
  const paths: string[] = []
  async function visit(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile() && (/\.mdx?$/i.test(entry.name) ||
        (directory === root && ['mndsite.yaml', 'feeds.yaml'].includes(entry.name)))) paths.push(path)
    }
  }
  await visit(root)
  paths.sort()
  const files = await Promise.all(paths.map(async path => {
    const file = await stat(path)
    return [relative(root, path).replaceAll('\\', '/'), file.size, file.mtimeMs, file.ctimeMs] as const
  }))
  return { paths: files.map(([path]) => path), stamp: JSON.stringify(files) }
}

function json(response: ServerResponse, status: number, data: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(data))
}

export async function startApi(port: number, host = '127.0.0.1') {
  const exampleRoot = resolve('example-workspace')
  const root = resolve(process.env.TRENDLY_INDEX_ROOT || exampleRoot)
  const workspace = root === exampleRoot ? 'example' : 'configured'
  const approvedFeed = website(process.env.TRENDLY_INDEX_FEED || defaultFeed)
  if (!approvedFeed) throw new Error('TRENDLY_INDEX_FEED must be an absolute HTTP or HTTPS URL.')
  const index = createSearchIndex(process.env.TRENDLY_INDEX_DB || '.trendly/search.sqlite')
  const { window } = new JSDOM()
  const parser = new window.DOMParser()
  const fetchFeed = createFeedFetcher(approvedFeed)
  let stamp: string | undefined
  let feed: Subscription | undefined
  let feedReady = false
  let nextFeedRefresh = 0
  let scanError = ''
  let feedError = ''
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let indexingFeed: Promise<void> | undefined
  let checking: Promise<void> | undefined

  async function refreshPosts() {
    try {
      const files = await scan(root)
      if (files.stamp === stamp || stopped) return
      const snapshot = await loadRepository({
        source: 'checkout', label: basename(root), paths: () => files.paths,
        read: path => readFile(join(root, path), 'utf8'), asset: () => undefined,
      })
      if (stopped) return
      index.replace('posts', snapshot.posts.filter(post => !post.draft).map(post => ({ ...post, site: post.site || snapshot.title })))
      const subscribed = snapshot.subscriptions.find(subscription => subscription.url === approvedFeed)
      if (!subscribed || !feed || subscribed.name !== feed.name) {
        index.replace('feeds', [])
        feedReady = false
        nextFeedRefresh = 0
        feed = subscribed
      }
      stamp = files.stamp
      scanError = ''
    } catch (error) {
      if (scanError !== String(error)) console.error('Could not index posts:', error)
      scanError = String(error)
    }
  }

  async function refreshFeed(subscription: Subscription) {
    try {
      const body = await fetchFeed()
      if (stopped || feed !== subscription) return
      const { entries } = parseFeed(body, subscription, window.document, parser)
      index.replace('feeds', entries.map(entry => ({ ...entry, origin: subscription.name })))
      feedReady = true
      nextFeedRefresh = Date.now() + 5 * 60 * 1000
      feedError = ''
    } catch (error) {
      if (feed !== subscription) return
      if (feedError !== String(error)) console.error('Could not index the approved subscription:', error)
      feedError = String(error)
      nextFeedRefresh = Date.now() + 30 * 1000
    }
  }

  function schedule() {
    checking = refreshPosts().then(() => {
      if (stopped) return
      if (feed && !indexingFeed && Date.now() >= nextFeedRefresh) {
        indexingFeed = refreshFeed(feed).finally(() => { indexingFeed = undefined })
      }
      timer = setTimeout(schedule, 2000)
    })
  }

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost')
      if (!['/api/search', '/api/feed'].includes(url.pathname)) return json(response, 404, { error: 'Not found.' })
      if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET')
        return json(response, 405, { error: 'Use GET.' })
      }
      if (url.pathname === '/api/feed') {
        if (url.searchParams.get('url') !== approvedFeed || !feed) return json(response, 403, { error: 'Feed is not approved.' })
        try {
          const body = await fetchFeed()
          response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' })
          response.end(body)
        } catch {
          json(response, 502, { error: 'The approved feed is temporarily unavailable.' })
        }
        return
      }
      const scope = url.searchParams.get('scope') ?? 'posts'
      if (scope !== 'posts' && scope !== 'feeds') return json(response, 400, { error: 'Choose posts or feeds.' })
      const ready = scope === 'posts' ? stamp !== undefined : feedReady
      const result: IndexedSearchResponse = {
        workspace, ready, feedUrl: feed?.url, results: ready ? index.search(scope, url.searchParams) : [],
      }
      json(response, 200, result)
    } catch (error) {
      console.error('Search API request failed:', error)
      json(response, 500, { error: 'The index could not serve this request.' })
    }
  })

  try {
    await new Promise<void>((done, fail) => {
      server.once('error', fail)
      server.listen(port, host, () => {
        server.removeListener('error', fail)
        done()
      })
    })
  } catch (error) {
    index.close()
    window.close()
    throw error
  }
  schedule()
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('The API did not bind to a TCP port.')
  return {
    port: address.port,
    async close() {
      stopped = true
      clearTimeout(timer)
      await Promise.all([new Promise<void>(done => server.close(() => done())), checking, indexingFeed])
      index.close()
      window.close()
    },
  }
}
