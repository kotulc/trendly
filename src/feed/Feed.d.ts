export type FeedSource = {
  url: string
  kind?: string
  title?: string
  publisher?: string
  description?: string
  image_url?: string
  audio_url?: string
  video_url?: string
  placement?: string
}

export type FeedEntry = {
  id: string
  title: string
  date?: string
  timestamp?: number
  summary: string
  body: string
  externalContent?: { html?: string; base: string }
  path: string
  href?: string
  draft?: boolean
  origin?: string
  site?: string
  cover?: { url: string; alt: string }
  facets?: { name: string; label: string; hue?: number; values: string[] }[]
  sources: FeedSource[]
}

type Resolve = (value: string, entry: FeedEntry) => string | undefined

export function entryMediaType(entry: Pick<FeedEntry, 'sources' | 'cover'>): 'article' | 'audio' | 'video' | 'image' | 'link'

export function FeedCard(props: {
  title: string
  meta: React.ReactNode
  badge?: React.ReactNode
  tags?: React.ReactNode
  excerpt?: string
  open: boolean
  focusOnOpen?: boolean
  toggle: () => void
  children: React.ReactNode
}): React.JSX.Element

export default function Feed(props: {
  entries: FeedEntry[]
  defaultSource?: string
  resolveImage?: Resolve
  resolveLink?: Resolve
  renderAction?: (entry: FeedEntry) => React.ReactNode
  initialExpanded?: string
  publicationControls?: boolean
}): React.JSX.Element
