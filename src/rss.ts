import { website, type Subscription } from './repository'
import type { FeedEntry } from './feed/Feed'

function child(node: Element, name: string) {
  return Array.from(node.children).find(element => element.localName === name)
}

function value(node: Element, ...names: string[]) {
  return names.map(name => child(node, name)?.textContent?.trim()).find(Boolean) || ''
}

function plain(markup: string) {
  const template = document.createElement('template')
  template.innerHTML = markup
  for (const node of template.content.querySelectorAll('script, style')) node.remove()
  return (template.content.textContent || '').replace(/\s+/g, ' ').trim()
}

function normalizeDate(input: string) {
  const date = new Date(input)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10)
}

export async function fetchFeed(feed: Subscription, proxy?: string): Promise<FeedEntry[]> {
  async function request(url: string) {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000), credentials: 'omit' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.text()
  }
  let raw: string
  try { raw = await request(feed.url) }
  catch (error) {
    if (!proxy) throw error
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
  return variants.slice(0, 100).flatMap((entry, index) => {
    const atomLink = Array.from(entry.children).find(element =>
      element.localName === 'link' && ['alternate', null].includes(element.getAttribute('rel')) && element.hasAttribute('href'))
    const link = atomLink?.getAttribute('href') || value(entry, 'link')
    let href: string | undefined
    try { if (link) href = website(new URL(link, feed.url).href) } catch { /* Invalid optional item link. */ }
    const id = `${feed.url}#${value(entry, 'guid', 'id') || href || index}`
    if (ids.has(id)) return []
    ids.add(id)
    const body = plain(value(entry, 'encoded', 'content', 'description', 'summary'))
    const summary = plain(value(entry, 'summary', 'description')) || body
    return [{
      id, title: value(entry, 'title') || href || 'Untitled entry', path: '', href,
      date: normalizeDate(value(entry, 'pubDate', 'published', 'updated', 'date')),
      body, summary: summary.length > 250 ? summary.slice(0, 247) + '…' : summary,
      sources: href ? [{ url: href, title: 'Original entry', publisher: feed.name }] : [],
    }]
  })
}
