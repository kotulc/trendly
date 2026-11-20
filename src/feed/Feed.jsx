import { useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const media_labels = { article: 'Article', podcast: 'Podcast', youtube: 'YouTube', link: 'Source' }

function web_url(value) {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url : null
  } catch {
    return null
  }
}

function youtube_id(url) {
  const host = url.hostname.replace(/^(www\.|m\.)/, '')
  const id = host === 'youtu.be' ? url.pathname.split('/')[1]
    : ['youtube.com', 'youtube-nocookie.com'].includes(host)
      ? url.searchParams.get('v') || /^\/(?:shorts|embed|live)\/([^/]+)/.exec(url.pathname)?.[1]
      : undefined
  return /^[\w-]{11}$/.test(id || '') ? id : undefined
}

function SourceCard({ source }) {
  const [playing, set_playing] = useState(false)
  const url = web_url(source?.url)
  if (!url) return null
  const video = youtube_id(url)
  const kind = video ? 'youtube' : source.kind
  const audio = kind === 'podcast' && web_url(source.audio_url)
  const image = web_url(source.image_url)
  const domain = url.hostname.replace(/^www\./, '')
  const label = Object.hasOwn(media_labels, kind) ? media_labels[kind] : media_labels.link
  return (
    <aside className="mnd-feed-source">
      <div>
        <p className="mnd-feed-meta">{label} · {source.publisher || domain}</p>
        <a href={url.href} target="_blank" rel="noreferrer">{source.title || domain}</a>
        {source.description && <p>{source.description}</p>}
        {(video || audio) && !playing && (
          <button type="button" onClick={() => set_playing(true)}>{video ? 'Play video' : 'Open audio player'}</button>
        )}
      </div>
      {image && <img className="mnd-feed-thumb" src={image.href} alt="" loading="lazy" referrerPolicy="no-referrer" />}
      {playing && video && <iframe src={`https://www.youtube-nocookie.com/embed/${video}?autoplay=1`}
        title={source.title || 'YouTube video'} allow="autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />}
      {playing && audio && <audio src={audio.href} controls preload="none" />}
    </aside>
  )
}

function Post({ entry, resolve_image, resolve_link }) {
  const [open, set_open] = useState(false)
  return (
    <details className="mnd-feed-entry" onToggle={(event) => set_open(event.currentTarget.open)}>
      <summary className="mnd-feed-summary">
        <span className="mnd-feed-info">
          <span className="mnd-feed-title">{entry.title}</span>
          {(entry.date || entry.draft || entry.origin) && (
            <span className="mnd-feed-meta">
              {entry.date && <time dateTime={entry.date}>{entry.date}</time>}
              {entry.origin && <span>{entry.origin}</span>}
              {entry.draft && <span className="mnd-feed-draft">Draft</span>}
            </span>
          )}
          {entry.summary && <span className="mnd-feed-excerpt">{entry.summary}</span>}
        </span>
      </summary>
      {open && (
        <div className="mnd-feed-body">
          {entry.sources?.length > 0 && (
            <div className="mnd-feed-sources">
              {entry.sources.map((source, index) => <SourceCard key={`${source.url}-${index}`} source={source} />)}
            </div>
          )}
          <div className="mnd-feed-prose">
            <Markdown skipHtml remarkPlugins={[remarkGfm]}
              urlTransform={(url, key) => web_url(url)?.href ||
                (key === 'src' ? resolve_image?.(url, entry) : resolve_link?.(url, entry)) || ''}
              components={{
                a: ({ href, children }) => href ? <a href={href}>{children}</a> : <span>{children}</span>,
                img: ({ src, alt }) => src ? <img src={src} alt={alt || ''} loading="lazy" referrerPolicy="no-referrer" /> : <span>{alt}</span>,
              }}>{entry.body}</Markdown>
          </div>
          {entry.href && <a className="mnd-feed-permalink" href={entry.href}>Open full post</a>}
        </div>
      )}
    </details>
  )
}

export default function Feed({ entries, resolveImage, resolveLink }) {
  return (
    <div className="mnd-feed">
      {entries.map(entry => <Post key={entry.id} entry={entry} resolve_image={resolveImage} resolve_link={resolveLink} />)}
    </div>
  )
}
