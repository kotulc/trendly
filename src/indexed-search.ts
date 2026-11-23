import { useEffect, useState } from 'react'
import type { FeedEntry } from './feed/Feed'

export type IndexedScope = 'posts' | 'feeds'
export type IndexedResult = { entry: FeedEntry; excerpt: string }
export type IndexedSearchResponse = {
  workspace: 'example' | 'configured'
  ready: boolean
  feedUrl?: string
  results: IndexedResult[]
}

export function useIndexedSearch(scope: IndexedScope | undefined, query: string, tag: string, media: string) {
  const key = scope && query ? new URLSearchParams({ scope, q: query, tag, media }).toString() : ''
  const [result, setResult] = useState<{ key: string; response: IndexedSearchResponse }>()

  useEffect(() => {
    if (!key) return
    const controller = new AbortController()
    let timer: number
    async function search() {
      try {
        const endpoint = new URL('./api/search', document.baseURI)
        endpoint.search = key
        const response = await fetch(endpoint, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(3000)]) })
        if (controller.signal.aborted) return
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
          setResult(undefined)
          return
        }
        const data: IndexedSearchResponse = await response.json()
        if (controller.signal.aborted) return
        if (data.workspace !== 'example' || !Array.isArray(data.results)) {
          setResult(undefined)
          return
        }
        setResult({ key, response: data })
        timer = window.setTimeout(search, 5000)
      } catch {
        if (!controller.signal.aborted) setResult(undefined)
      }
    }
    timer = window.setTimeout(search, 200)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [key])

  return key && result?.key === key && result.response.ready ? result.response : undefined
}
