import { createServer } from 'vite'
import { startApi } from './index'

const api = await startApi(0)
try {
  process.env.TRENDLY_API_TARGET = `http://127.0.0.1:${api.port}`
  const vite = await createServer()
  await vite.listen()
  vite.printUrls()

  async function close() {
    await Promise.all([vite.close(), api.close()])
  }
  process.once('SIGINT', close)
  process.once('SIGTERM', close)
} catch (error) {
  await api.close()
  throw error
}
