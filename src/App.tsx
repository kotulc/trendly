import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ArrowDownToLine, ArrowUpToLine, CircleHelp, FolderOpen, Github, Layers3, Link2, List, Moon, Plus, RefreshCw, Rss, Settings, Sun, Trash2, X } from 'lucide-react'
import Feed, { entryMediaType, FeedCard, type FeedEntry } from './feed/Feed'
import { exampleRepository, importFolder, loadRepository, openFolder, publicationPath, remoteRepository, repoAsset, website, type Commit, type ConfigChange, type ConfigFile, type Repository, type Snapshot } from './repository'
import { ConfigDialog } from './ConfigDialog'
import { subscriptionDrafts, updateSubscriptions, type SubscriptionDraft } from './config'
import { PublicationDialog, type PublicationCommit } from './PublicationDialog'
import { feedFormatHint, fetchFeed, type FeedFormat } from './rss'

type Page = 'posts' | 'preview' | 'feeds' | 'sources'
type Loaded = { repo: Repository; snapshot: Snapshot }
type FeedResult = { url: string; name: string; entries: FeedEntry[]; format?: FeedFormat; error?: string }
type SourceSummary = { name: string; published: Set<string>; feeds: string[]; posts: Set<string>; subscriptions: SubscriptionDraft[]; removed: SubscriptionDraft[]; knownFeeds: Map<string, FeedFormat> }
type PostView = 'posts' | 'preview'

const mediaLabels = { article: 'Article', audio: 'Audio', video: 'Video', image: 'Image', link: 'Link' }

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
  const [sourceOrder, setSourceOrder] = useState('name')
  const [media, setMedia] = useState('')
  const [dateOrder, setDateOrder] = useState<'newest' | 'oldest'>('newest')
  const [remoteForm, setRemoteForm] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const [feedResults, setFeedResults] = useState<FeedResult[]>()
  const [activeFeed, setActiveFeed] = useState('')
  const [sourceSelections, setSourceSelections] = useState<Record<PostView, string>>({ posts: '', preview: '' })
  const [loadingFeeds, setLoadingFeeds] = useState(false)
  const [pendingPublication, setPendingPublication] = useState<{ entry: FeedEntry; destination: string }>()
  const [publicationCommit, setPublicationCommit] = useState<PublicationCommit>()
  const [configEditor, setConfigEditor] = useState<{ path: ConfigFile; before?: string; repo: Repository; preview?: ConfigChange }>()
  const [configSaved, setConfigSaved] = useState<{ path: ConfigFile; commit?: Commit }>()
  const [subscriptionEdits, setSubscriptionEdits] = useState<{ before?: string; feeds: SubscriptionDraft[]; removed: SubscriptionDraft[] }>()
  const [expandedSource, setExpandedSource] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const nextSubscriptionId = useRef(-1)
  const readVersion = useRef(0)
  const feedVersion = useRef(0)
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
      if (quiet && repo.stamp === data?.repo.stamp) { repo.dispose?.(); return }
      const snapshot = await loadRepository(repo)
      if (version !== readVersion.current) { repo.dispose?.(); return }
      if (JSON.stringify(snapshot.subscriptions) !== JSON.stringify(data?.snapshot.subscriptions) ||
        snapshot.proxy !== data?.snapshot.proxy || replace) {
        ++feedVersion.current
        setLoadingFeeds(false)
        setFeedResults(undefined)
        setActiveFeed('')
      }
      setData({ repo, snapshot })
      setError('')
      if (replace) {
        setPublicationCommit(undefined)
        setConfigSaved(undefined)
        setSubscriptionEdits(undefined)
        setExpandedSource('')
        setSearch('')
        setTag('')
        setStatus('')
        setSourceFilter('')
        setSourceOrder('name')
        setSourceSelections({ posts: '', preview: '' })
        setMedia('')
        setDateOrder('newest')
      }
    } catch (failure) {
      repo?.dispose?.()
      if (version === readVersion.current && !(failure instanceof DOMException && failure.name === 'AbortError')) setError(message(failure))
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
    if (!repo) return
    if (repo.refresh && !repo.revision && !busy) {
      const timer = window.setInterval(() => {
        if (!document.hidden) void load(repo.refresh!, false, true)
      }, 3500)
      return () => window.clearInterval(timer)
    }
  }, [data, busy])

  useEffect(() => () => data?.repo.dispose?.(), [data?.repo])

  async function refreshFeeds(snapshot = data?.snapshot) {
    if (!snapshot) return
    const version = ++feedVersion.current
    setLoadingFeeds(true)
    try {
      const results = await Promise.all(snapshot.subscriptions.map(async feed => {
        try { return { ...feed, ...await fetchFeed(feed, snapshot.proxy) } }
        catch (failure) { return { ...feed, entries: [], error: message(failure) } }
      }))
      if (version === feedVersion.current) setFeedResults(results)
    } finally { if (version === feedVersion.current) setLoadingFeeds(false) }
  }

  useEffect(() => {
    if ((page === 'feeds' || page === 'sources') && !feedResults && !loadingFeeds && data?.snapshot.subscriptions.length) void refreshFeeds()
  }, [page, feedResults, loadingFeeds, data?.snapshot.subscriptions])

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
    await load(() => remoteRepository(String(form.get('repository')), String(form.get('ref'))))
    setRemoteForm(false)
  }

  async function reload() {
    if (data?.repo.refresh) await load(data.repo.refresh, false)
    else if (data?.repo.label === 'Example repository') return
    else chooseFolder()
  }

  const snapshot = data?.snapshot
  const feedYaml = snapshot?.configs['feeds.yaml']
  const before = subscriptionEdits ? subscriptionEdits.before : feedYaml
  const savedSubscriptions = useMemo(() => subscriptionDrafts(before), [before])
  const subscriptions = subscriptionEdits?.feeds ?? savedSubscriptions
  const removedSubscriptions = subscriptionEdits?.removed ?? []
  const subscriptionsChanged = !!subscriptionEdits
  const posts = snapshot?.posts || []
  const query = search.trim().toLowerCase()
  const facet = (entry: FeedEntry, name: string) => entry.facets?.find(item => item.name === name)?.values || []
  const matches = (entry: FeedEntry) => !query ||
    [entry.title, entry.summary, entry.body, entry.site || '', entry.origin || '',
      ...(entry.facets || []).flatMap(facet => facet.values), ...entry.sources.flatMap(source => [source.title || '', source.url, source.publisher || ''])]
      .some(value => value.toLowerCase().includes(query))
  const matchesFilters = (entry: FeedEntry) => matches(entry) && (!tag || facet(entry, 'tags').includes(tag)) &&
    (!status || facet(entry, 'status').includes(status)) && (!media || entryMediaType(entry) === media)
  const repositoryPage = page === 'posts' || page === 'preview' ? page : undefined
  const sources = new Map<string, SourceSummary>()
  function sourceSummary(name: string, key = name.toLowerCase()) {
    const existing = sources.get(key)
    if (existing) return existing
    const summary: SourceSummary = { name, published: new Set(), feeds: [], posts: new Set(), subscriptions: [], removed: [], knownFeeds: new Map() }
    sources.set(key, summary)
    return summary
  }
  const subscriptionNames = new Map(snapshot?.subscriptions.map(feed => [feed.url, feed.name]))
  for (const post of snapshot?.posts || []) {
    const cited = post.sources.map(citation => {
      const format = feedFormatHint(citation.url, citation.kind)
      const name = (format && subscriptionNames.get(citation.url)) || citation.publisher || new URL(citation.url).hostname.replace(/^www\./, '')
      return { name, format, url: citation.url }
    })
    if (post.site || !cited.length) cited.push({ name: post.site || snapshot!.title, format: undefined, url: '' })
    for (const citation of cited) {
      const source = sourceSummary(citation.name)
      if (citation.format) source.knownFeeds.set(citation.url, citation.format)
      source.posts.add(post.id)
      if (!post.draft) source.published.add(post.id)
    }
  }
  const selectedSource = repositoryPage ? sourceSelections[repositoryPage] : ''
  const selectedPosts = sources.get(selectedSource)?.posts
  const listedPosts = repositoryPage ? posts.filter(post =>
    matchesFilters(post) && (!selectedPosts?.size || selectedPosts.has(post.id))).sort(byDate(dateOrder)) : undefined
  const sidebarFilter = repositoryPage ? {
    label: `${page === 'posts' ? 'Posts' : 'Site feed'} sources`, all: 'All sources',
    options: [...sources].filter(([, source]) => source.posts.size > 0)
      .map(([key, source]) => ({ key, name: source.name })).sort((a, b) => a.name.localeCompare(b.name)),
    selected: selectedPosts?.size ? selectedSource : '',
    select: (key: string) => setSourceSelections(current => ({ ...current, [repositoryPage]: key })),
  } : page === 'feeds' ? {
    label: 'Feed subscriptions', all: 'All feeds',
    options: (snapshot?.subscriptions || []).map(feed => ({ key: feed.url, name: feed.name })),
    selected: activeFeed, select: setActiveFeed,
  } : undefined
  const feedEntries = (feedResults || []).filter(feed => !activeFeed || feed.url === activeFeed)
    .flatMap(feed => feed.entries.map(entry => ({ ...entry, origin: feed.name })))
  const activity = feedEntries.filter(matchesFilters).sort(byDate(dateOrder))
  const filterEntries = page === 'feeds' ? feedEntries : posts
  const availableTags = [...new Set(filterEntries.flatMap(entry => facet(entry, 'tags')))].sort()
  const availableStatuses = [...new Set(filterEntries.flatMap(entry => facet(entry, 'status')))].sort()
  const feedByUrl = new Map(feedResults?.map(feed => [feed.url, feed]))
  if (page === 'sources') {
    const originals = new Map(savedSubscriptions.map(feed => [feed.id, feed]))
    const enabled = new Set(subscriptions.map(feed => feed.id))
    for (const feed of [...subscriptions, ...removedSubscriptions]) {
      const original = originals.get(feed.id)
      const url = website(original?.url)
      const originalName = original?.name.trim() || (url && new URL(url).hostname)
      const source = originalName ? sourceSummary(originalName)
        : sourceSummary(feed.name.trim() || 'New subscription', feed.sourceKey ?? `\0${feed.id}`)
      if (enabled.has(feed.id)) {
        source.subscriptions.push(feed)
        if (url && !source.feeds.includes(url)) source.feeds.push(url)
      } else source.removed.push(feed)
    }
  }
  const availableSources = [...sources.entries()].filter(([, source]) => source.posts.size > 0 || source.subscriptions.length > 0 || source.removed.length > 0)
  const listedSources = availableSources.filter(([, source]) =>
    [source.name, ...source.knownFeeds.keys(), ...[...source.subscriptions, ...source.removed].flatMap(feed => [feed.name, feed.url])].some(value => value.toLowerCase().includes(query)) &&
    (sourceFilter !== 'subscriptions' || source.subscriptions.length > 0 || source.removed.length > 0) && (sourceFilter !== 'posts' || source.posts.size > 0))
    .sort(([aKey, a], [bKey, b]) => (bKey.startsWith('\0') ? Math.min(b.subscriptions[0]?.id ?? 0, 0) : 0) -
      (aKey.startsWith('\0') ? Math.min(a.subscriptions[0]?.id ?? 0, 0) : 0) ||
      (sourceOrder === 'published' ? b.published.size - a.published.size : 0) || a.name.localeCompare(b.name))
  const visibleCount = page === 'sources' ? listedSources.length : page === 'feeds' ? activity.length : listedPosts?.length ?? 0
  const totalCount = page === 'sources' ? availableSources.length : page === 'feeds' ? feedEntries.length : posts.length
  const countLabel = page === 'sources' ? 'source' : 'post'
  const countText = `${visibleCount}${visibleCount < totalCount ? ` of ${totalCount}` : ''} ${countLabel}${(visibleCount < totalCount ? totalCount : visibleCount) === 1 ? '' : 's'}`
  const descriptions: Record<Page, string> = {
    posts: 'Browse Markdown from the selected repository.',
    preview: 'Review repository posts and manage the mndsite feed.',
    feeds: 'Read new entries from the RSS and Atom feeds this repository subscribes to.',
    sources: 'See subscribed feeds and publishers represented in repository posts.',
  }
  const active = navigation.find(item => item.id === page)!
  const searchLabel = `Search ${active.title.toLowerCase()}`

  function preparePublication(entry: FeedEntry) {
    if (!snapshot) return
    try {
      setError('')
      setPendingPublication({ entry, destination: publicationPath(snapshot, entry) })
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
    if (sourceFilter === 'posts') setSourceFilter('subscriptions')
    setExpandedSource(`\0${id}`)
  }

  function toggleSubscription(key: string, source: SourceSummary) {
    if (source.subscriptions.length > 0) {
      const ids = new Set(source.subscriptions.map(feed => feed.id))
      editSubscriptions(subscriptions.filter(feed => !ids.has(feed.id)), [...removedSubscriptions, ...source.subscriptions])
    } else if (source.removed.length > 0) {
      const ids = new Set(source.removed.map(feed => feed.id))
      editSubscriptions([...subscriptions, ...source.removed], removedSubscriptions.filter(feed => !ids.has(feed.id)))
    } else {
      const feeds = [...source.knownFeeds.keys()].map(url => ({ id: nextSubscriptionId.current--, sourceKey: key, name: source.name, url }))
      editSubscriptions([...subscriptions, ...feeds])
      setExpandedSource(key)
    }
  }

  function reviewSubscriptions() {
    if (!data || !subscriptionsChanged) return
    setError('')
    try {
      if (before !== feedYaml) throw new Error('feeds.yaml changed since you started editing. Discard these changes to load the latest version.')
      const path = 'feeds.yaml'
      const after = updateSubscriptions(before, subscriptions)
      if (after === before) throw new Error('Make a change before reviewing the YAML.')
      setConfigEditor({ path, before, repo: data.repo, preview: { path, before, after } })
    } catch (failure) { setError(message(failure)) }
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
            {page === 'feeds' && <button className="icon-button" aria-label="Refresh feeds" title="Refresh feeds"
              disabled={loadingFeeds || !snapshot?.subscriptions.length} onClick={() => void refreshFeeds()}><RefreshCw size={17} aria-hidden="true" /></button>}
            <button className="icon-button" aria-label={dark ? 'Light theme' : 'Dark theme'} onClick={() => setDark(!dark)}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button>
          </div>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <div className="sidebar-repo">
            <strong>{snapshot?.title || 'Repository'}</strong>
            <span>{data?.repo.label}{data?.repo.revision && ` · ${data.repo.revision.slice(0, 8)}`}</span>
          </div>
          <nav aria-label="Repository views">
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
            <div className="page-heading-row">
              <h1>{active.title}</h1>
              {page === 'preview' && <button className="button" disabled={busy || !data} onClick={() => {
                if (data) setConfigEditor({ path: 'mndsite.yaml', before: data.snapshot.configs['mndsite.yaml'], repo: data.repo })
              }}><Settings size={15} aria-hidden="true" /> Feed settings</button>}
              {page === 'sources' && <div className="page-heading-actions">
                {subscriptionsChanged && <button className="button" onClick={() => {
                  setSubscriptionEdits(undefined)
                  setExpandedSource('')
                  setError('')
                }}>Discard changes</button>}
                <button className="button primary" disabled={busy || !subscriptionsChanged} onClick={reviewSubscriptions}>Review YAML</button>
              </div>}
            </div>
            <p>{page === 'posts' && snapshot?.description ? snapshot.description : descriptions[page]}</p>
          </div>
          {error && <div className="notice" role="alert"><CircleHelp size={18} />{error}</div>}
          {repositoryPage && publicationCommit && <p className="notice" role="status">
            Committed to GitHub. <a href={publicationCommit.url} target="_blank" rel="noreferrer">View commit {publicationCommit.oid.slice(0, 8)}</a>
          </p>}
          {configSaved && (page === 'preview' && configSaved.path === 'mndsite.yaml' || page === 'sources' && configSaved.path === 'feeds.yaml') &&
            <p className="notice" role="status">Saved {configSaved.path}.
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
            {page === 'preview' && snapshot?.rss && <a className="button" href={snapshot.rss} target="_blank" rel="noreferrer"><Rss size={15} /> RSS</a>}
            {page === 'sources' && <>
              <select aria-label="Filter by source type" value={sourceFilter} onChange={event => setSourceFilter(event.target.value)}>
                <option value="">All sources</option><option value="subscriptions">Subscriptions</option><option value="posts">Post sources</option>
              </select>
              <select aria-label="Sort sources" value={sourceOrder} onChange={event => setSourceOrder(event.target.value)}>
                <option value="name">Name A–Z</option><option value="published">Most published posts</option>
              </select>
            </>}
            <div className="controls-end">
              {page !== 'feeds' && data && data.repo.label !== 'Example repository' &&
                <button className="button" disabled={busy} onClick={() => void reload()}><RefreshCw size={15} /> Refresh</button>}
              <span className="count" role="status">{countText}</span>
            </div>
          </div>

          {busy && <p className="activity" role="status">Loading repository…</p>}
          {data && listedPosts && (
            <Feed entries={listedPosts} key={`${page}-${data.repo.label}-${page === 'posts' ? linkedPost || '' : ''}`}
              initialExpanded={page === 'posts' ? linkedPost : undefined} defaultSource={data.snapshot.title}
              resolveImage={(value, entry) => repoAsset(data.repo, value, entry)}
              renderAction={data.repo.publication ? entry =>
                <button className="button post-action" disabled={busy} onClick={() => preparePublication(entry)}
                  title={entry.draft ? 'Publish' : 'Unpublish'} aria-label={`${entry.draft ? 'Publish' : 'Unpublish'} ${entry.title}`}>
                  {entry.draft ? <ArrowUpToLine size={15} aria-hidden="true" /> : <ArrowDownToLine size={15} aria-hidden="true" />}
                  <span>{entry.draft ? 'Publish' : 'Unpublish'}</span>
                </button> : undefined} />
          )}
          {posts.length > 0 && listedPosts?.length === 0 && <p className="activity">No posts match these filters.</p>}
          {repositoryPage && data && !data.repo.publication && <p className="activity">Open a GitHub branch to publish or unpublish posts.</p>}
          {page === 'sources' && <>
            {listedSources.length > 0 && <div className="mnd-feed source-list">{listedSources.map(([key, source]) => {
              const results = source.feeds.map(url => feedByUrl.get(url))
              const loaded = results.reduce((count, feed) => count + (feed?.entries.length || 0), 0)
              const unavailable = results.filter(feed => feed?.error).length
              const subscribed = source.subscriptions.length > 0
              const feedSource = subscribed || source.removed.length > 0 || source.knownFeeds.size > 0
              const formats = new Set(source.knownFeeds.values())
              for (const feed of [...source.subscriptions, ...source.removed]) {
                const url = website(feed.url)
                const format = (url && feedByUrl.get(url)?.format) || feedFormatHint(feed.url)
                if (format) formats.add(format)
              }
              const feedTags = formats.size ? [...formats].sort() : ['feed']
              const action = subscribed ? 'Unsubscribe' : 'Subscribe'
              const open = expandedSource === key
              return <div className={feedSource ? 'mnd-feed-row' : undefined} key={key} data-subscribed={feedSource ? subscribed : undefined}>
                <FeedCard title={source.name} open={open}
                toggle={() => setExpandedSource(current => current === key ? '' : key)}
                tags={feedSource && <span className="mnd-feed-tags">
                  {feedTags.map(format => <span className="mnd-feed-facet" key={format}>{format}</span>)}
                </span>}
                meta={<>
                  <span className="mnd-feed-publication">{source.published.size} {source.published.size === 1 ? 'post' : 'posts'}</span>
                  {source.feeds.length > 0 && <span className="mnd-feed-meta-item">{results.every(Boolean) ? `${loaded} ${loaded === 1 ? 'item' : 'items'}` : 'Loading…'}{unavailable > 0 && ` · ${unavailable} unavailable`}</span>}
                  {!subscribed && source.removed.length > 0 && <span className="mnd-feed-meta-item">Removal staged</span>}
                </>}>
                  {open && subscribed && <div className="subscription-editor">
                    {source.subscriptions.map((feed, index) => <fieldset key={feed.id} disabled={busy}>
                      <legend>{source.subscriptions.length > 1 ? `Subscription ${index + 1}` : 'Subscription'}</legend>
                      <label>Name<input value={feed.name} placeholder="Feed name" autoFocus={feed.id < 0 && !feed.sourceKey} onChange={event =>
                        editSubscriptions(subscriptions.map(item => item.id === feed.id ? { ...item, name: event.target.value } : item))} /></label>
                      <label>Feed URL<input value={feed.url} placeholder="https://example.com/rss.xml" autoFocus={index === 0 && feed.id < 0 && !!feed.sourceKey} onChange={event =>
                        editSubscriptions(subscriptions.map(item => item.id === feed.id ? { ...item, url: event.target.value } : item))} /></label>
                      <button className="icon-button" type="button" aria-label={`Remove subscription ${index + 1}`} title="Remove subscription"
                        onClick={() => editSubscriptions(subscriptions.filter(item => item.id !== feed.id))}><Trash2 size={16} aria-hidden="true" /></button>
                    </fieldset>)}
                  </div>}
                  {open && source.posts.size > 0 && <div className="mnd-feed-prose">
                    <h2>Repository posts</h2>
                    <ul>{posts.filter(post => source.posts.has(post.id)).map(post => <li key={post.id}>
                      <a href={`#post=${encodeURIComponent(post.id)}`}>{post.title}</a>
                    </li>)}</ul>
                  </div>}
                  {open && !subscribed && source.posts.size === 0 && <p className="mnd-feed-meta">Review YAML to apply this removal.</p>}
                </FeedCard>
                {feedSource && <div className="mnd-feed-action">
                  <button className="button subscription-toggle" type="button" role="switch" aria-checked={subscribed}
                    disabled={busy} aria-label={`${source.name} subscription`} title={action}
                    onClick={() => toggleSubscription(key, source)}>{subscribed ? 'Subscribed' : 'Unsubscribed'}</button>
                </div>}
              </div>
            })}</div>}
            {availableSources.length === 0 && <p className="activity">This repository has no sources.</p>}
            {availableSources.length > 0 && listedSources.length === 0 && <p className="activity">No sources match these filters.</p>}
            <button className="button subscription-add" type="button" disabled={busy || !data} onClick={addSubscription}>
              <Plus size={16} aria-hidden="true" /> Add subscriptions
            </button>
          </>}
          {page === 'feeds' && <>
            {loadingFeeds && <p className="activity" role="status">Loading feeds…</p>}
            {snapshot?.subscriptions.length === 0 && <p className="activity">No subscriptions defined in feeds.yaml.</p>}
            {feedResults?.filter(feed => feed.error && (!activeFeed || feed.url === activeFeed)).map(feed =>
              <p className="notice" key={feed.url}>{feed.name} could not be loaded. {feed.error}</p>)}
            <Feed entries={activity} />
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
      {configEditor && <ConfigDialog {...configEditor} onClose={() => setConfigEditor(undefined)} onWrite={commit => {
        setConfigSaved({ path: configEditor.path, commit })
        if (configEditor.path === 'feeds.yaml') setSubscriptionEdits(undefined)
        setConfigEditor(undefined)
        if (configEditor.repo.refresh) void load(configEditor.repo.refresh, false)
      }} />}
    </div>
  )
}
