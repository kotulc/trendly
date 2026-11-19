import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { AlertCircle, BookOpen, Check, ChevronRight, Columns2, FileText, FolderOpen, Hash, Lightbulb, List, Moon, Plus, RefreshCw, Save, Sun, TrendingUp } from 'lucide-react'
import { stringify } from 'yaml'
import { copyPost, newPost, readPost, readYaml, webUrl, type Post, type Snapshot, type Suggestion } from './model'
import { Preview } from './Preview'
import { demoWorkspace, openWorkspace, scanWorkspace, supportsWorkspace, WorkspaceConflict, type Workspace } from './workspace'

type Editor = { file: string; raw: string; base: string | null }
type View = 'preview' | 'markdown' | 'split'

const empty: Snapshot = { name: '', posts: [], feeds: [], suggestions: [], issues: [] }
const all = 'all'
const recommendations = 'suggestions'

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function draftFrom(post: Post): Editor {
  return { file: post.file, raw: post.raw, base: post.raw }
}

function displayDate(value?: string) {
  if (!value) return 'Draft'
  const valid = /^\d{4}-\d{2}-\d{2}/.exec(value)
  const date = valid ? new Date(valid[0] + 'T12:00:00') : new Date(NaN)
  return Number.isNaN(date.getTime()) ? 'Draft' : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
}

export function App() {
  const [workspace, setWorkspace] = useState(demoWorkspace)
  const [snapshot, setSnapshot] = useState(empty)
  const [channel, setChannel] = useState(all)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [view, setView] = useState<View>('preview')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [addingFeed, setAddingFeed] = useState(false)
  const scanVersion = useRef(0)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const dark = snapshot.theme ? snapshot.theme === 'dark' : systemDark

  const dirty = !!editor && editor.raw !== editor.base
  const disk = snapshot.posts.find((post) => post.file === editor?.file)
  const conflict = !!editor && (disk?.raw ?? null) !== editor.base
  const draft = useMemo(() => editor ? readPost(editor.file, editor.raw) : null, [editor])
  const currentFeed = channel.startsWith('feed:') ? snapshot.feeds.find((feed) => `feed:${feed.id}` === channel) : undefined
  const available = snapshot.suggestions.filter((item) => !item.dismissed && !snapshot.feeds.some((feed) => feed.id === item.id || feed.url === item.url))
  const visiblePosts = snapshot.posts.filter((post) => !currentFeed || post.feeds.includes(currentFeed.id))

  useEffect(() => {
    const preference = window.matchMedia('(prefers-color-scheme: dark)')
    const update = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])

  const refresh = useCallback(async (target: Workspace) => {
    const version = ++scanVersion.current
    const updated = await scanWorkspace(target)
    if (version !== scanVersion.current) return
    setSnapshot(updated)
    setEditor((current) => {
      if (!current) return target.mode === 'demo' && updated.posts.length ? draftFrom(updated.posts[0]) : null
      if (current.raw !== current.base) return current
      const latest = updated.posts.find((post) => post.file === current.file)
      return latest ? draftFrom(latest) : null
    })
  }, [])

  useEffect(() => {
    const scan = () => {
      void refresh(workspace).catch((failure) => setError(message(failure)))
    }
    scan()
    if (workspace.mode === 'demo') return
    const timer = window.setInterval(() => { if (!document.hidden) scan() }, 3000)
    window.addEventListener('focus', scan)
    return () => {
      ++scanVersion.current
      window.clearInterval(timer)
      window.removeEventListener('focus', scan)
    }
  }, [workspace, refresh])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = true }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function maySwitch() {
    return !dirty || window.confirm('Leave this draft and discard unsaved edits?')
  }

  async function run(task: () => Promise<void>) {
    setBusy(true)
    setError('')
    setNotice('')
    try { await task() }
    catch (failure) {
      if (!(failure instanceof DOMException && failure.name === 'AbortError')) setError(message(failure))
      if (failure instanceof WorkspaceConflict) await refresh(workspace).catch(() => {})
    } finally { setBusy(false) }
  }

  function chooseFolder() {
    if (!maySwitch()) return
    void run(async () => {
      const selected = await openWorkspace()
      const loaded = await scanWorkspace(selected)
      ++scanVersion.current
      setSnapshot(loaded)
      setEditor(loaded.posts[0] ? draftFrom(loaded.posts[0]) : null)
      setView('preview')
      setChannel(all)
      setWorkspace(selected)
    })
  }

  function toggleTheme() {
    void run(async () => {
      const raw = await workspace.read('workspace.yaml')
      if (raw === null) throw new Error('This folder is missing workspace.yaml.')
      const settings = readYaml(raw)
      await workspace.write('workspace.yaml', stringify({ ...settings, theme: dark ? 'light' : 'dark' }), raw)
      await refresh(workspace)
    })
  }

  function selectPost(post: Post) {
    if (busy || editor?.file === post.file || !maySwitch()) return
    setEditor(draftFrom(post))
    setView('preview')
    setNotice('')
  }

  function selectChannel(next: string) {
    if (channel === next || busy || !maySwitch()) return
    setEditor(next === recommendations ? null : snapshot.posts
      .filter((post) => next === all || post.feeds.includes(next.slice(5))).map(draftFrom)[0] ?? null)
    setView('preview')
    setChannel(next)
    setNotice('')
  }

  function createDraft() {
    if (!maySwitch()) return
    const id = crypto.randomUUID()
    setEditor({ file: `${id}.md`, raw: newPost(id, currentFeed?.id), base: null })
    if (channel === recommendations) setChannel(all)
    setView(window.innerWidth > 1150 ? 'split' : 'markdown')
    setNotice('')
  }

  function save(asCopy = false) {
    if (!editor) return
    void run(async () => {
      const id = crypto.randomUUID()
      const file = asCopy ? `${id}.md` : editor.file
      const raw = asCopy ? copyPost(editor.raw, id) : editor.raw
      await workspace.write(`posts/${file}`, raw, asCopy ? null : editor.base)
      setEditor({ file, raw, base: raw })
      await refresh(workspace)
      setNotice(asCopy ? 'Saved as a new draft.' : workspace.mode === 'demo' ? 'Saved for this demo session.' : 'Draft saved to disk.')
    })
  }

  function handleSuggestion(item: Suggestion, follow: boolean) {
    void run(async () => {
      if (follow) {
        await workspace.write(`feeds/${item.id}.yaml`, stringify({
          id: item.id, name: item.name, url: item.url, ...(item.description ? { description: item.description } : {}),
        }), null)
      } else {
        await workspace.write(`suggestions/${item.file}`, stringify({ ...readYaml(item.raw), status: 'dismissed' }), item.raw)
      }
      await refresh(workspace)
      setNotice(follow ? `Following ${item.name}.` : `Dismissed ${item.name}.`)
    })
  }

  function addFeed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const name = String(fields.get('name') || '').trim()
    const address = String(fields.get('url') || '').trim()
    if (!name || (address && !webUrl(address))) {
      setError('Enter a feed name and, if supplied, a valid HTTP or HTTPS URL.')
      return
    }
    void run(async () => {
      const id = crypto.randomUUID()
      await workspace.write(`feeds/${id}.yaml`, stringify({ id, name, ...(address ? { url: webUrl(address) } : {}) }), null)
      await refresh(workspace)
      setAddingFeed(false)
    })
  }

  const channelTitle = channel === recommendations ? 'Feed suggestions' : currentFeed?.name || 'All posts'
  const channelDescription = channel === recommendations ? 'Review feeds suggested for this workspace.' : currentFeed?.description || (currentFeed ? 'Posts in this feed.' : 'Browse and edit your Markdown drafts.')

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => selectChannel(all)} aria-label="Trendly, all posts">
          <span className="brand-icon"><TrendingUp size={20} /></span> trendly
        </button>
        <div className="topbar-workspace"><ChevronRight size={14} />{snapshot.name || 'Workspace'}</div>
        <div className="topbar-actions">
          <button className="icon-button refresh" title="Refresh workspace" aria-label="Refresh workspace" disabled={busy}
            onClick={() => void run(async () => { await refresh(workspace); setNotice('Workspace refreshed.') })}><RefreshCw size={17} /></button>
          <button className="icon-button" disabled={busy} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} title={dark ? 'Light theme' : 'Dark theme'} onClick={toggleTheme}>
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="button folder-button" disabled={busy} onClick={chooseFolder}><FolderOpen size={17} /> Open workspace</button>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar" aria-label="Workspace navigation">
          <div className="sidebar-content">
            <button className="button primary new-button" disabled={busy} onClick={createDraft}><Plus size={18} /> New draft</button>
            <nav aria-label="Workspace">
              <p className="section-label">Workspace</p>
              <button className={`nav-row ${channel === all ? 'active' : ''}`} aria-current={channel === all ? 'page' : undefined} onClick={() => selectChannel(all)}>
                <List size={17} /> All posts <span className="nav-count">{snapshot.posts.length}</span>
              </button>
              <button className={`nav-row ${channel === recommendations ? 'active' : ''}`} aria-current={channel === recommendations ? 'page' : undefined} onClick={() => selectChannel(recommendations)}>
                <Lightbulb size={17} /> Feed suggestions {available.length > 0 && <span className="nav-count">{available.length}</span>}
              </button>
            </nav>
            <nav aria-label="Feeds">
              <div className="sidebar-heading"><p className="section-label">Feeds</p>
                <button className="icon-button" aria-label="Add feed" title="Add feed" aria-expanded={addingFeed} disabled={busy} onClick={() => setAddingFeed(!addingFeed)}><Plus size={16} /></button>
              </div>
              {addingFeed && <form className="feed-form" onSubmit={addFeed}>
                <label>Feed name<input name="name" required autoFocus /></label>
                <label>Feed URL (optional)<input name="url" type="url" /></label>
                <button type="submit" className="button" disabled={busy}>Add feed</button>
              </form>}
              {snapshot.feeds.map((feed) => (
                <button key={feed.id} className={`nav-row ${currentFeed?.id === feed.id ? 'active' : ''}`}
                  aria-current={currentFeed?.id === feed.id ? 'page' : undefined} onClick={() => selectChannel(`feed:${feed.id}`)}>
                  <Hash size={17} /><span className="nav-name">{feed.name}</span>
                  <span className="nav-count">{snapshot.posts.filter((post) => post.feeds.includes(feed.id)).length}</span>
                </button>
              ))}
              {!snapshot.feeds.length && !addingFeed && <p className="sidebar-empty">No feeds yet</p>}
            </nav>
          </div>
          <div className="sidebar-footer">
            <FolderOpen size={17} /><div><strong>{workspace.mode === 'demo' ? 'Example workspace' : 'Local workspace'}</strong>
              <span>{workspace.mode === 'demo' ? 'Changes reset on reload' : 'Files on this device'}</span></div>
          </div>
        </aside>

        <main className="main">
          <div className="channel-header">
            <div><h1>{channelTitle}</h1><p>{channelDescription}</p></div>
            {currentFeed?.url && <a className="button" href={currentFeed.url} target="_blank" rel="noreferrer">Open feed</a>}
          </div>
          {!supportsWorkspace() && <div className="banner"><AlertCircle size={17} /> Use desktop Chrome or Edge to open and edit local workspaces.</div>}
          {error && <div className="banner warning" role="alert"><AlertCircle size={17} />{error}</div>}
          {snapshot.issues.length > 0 && <details className="banner workspace-issues"><summary>{snapshot.issues.length} workspace file {snapshot.issues.length === 1 ? 'issue' : 'issues'}</summary>
            <ul>{snapshot.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></details>}
          {channel === recommendations ? (
            <section className="suggestion-list" aria-label="Suggested feeds">
              {available.map((item) => <article className="suggestion" key={item.id}>
                <span className="source-icon"><Lightbulb size={20} /></span>
                <div><h2>{item.name}</h2>{item.description && <p>{item.description}</p>}
                  <a href={item.url} target="_blank" rel="noreferrer">{new URL(item.url).hostname}</a>
                  <div className="suggestion-actions">
                    <button className="button primary" disabled={busy} onClick={() => handleSuggestion(item, true)}><Plus size={16} /> Follow</button>
                    <button className="button" disabled={busy} onClick={() => handleSuggestion(item, false)}>Dismiss</button>
                  </div>
                </div>
              </article>)}
              {!available.length && <div className="empty-state"><Lightbulb size={24} /><h2>No suggestions to review</h2><p>Suggestions added to the workspace will appear here.</p></div>}
            </section>
          ) : (
            <div className="content-grid">
              <section className="post-list" aria-label="Posts">
                <p className="section-label">{visiblePosts.length} {visiblePosts.length === 1 ? 'post' : 'posts'}</p>
                {visiblePosts.map((post) => (
                  <button className={`post-card ${editor?.file === post.file ? 'selected' : ''}`} key={post.file}
                    aria-pressed={editor?.file === post.file} onClick={() => selectPost(post)}>
                    <span className="post-meta"><FileText size={15} /> {displayDate(post.updatedAt)}</span>
                    <strong>{post.title}</strong>
                    <span className="post-excerpt">{post.body.split(/\r?\n/).find((line) => line.trim() && !line.startsWith('#')) || 'Empty draft'}</span>
                    {post.tags.length > 0 && <span className="tags">{post.tags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}</span>}
                  </button>
                ))}
                {!visiblePosts.length && <p className="muted">No posts in this view.</p>}
              </section>
              <section className="detail" aria-label="Post editor">
                {editor && draft ? <>
                  <div className="editor-toolbar">
                    <div className="editor-tabs" role="group" aria-label="Editor view">
                      <button aria-pressed={view === 'preview'} onClick={() => setView('preview')}><BookOpen size={16} /> Preview</button>
                      <button aria-pressed={view === 'markdown'} onClick={() => setView('markdown')}><FileText size={16} /> Markdown</button>
                      <button aria-pressed={view === 'split'} onClick={() => setView('split')}><Columns2 size={16} /> Split</button>
                    </div>
                    <button className="button save-button" disabled={!dirty || conflict || busy} onClick={() => save()}><Save size={15} /> Save draft</button>
                  </div>
                  {conflict && <div className="banner warning conflict" role="alert"><AlertCircle size={17} />
                    <div><strong>{disk ? 'This draft changed on disk.' : 'This draft was removed from disk.'}</strong> Your edits are still here.
                      <div className="conflict-actions">
                        <button className="button" disabled={busy} onClick={() => setEditor(disk ? draftFrom(disk) : null)}>{disk ? 'Load disk version' : 'Close draft'}</button>
                        <button className="button" disabled={busy} onClick={() => save(true)}>Save edits as a copy</button>
                      </div>
                    </div>
                  </div>}
                  {draft.issues.length > 0 && <div className="banner warning">{draft.issues.join(' ')}</div>}
                  <div className={`editor-content view-${view}`}>
                    {view !== 'preview' && <div className="markdown-pane">
                      <label htmlFor="markdown-input">Markdown draft</label>
                      <textarea id="markdown-input" value={editor.raw} spellCheck={false} disabled={busy}
                        onChange={(event) => setEditor({ ...editor, raw: event.target.value })} />
                    </div>}
                    {view !== 'markdown' && <Preview post={draft} workspace={workspace} />}
                  </div>
                  <div className="editor-status"><span>{dirty ? 'Unsaved changes' : workspace.mode === 'demo' ? 'Example draft' : 'Saved locally'}</span></div>
                </> : <div className="empty-state"><FileText size={26} /><h2>Open a draft</h2><p>Select a post card or start a new draft.</p></div>}
              </section>
            </div>
          )}
          <div className="feedback" role="status" aria-live="polite">
            {notice && <button title="Dismiss message" onClick={() => setNotice('')}><Check size={16} />{notice}</button>}
          </div>
        </main>
      </div>
    </div>
  )
}
