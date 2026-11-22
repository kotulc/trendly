import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ArrowDownToLine, ArrowUpToLine, CircleHelp, FolderOpen, Github, Layers3, Link2, List, Moon, Plus, RefreshCw, Rss, Settings, Sun, Trash2, X } from 'lucide-react'
import Feed, { entryMediaType, FeedCard, type FeedEntry } from './feed/Feed'
import { exampleRepository, importFolder, loadRepository, normalizeSubscriptions, openFolder, publicationPath, remoteRepository, repoAsset, website, type Commit, type ConfigChange, type ConfigFile, type Repository, type Snapshot, type Subscription } from './repository'
import { ConfigDialog, type PendingConfigChange } from './ConfigDialog'
import { feedSettings, sameFeedSettings, sourceProxyUrl, subscriptionDrafts, updateFeedSettings, updatePostDrafts, updateSourceProxy, updateSubscriptions, type FeedSettings, type SubscriptionDraft } from './config'
import { PublicationDialog, type PublicationCommit } from './PublicationDialog'
import { feedFormatHint, fetchFeed, type FeedFormat } from './rss'

type Page = 'posts' | 'preview' | 'feeds' | 'sources'
type Loaded = { repo: Repository; snapshot: Snapshot; workspace: number }
type FeedResult = { name: string; entries: FeedEntry[]; format?: FeedFormat; error?: string }
type FeedSource = { url?: string; candidate?: { name: string; format: FeedFormat }; subscriptions: SubscriptionDraft[]; removed: SubscriptionDraft[] }
type PostView = 'posts' | 'preview'
type SettingsEdit<T> = { original: T; value: T }

const mediaLabels = { article: 'Article', audio: 'Audio', video: 'Video', image: 'Image', link: 'Link' }
const feedFormatLabels: Record<FeedFormat, string> = { rss: 'RSS', atom: 'Atom' }
const repositorySourceLabels = { example: 'Bundled example', checkout: 'Live local checkout', import: 'Imported snapshot', github: 'GitHub' }
const postStatuses = ['Archived', 'Draft', 'Published']

function withPostStatus(post: FeedEntry): FeedEntry {
  const facets = post.facets ?? []
  const status = facets.find(facet => facet.name === 'status')
  const values = new Set([post.draft ? 'Draft' : 'Published'])
  for (const value of status?.values ?? []) {
    const normalized = value.toLowerCase()
    if (['draft', 'published', 'unpublished'].includes(normalized)) continue
    values.add(normalized === 'archived' ? 'Archived' : value)
  }
  return { ...post, facets: [
    { name: 'status', label: 'Status', hue: 35, ...status, values: [...values] },
    ...facets.filter(facet => facet.name !== 'status'),
  ] }
}

function byDate(direction: 'newest' | 'oldest') {
  return (a: FeedEntry, b: FeedEntry) => {
    const first = a.timestamp ?? (a.date ? Date.parse(a.date) : undefined)
    const second = b.timestamp ?? (b.date ? Date.parse(b.date) : undefined)
    if (first === undefined && second !== undefined) return 1
    if (second === undefined && first !== undefined) return -1
    return ((first ?? 0) - (second ?? 0)) * (direction === 'oldest' ? 1 : -1) || a.title.localeCompare(b.title)
  }
}

const navigation = [
  { id: 'posts', title: 'Posts', icon: Layers3 },
  { id: 'preview', title: 'Site feed', icon: List },
  { id: 'feeds', title: 'External feeds', icon: Rss },
  { id: 'sources', title: 'Sources', icon: Link2 },
] as const

const palettes: Record<string, [number, number]> = {
  slate: [215, 19], gray: [220, 9], blue: [221, 83], indigo: [243, 75], violet: [262, 83],
  rose: [347, 77], orange: [21, 90], amber: [38, 92], emerald: [161, 94], teal: [175, 84], cyan: [192, 91],
}

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Unable to load this repository.'
}

function postFromHash() {
  return new URLSearchParams(window.location.hash.slice(1)).get('post') || undefined
}

export function App() {
  const [data, setData] = useState<Loaded>()
  const [page, setPage] = useState<Page>('posts')
  const [linkedPost, setLinkedPost] = useState(postFromHash)
  const [search, setSearch] = useState('')
  const [tag, setTag] = useState('')
  const [status, setStatus] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [formatFilter, setFormatFilter] = useState('')
  const [sourceOrder, setSourceOrder] = useState('name')
  const [media, setMedia] = useState('')
  const [dateOrder, setDateOrder] = useState<'newest' | 'oldest'>('newest')
  const [remoteForm, setRemoteForm] = useState(false)
  const [error, setError] = useState('')
  const [liveRefreshError, setLiveRefreshError] = useState('')
  const [busy, setBusy] = useState(false)
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const [feedByUrl, setFeedByUrl] = useState(() => new Map<string, FeedResult>())
  const [activeFeed, setActiveFeed] = useState('')
  const [sourceSelections, setSourceSelections] = useState<Record<PostView, string>>({ posts: '', preview: '' })
  const [previewDrafts, setPreviewDrafts] = useState(() => new Map<string, boolean>())
  const [loadingFeeds, setLoadingFeeds] = useState(false)
  const [pendingPublication, setPendingPublication] = useState<{ entry: FeedEntry; destination: string }>()
  const [publicationCommit, setPublicationCommit] = useState<PublicationCommit>()
  const [configEditor, setConfigEditor] = useState<{
    path: ConfigFile; before?: string; repo: Repository; pending?: PendingConfigChange
  }>()
  const [configSaved, setConfigSaved] = useState<{ path: ConfigFile; commit?: Commit; message?: string }>()
  const [feedSettingsEdit, setFeedSettingsEdit] = useState<SettingsEdit<FeedSettings>>()
  const [proxyEdit, setProxyEdit] = useState<SettingsEdit<string>>()
  const [subscriptionEdits, setSubscriptionEdits] = useState<{ before?: string; feeds: SubscriptionDraft[]; removed: SubscriptionDraft[] }>()
  const [expandedSource, setExpandedSource] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const nextSubscriptionId = useRef(-1)
  const readVersion = useRef(0)
  const feedVersion = useRef(0)
  const fetchingFeeds = useRef('')
  const foreground = useRef(false)
  const theme = data?.snapshot.color

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', dark)
    const [hue, saturation] = palettes[theme || ''] || [0, 0]
    root.style.setProperty('--site-hs', `${hue}deg ${saturation}%`)
    root.dataset.typeset = data?.snapshot.typeset || 'sans'
    const header = getComputedStyle(root).getPropertyValue('--site-chrome-bg').trim()
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', header)
  }, [dark, theme, data?.snapshot.typeset])

  async function load(get: () => Promise<Repository> | Repository, replace = true, quiet = false) {
    if (quiet && foreground.current) return
    const version = ++readVersion.current
    if (!quiet) { foreground.current = true; setBusy(true); setError('') }
    let repo: Repository | undefined
    try {
      repo = await get()
      if (version !== readVersion.current) { repo.dispose?.(); return }
      if (quiet && repo.stamp === data?.repo.stamp) {
        repo.dispose?.()
        setLiveRefreshError('')
        return
      }
      const snapshot = await loadRepository(repo)
      if (version !== readVersion.current) { repo.dispose?.(); return }
      if (snapshot.proxy !== data?.snapshot.proxy || replace) {
        ++feedVersion.current
        setLoadingFeeds(false)
        setFeedByUrl(new Map())
      }
      if (replace) {
        setActiveFeed('')
      }
      setData({ repo, snapshot, workspace: replace ? version : data?.workspace ?? version })
      setLiveRefreshError('')
      if (!quiet) setError('')
      setPreviewDrafts(current => {
        if (replace) return new Map()
        if (!current.size) return current
        return new Map(snapshot.posts.flatMap(post => {
          const draft = current.get(post.id)
          return draft !== undefined && draft !== !!post.draft ? [[post.id, draft] as const] : []
        }))
      })
      if (replace) {
        setPublicationCommit(undefined)
        setConfigSaved(undefined)
        setFeedSettingsEdit(undefined)
        setProxyEdit(undefined)
        setSubscriptionEdits(undefined)
        setExpandedSource('')
        setSearch('')
        setTag('')
        setStatus('')
        setSourceFilter('')
        setFormatFilter('')
        setSourceOrder('name')
        setSourceSelections({ posts: '', preview: '' })
        setMedia('')
        setDateOrder('newest')
      }
      return true
    } catch (failure) {
      repo?.dispose?.()
      if (version === readVersion.current && !(failure instanceof DOMException && failure.name === 'AbortError')) {
        if (quiet) setLiveRefreshError(message(failure))
        else setError(message(failure))
      }
    } finally {
      if (!quiet && version === readVersion.current) {
        foreground.current = false
        setBusy(false)
      }
    }
  }

  useEffect(() => { void load(exampleRepository) }, [])

  useEffect(() => {
    function followPostLink() {
      const post = postFromHash()
      if (post) navigate('posts', post)
      else setLinkedPost(undefined)
    }
    window.addEventListener('hashchange', followPostLink)
    return () => window.removeEventListener('hashchange', followPostLink)
  }, [])

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.altKey || event.shiftKey ||
        document.querySelector('dialog[open]')) return
      if (event.target instanceof HTMLElement &&
        (event.target.isContentEditable || event.target.closest('input, select, textarea'))) return
      if (event.key !== '/' || event.ctrlKey || event.metaKey) return
      event.preventDefault()
      searchInput.current?.focus({ preventScroll: true })
    }
    window.addEventListener('keydown', focusSearch)
    return () => window.removeEventListener('keydown', focusSearch)
  }, [])

  useEffect(() => {
    const repo = data?.repo
    if (repo?.source !== 'checkout' || !repo.refresh || busy) return
    const refresh = repo.refresh

    let timer: number | undefined
    let running = false
    let stopped = false
    function schedule() {
      window.clearTimeout(timer)
      if (!stopped && !document.hidden) timer = window.setTimeout(check, 2000)
    }
    async function check() {
      if (stopped || running || document.hidden) return
      window.clearTimeout(timer)
      running = true
      await load(refresh, false, true)
      running = false
      schedule()
    }
    schedule()
    document.addEventListener('visibilitychange', check)
    return () => {
      stopped = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [data, busy])

  useEffect(() => () => data?.repo.dispose?.(), [data?.repo])

  function navigate(next: Page, post?: string) {
    setPage(next)
    setLinkedPost(post)
    if (post) setSourceSelections(current => ({ ...current, posts: '' }))
    else if (postFromHash()) window.history.replaceState(null, '', window.location.pathname + window.location.search)
    setSearch('')
    setTag('')
    setStatus('')
    setMedia('')
    setDateOrder('newest')
  }

  function chooseFolder() {
    const picker = (window as Window & { showDirectoryPicker?: Parameters<typeof openFolder>[0] }).showDirectoryPicker
    if (picker) void load(() => openFolder(picker))
    else fileInput.current?.click()
  }

  async function openRemote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    if (await load(() => remoteRepository(String(form.get('repository')), String(form.get('ref'))))) setRemoteForm(false)
  }

  async function reload() {
    if (data?.repo.refresh) await load(data.repo.refresh, false)
    else if (data?.repo.source === 'import') chooseFolder()
  }

  const snapshot = data?.snapshot
  const feedYaml = snapshot?.configs['feeds.yaml']
  const siteYaml = snapshot?.configs['mndsite.yaml']
  const savedFeedSettings = useMemo(() => feedSettings(siteYaml), [siteYaml])
  const savedProxyUrl = useMemo(() => sourceProxyUrl(feedYaml), [feedYaml])
  const before = subscriptionEdits ? subscriptionEdits.before : feedYaml
  const savedSubscriptions = useMemo(() => subscriptionDrafts(before), [before])
  const subscriptions = subscriptionEdits?.feeds ?? savedSubscriptions
  const removedSubscriptions = subscriptionEdits?.removed ?? []
  const subscriptionsChanged = !!subscriptionEdits
  const sourceChanges = subscriptionsChanged || !!proxyEdit
  const readerSubscriptions = subscriptionEdits ? normalizeSubscriptions(subscriptions) : snapshot?.subscriptions ?? []
  const readerKey = JSON.stringify(readerSubscriptions)
  const readingFeeds = page === 'feeds' || page === 'sources'
  const selectedFeed = readerSubscriptions.some(feed => feed.url === activeFeed) ? activeFeed : ''

  async function refreshFeeds(feeds: Subscription[] = readerSubscriptions) {
    if (!feeds.length) return
    const version = ++feedVersion.current
    fetchingFeeds.current = readerKey
    setLoadingFeeds(true)
    await Promise.all(feeds.map(async feed => {
      let result: FeedResult
      try { result = { ...feed, ...await fetchFeed(feed, snapshot?.proxy) } }
      catch (failure) { result = { ...feed, entries: [], error: message(failure) } }
      if (version === feedVersion.current) {
        setFeedByUrl(current => new Map(current).set(feed.url, result))
      }
    }))
    if (version === feedVersion.current) setLoadingFeeds(false)
  }

  useEffect(() => {
    if (!readingFeeds || (loadingFeeds && fetchingFeeds.current === readerKey)) return
    const missing = readerSubscriptions.filter(feed => feedByUrl.get(feed.url)?.name !== feed.name)
    if (!missing.length) return
    const timer = window.setTimeout(() => void refreshFeeds(missing), subscriptionsChanged ? 450 : 0)
    return () => window.clearTimeout(timer)
  }, [readingFeeds, readerKey, snapshot?.proxy, feedByUrl, loadingFeeds, subscriptionsChanged])

  const savedPosts = snapshot?.posts || []
  const draftChanges = new Map(savedPosts.flatMap(post => {
    const draft = previewDrafts.get(post.id)
    return draft !== undefined && draft !== !!post.draft && !post.path.startsWith('drafts/')
      ? [[post.path, draft] as const] : []
  }))
  const feedChanges = !!feedSettingsEdit || draftChanges.size > 0
  const previewPosts = page === 'preview' && previewDrafts.size > 0 ? savedPosts.map(post => {
    const draft = previewDrafts.get(post.id)
    if (draft === undefined || draft === !!post.draft) return post
    const tags = post.tags.filter(tag => tag !== 'draft')
    if (draft) tags.unshift('draft')
    const facets = (post.facets ?? []).filter(facet => facet.name !== 'tags')
    if (tags.length) {
      const previous = post.facets?.find(facet => facet.name === 'tags')
      facets.push({ name: 'tags', label: 'Tag', ...previous, values: tags })
    }
    return { ...post, draft, tags, facets, href: draft ? undefined : post.href }
  }) : savedPosts
  const posts = previewPosts.map(withPostStatus)
  const query = search.trim().toLowerCase()
  const facet = (entry: FeedEntry, name: string) => entry.facets?.find(item => item.name === name)?.values || []
  const matches = (entry: FeedEntry) => !query ||
    [entry.title, entry.summary, entry.body, entry.site || '', entry.origin || '',
      ...(entry.facets || []).flatMap(facet => facet.values), ...entry.sources.flatMap(source => [source.title || '', source.url, source.publisher || ''])]
      .some(value => value.toLowerCase().includes(query))
  const matchesFilters = (entry: FeedEntry) => matches(entry) && (!tag || facet(entry, 'tags').includes(tag)) &&
    (!status || facet(entry, 'status').includes(status)) && (!media || entryMediaType(entry) === media)
  const repositoryPage = page === 'posts' || page === 'preview' ? page : undefined
  const postPublishers = new Map<string, { name: string; posts: Set<string> }>()
  if (repositoryPage) for (const post of posts) {
    const names = post.sources.map(citation => citation.publisher || new URL(citation.url).hostname.replace(/^www\./, ''))
    if (post.site || !names.length) names.push(post.site || snapshot!.title)
    for (const name of names) {
      const key = name.toLowerCase()
      const publisher = postPublishers.get(key) ?? { name, posts: new Set<string>() }
      publisher.posts.add(post.id)
      postPublishers.set(key, publisher)
    }
  }
  const selectedSource = repositoryPage ? sourceSelections[repositoryPage] : ''
  const selectedPosts = postPublishers.get(selectedSource)?.posts
  const listedPosts = repositoryPage ? posts.filter(post =>
    matchesFilters(post) && (!selectedPosts?.size || selectedPosts.has(post.id))).sort(byDate(dateOrder)) : undefined
  const sidebarFilter = repositoryPage ? {
    label: `${page === 'posts' ? 'Posts' : 'Site feed'} publishers and citations`, all: 'All publishers',
    options: [...postPublishers].map(([key, publisher]) => ({ key, name: publisher.name })).sort((a, b) => a.name.localeCompare(b.name)),
    selected: selectedPosts?.size ? selectedSource : '',
    select: (key: string) => setSourceSelections(current => ({ ...current, [repositoryPage]: key })),
  } : page === 'feeds' ? {
    label: 'Feed subscriptions', all: 'All feeds',
    options: readerSubscriptions.map(feed => ({ key: feed.url, name: feed.name })),
    selected: selectedFeed, select: setActiveFeed,
  } : undefined
  const visibleFeeds = readerSubscriptions.filter(feed => !selectedFeed || feed.url === selectedFeed)
  const feedEntries = visibleFeeds.flatMap(feed => (feedByUrl.get(feed.url)?.entries ?? [])
    .map(entry => ({ ...entry, origin: feed.name })))
  const activity = feedEntries.filter(matchesFilters).sort(byDate(dateOrder))
  const filterEntries = page === 'feeds' ? feedEntries : posts
  const availableTags = [...new Set(filterEntries.flatMap(entry => facet(entry, 'tags')))].sort()
  const availableStatuses = [...new Set([
    ...(repositoryPage ? postStatuses : []), ...filterEntries.flatMap(entry => facet(entry, 'status')),
  ])].sort()
  const sources = new Map<string, FeedSource>()
  function feedSource(key: string, url?: string) {
    const source = sources.get(key) ?? { url, subscriptions: [], removed: [] }
    sources.set(key, source)
    return source
  }
  if (page === 'sources') {
    if (snapshot?.rss) feedSource(snapshot.rss, snapshot.rss).candidate = { name: snapshot.title, format: 'rss' }
    for (const post of posts) for (const citation of post.sources) {
      const format = feedFormatHint(citation.url, citation.kind)
      if (!format) continue
      const source = feedSource(citation.url, citation.url)
      source.candidate ??= { name: citation.publisher || new URL(citation.url).hostname, format }
    }
    for (const [drafts, group] of [[subscriptions, 'subscriptions'], [removedSubscriptions, 'removed']] as const) {
      for (const feed of drafts) {
        const url = website(feed.url)
        feedSource(url ?? `draft:${feed.id}`, url)[group].push(feed)
      }
    }
  }
  const listedSources = [...sources.values()].map(source => {
    const draft = source.subscriptions[0] ?? source.removed[0]
    const result = source.url ? feedByUrl.get(source.url) : undefined
    const format = result?.format ?? source.candidate?.format ?? (source.url ? feedFormatHint(source.url) : undefined)
    const name = draft?.name.trim() || source.candidate?.name || (source.url ? new URL(source.url).hostname : 'New subscription')
    const entryCount = result && !result.error ? result.entries.length : undefined
    return { ...source, key: draft ? `draft:${draft.id}` : source.url!, name, result, format, draft, entryCount }
  }).filter(source =>
    [source.name, source.url ?? source.draft?.url ?? ''].some(value => value.toLowerCase().includes(query)) &&
    (!formatFilter || source.format === formatFilter) &&
    (!sourceFilter || (source.subscriptions.length > 0) === (sourceFilter === 'subscribed')))
    .sort((a, b) => Math.min(a.draft?.id ?? 0, 0) - Math.min(b.draft?.id ?? 0, 0) ||
      (sourceOrder === 'entries' ? (b.entryCount ?? -1) - (a.entryCount ?? -1) : 0) ||
      a.name.localeCompare(b.name) || (a.url ?? '').localeCompare(b.url ?? ''))
  const visibleCount = page === 'sources' ? listedSources.length : page === 'feeds' ? activity.length : listedPosts?.length ?? 0
  const totalCount = page === 'sources' ? sources.size : page === 'feeds' ? feedEntries.length : posts.length
  const [singular, plural] = page === 'sources' ? ['feed', 'feeds'] : page === 'feeds' ? ['entry', 'entries'] : ['post', 'posts']
  const countText = `${visibleCount}${visibleCount < totalCount ? ` of ${totalCount}` : ''} ${totalCount === 1 ? singular : plural}`
  const descriptions: Record<Page, string> = {
    posts: 'Browse Markdown from the host site’s repository.',
    preview: 'Preview the host site’s posts and edit its mndsite feed settings.',
    feeds: 'Read entries from the RSS and Atom feeds you subscribe to.',
    sources: 'Manage subscriptions to RSS and Atom feeds, including the host site’s published RSS feed.',
  }
  const active = navigation.find(item => item.id === page)!
  const searchLabel = `Search ${active.title.toLowerCase()}`

  function togglePreviewPublication(id: string) {
    const post = savedPosts.find(entry => entry.id === id)
    if (!post) return
    setPreviewDrafts(current => {
      const saved = !!post.draft
      const draft = !(current.get(id) ?? saved)
      const next = new Map(current)
      if (draft === saved) next.delete(id)
      else next.set(id, draft)
      return next
    })
  }

  function preparePublication(entry: FeedEntry) {
    if (!data) return
    try {
      setError('')
      if (entry.draft && !entry.path.startsWith('drafts/')) {
        const path = 'mndsite.yaml'
        const before = data.snapshot.configs[path]
        const after = updatePostDrafts(before, new Map([[entry.path, false]]))
        if (after === undefined || after === before) throw new Error('Refresh the workspace and try the publication change again.')
        setConfigEditor({ path, before, repo: data.repo, pending: {
          change: { path, before, after }, postTitle: entry.title, action: 'Publish post', successMessage: 'Post marked published.',
        } })
      } else {
        setPendingPublication({ entry, destination: publicationPath(data.snapshot, entry) })
      }
    } catch (failure) { setError(message(failure)) }
  }

  function editSubscriptions(feeds: SubscriptionDraft[], removed = removedSubscriptions) {
    const ordered = [...feeds.filter(feed => feed.id >= 0).sort((a, b) => a.id - b.id), ...feeds.filter(feed => feed.id < 0)]
    setSubscriptionEdits(JSON.stringify(ordered) === JSON.stringify(savedSubscriptions) ? undefined : { before, feeds: ordered, removed })
    setError('')
  }

  function addSubscription() {
    const id = nextSubscriptionId.current--
    editSubscriptions([...subscriptions, { id, name: '', url: '' }])
    setSearch('')
    setSourceFilter('')
    setFormatFilter('')
    setExpandedSource(`draft:${id}`)
  }

  function toggleSubscription(source: FeedSource) {
    if (source.subscriptions.length > 0) {
      const ids = new Set(source.subscriptions.map(feed => feed.id))
      const removed = source.subscriptions.filter(feed => feed.originalIndex !== undefined)
      editSubscriptions(subscriptions.filter(feed => !ids.has(feed.id)), [...removedSubscriptions, ...removed])
    } else if (source.removed.length > 0) {
      const ids = new Set(source.removed.map(feed => feed.id))
      editSubscriptions([...subscriptions, ...source.removed], removedSubscriptions.filter(feed => !ids.has(feed.id)))
      if (sourceFilter === 'unsubscribed') setSourceFilter('')
    } else if (source.url && source.candidate) {
      const id = nextSubscriptionId.current--
      editSubscriptions([...subscriptions, { id, name: source.candidate.name, url: source.url }])
      if (sourceFilter === 'unsubscribed') setSourceFilter('')
      setExpandedSource(`draft:${id}`)
    }
  }

  function editFeedSettings(value: FeedSettings) {
    setFeedSettingsEdit(current => sameFeedSettings(value, savedFeedSettings)
      ? undefined : { original: current?.original ?? savedFeedSettings, value })
    setError('')
  }

  function editProxyUrl(value: string) {
    setProxyEdit(current => value.trim() === savedProxyUrl.trim()
      ? undefined : { original: current?.original ?? savedProxyUrl, value })
    setError('')
  }

  function sourceConfigChange(): ConfigChange {
    if (before !== feedYaml || (proxyEdit && proxyEdit.original !== savedProxyUrl)) {
      throw new Error('Source settings changed on disk. Discard changes to use the latest version.')
    }
    const updatedSubscriptions = subscriptionsChanged ? updateSubscriptions(before, subscriptions) : before
    const after = proxyEdit ? updateSourceProxy(updatedSubscriptions, proxyEdit.value) : updatedSubscriptions
    if (after === undefined || after === before) throw new Error('Make a source settings change before saving.')
    return { path: 'feeds.yaml', before, after }
  }

  function openSourceSettings() {
    if (!data) return
    setError('')
    setConfigEditor({ path: 'feeds.yaml', before: feedYaml, repo: data.repo })
  }

  function discardSourceChanges() {
    setSubscriptionEdits(undefined)
    setProxyEdit(undefined)
    setExpandedSource('')
    setError('')
  }

  function discardFeedChanges() {
    setPreviewDrafts(new Map())
    setFeedSettingsEdit(undefined)
    setError('')
  }

  async function finishConfigWrite(path: ConfigFile, repo: Repository, commit?: Commit, message?: string, savedPageSettings = true) {
    setConfigSaved({ path, commit, message })
    if (repo.refresh && await load(repo.refresh, false) && savedPageSettings) {
      if (path === 'feeds.yaml') {
        setSubscriptionEdits(undefined)
        setProxyEdit(undefined)
      } else {
        setFeedSettingsEdit(undefined)
      }
    }
  }

  async function saveLocalConfig(repo: Repository, prepareChange: () => ConfigChange) {
    if (busy || !repo.writeConfig) return
    ++readVersion.current
    foreground.current = true
    setBusy(true)
    setError('')
    try {
      const change = prepareChange()
      await repo.writeConfig(change)
      await finishConfigWrite(change.path, repo)
    } catch (failure) { setError(message(failure)) }
    finally {
      foreground.current = false
      setBusy(false)
    }
  }

  function saveConfigChanges(prepareChange: () => ConfigChange) {
    if (!data) return
    if (data.repo.writeConfig) {
      void saveLocalConfig(data.repo, prepareChange)
      return
    }
    setError('')
    try {
      const change = prepareChange()
      setConfigEditor({ path: change.path, before: change.before, repo: data.repo,
        pending: { change, action: 'Save changes' } })
    } catch (failure) { setError(message(failure)) }
  }

  function feedConfigChange(): ConfigChange {
    const path = 'mndsite.yaml'
    if (feedSettingsEdit && !sameFeedSettings(feedSettingsEdit.original, savedFeedSettings)) {
      throw new Error('Feed settings changed on disk. Discard changes to use the latest version.')
    }
    const updatedSettings = feedSettingsEdit ? updateFeedSettings(siteYaml, feedSettingsEdit.value) : siteYaml
    const after = draftChanges.size ? updatePostDrafts(updatedSettings, draftChanges) : updatedSettings
    if (after === undefined || after === siteYaml) throw new Error('Make a feed settings change before saving.')
    return { path, before: siteYaml, after }
  }

  return (
    <div className="app">
      <header className="navbar">
        <div className="navbar-inner">
          <button className="brand" onClick={() => navigate('posts')}>
            <span className="brand-mark" aria-hidden="true" /> Trendly
          </button>
          <div className="navbar-search" role="search" aria-label={active.title}>
            <input ref={searchInput} type="search" aria-label={searchLabel} aria-keyshortcuts="/"
              placeholder={`${searchLabel}…`} value={search} onChange={event => setSearch(event.target.value)} />
            {search ? <button className="icon-button search-clear" type="button" aria-label="Clear search" onClick={() => {
              setSearch('')
              searchInput.current?.focus()
            }}><X size={15} aria-hidden="true" /></button> : <kbd aria-hidden="true">/</kbd>}
          </div>
          <div className="navbar-actions">
            <button className="icon-button" aria-label="Open folder" title="Open folder" onClick={chooseFolder} disabled={busy}><FolderOpen size={17} aria-hidden="true" /></button>
            <input type="file" ref={fileInput} hidden {...{ webkitdirectory: '' }} onChange={event => {
              const files = event.currentTarget.files
              if (files?.length) {
                const imported = importFolder(files)
                void load(() => imported)
              }
              event.currentTarget.value = ''
            }} />
            <button className="icon-button" aria-label="Open GitHub" title="Open GitHub" onClick={() => setRemoteForm(!remoteForm)} aria-expanded={remoteForm}><Github size={17} aria-hidden="true" /></button>
            {(page === 'feeds' || page === 'sources') && <button className="icon-button" aria-label="Refresh feeds" title="Refresh feeds"
              disabled={loadingFeeds || !readerSubscriptions.length} onClick={() => void refreshFeeds()}><RefreshCw size={17} aria-hidden="true" /></button>}
            <button className="icon-button" aria-label={dark ? 'Light theme' : 'Dark theme'} onClick={() => setDark(!dark)}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button>
          </div>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <div className="sidebar-repo">
            <strong>{snapshot?.title || 'Repository'}</strong>
            {data && <>
              <span>{data.repo.label}</span>
              <span title={data.repo.revision}>{repositorySourceLabels[data.repo.source]}
                {data.repo.ref && ` · ${data.repo.ref}`}{data.repo.revision && ` · ${data.repo.revision.slice(0, 8)}`}</span>
            </>}
          </div>
          <nav aria-label="Trendly views">
            {navigation.map(({ id, title, icon: Icon }) => <Fragment key={id}>
              <button aria-current={page === id ? 'page' : undefined} onClick={() => navigate(id)}>
                <Icon size={17} aria-hidden="true" /> {title}
              </button>
              {id === page && !!sidebarFilter?.options.length && (
                <ul className="sidebar-feeds" aria-label={sidebarFilter.label}>
                  <li><button aria-pressed={!sidebarFilter.selected} onClick={() => sidebarFilter.select('')}>{sidebarFilter.all}</button></li>
                  {sidebarFilter.options.map(option => <li key={option.key}>
                    <button aria-pressed={sidebarFilter.selected === option.key} onClick={() => sidebarFilter.select(option.key)}>{option.name}</button>
                  </li>)}
                </ul>
              )}
            </Fragment>)}
          </nav>
        </aside>

        <main>
          {remoteForm && <form className="remote-form" onSubmit={openRemote}>
            <label>GitHub repository<input name="repository" placeholder="owner/repository" required autoFocus /></label>
            <label>Branch, tag, or commit<input name="ref" placeholder="Default branch" /></label>
            <button className="button primary" type="submit" disabled={busy}>Open repository</button>
            <button className="icon-button" type="button" aria-label="Close repository form" onClick={() => setRemoteForm(false)}><X size={17} /></button>
          </form>}
          <div className="page-heading">
            <div className="breadcrumb">{snapshot?.title || 'Repository'} <span aria-hidden="true">/</span> {active.title}</div>
            <h1>{active.title}</h1>
            <p>{page === 'posts' && snapshot?.description ? snapshot.description : descriptions[page]}</p>
          </div>
          {(page === 'preview' || page === 'sources') && <div className="settings-actions">
            {page === 'preview'
              ? <button className="button" disabled={busy || !data} onClick={() => {
                if (data) setConfigEditor({ path: 'mndsite.yaml', before: data.snapshot.configs['mndsite.yaml'], repo: data.repo })
              }}><Settings size={15} aria-hidden="true" /> Feed settings</button>
              : <button className="button" disabled={busy || !data} onClick={openSourceSettings}>
                <Settings size={15} aria-hidden="true" /> Source settings
              </button>}
            {(page === 'preview' ? feedChanges : sourceChanges) && <button className="button primary" disabled={busy}
              onClick={() => saveConfigChanges(page === 'preview' ? feedConfigChange : sourceConfigChange)}>Save changes</button>}
            {(page === 'preview' ? feedChanges || previewDrafts.size > 0 : sourceChanges) && <button className="button" disabled={busy}
              onClick={page === 'preview' ? discardFeedChanges : discardSourceChanges}>Discard changes</button>}
            {page === 'preview' && snapshot?.rss && <a className="button" href={snapshot.rss} target="_blank" rel="noreferrer">
              <Rss size={15} aria-hidden="true" /> Published RSS
            </a>}
          </div>}
          {page === 'preview' && previewDrafts.size > draftChanges.size && <p className="activity publication-save-note">
            Use Posts to publish files from <code>drafts/</code>.
          </p>}
          {error && <div className="notice" role="alert"><CircleHelp size={18} />{error}</div>}
          {liveRefreshError && !error && <p className="notice" role="status">Showing the last loaded checkout. {liveRefreshError}</p>}
          {repositoryPage && publicationCommit && <p className="notice" role="status">
            Committed to GitHub. <a href={publicationCommit.url} target="_blank" rel="noreferrer">View commit {publicationCommit.oid.slice(0, 8)}</a>
          </p>}
          {configSaved && (page === 'preview' && configSaved.path === 'mndsite.yaml' || page === 'sources' && configSaved.path === 'feeds.yaml') &&
            <p className="notice" role="status">{configSaved.message ?? `Saved ${configSaved.path}.`}
              {configSaved.commit && <a href={configSaved.commit.url} target="_blank" rel="noreferrer">View commit {configSaved.commit.oid.slice(0, 8)}</a>}
            </p>}
          <div className="controls">
            {page !== 'sources' && <>
              {(availableTags.length > 0 || tag) && <select aria-label="Filter by tag" value={tag} onChange={event => setTag(event.target.value)}>
                <option value="">All tags</option>{availableTags.map(value => <option key={value}>{value}</option>)}
                {tag && !availableTags.includes(tag) && <option>{tag}</option>}
              </select>}
              {(availableStatuses.length > 0 || status) && <select aria-label="Filter by status" value={status} onChange={event => setStatus(event.target.value)}>
                <option value="">All statuses</option>{availableStatuses.map(value => <option key={value}>{value}</option>)}
                {status && !availableStatuses.includes(status) && <option>{status}</option>}
              </select>}
              <select aria-label="Filter by media type" value={media} onChange={event => setMedia(event.target.value)}>
                <option value="">All media types</option>{Object.entries(mediaLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <select aria-label="Sort by date" value={dateOrder} onChange={event => setDateOrder(event.target.value === 'oldest' ? 'oldest' : 'newest')}>
                <option value="newest">Newest first</option><option value="oldest">Oldest first</option>
              </select>
            </>}
            {page === 'sources' && <>
              <select aria-label="Filter by subscription status" value={sourceFilter} onChange={event => setSourceFilter(event.target.value)}>
                <option value="">All feeds</option><option value="subscribed">Subscribed</option><option value="unsubscribed">Unsubscribed</option>
              </select>
              <select aria-label="Filter by feed format" value={formatFilter} onChange={event => setFormatFilter(event.target.value)}>
                <option value="">All formats</option>
                {Object.entries(feedFormatLabels).map(([format, label]) => <option key={format} value={format}>{label}</option>)}
              </select>
              <select aria-label="Sort feeds" value={sourceOrder} onChange={event => setSourceOrder(event.target.value)}>
                <option value="name">Name A–Z</option><option value="entries">Most feed entries</option>
              </select>
            </>}
            <div className="controls-end">
              {page !== 'feeds' && data && data.repo.source !== 'example' &&
                <button className="button" disabled={busy} onClick={() => void reload()}><RefreshCw size={15} aria-hidden="true" /> {data.repo.source === 'import' ? 'Reopen folder' : page === 'sources' ? 'Reload workspace' : 'Refresh'}</button>}
              <span className="count" role="status">{countText}</span>
            </div>
          </div>

          {busy && <p className="activity" role="status">Loading repository…</p>}
          {data && listedPosts && (
            <Feed entries={listedPosts} key={`${page}-${data.workspace}-${page === 'posts' ? linkedPost || '' : ''}`}
              initialExpanded={page === 'posts' ? linkedPost : undefined} defaultSource={data.snapshot.title}
              resolveImage={(value, entry) => repoAsset(data.repo, value, entry)}
              publicationControls={page === 'preview'}
              renderAction={page === 'preview' ? entry => {
                const action = entry.draft ? 'Publish' : 'Unpublish'
                return <button className="button state-toggle" type="button" data-next-status={entry.draft ? 'published' : 'draft'}
                  aria-label={`${action} ${entry.title}`} disabled={busy}
                  title={entry.draft ? 'Preview as published' : 'Preview as unpublished'}
                  onClick={() => togglePreviewPublication(entry.id)}>{action}</button>
              } : data.repo.publication ? entry =>
                <button className="button post-action" disabled={busy} onClick={() => preparePublication(entry)}
                  title={entry.draft ? 'Publish' : 'Unpublish'} aria-label={`${entry.draft ? 'Publish' : 'Unpublish'} ${entry.title}`}>
                  {entry.draft ? <ArrowUpToLine size={15} aria-hidden="true" /> : <ArrowDownToLine size={15} aria-hidden="true" />}
                  <span>{entry.draft ? 'Publish' : 'Unpublish'}</span>
                </button> : undefined} />
          )}
          {posts.length > 0 && listedPosts?.length === 0 && <p className="activity">No posts match these filters.</p>}
          {page === 'sources' && <>
            {listedSources.length > 0 && <div className="mnd-feed source-list state-card-list">{listedSources.map(source => {
              const { key, url, format, result, name, entryCount } = source
              const subscribed = source.subscriptions.length > 0
              let statusText = ''
              if (subscribed) {
                if (entryCount !== undefined) statusText = `${entryCount} ${entryCount === 1 ? 'feed entry' : 'feed entries'}`
                else if (result?.error) statusText = 'Feed unavailable'
                else statusText = url ? 'Loading…' : 'Enter a feed URL'
              } else if (source.removed.length > 0) statusText = 'Removal staged'
              const open = expandedSource === key || source.subscriptions.some(feed => expandedSource === `draft:${feed.id}`)
              return <div className="mnd-feed-row" key={key} data-subscribed={subscribed}>
                <FeedCard title={name} open={open}
                toggle={() => setExpandedSource(open ? '' : key)}
                tags={format && <span className="mnd-feed-tags">
                  <span className="mnd-feed-facet">{feedFormatLabels[format]}</span>
                </span>}
                meta={<>
                  {url && <span className="source-feed-url">{url}</span>}
                  {statusText && <span className="mnd-feed-meta-item">{statusText}</span>}
                </>}>
                  {open && subscribed && <div className="subscription-editor">
                    {source.subscriptions.map((feed, index) => <fieldset key={feed.id} disabled={busy}>
                      <legend>{source.subscriptions.length > 1 ? `Subscription ${index + 1}` : 'Subscription'}</legend>
                      <label>Name<input value={feed.name} placeholder="Feed name" autoFocus={feed.id < 0 && !feed.url} onChange={event =>
                        editSubscriptions(subscriptions.map(item => item.id === feed.id ? { ...item, name: event.target.value } : item))} /></label>
                      <label>Feed URL<input value={feed.url} placeholder="https://example.com/rss.xml" onChange={event =>
                        editSubscriptions(subscriptions.map(item => item.id === feed.id ? { ...item, url: event.target.value } : item))} /></label>
                      <button className="icon-button" type="button" aria-label={`Remove subscription ${index + 1}`} title="Remove subscription"
                        onClick={() => editSubscriptions(subscriptions.filter(item => item.id !== feed.id))}><Trash2 size={16} aria-hidden="true" /></button>
                    </fieldset>)}
                  </div>}
                  {open && subscribed && result?.error && <p className="notice">{result.error}</p>}
                  {open && !subscribed && source.removed.length === 0 && url && <p className="mnd-feed-meta">
                    <a href={url} target="_blank" rel="noreferrer">Open feed</a>
                  </p>}
                </FeedCard>
                <div className="mnd-feed-action">
                  <button className="button subscription-toggle state-toggle" type="button" role="switch" aria-checked={subscribed}
                    disabled={busy} aria-label={`${name} subscription`} title={subscribed ? 'Unsubscribe' : 'Subscribe'}
                    onClick={() => toggleSubscription(source)}>{subscribed ? 'Subscribed' : 'Unsubscribed'}</button>
                </div>
              </div>
            })}</div>}
            {snapshot && sources.size === 0 && <p className="activity">No feeds found. Add a subscription by feed URL.</p>}
            {sources.size > 0 && listedSources.length === 0 && <p className="activity">No feeds match these filters.</p>}
            <button className="button subscription-add" type="button" disabled={busy || !data} onClick={addSubscription}>
              <Plus size={16} aria-hidden="true" /> Add subscriptions
            </button>
          </>}
          {page === 'feeds' && <>
            {subscriptionsChanged && <p className="notice">Previewing unsaved subscription changes. <button className="button" onClick={() => navigate('sources')}>Sources</button></p>}
            {loadingFeeds && <p className="activity" role="status">Loading feeds…</p>}
            {snapshot && readerSubscriptions.length === 0 && <p className="activity">No feed subscriptions.</p>}
            {visibleFeeds.map(feed => {
              const failure = feedByUrl.get(feed.url)?.error
              return failure && <p className="notice" key={feed.url}>{feed.name} could not be loaded. {failure}</p>
            })}
            <Feed entries={activity} key={data?.workspace} />
            {feedEntries.length > 0 && activity.length === 0 && <p className="activity">No entries match these filters.</p>}
          </>}
        </main>
      </div>
      {data?.repo.publication && pendingPublication && <PublicationDialog
        entry={pendingPublication.entry} initialDestination={pendingPublication.destination}
        snapshot={data.snapshot} repository={data.repo.label} publication={data.repo.publication}
        onClose={() => setPendingPublication(undefined)} onCommit={commit => {
          setPendingPublication(undefined)
          setPublicationCommit(commit)
          if (data.repo.refresh) void load(data.repo.refresh, false)
        }} />}
      {configEditor && <ConfigDialog {...configEditor}
        before={configEditor.pending ? configEditor.before : snapshot?.configs[configEditor.path]}
        editor={configEditor.path === 'mndsite.yaml'
          ? { kind: 'feed', value: feedSettingsEdit?.value ?? savedFeedSettings, onChange: editFeedSettings }
          : { kind: 'source', value: proxyEdit?.value ?? savedProxyUrl, onChange: editProxyUrl }}
        prepareChange={configEditor.path === 'mndsite.yaml'
          ? feedChanges ? feedConfigChange : undefined
          : sourceChanges ? sourceConfigChange : undefined}
        onDiscard={() => {
          if (configEditor.path === 'feeds.yaml') discardSourceChanges()
          else discardFeedChanges()
          setConfigEditor(undefined)
        }}
        onClose={() => setConfigEditor(undefined)} onWrite={commit => {
        setConfigEditor(undefined)
        void finishConfigWrite(configEditor.path, configEditor.repo, commit, configEditor.pending?.successMessage, !configEditor.pending?.postTitle)
      }} />}
    </div>
  )
}
