import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { entryMediaType, type FeedEntry } from '../src/feed/Feed'
import type { IndexedResult, IndexedScope } from '../src/indexed-search'

export function createSearchIndex(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS search_entries USING fts5(
      scope UNINDEXED, date UNINDEXED, media UNINDEXED, tags UNINDEXED,
      title, source, summary, body, entry UNINDEXED
    )
  `)
  const remove = db.prepare('DELETE FROM search_entries WHERE scope = ?')
  const insert = db.prepare('INSERT INTO search_entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')

  return {
    replace(scope: IndexedScope, entries: FeedEntry[]) {
      db.exec('BEGIN')
      try {
        remove.run(scope)
        for (const entry of entries) {
          const tags = entry.facets?.find(facet => facet.name === 'tags')?.values ?? []
          const source = [entry.origin, entry.site, scope === 'posts' ? 'Published' : '',
            ...(entry.facets ?? []).flatMap(facet => facet.values),
            ...entry.sources.flatMap(citation => [citation.title, citation.publisher, citation.url])].filter(Boolean).join(' ')
          insert.run(scope, entry.date ?? '', entryMediaType(entry), JSON.stringify(tags), entry.title, source,
            entry.summary, entry.body, JSON.stringify(entry))
        }
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
    search(scope: IndexedScope, params: URLSearchParams): IndexedResult[] {
      const query = (params.get('q') ?? '').slice(0, 256)
      const terms = query.match(/[\p{L}\p{M}\p{N}]+/gu)?.slice(0, 12)
      if (!terms?.length) return []
      const match = terms.map(term => `"${term}"*`).join(' AND ')
      const media = params.get('media') ?? ''
      const tag = params.get('tag') ?? ''
      const from = params.get('from') ?? ''
      const to = params.get('to') ?? ''
      const rows = db.prepare(`
        SELECT entry, snippet(search_entries, -1, '', '', ' … ', 24) AS excerpt
        FROM search_entries
        WHERE search_entries MATCH ? AND scope = ?
          AND (? = '' OR media = ?)
          AND (? = '' OR EXISTS (SELECT 1 FROM json_each(search_entries.tags) WHERE value = ?))
          AND (? = '' OR date >= ?) AND (? = '' OR (date != '' AND date <= ?))
        ORDER BY bm25(search_entries, 0, 0, 0, 0, 5, 2, 2, 1, 0), date DESC, title
        LIMIT 75
      `).all(match, scope, media, media, tag, tag, from, from, to, to)
      return rows.map(row => ({ entry: JSON.parse(String(row.entry)), excerpt: String(row.excerpt) }))
    },
    close() { db.close() },
  }
}
