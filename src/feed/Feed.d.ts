export type FeedSource = {
  url: string
  kind?: string
  title?: string
  publisher?: string
  description?: string
  image_url?: string
  audio_url?: string
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
  sources: FeedSource[]
}

type Resolve = (value: string, entry: FeedEntry) => string | undefined

export default function Feed(props: { entries: FeedEntry[]; resolveImage?: Resolve; resolveLink?: Resolve }): React.JSX.Element
