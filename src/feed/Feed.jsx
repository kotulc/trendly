import { createElement, Fragment, useLayoutEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { normalize_tags } from './card-meta.mjs'

const media_labels = { article: 'Article', podcast: 'Podcast', youtube: 'YouTube', vimeo: 'Vimeo', audio: 'Audio', video: 'Video', image: 'Image', link: 'Source' }
const post_icons = {
  article: ['Article', 'M5 4h10l4 4v12H5z M15 4v5h4 M8 12h8 M8 16h6'],
  video: ['Video', 'M4 5h16v14H4z M10 9l5 3-5 3z'],
  audio: ['Audio', 'M4 13v-1a8 8 0 0 1 16 0v1 M4 13h4v6H6a2 2 0 0 1-2-2z M20 13h-4v6h2a2 2 0 0 0 2-2z'],
  image: ['Image', 'M4 5h16v14H4z M4 16l5-5 3 3 2-2 6 6 M15.5 9h.01'],
  link: ['Link', 'M10 14l4-4 M8 16l-1 1a3 3 0 0 1-4-4l4-4a3 3 0 0 1 4 0 M16 8l1-1a3 3 0 0 1 4 4l-4 4a3 3 0 0 1-4 0'],
}

const prose_elements = new Set([
  'p', 'div', 'section', 'blockquote', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'strong', 'b', 'em', 'i', 's', 'del', 'u', 'code', 'pre', 'kbd', 'sub', 'sup', 'figure', 'figcaption',
  'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
])
const hidden_elements = new Set(['script', 'style', 'object', 'embed', 'template', 'noscript', 'svg', 'math', 'form'])

function web_url(value, base) {
  if (!value?.trim()) return null
  try {
    const url = new URL(value, base)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url : null
  } catch {
    return null
  }
}

function ExternalContent({ content, text }) {
  if (!content.html) return <p className="mnd-feed-plain">{text}</p>
  const template = document.createElement('template')
  template.innerHTML = content.html

  function render(node, key) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent
    if (!(node instanceof Element) || hidden_elements.has(node.localName)) return null
    const tag = node.localName === 'h1' ? 'h2' : node.localName
    if (tag === 'img') {
      const src = web_url(node.getAttribute('src'), content.base) || web_url(node.getAttribute('data-src'), content.base)
      const alt = node.getAttribute('alt') || ''
      return src ? <img key={key} src={src.href} alt={alt} referrerPolicy="no-referrer" /> : alt
    }
    if (tag === 'audio' || tag === 'video') {
      const src = web_url(node.getAttribute('src'), content.base) || web_url(node.getAttribute('data-src'), content.base)
      const sources = src ? [{ src: src.href }] : [...node.children].flatMap(child => {
        const url = child.localName === 'source' && (web_url(child.getAttribute('src'), content.base) ||
          web_url(child.getAttribute('data-src'), content.base))
        return url ? [{ src: url.href, type: child.getAttribute('type') || undefined }] : []
      })
      if (sources.length) return <NativeMedia key={key} kind={tag} sources={sources}
        poster={tag === 'video' ? web_url(node.getAttribute('poster'), content.base)?.href : undefined} />
    }
    if (tag === 'iframe') {
      const src = web_url(node.getAttribute('src'), content.base) || web_url(node.getAttribute('data-src'), content.base)
      const embed = src && hosted_video(src)
      return embed ? <span key={key} className="mnd-feed-inline-media">
        <MediaPlayer kind="video" embed={embed} title={node.getAttribute('title') || media_labels[embed.provider]} />
        <a href={embed.href} target="_blank" rel="noreferrer">Open on {media_labels[embed.provider]}</a>
      </span> : null
    }
    if (tag === 'br' || tag === 'hr') return createElement(tag, { key })
    const children = Array.from(node.childNodes, render)
    if (tag === 'a') {
      const href = web_url(node.getAttribute('href'), content.base)
      return <PostLink key={key} href={href?.href} title={node.getAttribute('title')} external>{children}</PostLink>
    }
    return createElement(prose_elements.has(tag) ? tag : Fragment, { key }, children)
  }

  return Array.from(template.content.childNodes, render)
}

function youtube_id(url) {
  const host = url.hostname.replace(/^(www\.|m\.)/, '')
  const id = host === 'youtu.be' ? url.pathname.split('/')[1]
    : ['youtube.com', 'youtube-nocookie.com'].includes(host)
      ? url.searchParams.get('v') || /^\/(?:shorts|embed|live)\/([^/]+)/.exec(url.pathname)?.[1]
      : undefined
  return /^[\w-]{11}$/.test(id || '') ? id : undefined
}

function hosted_video(url) {
  const youtube = youtube_id(url)
  if (youtube) return { provider: 'youtube', src: `https://www.youtube-nocookie.com/embed/${youtube}`,
    href: `https://www.youtube.com/watch?v=${youtube}` }
  const host = url.hostname.replace(/^www\./, '')
  const match = host === 'vimeo.com' ? /^\/(\d+)(?:\/([\w-]+))?\/?$/.exec(url.pathname)
    : host === 'player.vimeo.com' ? /^\/video\/(\d+)\/?$/.exec(url.pathname) : null
  if (!match) return null
  const [, id, path_hash] = match
  const hash = path_hash || url.searchParams.get('h')
  const params = new URLSearchParams({ dnt: '1' })
  if (hash && /^[\w-]+$/.test(hash)) params.set('h', hash)
  return { provider: 'vimeo', src: `https://player.vimeo.com/video/${id}?${params}`, href: `https://vimeo.com/${id}${params.has('h') ? `/${hash}` : ''}` }
}

function media_file_type(path) {
  const filename = path?.split(/[?#]/, 1)[0] || ''
  if (/\.(?:mp4|m4v|webm|ogv|mov)$/i.test(filename)) return 'video'
  if (/\.(?:mp3|m4a|aac|oga|ogg|opus|wav|flac)$/i.test(filename)) return 'audio'
}

function post_type(entry, source, url) {
  const kind = typeof source?.kind === 'string' ? source.kind.toLowerCase() : ''
  const path = url?.pathname || ''
  if (source?.video_url || (url && hosted_video(url)) || kind === 'video') return 'video'
  if (source?.audio_url || ['podcast', 'audio'].includes(kind)) return 'audio'
  const direct = media_file_type(path)
  if (direct) return direct
  if (kind === 'image' || /\.(?:jpe?g|png|gif|webp|svg|avif)$/i.test(path)) return 'image'
  if (kind === 'article') return 'article'
  if (!url && entry.cover) return 'image'
  return url ? 'link' : 'article'
}

export function entryMediaType(entry) {
  const source = entry.sources?.[0]
  return post_type(entry, source, web_url(source?.url))
}

function reveal_offset({ top, bottom }, inset) {
  if (top < inset) return top - inset
  return Math.max(0, Math.min(bottom - window.innerHeight, top - inset))
}

function reveal_as_it_resizes(element, header, bounds = () => element.getBoundingClientRect()) {
  let frame = 0
  let destination
  const interaction = new AbortController()
  const observer = new ResizeObserver(() => {
    const inset = parseFloat(getComputedStyle(header).scrollMarginTop) || 0
    const start = window.scrollY
    const max = document.scrollingElement.scrollHeight - window.innerHeight
    const target = Math.max(0, Math.min(max, start + reveal_offset(bounds(inset), inset)))
    if (target === destination) return
    cancelAnimationFrame(frame)
    destination = target
    const distance = target - start
    if (Math.abs(distance) < 1) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      window.scrollTo({ top: target, behavior: 'instant' })
      return
    }

    const duration = Math.min(700, 320 + Math.abs(distance) * .5)
    const started = performance.now()
    let last_position = start
    function animate(now) {
      if (Math.abs(window.scrollY - last_position) > 1) {
        stop()
        return
      }
      const progress = Math.min(1, (now - started) / duration)
      const eased = progress * progress * (3 - 2 * progress)
      window.scrollTo({ top: start + distance * eased, behavior: 'instant' })
      last_position = window.scrollY
      if (progress < 1) frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
  })

  function stop() {
    cancelAnimationFrame(frame)
    observer.disconnect()
    interaction.abort()
  }

  for (const event of ['wheel', 'touchmove', 'pointerdown', 'keydown']) {
    window.addEventListener(event, stop, { passive: true, capture: true, signal: interaction.signal })
  }
  observer.observe(element)
  return stop
}

function NativeMedia({ kind, sources, poster, title }) {
  const Element = kind === 'video' ? 'video' : 'audio'
  const single = sources.length === 1 && !sources[0].type
  return <span className="mnd-feed-player">
    <Element src={single ? sources[0].src : undefined} controls preload="metadata"
      aria-label={title || (kind === 'video' ? 'Video player' : 'Audio player')}
      {...(kind === 'video' && { playsInline: true, poster })}>
      {!single && sources.map(({ src, type }, index) => <source key={index} src={src} type={type} />)}
    </Element>
    <a href={sources[0].src} target="_blank" rel="noreferrer">Open {kind} file</a>
  </span>
}

function MediaPlayer({ kind, src, embed, poster, title }) {
  if (!embed) return <NativeMedia kind={kind} sources={[{ src }]} poster={poster} title={title} />
  return <span className="mnd-feed-player">
    <iframe src={embed.src} title={title || media_labels[embed.provider]}
      allow="encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
  </span>
}

function SourceCard({ source }) {
  const url = web_url(source?.url)
  if (!url) return null
  const direct = media_file_type(url.pathname)
  const audio = web_url(source.audio_url) || (direct === 'audio' && !source.video_url ? url : null)
  const video = web_url(source.video_url) || (direct === 'video' && !source.audio_url ? url : null)
  const embed = hosted_video(video || url)
  const kind = embed?.provider || source.kind || direct
  const image = web_url(source.image_url)
  const full_image = kind === 'image' && !audio && !video && !embed && (image || url)
  const domain = url.hostname.replace(/^www\./, '')
  const label = Object.hasOwn(media_labels, kind) ? media_labels[kind] : media_labels.link
  return (
    <aside className="mnd-feed-source">
      <div>
        <p className="mnd-feed-meta">{label} · {source.publisher || domain}</p>
        <a href={url.href} target="_blank" rel="noreferrer">{source.title || domain}</a>
        {source.description && <p>{source.description}</p>}
      </div>
      {image && !full_image && <img className="mnd-feed-thumb" src={image.href} alt="" referrerPolicy="no-referrer" />}
      {full_image && <img className="mnd-feed-source-image" src={full_image.href} alt={source.title || ''} referrerPolicy="no-referrer" />}
      {source.placement !== 'inline' && <>
        {(embed || video) && <MediaPlayer kind="video" src={video?.href} embed={embed} poster={image?.href} title={source.title} />}
        {audio && <MediaPlayer kind="audio" src={audio.href} title={source.title} />}
      </>}
    </aside>
  )
}

function PostLink({ href, title, children, external, resolve_media }) {
  const url = web_url(href)
  const embed = (title === 'embed' || external) && url && hosted_video(url)
  const kind = embed ? 'video' : (title === 'embed' || external) && media_file_type(url?.pathname || href)
  const src = kind && !embed && (url?.href || resolve_media?.(href))
  if (!embed && !src) return href ? <a href={href} title={title || undefined}
    target="_blank" rel="noreferrer">{children}</a> : <span>{children}</span>
  return <span className="mnd-feed-inline-media">
    <a href={embed ? href : src} target="_blank" rel="noreferrer">{children}</a>
    <MediaPlayer kind={kind} src={src} embed={embed} title={typeof children === 'string' ? children : undefined} />
  </span>
}

function FacetChip({ facet: { name, label, hue, value } }) {
  return <span className="mnd-feed-facet" title={`${label}: ${value}`}
    data-status={name === 'status' ? value.toLowerCase() : undefined}
    style={hue === undefined ? undefined : { '--facet-hue': hue }}>{value}</span>
}

export function FeedCard({ title, meta, tags, badge, excerpt, searchExcerpt, open, focusOnOpen, toggle, children }) {
  const summary = useRef(null)

  useLayoutEffect(() => {
    if (!open) return
    const header = summary.current
    if (focusOnOpen) header.focus({ preventScroll: true })

    const card = header.parentElement
    return reveal_as_it_resizes(card, header, inset => {
      const rect = card.getBoundingClientRect()
      const available = window.innerHeight - inset
      if (rect.height <= available) return rect

      const media = card.querySelector('.mnd-feed-body :is(.mnd-feed-player, img:not(.mnd-feed-thumb))')
      const media_rect = media?.getBoundingClientRect()
      if (!media_rect?.height) return rect
      // Keep the title and media together when they can share the viewport.
      return media_rect.bottom - rect.top <= available ? { top: rect.top, bottom: media_rect.bottom } : media_rect
    })
  }, [open, focusOnOpen])

  return <details className="mnd-feed-entry" open={open}>
    <summary ref={summary} className="mnd-feed-summary" onClick={event => {
      event.preventDefault()
      if (!open) event.currentTarget.focus({ preventScroll: true })
      toggle()
    }}>
      <span className="mnd-feed-info">
        <span className="mnd-feed-title" title={title}>{title}</span>
        <span className="mnd-feed-meta">{meta}</span>
        {!open && searchExcerpt && <span className="mnd-feed-search-excerpt">{searchExcerpt}</span>}
      </span>
      {tags}
      {badge}
    </summary>
    {open && <>
      {excerpt && <div className="mnd-feed-context"><p className="mnd-feed-excerpt">{excerpt}</p></div>}
      <div className="mnd-feed-body">{children}</div>
    </>}
  </details>
}

function Post({ entry, open, focus_on_open, toggle, default_source, resolve_image, resolve_link, publication_controls }) {
  const first_source = entry.sources?.[0]
  const source_url = web_url(first_source?.url)
  const first_host = source_url?.hostname.replace(/^www\./, '')
  const site = entry.site || entry.origin || first_source?.publisher || first_host || default_source
  const kind = entryMediaType(entry)
  const [type_label, icon] = post_icons[kind]
  const facets = entry.facets || []
  const chips = publication_controls
    ? facets.filter(facet => facet.name === 'status').flatMap(facet => facet.values.map(value => ({ ...facet, value })))
    : facets.flatMap(facet => normalize_tags(facet.values)
      .filter(value => (facet.name !== 'status' || !['draft', 'published', 'unpublished'].includes(value)) &&
        (!entry.draft || value !== 'draft'))
      .map(value => ({ ...facet, value })))
  const show_draft_chip = entry.draft && !publication_controls
  const publication = entry.date && (!entry.draft || publication_controls)
    ? <time className="mnd-feed-publication" dateTime={entry.date}>{!publication_controls && 'Published '}{entry.date}</time>
    : !publication_controls && <span className="mnd-feed-publication">{entry.draft ? 'Unpublished' : 'Published'}</span>

  function markdown_url(url, key, node) {
    const remote = web_url(url)
    if (remote) return remote.href
    if (key === 'src') return resolve_image?.(url, entry) || ''
    if (node.properties.title === 'embed' && media_file_type(url) && resolve_image?.(url, entry)) return url
    return resolve_link?.(url, entry) || ''
  }
  return (
    <FeedCard title={entry.title} excerpt={entry.summary} searchExcerpt={entry.searchExcerpt} open={open} focusOnOpen={focus_on_open} toggle={toggle} meta={<>
      {site && <span className="mnd-feed-site" title={site}>{site}</span>}
      {publication}
    </>} tags={(show_draft_chip || chips.length > 0) && (
      <span className="mnd-feed-tags">
        {show_draft_chip && <FacetChip facet={{ name: 'status', label: 'Status', value: 'draft' }} />}
        {chips.map(facet => <FacetChip key={`${facet.name}:${facet.value}`} facet={facet} />)}
      </span>
    )} badge={!publication_controls && <span className="mnd-feed-type" data-media={kind}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d={icon} />
          </svg>
          {type_label}
    </span>}>
      {entry.sources?.length > 0 && (
        <div className="mnd-feed-sources">
          {entry.sources.map((source, index) => <SourceCard key={`${source.url}-${index}`} source={source} />)}
        </div>
      )}
      <div className="mnd-feed-prose">
        {entry.externalContent ? <ExternalContent content={entry.externalContent} text={entry.body} /> : <Markdown skipHtml remarkPlugins={[remarkGfm]}
          urlTransform={markdown_url}
          components={{
            a: ({ href, title, children }) => <PostLink href={href} title={title}
              resolve_media={url => resolve_image?.(url, entry)}>{children}</PostLink>,
            img: ({ src, alt }) => src ? <img src={src} alt={alt || ''} loading="lazy" referrerPolicy="no-referrer" /> : <span>{alt}</span>,
          }}>{entry.body}</Markdown>}
      </div>
      {entry.href && <a className="mnd-feed-permalink" href={entry.href} target="_blank" rel="noreferrer">Open full post</a>}
    </FeedCard>
  )
}

export default function Feed({ entries, defaultSource, resolveImage, resolveLink, renderAction, initialExpanded, publicationControls }) {
  const [expanded, set_expanded] = useState(initialExpanded ?? null)

  return (
    <div className={publicationControls ? 'mnd-feed state-card-list' : 'mnd-feed'}>
      {entries.map(entry => {
        const post = <Post key={entry.id} entry={entry} open={expanded === entry.id}
          focus_on_open={initialExpanded === entry.id}
          toggle={() => set_expanded(current => current === entry.id ? null : entry.id)}
          default_source={defaultSource} resolve_image={resolveImage} resolve_link={resolveLink}
          publication_controls={publicationControls} />
        const action = renderAction?.(entry)
        return action ? <div className="mnd-feed-row" key={entry.id}>
          {post}<div className="mnd-feed-action">{action}</div>
        </div> : post
      })}
    </div>
  )
}
