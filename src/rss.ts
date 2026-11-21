import { website, type Subscription } from './repository'
import { entryMediaType, type FeedEntry, type FeedSource } from './feed/Feed'
import { normalize_tags } from './feed/card-meta.mjs'

const mediaNamespace = 'http://search.yahoo.com/mrss/'
const itunesNamespace = 'http://www.itunes.com/dtds/podcast-1.0.dtd'

export type FeedFormat = 'rss' | 'atom'

export function feedFormatHint(url: string, kind?: string): FeedFormat | undefined {
  const format = kind?.toLowerCase()
  if (format === 'rss' || format === 'atom') return format
  const address = website(url)
  const match = address && new URL(address).pathname.match(/[/.](rss|atom)(?:\.xml)?\/?$/i)
  return match ? match[1].toLowerCase() as FeedFormat : undefined
}

function child(node: Element, name: string) {
  return Array.from(node.children).find(element => element.localName === name)
}

function value(node: Element, ...names: string[]) {
  return names.map(name => child(node, name)?.textContent?.trim()).find(Boolean) || ''
}

function textFromMarkup(markup: string) {
  const template = document.createElement('template')
  template.innerHTML = markup
  const hasMarkup = template.content.childElementCount > 0
  for (const node of template.content.querySelectorAll('script, style, template, iframe, object, noscript')) node.remove()
  for (const node of template.content.querySelectorAll('p, br, div, li, blockquote, pre, h1, h2, h3, h4, h5, h6, td, th')) {
    node.before(' ')
    node.after(' ')
  }
  return { text: (template.content.textContent || '').trim(), hasMarkup }
}

function plain(markup: string) {
  return textFromMarkup(markup).text.replace(/\s+/g, ' ')
}

function content(entry: Element, ...names: string[]) {
  for (const name of names) {
    const field = Array.from(entry.children).find(element => element.localName === name && element.namespaceURI !== mediaNamespace)
    if (!field) continue
    const value = (field.childElementCount ? field.innerHTML : field.textContent || '').trim()
    if (!value) continue
    const type = field.getAttribute('type')?.toLowerCase()
    if (type === 'text' || type === 'text/plain') return { text: value }
    const { text, hasMarkup } = textFromMarkup(value)
    return { text: hasMarkup ? text.replace(/\s+/g, ' ') : text, html: hasMarkup ? value : undefined }
  }
  return { text: '' }
}

function feedUrl(value: string | null | undefined, base: string) {
  try { if (value) return website(new URL(value, base).href) } catch { /* Invalid optional URL. */ }
}

function entrySource(entry: Element, feed: Subscription, href?: string): FeedSource | undefined {
  const enclosures = [...Array.from(entry.children).filter(node => node.localName === 'enclosure' || node.getAttribute('rel') === 'enclosure'),
    ...entry.getElementsByTagNameNS(mediaNamespace, 'content')]
    .flatMap(node => {
      const url = feedUrl(node.getAttribute('url') || node.getAttribute('href'), feed.url)
      if (!url) return []
      const medium = (node.getAttribute('type')?.split('/')[0] || node.getAttribute('medium'))?.toLowerCase()
      const kind = medium === 'audio' || medium === 'video' || medium === 'image' ? medium : entryMediaType({ sources: [{ url }] })
      return [{ url, kind }]
    })
  const video = enclosures.find(item => item.kind === 'video')?.url
  const audio = enclosures.find(item => item.kind === 'audio')?.url
  const thumbnail = entry.getElementsByTagNameNS(mediaNamespace, 'thumbnail')[0]
  const artwork = entry.getElementsByTagNameNS(itunesNamespace, 'image')[0]
  const image = enclosures.find(item => item.kind === 'image')?.url ||
    feedUrl(thumbnail?.getAttribute('url') || artwork?.getAttribute('href'), feed.url)
  const url = href || video || audio || image
  if (!url) return undefined
  const linkedKind = entryMediaType({ sources: [{ url }] })
  return {
    url, title: href ? 'Original entry' : 'Media file', publisher: feed.name,
    kind: video ? 'video' : audio ? 'audio' : linkedKind !== 'link' ? linkedKind : image ? 'image' : 'article',
    video_url: video,
    audio_url: audio,
    image_url: image,
  }
}

export async function fetchFeed(feed: Subscription, proxy?: string): Promise<{ format: FeedFormat; entries: FeedEntry[] }> {
  async function request(url: string) {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000), credentials: 'omit', cache: 'no-cache' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.text()
  }
  let raw: string
  const localNprPath = !proxy && /^https:\/\/feeds\.npr\.org(\/[0-9]+\/podcast\.xml)$/.exec(feed.url)?.[1]
  try { raw = await request(import.meta.env.DEV && localNprPath ? `/_trendly/npr${localNprPath}` : feed.url) }
  catch (error) {
    if (import.meta.env.DEV && localNprPath) {
      const detail = error instanceof Error ? error.message : 'Request failed.'
      throw new Error(`The local NPR proxy could not load this feed. ${detail}`)
    }
    if (!proxy) {
      if (error instanceof TypeError) {
        throw new Error('The browser request failed. If the publisher blocks cross-origin requests, use a trusted proxy_url in feeds.yaml.')
      }
      throw error
    }
    const url = new URL(proxy)
    url.searchParams.set('url', feed.url)
    raw = await request(url.href)
  }
  const xml = new DOMParser().parseFromString(raw, 'application/xml')
  const root = xml.documentElement
  if (xml.querySelector('parsererror') || !['rss', 'feed', 'RDF'].includes(root.localName)) {
    throw new Error('The response is not valid RSS or Atom.')
  }
  const variants = Array.from(root.getElementsByTagNameNS('*', root.localName === 'feed' ? 'entry' : 'item'))
  const ids = new Set<string>()
  const entries = variants.slice(0, 100).flatMap((entry, index) => {
    const atomLink = Array.from(entry.children).find(element =>
      element.localName === 'link' && ['alternate', null].includes(element.getAttribute('rel')) && element.hasAttribute('href'))
    const link = atomLink?.getAttribute('href') || value(entry, 'link')
    const href = feedUrl(link, feed.url)
    const id = `${feed.url}#${value(entry, 'guid', 'id') || href || index}`
    if (ids.has(id)) return []
    ids.add(id)
    const article = content(entry, 'encoded', 'content', 'description', 'summary')
    const summary = (content(entry, 'summary', 'description').text || article.text).replace(/\s+/g, ' ')
    const parsedDate = Date.parse(value(entry, 'pubDate', 'published', 'updated', 'date'))
    const timestamp = Number.isNaN(parsedDate) ? undefined : parsedDate
    const source = entrySource(entry, feed, href)
    const tags = normalize_tags(Array.from(entry.children).filter(node => node.localName === 'category')
      .map(node => plain(node.getAttribute('term') || node.textContent || '')))
    return [{
      id, title: value(entry, 'title') || href || 'Untitled entry', path: '', href,
      timestamp, date: timestamp === undefined ? undefined : new Date(timestamp).toISOString().slice(0, 10),
      body: article.text, externalContent: { html: article.html, base: href || feed.url },
      summary: summary.length > 250 ? summary.slice(0, 247) + '…' : summary,
      facets: tags.length ? [{ name: 'tags', label: 'Tag', values: tags }] : [],
      sources: source ? [source] : [],
    }]
  })
  return { format: root.localName === 'feed' ? 'atom' : 'rss', entries }
}
