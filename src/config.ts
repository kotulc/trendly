import { isMap, isSeq, parseDocument } from 'yaml'
import { isDraftPath, website } from './repository'

type FeedSettings = { section: string; expandable: boolean; siteUrl: string }
export type SubscriptionDraft = { id: number; originalIndex?: number; name: string; url: string }

function readYaml(contents?: string) {
  const doc = parseDocument(contents ?? '')
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

export function updatePostDraft(contents: string | undefined, path: string, draft: boolean) {
  if (!isDraftPath(path)) throw new Error('Choose a repository-relative Markdown path.')
  const doc = readYaml(contents)
  const paths = doc.get('drafts', true)
  if (isSeq(paths)) {
    const current = paths.toJSON() as string[]
    if (current.includes(path) === draft) return contents
    if (draft) paths.add(path)
    else paths.items = paths.items.filter((_, index) => current[index] !== path)
  } else if (doc.get('drafts') == null && draft) {
    doc.set('drafts', [path])
  } else {
    return contents
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
