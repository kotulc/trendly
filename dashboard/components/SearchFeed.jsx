/**
 * Trendly search-results island: stored search results for a topic fetched at runtime,
 * grouped by category. Rows are compact (hover for the snippet, click to expand) and
 * filterable by extracted keywords via a panel portaled into the right toc column.
 * Props: api — base url of the trendly server ('' = same origin as the site).
 */
import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'


function fmt_time(iso) {
  // Row timestamps arrive as sqlite 'YYYY-MM-DD HH:MM:SS' strings
  return String(iso || '').slice(0, 16)
}


function domain(url) {
  try { return new URL(url).hostname } catch { return '' }
}


function top_keywords(results, limit = 20) {
  /** Most frequent keywords across the topic's results, [keyword, count] pairs. */
  const counts = {}
  results.forEach(r => (r.keywords || []).forEach(k => { counts[k] = (counts[k] || 0) + 1 }))
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit)
}


function Row({ item }) {
  const [open, set_open] = useState(false)
  return (
    <div className="post-entry">
      <div className="post-line" title={item.snippet} onClick={() => set_open(!open)}>
        <a className="post-title" href={item.url} target="_blank" rel="noreferrer"
           onClick={e => e.stopPropagation()}>
          {item.title || item.url}
        </a>
        <div className="post-meta">
          <span>{fmt_time(item.retrieved_at)}</span>
          <span>{domain(item.url)}</span>
          <span>{Number(item.score).toFixed(2)}</span>
        </div>
      </div>
      {open && (
        <div className="post-detail">
          {item.snippet && <p className="post-summary">{item.snippet}</p>}
          <div className="post-meta">
            <span>query: {item.query}</span>
            {item.engine && <span>{item.engine}</span>}
          </div>
          {item.keywords?.length > 0 && (
            <div className="tag-list">
              {item.keywords.map(k => <span key={k} className="chip chip-tag">{k}</span>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}


export default function SearchFeed({ api = '' }) {
  const [topics, set_topics]   = useState(null)
  const [topic, set_topic]     = useState(null)
  const [results, set_results] = useState(null)
  const [filters, set_filters] = useState([])
  const [toc, set_toc]         = useState(null)

  useEffect(() => { set_toc(document.querySelector('.nextra-toc')) }, [])

  const load_results = useCallback((name) => {
    fetch(`${api}/api/topics/${name}/searches`)
      .then(r => r.json())
      .then(d => set_results(d.results))
      .catch(() => set_results([]))
  }, [api])

  const select = useCallback((name) => {
    set_topic(name)
    set_results(null)
    set_filters([])
    window.history.replaceState(null, '', `#${encodeURIComponent(name)}`)
    load_results(name)
  }, [load_results])

  useEffect(() => {
    fetch(`${api}/api/topics`)
      .then(r => r.json())
      .then(names => {
        set_topics(names)
        const from_hash = decodeURIComponent(window.location.hash.slice(1))
        const initial = names.includes(from_hash) ? from_hash : names[0]
        if (initial) select(initial)
      })
      .catch(() => set_topics([]))
  }, [api, select])

  function toggle_filter(keyword) {
    set_filters(f => f.includes(keyword) ? f.filter(k => k !== keyword) : [...f, keyword])
  }

  if (!topics) return <p className="feed-loading">Loading…</p>
  if (!topics.length) return <p className="feed-loading">No topics configured on the server.</p>

  const visible = !results ? [] : (filters.length
    ? results.filter(r => (r.keywords || []).some(k => filters.includes(k)))
    : results)

  const groups = {}
  visible.forEach(r => { (groups[r.category || 'general'] ||= []).push(r) })

  const panel = results?.length > 0 && (
    <div className="filter-panel">
      <div className="meta-sidebar-label">Filter by keyword</div>
      <div className="meta-sidebar-chips">
        {top_keywords(results).map(([keyword, count]) => (
          <button key={keyword} onClick={() => toggle_filter(keyword)}
                  className={`chip ${filters.includes(keyword) ? 'chip-category' : 'chip-tag'}`}>
            {keyword} · {count}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="topic-feed">
      <div className="tag-list">
        {topics.map(name => (
          <button key={name} onClick={() => select(name)}
                  className={`chip ${name === topic ? 'chip-category' : 'chip-tag'}`}>
            {name}
          </button>
        ))}
        <button className="chip chip-tag" onClick={() => topic && load_results(topic)}>
          ↻ refresh
        </button>
      </div>

      {panel && (toc ? createPortal(panel, toc) : panel)}

      {!results ? <p className="feed-loading">Loading…</p> : (
        <div className="dir-feed">
          {Object.entries(groups).map(([category, rows], i) => (
            <section key={category} className="feed-section">
              {i > 0 && <div className="feed-section-divider" />}
              <h3>{category} <span className="muted">({rows.length})</span></h3>
              <div className="post-index post-index-compact">
                {rows.map(item => <Row key={`${item.query}|${item.url}`} item={item} />)}
              </div>
            </section>
          ))}
          {!visible.length && (
            <p className="feed-loading">
              {results.length ? 'No results match the selected keywords.'
                              : 'No stored searches yet — run one via POST /api/search.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
