import { useEffect, useState } from 'react'
import { ExternalLink, FileText, Headphones, Link, Play, Video } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { webUrl, youtubeId, type Post, type Source } from './model'
import type { Workspace } from './workspace'

const types = {
  article: { label: 'Article', icon: FileText },
  youtube: { label: 'YouTube', icon: Video },
  podcast: { label: 'Podcast', icon: Headphones },
  link: { label: 'Link', icon: Link },
}

function assetPath(url: string) {
  try {
    const path = decodeURIComponent(url).replace(/^\.\//, '')
    if (!path.startsWith('assets/') || path.split('/').some((part) => !part || part === '..' || part === '.' || /[\\:]/.test(part))) {
      return undefined
    }
    return path
  } catch {
    return undefined
  }
}

function PreviewImage({ src, alt, workspace }: { src?: string; alt?: string; workspace: Workspace }) {
  const [local, setLocal] = useState<{ path: string; url: string }>()
  const path = src ? assetPath(src) : undefined
  useEffect(() => {
    if (!path) return
    let cancelled = false
    let objectUrl: string | undefined
    workspace.asset(path).then((file) => {
      if (!file || cancelled || !file.type.startsWith('image/')) return
      objectUrl = URL.createObjectURL(file)
      setLocal({ path, url: objectUrl })
    }).catch(() => {})
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [path, workspace])
  const url = path ? local?.path === path ? local.url : undefined : webUrl(src)
  return url ? <img src={url} alt={alt ?? ''} loading="lazy" referrerPolicy="no-referrer" /> : <span>{alt}</span>
}

function SourceCard({ source }: { source: Source }) {
  const [playing, setPlaying] = useState(false)
  const { label, icon: Icon } = types[source.kind]
  const domain = new URL(source.url).hostname.replace(/^www\./, '')
  const video = source.kind === 'youtube' ? youtubeId(source.url) : undefined
  return (
    <section className="source-card">
      <div className="source-main">
        <span className="source-icon"><Icon size={20} /></span>
        <div className="source-detail">
          <p className="source-type">{label} · {source.publisher || domain}</p>
          <a className="source-title" href={source.url} target="_blank" rel="noreferrer">
            {source.title || domain} <ExternalLink size={13} aria-hidden="true" />
          </a>
          {source.description && <p>{source.description}</p>}
        </div>
        {source.image_url && <img className="source-thumb" src={source.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" />}
      </div>
      {video && (playing
        ? <iframe title={source.title || 'YouTube video'} className="video" src={`https://www.youtube-nocookie.com/embed/${video}?autoplay=1`} referrerPolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
        : <button className="source-play" onClick={() => setPlaying(true)}><Play size={15} /> Play video</button>)}
      {source.kind === 'podcast' && source.audio_url && (playing
        ? <audio controls preload="none" src={source.audio_url} />
        : <button className="source-play" onClick={() => setPlaying(true)}><Headphones size={15} /> Open audio player</button>)}
    </section>
  )
}

export function Preview({ post, workspace }: { post: Post; workspace: Workspace }) {
  return (
    <article className="preview-article">
      <h2>{post.title}</h2>
      {post.tags.length > 0 && <div className="tags">{post.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
      {post.sources.length > 0 && <div className="sources" aria-label="Sources">
        {post.sources.map((source, index) => <SourceCard source={source} key={`${source.url}-${index}`} />)}
      </div>}
      <div className="prose">
        {post.body.trim() ? <Markdown
          remarkPlugins={[remarkGfm]}
          skipHtml
          urlTransform={(url, key) => webUrl(url) ?? (key === 'src' && assetPath(url) ? url : '')}
          components={{
            a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noreferrer">{children}</a> : <span>{children}</span>,
            img: ({ src, alt }) => <PreviewImage src={src} alt={alt} workspace={workspace} />,
          }}
        >{post.body}</Markdown> : <p className="muted">Start writing in the Markdown editor to see your post here.</p>}
      </div>
    </article>
  )
}
