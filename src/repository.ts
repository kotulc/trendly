import { parse } from 'yaml'
import type { FeedEntry, FeedSource } from './feed/Feed'
import { card_meta } from './feed/card-meta.mjs'

export type Repository = {
  label: string
  source: 'example' | 'checkout' | 'import' | 'github'
  ref?: string
  requestedRef?: string
  repoUrl?: string
  revision?: string
  stamp?: string
  paths: () => string[]
  read: (path: string) => Promise<string>
  asset: (path: string) => string | undefined
  link?: (path: string) => string
  refresh?: () => Promise<Repository>
  writeConfig?: (change: ConfigChange) => Promise<void>
  publication?: {
    branch: string
    move: (from: string, to: string, headline: string, token: string) => Promise<Commit>
    writeConfig: (change: ConfigChange, token: string) => Promise<Commit>
  }
  dispose?: () => void
}

export type ConfigFile = 'mndsite.yaml' | 'feeds.yaml'
export type ConfigChange = { path: ConfigFile; before?: string; after: string }
export type Commit = { oid: string; url: string }

export type Subscription = { name: string; url: string }
export type Post = FeedEntry & { route: string; tags: string[] }
export type Snapshot = {
  title: string
  description: string
  contentRoot: string
  section: string
  configs: Record<ConfigFile, string | undefined>
  posts: Post[]
  subscriptions: Subscription[]
  proxy?: string
  rss?: string
  repoUrl?: string
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

export function normalizeSubscriptions(entries: unknown[]): Subscription[] {
  const seen = new Set<string>()
  return entries.flatMap(entry => {
    const feed = object(entry)
    const url = website(feed.url)
    if (!url || seen.has(url)) return []
    seen.add(url)
    return [{ url, name: text(feed.name) || new URL(url).hostname }]
  })
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
    video_url: website(data.video_url), placement: text(data.placement),
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
  const card = card_meta(meta, object(mapping.facets), draft)
  return {
    id: path, title, draft, route, path, body, date: validDate ? date : undefined,
    summary: field(meta, mapping.description, ['description', 'desc']) || excerpt(body),
    ...card,
    tags: card.facets?.find(facet => facet.name === 'tags')?.values || [],
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

export function isDraftPath(path: unknown): path is string {
  return typeof path === 'string' && !/[\\:\0]/.test(path) && normalize(path) === path && markdown.test(path)
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
  const siteYaml = await repo.read('mndsite.yaml')
  const config = object(yaml(siteYaml))
  const content = normalize(text(config.content) || 'docs')
  if (content === undefined) throw new Error('The published content directory must be inside the repository.')
  const draftRoot = 'drafts'
  const draftPaths = config.drafts ?? []
  if (!Array.isArray(draftPaths) || !draftPaths.every(isDraftPath)) {
    throw new Error('mndsite.yaml: drafts must be a list of repository-relative Markdown paths.')
  }
  const configuredDrafts = new Set(draftPaths)
  const files = paths.filter(path => post_path(path, content) && !within(path, draftRoot) ||
    post_path(path, draftRoot))
  const posts = await parallel(files, async path => {
    const outsideContent = within(path, draftRoot)
    try { return post(await repo.read(path), path, outsideContent ? draftRoot : content,
      outsideContent || configuredDrafts.has(path), config, repo) }
    catch (error) { throw new Error(`${path}: ${error instanceof Error ? error.message : 'Unable to read post'}`) }
  })
  posts.sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.route.localeCompare(b.route) || a.id.localeCompare(b.id))
  const feedsYaml = paths.includes('feeds.yaml') ? await repo.read('feeds.yaml') : undefined
  const subscriptionsConfig = feedsYaml === undefined ? [] : yaml(feedsYaml)
  const settings = object(subscriptionsConfig)
  const supplied = Array.isArray(subscriptionsConfig) ? subscriptionsConfig : Array.isArray(settings.feeds) ? settings.feeds : []
  const subscriptions = normalizeSubscriptions(supplied)
  const base = website(object(config.rss).site_url)
  return {
    title: text(config.title) || repo.label, description: text(config.description) === 'none' ? '' : text(config.description),
    contentRoot: content,
    configs: { 'mndsite.yaml': siteYaml, 'feeds.yaml': feedsYaml },
    section: text(config.feed_url).replace(/^\/+|\/+$/g, '').replace(/^(none|auto|default)$/, ''),
    posts, subscriptions, proxy: website(settings.proxy_url),
    rss: base && new URL('rss.xml', base.replace(/\/*$/, '/')).href,
    repoUrl: repo.repoUrl ?? website(config.repo_url),
    color: text(object(config.theme).color), typeset: text(object(config.theme).typeset),
  }
}

export function publicationPath(snapshot: Snapshot, entry: FeedEntry, requested?: string) {
  const { contentRoot, section } = snapshot
  if (!contentRoot || within(contentRoot, 'drafts')) throw new Error('Publishing requires a separate content directory outside drafts/.')
  const root = entry.draft ? 'drafts' : contentRoot
  if (!post_path(entry.path, root)) throw new Error('Choose a Markdown post from this repository.')
  const relative = entry.path.slice(root.length + 1)
  const sectionPath = entry.draft && section && !relative.includes('/') ? `${section}/${relative}` : relative
  const destinationRoot = entry.draft ? contentRoot : 'drafts'
  const destination = requested?.trim() ?? `${destinationRoot}/${sectionPath}`
  if (normalize(destination) !== destination || !post_path(destination, destinationRoot)) {
    throw new Error('Check the feed section and content directory in mndsite.yaml.')
  }
  return destination
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
    label, source: refresh ? 'checkout' : 'import', paths: () => paths, refresh,
    stamp: JSON.stringify(paths.sort().map(path => [path, files.get(path)?.lastModified, files.get(path)?.size])),
    async read(path) {
      const file = files.get(path)
      if (!file) throw new Error(`File missing: ${path}`)
      return file.text()
    },
    asset(path) {
      const file = files.get(path)
      if (!file || !/\.(?:jpe?g|png|webp|gif|svg|avif|ico|bmp|mp4|m4v|webm|ogv|mov|mp3|m4a|aac|oga|ogg|opus|wav|flac)$/i.test(path)) return
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

type Directory = FileSystemDirectoryHandle & {
  values(): AsyncIterableIterator<FileSystemHandle>
  requestPermission?: (options: { mode: 'readwrite' }) => Promise<PermissionState>
}

export async function openFolder(picker: (options: { mode: 'read' }) => Promise<Directory>) {
  const root = await picker.call(window, { mode: 'read' })
  async function writeConfig({ path, before, after }: ConfigChange) {
    if (root.requestPermission && await root.requestPermission({ mode: 'readwrite' }) !== 'granted') {
      throw new Error('Allow write access to the selected folder to save the YAML.')
    }
    let handle: FileSystemFileHandle | undefined
    try { handle = await root.getFileHandle(path) }
    catch (error) { if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error }
    const saved = handle && await (await handle.getFile()).text()
    if (saved !== before) throw new Error(`${path} has changed. Refresh the folder and reopen the editor.`)
    const file = handle || await root.getFileHandle(path, { create: true })
    const stream = await file.createWritable()
    try {
      await stream.write(after)
      if (await (await file.getFile()).text() !== (before ?? '')) throw new Error(`${path} changed while saving. Refresh and try again.`)
      await stream.close()
    } catch (error) {
      await stream.abort().catch(() => {})
      throw error
    }
  }
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
    return { ...localRepository(files, root.name, scan), writeConfig }
  }
  return scan()
}

async function fetchData<T>(url: string, decode: (response: Response) => Promise<T>): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) })
  if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}. Check the repository and revision.`)
  return decode(response)
}

function base64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = () => reject(new Error('Unable to read the file for the commit.'))
    reader.readAsDataURL(blob)
  })
}

export async function remoteRepository(input: string, ref: string): Promise<Repository> {
  const address = input.trim().replace(/^https:\/\/github\.com\//i, '').replace(/\/$/, '').replace(/\.git$/, '')
  if (!/^[\w.-]+\/[\w.-]+$/.test(address)) throw new Error('Enter a public GitHub repository as owner/repo.')
  const api = `https://api.github.com/repos/${address}`
  const requestedRef = ref.trim() || (await fetchData<{ default_branch: string }>(api, response => response.json())).default_branch
  const branchName = requestedRef.replace(/^refs\/heads\//, '')
  const branchPath = branchName.split('/').map(encodeURIComponent).join('/')
  const branchResponse = await fetch(`${api}/git/ref/heads/${branchPath}`, { signal: AbortSignal.timeout(12000), cache: 'no-cache' })
  const branch = branchResponse.ok ? await branchResponse.json() as { ref: string; object: { sha: string } } : undefined
  const branchHead = branch?.ref === `refs/heads/${branchName}` ? branch.object.sha : undefined
  const commit = await fetchData<{ sha: string; commit: { tree: { sha: string } } }>(
    `${api}/commits/${encodeURIComponent(branchHead || requestedRef)}`, response => response.json())
  const tree = await fetchData<{ tree: { path: string; type: string; mode: string }[]; truncated: boolean }>(
    `${api}/git/trees/${commit.commit.tree.sha}?recursive=1`, response => response.json())
  if (tree.truncated) throw new Error('This repository is too large to list in one request. Open a local checkout.')
  const paths = tree.tree.filter(entry => entry.type === 'blob' && entry.mode !== '120000').map(entry => entry.path)
  const raw = (path: string) => `https://raw.githubusercontent.com/${address}/${commit.sha}/${path.split('/').map(encodeURIComponent).join('/')}`
  type FileChanges = { additions: { path: string; contents: string }[]; deletions?: { path: string }[] }
  async function commitFiles(fileChanges: FileChanges, headline: string, token: string) {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `mutation ($input: CreateCommitOnBranchInput!) {
          createCommitOnBranch(input: $input) { commit { oid url } }
        }`,
        variables: { input: {
          branch: { repositoryNameWithOwner: address, refName: `refs/heads/${branchName}` },
          expectedHeadOid: commit.sha, message: { headline }, fileChanges,
        } },
      }),
    })
    if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}. Check the token’s repository access.`)
    const result = await response.json() as {
      data?: { createCommitOnBranch?: { commit?: Commit } }
      errors?: { message: string }[]
    }
    const saved = result.data?.createCommitOnBranch?.commit
    if (!saved) throw new Error(result.errors?.[0]?.message || 'GitHub did not confirm the commit. Refresh the branch before retrying.')
    return saved
  }
  return {
    label: address, source: 'github', ref: requestedRef, requestedRef: ref.trim(), revision: commit.sha,
    repoUrl: `https://github.com/${address}`, paths: () => paths,
    read: path => fetchData(raw(path), response => response.text()),
    asset: raw,
    link: path => `https://github.com/${address}/blob/${commit.sha}/${path.split('/').map(encodeURIComponent).join('/')}`,
    refresh: () => remoteRepository(address, ref),
    publication: branchHead ? {
      branch: branchName,
      async move(from, to, headline, token) {
        if (!paths.includes(from) || !markdown.test(from) || normalize(to) !== to || !markdown.test(to)) {
          throw new Error('Choose a valid Markdown source and destination.')
        }
        if (tree.tree.some(({ path, type }) => path === to || path.startsWith(to + '/') ||
          (type !== 'tree' && to.startsWith(path + '/')))) {
          throw new Error(`${to} already exists or its path is blocked. Review the files in GitHub.`)
        }
        const contents = await base64(await fetchData(raw(from), response => response.blob()))
        return commitFiles({ additions: [{ path: to, contents }], deletions: [{ path: from }] }, headline, token)
      },
      async writeConfig({ path, before, after }, token) {
        const node = tree.tree.find(entry => entry.path === path)
        if ((node && (node.type !== 'blob' || node.mode === '120000')) || (before === undefined) !== !node) {
          throw new Error(`Check the current ${path} in GitHub and refresh the branch.`)
        }
        const contents = await base64(new Blob([after], { type: 'text/yaml' }))
        return commitFiles({ additions: [{ path, contents }] }, `Update ${path}`, token)
      },
    } : undefined,
  }
}

export function exampleRepository(): Repository {
  const assets = Object.fromEntries(Object.entries(import.meta.glob('../example-workspace/**/*.{jpg,jpeg,png,webp,svg,mp4,m4v,webm,ogv,mov,mp3,m4a,aac,oga,ogg,opus,wav,flac}', {
    eager: true, query: '?url', import: 'default',
  })).map(([path, url]) => [path.replace('../example-workspace/', ''), url as string]))
  const files = Object.fromEntries(Object.entries(import.meta.glob('../example-workspace/**/*.{yaml,md}', { eager: true, query: '?raw', import: 'default' }))
    .map(([path, data]) => [path.replace('../example-workspace/', ''), data as string]))
  return {
    label: 'Example repository', source: 'example',
    paths: () => [...Object.keys(files), ...Object.keys(assets)],
    async read(path) { return files[path] },
    asset: path => assets[path],
  }
}
