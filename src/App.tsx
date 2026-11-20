import { useEffect, useRef, useState, type FormEvent } from 'react'
import { BookOpen, CircleHelp, FileText, FolderOpen, Github, Layers3, Link2, List, Moon, RefreshCw, Rss, Search, Sun, X } from 'lucide-react'
import Feed, { type FeedEntry } from './feed/Feed'
import { exampleRepository, importFolder, loadRepository, openFolder, remoteRepository, repoAsset, type Repository, type Snapshot } from './repository'
import { fetchFeed } from './rss'

type Page = 'posts' | 'preview' | 'feeds' | 'sources'
type Loaded = { repo: Repository; snapshot: Snapshot }
type FeedResult = { url: string; name: string; entries: FeedEntry[]; error?: string }

const navigation = [
  { id: 'posts', title: 'Posts', icon: FileText },
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

export function App() {
  const [data, setData] = useState<Loaded>()
  const [page, setPage] = useState<Page>('posts')
  const [search, setSearch] = useState('')
  const [tag, setTag] = useState('')
  const [onlyDrafts, setOnlyDrafts] = useState(false)
  const [showDrafts, setShowDrafts] = useState(true)
  const [remoteForm, setRemoteForm] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const [feedResults, setFeedResults] = useState<FeedResult[]>()
  const [activeFeed, setActiveFeed] = useState('')
  const [includePosts, setIncludePosts] = useState(false)
  const [loadingFeeds, setLoadingFeeds] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const readVersion = useRef(0)
  const feedVersion = useRef(0)
  const foreground = useRef(false)
  const theme = data?.snapshot.color

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', dark)
    const [hue, saturation] = palettes[theme || ''] || [dark ? 204 : 212, 100]
    root.style.setProperty('--site-hs', `${hue}deg ${saturation}%`)
    root.dataset.typeset = data?.snapshot.typeset || 'sans'
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
        setSearch('')
        setTag('')
        setOnlyDrafts(false)
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
        try { return { ...feed, entries: await fetchFeed(feed, snapshot.proxy) } }
        catch (failure) { return { ...feed, entries: [], error: message(failure) } }
      }))
      if (version === feedVersion.current) setFeedResults(results)
    } finally { if (version === feedVersion.current) setLoadingFeeds(false) }
  }

  useEffect(() => {
    if (page === 'feeds' && !feedResults && !loadingFeeds && data?.snapshot.subscriptions.length) void refreshFeeds()
  }, [page, feedResults, loadingFeeds, data?.snapshot.subscriptions])

  function navigate(next: Page) {
    setPage(next)
    setSearch('')
    setTag('')
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
  const query = search.trim().toLowerCase()
  const availableTags = [...new Set(snapshot?.posts.flatMap(post => post.tags))].sort()
  const matches = (entry: FeedEntry) => !query ||
    [entry.title, entry.summary, entry.body, ...entry.sources.map(source => source.title || source.url)]
      .some(value => value.toLowerCase().includes(query))
  const filtered = snapshot?.posts.filter(post => matches(post) && (!tag || post.tags.includes(tag)) && (!onlyDrafts || post.draft)) || []
  const sitePosts = snapshot?.posts.filter(post => post.draft ? showDrafts
    : !!post.date && !!post.route && (!snapshot.section || post.route.startsWith(snapshot.section + '/'))) || []
  const sources = new Map<string, { title: string; publisher: string; posts: Set<string> }>()
  for (const post of snapshot?.posts || []) for (const source of post.sources) {
    const existing = sources.get(source.url)
    if (existing) existing.posts.add(post.title)
    else sources.set(source.url, {
      title: source.title || new URL(source.url).hostname, publisher: source.publisher || new URL(source.url).hostname,
      posts: new Set([post.title]),
    })
  }
  const external = (feedResults || []).filter(feed => !activeFeed || feed.url === activeFeed)
    .flatMap(feed => feed.entries.map(entry => ({ ...entry, origin: feed.name })))
  const activity = [...external, ...(includePosts ? (snapshot?.posts || []).filter(post => !post.draft)
    .map(post => ({ ...post, origin: 'Repository' })) : [])].filter(matches)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.title.localeCompare(b.title))
  const descriptions: Record<Page, string> = {
    posts: 'Browse Markdown from the selected repository.',
    preview: 'Preview the expandable feed with mndsite’s published layout.',
    feeds: 'Read RSS and Atom subscriptions from this repository.',
    sources: 'Find the articles, videos, and podcasts referenced by posts.',
  }
  const active = navigation.find(item => item.id === page)!

  return (
    <div className="app">
      <header className="navbar">
        <button className="brand" onClick={() => navigate('posts')}>
          <span className="brand-mark"><Layers3 size={18} aria-hidden="true" /></span> Trendly
        </button>
        <div className="repo-breadcrumb" title={data?.repo.label}>{data?.repo.label || 'Repository'}</div>
        <div className="navbar-actions">
          <button className="button" onClick={chooseFolder} disabled={busy}><FolderOpen size={16} /> <span>Open folder</span></button>
          <input type="file" ref={fileInput} hidden {...{ webkitdirectory: '' }} onChange={event => {
            const files = event.currentTarget.files
            if (files?.length) {
              const imported = importFolder(files)
              void load(() => imported)
            }
            event.currentTarget.value = ''
          }} />
          <button className="button" onClick={() => setRemoteForm(!remoteForm)} aria-expanded={remoteForm}><Github size={16} /> <span>Open GitHub</span></button>
          <button className="icon-button" aria-label={dark ? 'Light theme' : 'Dark theme'} onClick={() => setDark(!dark)}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <div className="sidebar-repo">
            <strong>{snapshot?.title || 'Repository'}</strong>
            <span>{data?.repo.revision ? data.repo.revision.slice(0, 8) : data?.repo.label === 'Example repository' ? 'Example repository' : 'Working files'}</span>
          </div>
          <nav aria-label="Repository views">
            {navigation.map(({ id, title, icon: Icon }) => <button key={id} aria-current={page === id ? 'page' : undefined}
              onClick={() => navigate(id)}><Icon size={17} aria-hidden="true" /> {title}</button>)}
          </nav>
          <div className="sidebar-foot"><BookOpen size={16} /> <span>Repository explorer</span></div>
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
            <h1>{page === 'preview' && snapshot?.section ? snapshot.section.split('/').at(-1)!.replace(/[-_]/g, ' ').replace(/^./, char => char.toUpperCase()) : active.title}</h1>
            <p>{page === 'posts' && snapshot?.description ? snapshot.description : descriptions[page]}</p>
          </div>
          {error && <div className="notice" role="alert"><CircleHelp size={18} />{error}</div>}
          <div className="controls">
            {page !== 'preview' && <label className="search"><Search size={16} /><input aria-label={`Search ${active.title.toLowerCase()}`}
              placeholder={`Search ${active.title.toLowerCase()}…`} value={search} onChange={event => setSearch(event.target.value)} /></label>}
            {page === 'posts' && <>
              {availableTags.length > 0 && <select aria-label="Filter by tag" value={tag} onChange={event => setTag(event.target.value)}>
                <option value="">All tags</option>{availableTags.map(value => <option key={value}>{value}</option>)}
              </select>}
              {snapshot?.posts.some(post => post.draft) && <label className="filter"><input type="checkbox" checked={onlyDrafts} onChange={event => setOnlyDrafts(event.target.checked)} /> Drafts only</label>}
            </>}
            {page === 'preview' && <>
              {snapshot?.posts.some(post => post.draft) && <label className="filter"><input type="checkbox" checked={showDrafts} onChange={event => setShowDrafts(event.target.checked)} /> Include drafts</label>}
              {snapshot?.rss && <a className="button" href={snapshot.rss} target="_blank" rel="noreferrer"><Rss size={15} /> RSS</a>}
            </>}
            {page === 'feeds' && (snapshot?.subscriptions.length ?? 0) > 0 &&
              <select aria-label="Choose an external feed" value={activeFeed} onChange={event => setActiveFeed(event.target.value)}>
                <option value="">All feeds</option>{snapshot?.subscriptions.map(feed => <option key={feed.url} value={feed.url}>{feed.name}</option>)}
              </select>}
            {page === 'feeds' && <label className="filter"><input type="checkbox" checked={includePosts}
              onChange={event => setIncludePosts(event.target.checked)} /> Include repository posts</label>}
            {page === 'feeds' ? (
              <button className="button reload" disabled={loadingFeeds || !snapshot?.subscriptions.length} onClick={() => void refreshFeeds()}><RefreshCw size={15} /> Refresh feeds</button>
            ) : data?.repo.label !== 'Example repository' && <button className="button reload" disabled={busy} onClick={() => void reload()}><RefreshCw size={15} /> Refresh</button>}
          </div>

          {busy && <p className="activity" role="status">Loading repository…</p>}
          {data && (page === 'posts' || page === 'preview') && <>
            <p className="count">{(page === 'posts' ? filtered : sitePosts).length} posts</p>
            <Feed entries={page === 'posts' ? filtered : sitePosts} key={`${page}-${data.repo.label}`}
              resolveImage={(value, entry) => repoAsset(data.repo, value, entry)} />
          </>}
          {page === 'sources' && <div className="source-list">
            {[...sources].filter(([url, source]) => `${url} ${source.title} ${[...source.posts].join(' ')}`.toLowerCase().includes(query))
              .map(([url, source]) => <article key={url}><span>{source.publisher}</span>
                <a href={url} target="_blank" rel="noreferrer">{source.title}</a>
                <p>{[...source.posts].join(' · ')}</p>
              </article>)}
            {sources.size === 0 && <p className="activity">This repository has no post sources.</p>}
          </div>}
          {page === 'feeds' && <>
            {loadingFeeds && <p className="activity" role="status">Loading feeds…</p>}
            {snapshot?.subscriptions.length === 0 && <p className="activity">No subscriptions defined in feeds.yaml.</p>}
            {feedResults?.filter(feed => feed.error && (!activeFeed || feed.url === activeFeed)).map(feed =>
              <p className="notice" key={feed.url}>{feed.name} could not be loaded. {feed.error}</p>)}
            <Feed entries={activity} resolveImage={(value, entry) => data && entry.path ? repoAsset(data.repo, value, entry) : undefined} />
          </>}
        </main>
      </div>
    </div>
  )
}
