import { useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const media_labels = { article: 'Article', podcast: 'Podcast', youtube: 'YouTube', link: 'Source' }
const post_icons = {
  article: ['Article', 'M5 4h10l4 4v12H5z M15 4v5h4 M8 12h8 M8 16h6'],
  video: ['Video', 'M4 5h16v14H4z M10 9l5 3-5 3z'],
  audio: ['Audio', 'M4 13v-1a8 8 0 0 1 16 0v1 M4 13h4v6H6a2 2 0 0 1-2-2z M20 13h-4v6h2a2 2 0 0 0 2-2z'],
  image: ['Image', 'M4 5h16v14H4z M4 16l5-5 3 3 2-2 6 6 M15.5 9h.01'],
  link: ['Link', 'M10 14l4-4 M8 16l-1 1a3 3 0 0 1-4-4l4-4a3 3 0 0 1 4 0 M16 8l1-1a3 3 0 0 1 4 4l-4 4a3 3 0 0 1-4 0'],
}

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

function post_type(entry, source, url) {
  const kind = typeof source?.kind === 'string' ? source.kind.toLowerCase() : ''
  const path = url?.pathname || ''
  if ((url && youtube_id(url)) || kind === 'video' || /\.(?:mp4|webm|mov)$/i.test(path)) return 'video'
  if (source?.audio_url || ['podcast', 'audio'].includes(kind) || /\.(?:mp3|m4a|ogg|opus|wav)$/i.test(path)) return 'audio'
  if (kind === 'image' || /\.(?:jpe?g|png|gif|webp|svg|avif)$/i.test(path)) return 'image'
  if (kind === 'article') return 'article'
  if (!url && entry.cover) return 'image'
  return url ? 'link' : 'article'
}

function MediaPlayer({ video, audio, title }) {
  const [playing, set_playing] = useState(false)
  if (!video && !audio) return null
  return (
    <span className="mnd-feed-player">
      {!playing ? (
        <button type="button" onClick={() => set_playing(true)}>{video ? 'Play video' : 'Open audio player'}</button>
      ) : video ? (
        <iframe src={`https://www.youtube-nocookie.com/embed/${video}?autoplay=1`}
          title={title} allow="autoplay; encrypted-media; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
      ) : <audio src={audio} controls preload="none" />}
    </span>
  )
}

function SourceCard({ source }) {
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
      </div>
      {image && <img className="mnd-feed-thumb" src={image.href} alt="" loading="lazy" referrerPolicy="no-referrer" />}
      {source.placement !== 'inline' && <MediaPlayer video={video} audio={audio && audio.href} title={source.title || 'YouTube video'} />}
    </aside>
  )
}

function PostLink({ href, title, children }) {
  if (!href) return <span>{children}</span>
  const url = title === 'embed' && web_url(href)
  const video = url && youtube_id(url)
  const audio = url && /\.(?:mp3|m4a|ogg|opus|wav)$/i.test(url.pathname) && url.href
  if (!video && !audio) return <a href={href} title={title}>{children}</a>
  return <span className="mnd-feed-inline-media">
    <a href={href} target="_blank" rel="noreferrer">{children}</a>
    <MediaPlayer video={video} audio={audio} title={typeof children === 'string' ? children : 'Embedded video'} />
  </span>
}

function Post({ entry, open, toggle, default_source, resolve_image, resolve_link }) {
  const first_source = entry.sources?.[0]
  const source_url = web_url(first_source?.url)
  const first_host = source_url?.hostname.replace(/^www\./, '')
  const site = entry.site || entry.origin || first_source?.publisher || first_host || default_source
  const kind = post_type(entry, first_source, source_url)
  const [type_label, icon] = post_icons[kind]
  const facets = (entry.facets || []).flatMap(facet => facet.values
    .filter(value => facet.name !== 'status' || !['draft', 'published', 'unpublished'].includes(value.toLowerCase()))
    .map(value => ({ ...facet, value })))
  return (
    <details className="mnd-feed-entry" open={open}>
      <summary className="mnd-feed-summary" onClick={event => {
        event.preventDefault()
        toggle()
      }}>
        <span className="mnd-feed-info">
          <span className="mnd-feed-title">{entry.title}</span>
          <span className="mnd-feed-meta">
            {site && <span className="mnd-feed-site">{site}</span>}
            {!entry.draft && entry.date
              ? <time className="mnd-feed-publication" dateTime={entry.date}>Published {entry.date}</time>
              : <span className="mnd-feed-publication">{entry.draft ? 'Unpublished' : 'Published'}</span>}
          </span>
        </span>
        <span className="mnd-feed-type" data-media={kind}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d={icon} />
          </svg>
          {type_label}
        </span>
      </summary>
      {open && (
        <>
          {(entry.summary || facets.length > 0) && (
            <div className="mnd-feed-context">
              {entry.summary && <p className="mnd-feed-excerpt">{entry.summary}</p>}
              {facets.length > 0 && (
                <div className="mnd-feed-facets">
                  {facets.map(({ name, label, hue, value }) => (
                    <span className="mnd-feed-facet" key={`${name}:${value}`}
                      title={`${label}: ${value}`}
                      style={hue === undefined ? undefined : { '--facet-hue': hue }}>{value}</span>
                  ))}
                </div>
              )}
            </div>
          )}
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
                  a: ({ href, title, children }) => <PostLink href={href} title={title}>{children}</PostLink>,
                  img: ({ src, alt }) => src ? <img src={src} alt={alt || ''} loading="lazy" referrerPolicy="no-referrer" /> : <span>{alt}</span>,
                }}>{entry.body}</Markdown>
            </div>
            {entry.href && <a className="mnd-feed-permalink" href={entry.href}>Open full post</a>}
          </div>
        </>
      )}
    </details>
  )
}

export default function Feed({ entries, defaultSource, resolveImage, resolveLink }) {
  const [expanded, set_expanded] = useState(null)
  return (
    <div className="mnd-feed">
      {entries.map(entry => <Post key={entry.id} entry={entry} open={expanded === entry.id}
        toggle={() => set_expanded(current => current === entry.id ? null : entry.id)}
        default_source={defaultSource}
        resolve_image={resolveImage} resolve_link={resolveLink} />)}
    </div>
  )
}
