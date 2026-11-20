import { parse } from 'yaml'
import type { FeedEntry, FeedSource } from './feed/Feed'

export type Repository = {
  label: string
  revision?: string
  stamp?: string
  paths: () => string[]
  read: (path: string) => Promise<string>
  asset: (path: string) => string | undefined
  link?: (path: string) => string
  refresh?: () => Promise<Repository>
  dispose?: () => void
}

export type Subscription = { name: string; url: string }
export type Post = FeedEntry & { route: string; tags: string[] }
export type Snapshot = {
  title: string
  description: string
  section: string
  posts: Post[]
  subscriptions: Subscription[]
  proxy?: string
  rss?: string
  color?: string
  typeset?: string
}

const frontmatter = /^(?:\uFEFF)?---[ \t]*\r?\n([\s\S]*?)^---[ \t]*(?:\r?\n|$)/m
const markdown = /\.mdx?$/i

function object(data: unknown): Record<string, unknown> {
  return data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {}
}

function text(data: unknown) {
  return typeof data === 'string' ? data.trim() : ''
}

function yaml(data: string) {
  return parse(data, { maxAliasCount: 0 })
}

export function website(data: unknown) {
  try {
    const url = new URL(text(data))
    if (/^https?:$/.test(url.protocol) && !url.username && !url.password) return url.href
  } catch { /* A source needs an absolute URL. */ }
}

function normalize(path: string) {
  const parts: string[] = []
  for (const piece of path.split('/')) {
    if (!piece || piece === '.') continue
    if (piece === '..') {
      if (!parts.length) return undefined
      parts.pop()
    } else if (!piece.includes('\\') && !piece.includes('\0')) {
      parts.push(piece)
    } else return undefined
  }
  return parts.join('/')
}

function field(meta: Record<string, unknown>, mapping: unknown, defaults: string[]) {
  const keys = mapping === null ? [] : Array.isArray(mapping) ? mapping : typeof mapping === 'string' ? [mapping] : defaults
  return keys.map(key => text(meta[String(key)])).find(Boolean) || ''
}

function excerpt(body: string) {
  const paragraph = body.replace(/```[\s\S]*?```/g, '').split(/\n\s*\n/).map(block => block.trim())
    .find(block => block && !/^#{1,6}\s/.test(block))
  if (!paragraph) return ''
  const plain = paragraph.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[#*`[\]()!|>]/g, ' ').replace(/\s+/g, ' ').trim()
  if (plain.length <= 280) return plain
  const cut = plain.slice(0, 280)
  const space = cut.lastIndexOf(' ')
  return (space > 160 ? cut.slice(0, space) : cut).trim() + '…'
}

function post_source(value: unknown): FeedSource[] {
  const data = object(value)
  const url = website(data.url)
  return url ? [{
    url, title: text(data.title), kind: text(data.kind), publisher: text(data.publisher),
    description: text(data.description), image_url: website(data.image_url), audio_url: website(data.audio_url),
  }] : []
}

function post(data: string, path: string, root: string, draft: boolean, config: Record<string, unknown>, repo: Repository) {
  const match = frontmatter.exec(data)
  const meta = match?.index === 0 ? object(yaml(match[1])) : {}
  const body = (match?.index === 0 ? data.slice(match[0].length) : data).replace(/^\s*#\s+.+\r?\n?/, '')
  const relative = root ? path.slice(root.length + 1) : path
  const name = relative.split('/').at(-1)!.replace(markdown, '')
  const route = relative.replace(markdown, '').replace(/(?:^|\/)(?:index|home)$/, '')
  const mapping = object(config.frontmatter)
  const date = field(meta, mapping.date, ['date', 'published_at', 'updated_at']).slice(0, 10)
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
  const title = field(meta, mapping.title, ['title']) || name.replace(/[-_]/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
  const base = website(object(config.rss).site_url)
  const canonical = base && new URL(route.split('/').map(encodeURIComponent).join('/') + (route ? '/' : ''), base.replace(/\/*$/, '/')).href
  return {
    id: path, title, draft, route, path, body, date: validDate ? date : undefined,
    summary: field(meta, mapping.description, ['description', 'desc']) || excerpt(body),
    tags: Array.isArray(meta.tags) ? meta.tags.map(text).filter(Boolean) : [],
    sources: Array.isArray(meta.sources) ? meta.sources.flatMap(post_source) : [],
    href: draft ? undefined : canonical || repo.link?.(path),
  } satisfies Post
}

function within(path: string, root: string) {
  return !root || path.startsWith(root + '/')
}

function post_path(path: string, root: string) {
  return within(path, root) && markdown.test(path) &&
    !path.split('/').some(part => /^(\.|_assets$|images$)/.test(part))
}

async function parallel<T>(items: string[], callback: (path: string) => Promise<T>) {
  const results: T[] = []
  for (let index = 0; index < items.length; index += 10) {
    results.push(...await Promise.all(items.slice(index, index + 10).map(callback)))
  }
  return results
}

export async function loadRepository(repo: Repository): Promise<Snapshot> {
  const paths = repo.paths()
  if (!paths.includes('mndsite.yaml')) throw new Error('Choose a repository that contains mndsite.yaml at its root.')
  const config = object(yaml(await repo.read('mndsite.yaml')))
  const content = normalize(text(config.content) || 'docs')
  if (content === undefined) throw new Error('The published content directory must be inside the repository.')
  const draftRoot = 'drafts'
  const local = !repo.revision
  const files = paths.filter(path => post_path(path, content) && !within(path, draftRoot) ||
    local && post_path(path, draftRoot))
  const posts = await parallel(files, async path => {
    const draft = within(path, draftRoot)
    try { return post(await repo.read(path), path, draft ? draftRoot : content, draft, config, repo) }
    catch (error) { throw new Error(`${path}: ${error instanceof Error ? error.message : 'Unable to read post'}`) }
  })
  posts.sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.route.localeCompare(b.route) || a.id.localeCompare(b.id))
  const subscriptionsConfig = paths.includes('feeds.yaml') ? yaml(await repo.read('feeds.yaml')) : []
  const settings = object(subscriptionsConfig)
  const supplied = Array.isArray(subscriptionsConfig) ? subscriptionsConfig : Array.isArray(settings.feeds) ? settings.feeds : []
  const seen = new Set<string>()
  const subscriptions = supplied.flatMap((item: unknown) => {
    const feed = object(item)
    const url = website(feed.url)
    if (!url || seen.has(url)) return []
    seen.add(url)
    return [{ url, name: text(feed.name) || new URL(url).hostname }]
  })
  const base = website(object(config.rss).site_url)
  return {
    title: text(config.title) || repo.label, description: text(config.description) === 'none' ? '' : text(config.description),
    section: text(config.feed_url).replace(/^\/+|\/+$/g, '').replace(/^(none|auto|default)$/, ''),
    posts, subscriptions, proxy: website(settings.proxy_url),
    rss: base && new URL('rss.xml', base.replace(/\/*$/, '/')).href,
    color: text(object(config.theme).color), typeset: text(object(config.theme).typeset),
  }
}

export function repoAsset(repo: Repository, value: string, entry: FeedEntry) {
  if (value.startsWith('//') || /^[\w+.-]+:/.test(value)) return undefined
  try {
    const decoded = decodeURIComponent(value.split(/[?#]/)[0])
    if (!decoded) return undefined
    const parent = entry.path.split('/').slice(0, -1).join('/')
    const relative = normalize(decoded.startsWith('/') ? decoded : `${parent}/${decoded}`)
    const wanted = decoded.replace(/^\//, '')
    const paths = repo.paths()
    const matched = [relative, wanted, ...paths.filter(path => path.endsWith('/' + wanted))].find(path => path && paths.includes(path))
    return matched ? repo.asset(matched) : undefined
  } catch { return undefined }
}

function localRepository(files: Map<string, File>, label: string, refresh?: Repository['refresh']): Repository {
  const blobs = new Map<string, string>()
  const paths = [...files.keys()]
  return {
    label, paths: () => paths, refresh,
    stamp: JSON.stringify(paths.sort().map(path => [path, files.get(path)?.lastModified, files.get(path)?.size])),
    async read(path) {
      const file = files.get(path)
      if (!file) throw new Error(`File missing: ${path}`)
      return file.text()
    },
    asset(path) {
      const file = files.get(path)
      if (!file || !/\.(?:jpe?g|png|webp|gif|svg|avif|ico|bmp)$/i.test(path)) return
      const url = blobs.get(path) || URL.createObjectURL(file)
      blobs.set(path, url)
      return url
    },
    dispose() { for (const url of blobs.values()) URL.revokeObjectURL(url) },
  }
}

export function importFolder(files: FileList) {
  const entries = [...Array.from(files)].map(file => [file.webkitRelativePath.split('/').slice(1).join('/'), file] as const)
    .filter(([path]) => path && !path.startsWith('.git/'))
  return localRepository(new Map(entries), files[0]?.webkitRelativePath.split('/')[0] || 'Local repository')
}

type Directory = FileSystemDirectoryHandle & { values(): AsyncIterableIterator<FileSystemHandle> }

export async function openFolder(picker: (options: { mode: 'read' }) => Promise<Directory>) {
  const root = await picker.call(window, { mode: 'read' })
  async function scan() {
    const files = new Map<string, File>()
    async function walk(directory: Directory, prefix = '') {
      for await (const entry of directory.values()) {
        if (entry.name.startsWith('.') || ['node_modules', 'dist'].includes(entry.name)) continue
        const path = prefix + entry.name
        if (entry.kind === 'file') files.set(path, await (entry as FileSystemFileHandle).getFile())
        else await walk(entry as Directory, path + '/')
      }
    }
    await walk(root)
    return localRepository(files, root.name, scan)
  }
  return scan()
}

async function fetchData<T>(url: string, decode: (response: Response) => Promise<T>): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) })
  if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}. Check the repository and revision.`)
  return decode(response)
}

export async function remoteRepository(input: string, ref: string): Promise<Repository> {
  const address = input.trim().replace(/^https:\/\/github\.com\//i, '').replace(/\/$/, '').replace(/\.git$/, '')
  if (!/^[\w.-]+\/[\w.-]+$/.test(address)) throw new Error('Enter a public GitHub repository as owner/repo.')
  const api = `https://api.github.com/repos/${address}`
  const branch = ref.trim() || (await fetchData<{ default_branch: string }>(api, response => response.json())).default_branch
  const commit = await fetchData<{ sha: string; commit: { tree: { sha: string } } }>(`${api}/commits/${encodeURIComponent(branch)}`, response => response.json())
  const tree = await fetchData<{ tree: { path: string; type: string; mode: string }[]; truncated: boolean }>(
    `${api}/git/trees/${commit.commit.tree.sha}?recursive=1`, response => response.json())
  if (tree.truncated) throw new Error('This repository is too large to list in one request. Open a local checkout.')
  const paths = tree.tree.filter(entry => entry.type === 'blob' && entry.mode !== '120000').map(entry => entry.path)
  const raw = (path: string) => `https://raw.githubusercontent.com/${address}/${commit.sha}/${path.split('/').map(encodeURIComponent).join('/')}`
  return {
    label: address, revision: commit.sha, paths: () => paths,
    read: path => fetchData(raw(path), response => response.text()),
    asset: raw,
    link: path => `https://github.com/${address}/blob/${commit.sha}/${path.split('/').map(encodeURIComponent).join('/')}`,
    refresh: () => remoteRepository(address, ref),
  }
}

export function exampleRepository(): Repository {
  const files = Object.fromEntries(Object.entries(import.meta.glob('../example-workspace/**/*.{yaml,md}', { eager: true, query: '?raw', import: 'default' }))
    .map(([path, data]) => [path.replace('../example-workspace/', ''), data as string]))
  return {
    label: 'Example repository',
    paths: () => Object.keys(files),
    async read(path) { return files[path] },
    asset: () => undefined,
  }
}
