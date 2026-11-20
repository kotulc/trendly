import type { FeedEntry } from './Feed'

export function card_meta(frontmatter: Record<string, unknown>, facets: Record<string, unknown>, draft?: boolean):
  Pick<FeedEntry, 'facets' | 'site' | 'cover'>
