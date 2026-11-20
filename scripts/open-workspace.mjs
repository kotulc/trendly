import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, realpath, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { build, preview } from 'vite'
import { stringify } from 'yaml'

const folders = ['posts', 'feeds', 'suggestions', 'assets']
const imageTypes = new Map(Object.entries({
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg',
  '.avif': 'image/avif', '.bmp': 'image/bmp', '.ico': 'image/x-icon',
}))

class WorkspaceError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function validatePath(path, asset) {
  if (typeof path !== 'string') throw new WorkspaceError(400, 'Invalid workspace path.')
  const parts = path.split('/')
  if (parts.some((part) => !part || /[\\:<>"|?*\x00-\x1f]|[. ]$/.test(part) ||
    /^(?:con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/i.test(part))) {
    throw new WorkspaceError(400, 'Invalid workspace path.')
  }
  const [folder, file] = parts
  if (asset && folder === 'assets' && parts.length > 1) return parts
  if (!asset && path === 'workspace.yaml') return parts
  const allowedExtension = folder === 'posts' ? /\.md$/i : /\.yaml$/i
  if (!asset && folders.slice(0, 3).includes(folder) && parts.length === 2 && allowedExtension.test(file) && !file.startsWith('.')) return parts
  throw new WorkspaceError(400, 'Invalid workspace path.')
}

async function inspect(path) {
  try { return await lstat(path) }
  catch (error) { if (error.code === 'ENOENT') return null; throw error }
}

async function resolveFile(root, parts, createDirectories = false) {
  let path = root
  for (const part of parts.slice(0, -1)) {
    path = join(path, part)
    if (createDirectories) await mkdir(path).catch((error) => { if (error.code !== 'EEXIST') throw error })
    const entry = await inspect(path)
    if (!entry) return null
    if (!entry.isDirectory()) throw new WorkspaceError(400, 'Expected a regular workspace directory.')
  }
  path = join(path, parts.at(-1))
  const entry = await inspect(path)
  if (entry && !entry.isFile()) throw new WorkspaceError(400, 'Expected a regular workspace file.')
  return { path, entry }
}

async function readText(root, parts) {
  const target = await resolveFile(root, parts)
  if (!target?.entry) return null
  if (target.entry.size > 2 * 1024 * 1024) throw new WorkspaceError(413, 'Workspace text files are limited to 2 MB in local mode.')
  return readFile(target.path, 'utf8')
}

async function saveText(root, parts, raw, expected) {
  const conflict = () => new WorkspaceError(409, 'The file changed on disk.')
  if (await readText(root, parts) !== expected) throw conflict()
  const { path } = await resolveFile(root, parts, true)
  const temporary = join(dirname(path), `.trendly-${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, raw, { flag: 'wx', encoding: 'utf8' })
    if (await readText(root, parts) !== expected) throw conflict()
    await rename(temporary, path)
  } finally {
    await unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error })
  }
}

async function readRequest(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 16 * 1024 * 1024) throw new WorkspaceError(413, 'Workspace request is too large.')
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { throw new WorkspaceError(400, 'Invalid workspace request.') }
}

function workspacePlugin(root) {
  let writes = Promise.resolve()
  function enqueue(task) {
    const next = writes.then(task)
    writes = next.catch(() => {})
    return next
  }

  async function respond(request, response) {
    const authority = `127.0.0.1:${request.socket.localPort}`
    if (request.method !== 'POST' || request.headers.host !== authority ||
      request.headers.origin !== `http://${authority}` ||
      request.headers['content-type'] !== 'application/json') {
      throw new WorkspaceError(403, 'Open the loopback address printed by Trendly to use this workspace.')
    }
    const input = await readRequest(request)
    if (!input || typeof input !== 'object') throw new WorkspaceError(400, 'Invalid workspace request.')
    const { op, path, folder, raw, expected } = input
    switch (op) {
      case 'open':
        return enqueue(async () => {
          if (await readText(root, ['workspace.yaml']) === null) {
            if ((await readdir(root)).length) throw new WorkspaceError(400, 'Choose an empty folder or a Trendly workspace with a workspace.yaml file.')
            await saveText(root, ['workspace.yaml'], stringify({ version: 1, name: basename(root) }), null)
            for (const name of folders) await mkdir(join(root, name), { recursive: true })
          }
          return true
        })
      case 'read':
        return readText(root, validatePath(path, false))
      case 'list': {
        if (!folders.includes(folder)) throw new WorkspaceError(400, 'Invalid workspace folder.')
        const directory = join(root, folder)
        const entry = await inspect(directory)
        if (!entry) return []
        if (!entry.isDirectory()) throw new WorkspaceError(400, 'Expected a regular workspace directory.')
        return (await readdir(directory, { withFileTypes: true })).filter((item) => item.isFile()).map((item) => item.name).sort()
      }
      case 'write': {
        const parts = validatePath(path, false)
        if (typeof raw !== 'string' || (expected !== null && typeof expected !== 'string')) {
          throw new WorkspaceError(400, 'Invalid workspace write.')
        }
        if (Buffer.byteLength(raw) > 2 * 1024 * 1024) throw new WorkspaceError(413, 'Workspace text files are limited to 2 MB in local mode.')
        await enqueue(() => saveText(root, parts, raw, expected))
        return true
      }
      case 'asset': {
        const target = await resolveFile(root, validatePath(path, true))
        const type = imageTypes.get(extname(path).toLowerCase())
        if (!target?.entry || !type) {
          response.statusCode = 204
          return undefined
        }
        if (target.entry.size > 32 * 1024 * 1024) throw new WorkspaceError(413, 'Image is too large for the local preview.')
        response.setHeader('Content-Type', type)
        return readFile(target.path)
      }
      default:
        throw new WorkspaceError(400, 'Invalid workspace operation.')
    }
  }

  return {
    name: 'trendly-local-workspace',
    configurePreviewServer(server) {
      server.middlewares.use('/__trendly/workspace', (request, response) => {
        response.setHeader('Cache-Control', 'no-store')
        response.setHeader('X-Content-Type-Options', 'nosniff')
        void respond(request, response).then((value) => {
          if (value === undefined || Buffer.isBuffer(value)) response.end(value)
          else {
            response.setHeader('Content-Type', 'application/json')
            response.end(JSON.stringify(value))
          }
        }).catch((error) => {
          response.statusCode = error instanceof WorkspaceError ? error.status : 500
          response.setHeader('Content-Type', 'application/json')
          response.end(JSON.stringify({ error: error instanceof WorkspaceError ? error.message : 'Trendly could not access this workspace file.' }))
        })
      })
    },
  }
}

try {
  const [folder, ...rest] = process.argv.slice(2)
  if (!folder || rest.length) throw new Error('Usage: npm run workspace -- "path-to-folder"')
  const root = await realpath(folder)
  if (!(await lstat(root)).isDirectory()) throw new Error('Choose a workspace directory.')
  await build()
  const server = await preview({
    plugins: [workspacePlugin(root)],
    preview: { host: '127.0.0.1', port: 4173, cors: false },
  })
  console.log(`Open the address below in Firefox, then choose Open workspace.\nWorkspace: ${root}`)
  server.printUrls()
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
