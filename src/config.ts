import { isMap, isSeq, parseDocument, type Node } from 'yaml'
import { isDraftPath, website } from './repository'

export type FeedSettings = { section: string; expandable: boolean; siteUrl: string }

export function sameFeedSettings(first: FeedSettings, second: FeedSettings) {
  return first.section === second.section && first.expandable === second.expandable && first.siteUrl === second.siteUrl
}
export type SubscriptionDraft = { id: number; originalIndex?: number; name: string; url: string }

function readYaml(contents?: string) {
  const doc = parseDocument<Node>(contents ?? '')
  if (doc.errors.length) throw new Error(doc.errors[0].message)
  return doc
}

function field(value: unknown) { return typeof value === 'string' ? value : '' }

function serialize(doc: ReturnType<typeof readYaml>, original?: string) {
  const output = doc.toString()
  return original?.includes('\r\n') ? output.replace(/\n/g, '\r\n') : output
}

export function feedSettings(contents?: string): FeedSettings {
  const doc = readYaml(contents)
  return { section: field(doc.get('feed_url')), expandable: doc.get('expandable_feed') === true,
    siteUrl: field(doc.getIn(['rss', 'site_url'])) }
}

export function updateFeedSettings(contents: string | undefined, values: FeedSettings) {
  const original = feedSettings(contents)
  const doc = readYaml(contents)
  const section = values.section.trim().replace(/^\/+|\/+$/g, '')
  if (values.expandable && (!/^[\w-]+(?:\/[\w-]+)*$/.test(section) || /^(none|default|auto)$/i.test(section))) {
    throw new Error('The expandable feed needs a section path such as posts or updates/news.')
  }
  if (values.section !== original.section) {
    if (section && section.split('/').some(part => !part || part === '.' || part === '..' || /[\\\0]/.test(part))) {
      throw new Error('Enter a section path such as posts or updates/news.')
    }
    if (section) doc.set('feed_url', section)
    else doc.delete('feed_url')
  }
  if (values.expandable !== original.expandable) doc.set('expandable_feed', values.expandable)
  if (values.siteUrl !== original.siteUrl) {
    const url = values.siteUrl.trim()
    const siteUrl = website(url)
    if (url && (!siteUrl || new URL(siteUrl).search || new URL(siteUrl).hash)) {
      throw new Error('Enter a public HTTP or HTTPS site URL without a query string or fragment.')
    }
    const rss = doc.get('rss', true)
    if (siteUrl) {
      if (isMap(rss)) doc.setIn(['rss', 'site_url'], siteUrl)
      else doc.set('rss', { site_url: siteUrl })
    } else {
      if (isMap(rss) && rss.items.length > 1) throw new Error('Remove the RSS block in YAML directly to review its extra settings.')
      doc.delete('rss')
    }
  }
  return serialize(doc, contents)
}

export function updatePostDrafts(contents: string | undefined, changes: ReadonlyMap<string, boolean>) {
  if ([...changes.keys()].some(path => !isDraftPath(path))) throw new Error('Choose repository-relative Markdown paths.')
  const doc = readYaml(contents)
  const paths = doc.get('drafts', true)
  if (!isSeq(paths) && doc.get('drafts') != null) throw new Error('The draft settings must be a list of Markdown paths.')
  const current = isSeq(paths) ? paths.toJSON() as string[] : []
  const existing = new Set(current)
  const added = [...changes].filter(([path, draft]) => draft && !existing.has(path)).map(([path]) => path)
  const removed = current.some(path => changes.get(path) === false)
  if (!added.length && !removed) return contents
  if (isSeq(paths)) {
    if (removed) paths.items = paths.items.filter((_, index) => changes.get(current[index]) !== false)
    for (const path of added) paths.add(path)
  } else {
    doc.set('drafts', added)
  }
  return serialize(doc, contents)
}

export function subscriptionDrafts(contents?: string): SubscriptionDraft[] {
  const doc = readYaml(contents)
  const list = isSeq(doc.contents) ? doc.contents : doc.get('feeds', true)
  if (!isSeq(list)) return []
  return list.items.flatMap((entry, index) => isMap(entry) ? [{
    id: index, originalIndex: index, name: field(entry.get('name')), url: field(entry.get('url')),
  }] : [])
}

export function sourceProxyUrl(contents?: string) {
  const doc = readYaml(contents)
  return isMap(doc.contents) ? field(doc.get('proxy_url')) : ''
}

export function updateSourceProxy(contents: string | undefined, value: string) {
  const doc = readYaml(contents)
  const url = value.trim()
  const previous = isMap(doc.contents) ? field(doc.get('proxy_url')).trim() : ''
  if (url === previous) return contents
  const proxy = website(url)
  if (url && (!proxy || new URL(proxy).hash)) {
    throw new Error('Enter an absolute HTTP or HTTPS feed proxy URL without a fragment.')
  }
  if (isSeq(doc.contents)) doc.contents = doc.createNode({ feeds: doc.contents })
  if (doc.contents != null && !isMap(doc.contents)) throw new Error('Use a YAML map or subscription list in feeds.yaml.')
  if (proxy) doc.set('proxy_url', proxy)
  else doc.delete('proxy_url')
  return serialize(doc, contents)
}

export function updateSubscriptions(contents: string | undefined, drafts: SubscriptionDraft[]) {
  const doc = readYaml(contents)
  const existing = isSeq(doc.contents) ? doc.contents : doc.get('feeds', true)
  const values = new Map(drafts.map(draft => [draft.originalIndex, draft]))
  const seen = new Set<string>()
  const urls = new Map(drafts.map(draft => {
    const url = website(draft.url)
    if (!url) throw new Error('Each subscription needs an absolute HTTP or HTTPS feed URL.')
    if (seen.has(url)) throw new Error('Each feed URL can be subscribed to once.')
    seen.add(url)
    return [draft.id, url]
  }))

  if (isSeq(existing)) {
    existing.items = existing.items.filter((entry, index) => {
      if (!isMap(entry)) return true
      const draft = values.get(index)
      if (!draft) return false
      if (draft.name !== field(entry.get('name'))) {
        if (draft.name.trim()) entry.set('name', draft.name.trim())
        else entry.delete('name')
      }
      if (draft.url !== field(entry.get('url'))) entry.set('url', urls.get(draft.id))
      return true
    })
    for (const draft of drafts.filter(draft => draft.originalIndex === undefined)) {
      existing.add(doc.createNode({ ...(draft.name.trim() && { name: draft.name.trim() }), url: urls.get(draft.id) }))
    }
  } else {
    if (existing != null || (doc.contents != null && !isMap(doc.contents))) {
      throw new Error('Use a YAML list for subscriptions in feeds.yaml.')
    }
    doc.set('feeds', drafts.map(draft => ({ ...(draft.name.trim() && { name: draft.name.trim() }), url: urls.get(draft.id) })))
  }
  return serialize(doc, contents)
}
