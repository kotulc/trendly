export type FeedSource = {
  url: string
  kind?: string
  title?: string
  publisher?: string
  description?: string
  image_url?: string
  audio_url?: string
  placement?: string
}

export type FeedEntry = {
  id: string
  title: string
  date?: string
  summary: string
  body: string
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

export default function Feed(props: {
  entries: FeedEntry[]
  defaultSource?: string
  resolveImage?: Resolve
  resolveLink?: Resolve
}): React.JSX.Element
