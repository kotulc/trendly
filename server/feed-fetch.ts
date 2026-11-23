import { website } from '../src/repository'

const maxBytes = 4 * 1024 * 1024
const cacheDuration = 5 * 60 * 1000

export function createFeedFetcher(url: string) {
  const origin = new URL(url).origin
  let cached: { body: string; expires: number } | undefined
  let pending: Promise<string> | undefined

  async function download() {
    let next = url
    const signal = AbortSignal.timeout(8000)
    for (let redirects = 0; redirects <= 3; redirects++) {
      const response = await fetch(next, {
        signal, redirect: 'manual', headers: { Accept: 'application/feed+json, application/rss+xml, application/atom+xml, application/xml, text/xml, application/json' },
      })
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel()
        const location = response.headers.get('location')
        const target = location && website(new URL(location, next).href)
        if (!target || new URL(target).origin !== origin) throw new Error('Feed redirect left the approved origin.')
        next = target
        continue
      }
      if (!response.ok || !response.body || Number(response.headers.get('content-length')) > maxBytes) {
        await response.body?.cancel()
        throw new Error(`Feed request failed or exceeded the size limit (HTTP ${response.status}).`)
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let size = 0
      let body = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) return body + decoder.decode()
        size += value.byteLength
        if (size > maxBytes) {
          await reader.cancel()
          throw new Error('Feed response exceeded the size limit.')
        }
        body += decoder.decode(value, { stream: true })
      }
    }
    throw new Error('Feed exceeded the redirect limit.')
  }

  return function fetchApprovedFeed() {
    if (cached && cached.expires > Date.now()) return Promise.resolve(cached.body)
    pending ??= download().then(body => {
      cached = { body, expires: Date.now() + cacheDuration }
      return body
    }).finally(() => { pending = undefined })
    return pending
  }
}
