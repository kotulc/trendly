/**
 * Trendly dashboard island: lists a topic's stored items with follow/unfollow and
 * delete actions, fetched at runtime from the trendly API. Synced into an mdsite
 * build via the mdsite.yaml `components:` dir and embedded from content MDX.
 * Props: api — base url of the trendly server ('' = same origin as the site).
 */
import { useState, useEffect, useCallback } from 'react'


function fmt_time(iso) {
  // Item timestamps arrive as sqlite 'YYYY-MM-DD HH:MM:SS' strings
  return String(iso || '').slice(0, 16)
}


export default function TopicFeed({ api = '' }) {
  const [topics, set_topics] = useState(null)
  const [topic, set_topic]   = useState(null)
  const [items, set_items]   = useState(null)

  const load_items = useCallback((name) => {
    fetch(`${api}/api/topics/${name}/items?status=digested`)
      .then(r => r.json())
      .then(d => set_items(d.items))
      .catch(() => set_items([]))
  }, [api])

  const select = useCallback((name) => {
    set_topic(name)
    set_items(null)
    window.history.replaceState(null, '', `#${encodeURIComponent(name)}`)
    load_items(name)
  }, [load_items])

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

  async function post(path, body) {
    await fetch(`${api}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    })
    load_items(topic)
  }

  function toggle_follow(item) {
    post('/api/sources/follow', { topic, domain: item.domain, followed: !item.followed })
  }

  function remove_item(item) {
    if (window.confirm(`Delete "${item.title || item.url}"? Similar items will be blocked in future runs.`))
      post(`/api/items/${item.id}/delete`)
  }

  if (!topics) return <p className="feed-loading">Loading…</p>
  if (!topics.length) return <p className="feed-loading">No topics configured on the server.</p>

  return (
    <div className="topic-feed">
      <div className="tag-list">
        {topics.map(name => (
          <button key={name} onClick={() => select(name)}
                  className={`chip ${name === topic ? 'chip-category' : 'chip-tag'}`}>
            {name}
          </button>
        ))}
      </div>

      {!items ? <p className="feed-loading">Loading…</p> : (
        <div className="post-index">
          {items.map(item => (
            <div key={item.id} className="post-entry">
              <a className="post-title" href={item.url} target="_blank" rel="noreferrer">
                {item.title || item.url}
              </a>
              <div className="post-meta">
                <span>{fmt_time(item.extracted_at)}</span>
                <span>{item.domain}</span>
                <span>score {Number(item.score).toFixed(2)}</span>
              </div>
              {item.summary && <p className="post-summary">{item.summary}</p>}
              {item.tags?.length > 0 && (
                <div className="tag-list">
                  {item.tags.map(t => <span key={t} className="chip chip-tag">{t}</span>)}
                </div>
              )}
              <div className="post-actions">
                <button className="chip chip-tag" onClick={() => toggle_follow(item)}>
                  {item.followed ? 'unfollow' : 'follow'} {item.domain}
                </button>
                <button className="chip chip-danger" onClick={() => remove_item(item)}>
                  delete
                </button>
              </div>
            </div>
          ))}
          {!items.length && <p className="feed-loading">No items yet for this topic.</p>}
        </div>
      )}
    </div>
  )
}
