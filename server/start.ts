import { startApi } from './index'

const host = process.env.TRENDLY_API_HOST || '127.0.0.1'
const api = await startApi(Number(process.env.PORT || 8787), host)
console.log(`Trendly API listening on ${host}:${api.port}`)
const close = () => void api.close()
process.once('SIGINT', close)
process.once('SIGTERM', close)
