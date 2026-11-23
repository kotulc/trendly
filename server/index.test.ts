import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { JSDOM } from 'jsdom'
import type { IndexedSearchResponse } from '../src/indexed-search'
import { parseFeed } from '../src/rss'
import { startApi } from './index'

const jsonFeed = JSON.stringify({
  version: 'https://jsonfeed.org/version/1.1', title: 'Fixture',
  items: [{
    id: 'podcast', title: 'Celestial podcast', url: '/episode', tags: ['Astronomy'],
    content_html: '<p>Neptune and stars</p><script>doNotIndex</script>',
    date_published: '2026-01-04T12:00:00Z',
    attachments: [{ url: '/episode.mp3', mime_type: 'audio/mpeg' }, { url: '/bonus.mp3', mime_type: 'audio/mpeg' }],
  }, { id: 'podcast', content_text: 'Duplicate' }],
})

test('JSON Feed joins RSS and Atom in the shared reader', () => {
  const { window } = new JSDOM()
  const feed = { name: 'Fixture', url: 'https://example.org/feed.json' }
  const parse = (raw: string) => parseFeed(raw, feed, window.document, new window.DOMParser())
  try {
    const json = parse(jsonFeed)
    assert.equal(json.format, 'json')
    assert.equal(json.entries.length, 1)
    const [entry] = json.entries
    assert.equal(entry.id, `${feed.url}#podcast`)
    assert.equal(entry.body, 'Neptune and stars')
    assert.equal(entry.sources[0].audio_url, 'https://example.org/episode.mp3')
    assert.equal(entry.sources[1].audio_url, 'https://example.org/bonus.mp3')
    assert.deepEqual(entry.facets?.[0].values, ['astronomy'])
    assert.equal(parse('<rss><channel><item><title>RSS</title></item></channel></rss>').format, 'rss')
    assert.equal(parse('<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom</title></entry></feed>').format, 'atom')
    assert.throws(() => parse('{"items":[]}'), /not a supported JSON Feed/)
  } finally {
    window.close()
  }
})

test('the API refreshes edited posts and removes unpublished posts and unsubscribed items', async () => {
  const temporaryRoot = await realpath(tmpdir())
  const directory = await mkdtemp(join(temporaryRoot, 'trendly-index-'))
  const fixture = createServer((_request, response) => response.end(jsonFeed))
  let api: Awaited<ReturnType<typeof startApi>> | undefined
  try {
    await new Promise<void>(done => fixture.listen(0, '127.0.0.1', done))
    const address = fixture.address()
    assert.ok(address && typeof address !== 'string')
    const feedUrl = `http://127.0.0.1:${address.port}/feed.json`
    const configPath = join(directory, 'mndsite.yaml')
    const feedsPath = join(directory, 'feeds.yaml')
    const postPath = join(directory, 'content', 'post.md')
    await mkdir(join(directory, 'content'))
    await writeFile(configPath, 'title: Index fixture\ncontent: content\n')
    await writeFile(feedsPath, `feeds:\n  - url: ${feedUrl}\n`)
    await writeFile(postPath, '---\ntitle: Original comet\n---\nThis comet is visible.')
    process.env.TRENDLY_INDEX_ROOT = directory
    process.env.TRENDLY_INDEX_FEED = feedUrl
    process.env.TRENDLY_INDEX_DB = join(directory, 'index.sqlite')
    api = await startApi(0)
    const endpoint = `http://127.0.0.1:${api.port}/api/`
    async function search(params: string) {
      const response = await fetch(`${endpoint}search?${params}`)
      assert.equal(response.status, 200)
      return await response.json() as IndexedSearchResponse
    }
    async function until(condition: () => Promise<boolean>) {
      for (let attempt = 0; attempt < 80; attempt++) {
        if (await condition()) return
        await delay(50)
      }
      assert.fail('The index did not refresh.')
    }

    await until(async () => (await search('q=comet')).results.length === 1)
    await until(async () => (await search('scope=feeds&q=neptune&media=audio&tag=astronomy&from=2026-01-01')).results.length === 1)
    assert.equal((await search('scope=feeds&q=doNotIndex')).results.length, 0)
    assert.equal((await fetch(`${endpoint}feed?url=${encodeURIComponent(feedUrl)}`)).status, 200)
    assert.equal((await fetch(`${endpoint}feed?url=${encodeURIComponent(`${feedUrl}/wrong`)}`)).status, 403)

    await writeFile(postPath, '---\ntitle: Revised galaxy\n---\nA new galaxy.')
    await until(async () => (await search('q=galaxy')).results.length === 1)
    assert.equal((await search('q=comet')).results.length, 0)
    await writeFile(configPath, 'title: Index fixture\ncontent: content\ndrafts:\n  - content/post.md\n')
    await writeFile(feedsPath, 'feeds: []\n')
    await until(async () => (await search('q=galaxy')).results.length === 0 && !(await search('scope=feeds&q=neptune')).ready)
    assert.equal((await search('scope=feeds&q=neptune')).results.length, 0)
    assert.equal((await fetch(`${endpoint}feed?url=${encodeURIComponent(feedUrl)}`)).status, 403)
  } finally {
    await api?.close()
    await new Promise<void>(done => fixture.close(() => done()))
    const target = await realpath(directory)
    assert.ok(dirname(target) === temporaryRoot && basename(target).startsWith('trendly-index-'))
    await rm(target, { recursive: true, force: true })
  }
})
