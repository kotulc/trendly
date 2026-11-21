import type { FeedEntry } from './Feed'

export function normalize_tags(tags: string[]): string[]

export function card_meta(frontmatter: Record<string, unknown>, facets: Record<string, unknown>, draft?: boolean):
  Pick<FeedEntry, 'facets' | 'site' | 'cover'>
