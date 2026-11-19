import { parse, stringify } from 'yaml'

export type Source = {
  url: string
  kind: 'article' | 'youtube' | 'podcast' | 'link'
  title?: string
  publisher?: string
  description?: string
  image_url?: string
  feed_url?: string
  audio_url?: string
}

export type Post = {
  id: string
  file: string
  raw: string
  title: string
  body: string
  feeds: string[]
  tags: string[]
  sources: Source[]
  updatedAt?: string
  issues: string[]
}

export type Feed = { id: string; name: string; description?: string; url?: string }
export type Suggestion = Feed & { file: string; raw: string; dismissed: boolean; url: string }
export type Theme = 'light' | 'dark'
export type Snapshot = {
  name: string
  theme?: Theme
  posts: Post[]
  feeds: Feed[]
  suggestions: Suggestion[]
  issues: string[]
}

const frontmatter = /^---[ \t]*\r?\n([\s\S]*?)^---[ \t]*(?:\r?\n|$)/m
const identifier = /^[a-z0-9](?:[a-z0-9-]{0,79})$/

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected a YAML mapping')
  }
  return value as Record<string, unknown>
}

export function readYaml(raw: string) {
  return record(parse(raw, { maxAliasCount: 0 }))
}

function string(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function strings(value: unknown) {
  return Array.isArray(value) ? [...new Set(value.map(string).filter(Boolean))] : []
}

export function webUrl(value: unknown) {
  try {
    const url = new URL(string(value))
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined
    return url.href
  } catch {
    return undefined
  }
}

export function youtubeId(value: string) {
  const url = new URL(value)
  const host = url.hostname.toLowerCase()
  let id: string | null = null
  if (host === 'youtu.be') id = url.pathname.split('/')[1]
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'].includes(host)) {
    id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(?:embed|shorts|live)\/([^/]+)/.exec(url.pathname)?.[1] ?? null
  }
  return id && /^[\w-]{11}$/.test(id) ? id : undefined
}

function source(value: unknown): Source {
  const data = record(value)
  const url = webUrl(data.url)
  if (!url) throw new Error('Expected an HTTP or HTTPS source URL')
  const kind = youtubeId(url) ? 'youtube' : data.kind === 'podcast' || data.kind === 'article' ? data.kind : 'link'
  return {
    url, kind,
    title: string(data.title) || undefined,
    publisher: string(data.publisher) || undefined,
    description: string(data.description) || undefined,
    image_url: webUrl(data.image_url),
    feed_url: webUrl(data.feed_url),
    audio_url: webUrl(data.audio_url),
  }
}

export function readPost(file: string, raw: string): Post {
  const filename = file.replace(/\.md$/i, '')
  const issues: string[] = []
  const normalized = raw.replace(/^\uFEFF/, '')
  const block = frontmatter.exec(normalized)
  const hasFrontmatter = block?.index === 0
  const body = hasFrontmatter ? normalized.slice(block[0].length) : normalized
  let data: Record<string, unknown> = {}
  if (hasFrontmatter) {
    try { data = readYaml(block[1]) } catch { issues.push('Frontmatter contains invalid YAML.') }
  } else if (/^---[ \t]*\r?\n/.test(normalized)) {
    issues.push('Frontmatter is missing its closing delimiter.')
  }
  const id = string(data.id) || filename
  if (!identifier.test(id)) issues.push('The post ID must use lowercase letters, numbers, or hyphens.')
  if (id !== filename) issues.push('The post ID must match the filename.')
  if (data.version !== undefined && data.version !== 1) issues.push('This post uses an unsupported format version.')
  const sources: Source[] = []
  if (Array.isArray(data.sources)) {
    for (const [index, item] of data.sources.entries()) {
      try { sources.push(source(item)) } catch { issues.push(`Source ${index + 1} needs a valid URL.`) }
    }
  } else if (data.sources !== undefined) {
    issues.push('Sources must be a list.')
  }
  return {
    id, file, raw, body,
    title: string(data.title) || /^#\s+(.+)$/m.exec(body)?.[1] || 'Untitled draft',
    feeds: strings(data.feeds),
    tags: strings(data.tags),
    updatedAt: string(data.updated_at) || undefined,
    sources, issues,
  }
}

export function readFeed(file: string, raw: string): Feed {
  const data = readYaml(raw)
  const filename = file.replace(/\.yaml$/i, '')
  const id = string(data.id)
  const name = string(data.name)
  if (!identifier.test(id) || id !== filename || !name) throw new Error('Expected a name and an ID matching the filename')
  if (data.url !== undefined && !webUrl(data.url)) throw new Error('Expected an HTTP or HTTPS feed URL')
  return { id, name, description: string(data.description) || undefined, url: webUrl(data.url) }
}

export function readSuggestion(file: string, raw: string): Suggestion {
  const feed = readFeed(file, raw)
  if (!feed.url) throw new Error('Expected a feed URL')
  return { ...feed, url: feed.url, file, raw, dismissed: readYaml(raw).status === 'dismissed' }
}

export function newPost(id: string, feed?: string) {
  return `---\n${stringify({ version: 1, id, title: '', feeds: feed ? [feed] : [], tags: [], sources: [] })}---\n\n`
}

export function copyPost(raw: string, id: string) {
  const normalized = raw.replace(/^\uFEFF/, '')
  const block = frontmatter.exec(normalized)
  if (block?.index === 0) {
    try {
      const data = { ...readYaml(block[1]), id }
      return `---\n${stringify(data)}---\n${normalized.slice(block[0].length)}`
    } catch { /* Preserve the original text when its frontmatter cannot be parsed. */ }
  }
  return raw
}
