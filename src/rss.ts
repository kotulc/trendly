import { website, type Subscription } from './repository'
import { entryMediaType, type FeedEntry, type FeedSource } from './feed/Feed'
import { normalize_tags } from './feed/card-meta.mjs'

const mediaNamespace = 'http://search.yahoo.com/mrss/'
const itunesNamespace = 'http://www.itunes.com/dtds/podcast-1.0.dtd'

export type FeedFormat = 'rss' | 'atom' | 'json'

export function feedFormatHint(url: string, kind?: string): FeedFormat | undefined {
  const format = kind?.toLowerCase()
  if (format === 'rss' || format === 'atom') return format
  if (format === 'json' || format === 'jsonfeed' || format === 'json-feed') return 'json'
  const address = website(url)
  if (!address) return
  const pathname = new URL(address).pathname
  if (/[/.](?:feed\.json|jsonfeed(?:\.json)?)\/?$/i.test(pathname)) return 'json'
  const match = pathname.match(/[/.](rss|atom)(?:\.xml)?\/?$/i)
  return match ? match[1].toLowerCase() as FeedFormat : undefined
}

function child(node: Element, name: string) {
  return Array.from(node.children).find(element => element.localName === name)
}

function value(node: Element, ...names: string[]) {
  return names.map(name => child(node, name)?.textContent?.trim()).find(Boolean) || ''
}

function textFromMarkup(markup: string, document: Document) {
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

function plain(markup: string, document: Document) {
  return textFromMarkup(markup, document).text.replace(/\s+/g, ' ')
}

function content(entry: Element, document: Document, ...names: string[]) {
  for (const name of names) {
    const field = Array.from(entry.children).find(element => element.localName === name && element.namespaceURI !== mediaNamespace)
    if (!field) continue
    const value = (field.childElementCount ? field.innerHTML : field.textContent || '').trim()
    if (!value) continue
    const type = field.getAttribute('type')?.toLowerCase()
    if (type === 'text' || type === 'text/plain') return { text: value }
    const { text, hasMarkup } = textFromMarkup(value, document)
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
      return [attachment(url, node.getAttribute('type') || node.getAttribute('medium') || '')]
    })
  const thumbnail = entry.getElementsByTagNameNS(mediaNamespace, 'thumbnail')[0]
  const artwork = entry.getElementsByTagNameNS(itunesNamespace, 'image')[0]
  return mediaSource(feed, enclosures, href, feedUrl(thumbnail?.getAttribute('url') || artwork?.getAttribute('href'), feed.url))
}

function attachment(url: string, type: string) {
  const medium = type.split('/')[0].toLowerCase()
  const kind = medium === 'audio' || medium === 'video' || medium === 'image' ? medium : entryMediaType({ sources: [{ url }] })
  return { url, kind }
}

function mediaSource(feed: Subscription, attachments: ReturnType<typeof attachment>[], href?: string, artwork?: string): FeedSource | undefined {
  const video = attachments.find(item => item.kind === 'video')?.url
  const audio = attachments.find(item => item.kind === 'audio')?.url
  const image = attachments.find(item => item.kind === 'image')?.url || artwork
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

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function entryDate(date: string) {
  const timestamp = Date.parse(date)
  return Number.isFinite(timestamp) ? { timestamp, date: new Date(timestamp).toISOString().slice(0, 10) } : {}
}

function excerpt(value: string) {
  const summary = value.replace(/\s+/g, ' ')
  return summary.length > 250 ? summary.slice(0, 247) + '…' : summary
}

function parseJsonFeed(raw: string, feed: Subscription, document: Document): FeedEntry[] {
  let data: Record<string, unknown>
  try { data = record(JSON.parse(raw)) }
  catch { throw new Error('The response is not valid JSON Feed.') }
  if (!['https://jsonfeed.org/version/1', 'https://jsonfeed.org/version/1.1'].includes(text(data.version)) || !Array.isArray(data.items)) {
    throw new Error('The response is not a supported JSON Feed (version 1 or 1.1).')
  }

  const ids = new Set<string>()
  return data.items.slice(0, 100).flatMap(rawItem => {
    const item = record(rawItem)
    const itemId = text(item.id)
    if (!itemId || ids.has(itemId)) return []
    ids.add(itemId)
    const href = feedUrl(text(item.url), feed.url) || feedUrl(text(item.external_url), feed.url)
    const html = text(item.content_html)
    const body = text(item.content_text) || (html ? plain(html, document) : '')
    const summary = excerpt(text(item.summary) || body)
    const tags = normalize_tags((Array.isArray(item.tags) ? item.tags : []).map(text))
    const attachments = (Array.isArray(item.attachments) ? item.attachments : []).flatMap(rawAttachment => {
      const entry = record(rawAttachment)
      const url = feedUrl(text(entry.url), feed.url)
      return url ? [{ ...attachment(url, text(entry.mime_type)), title: text(entry.title) }] : []
    })
    const image = feedUrl(text(item.image), feed.url) || feedUrl(text(item.banner_image), feed.url)
    const source = mediaSource(feed, attachments, href, image)
    const primaryMedia = [source?.audio_url, source?.video_url, source?.image_url]
    const otherSources = attachments.filter(file => !primaryMedia.includes(file.url)).flatMap(file => {
      const additional = mediaSource(feed, [file], file.url)
      return additional ? [{ ...additional, title: file.title || 'Attachment' }] : []
    })
    return [{
      id: `${feed.url}#${itemId}`, title: text(item.title) || summary || href || 'Untitled entry', path: '', href,
      ...entryDate(text(item.date_published) || text(item.date_modified)), body,
      externalContent: { html: html || undefined, base: href || feed.url }, summary,
      facets: tags.length ? [{ name: 'tags', label: 'Tag', values: tags }] : [], sources: source ? [source, ...otherSources] : otherSources,
    }]
  })
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
  return parseFeed(raw, feed)
}

export function parseFeed(raw: string, feed: Subscription, htmlDocument = document, parser = new DOMParser()): { format: FeedFormat; entries: FeedEntry[] } {
  const body = raw.trimStart()
  if (body.startsWith('{') || body.startsWith('[')) return { format: 'json', entries: parseJsonFeed(body, feed, htmlDocument) }
  const xml = parser.parseFromString(body, 'application/xml')
  const root = xml.documentElement
  if (xml.querySelector('parsererror') || !['rss', 'feed', 'RDF'].includes(root.localName)) {
    throw new Error('The response is not valid RSS, Atom, or JSON Feed.')
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
    const article = content(entry, htmlDocument, 'encoded', 'content', 'description', 'summary')
    const summary = excerpt(content(entry, htmlDocument, 'summary', 'description').text || article.text)
    const source = entrySource(entry, feed, href)
    const tags = normalize_tags(Array.from(entry.children).filter(node => node.localName === 'category')
      .map(node => plain(node.getAttribute('term') || node.textContent || '', htmlDocument)))
    return [{
      id, title: value(entry, 'title') || href || 'Untitled entry', path: '', href,
      ...entryDate(value(entry, 'pubDate', 'published', 'updated', 'date')),
      body: article.text, externalContent: { html: article.html, base: href || feed.url },
      summary,
      facets: tags.length ? [{ name: 'tags', label: 'Tag', values: tags }] : [],
      sources: source ? [source] : [],
    }]
  })
  return { format: root.localName === 'feed' ? 'atom' : 'rss', entries }
}
