import { stringify } from 'yaml'
import { readFeed, readPost, readSuggestion, readYaml, type Snapshot } from './model'

type Folder = 'posts' | 'feeds' | 'suggestions' | 'assets'
type Directory = FileSystemDirectoryHandle & { values(): AsyncIterableIterator<FileSystemHandle> }
type PickerWindow = Window & {
  showDirectoryPicker?: (options: { mode: 'readwrite'; id: string }) => Promise<Directory>
}

export interface Workspace {
  mode: 'disk' | 'demo'
  read(path: string): Promise<string | null>
  list(folder: Folder): Promise<string[]>
  write(path: string, raw: string, expected: string | null): Promise<void>
  asset(path: string): Promise<Blob | undefined>
}

export class WorkspaceConflict extends Error {
  constructor() {
    super('The file changed on disk. Refresh and review the changes before saving.')
  }
}

function missing(error: unknown) {
  return error instanceof DOMException && error.name === 'NotFoundError'
}

async function fileAt(root: Directory, path: string, create = false) {
  const parts = path.split('/')
  if (parts.some((part) => !part || part === '..' || part === '.' || /[\\:]/.test(part))) {
    throw new Error('Invalid workspace path')
  }
  const filename = parts.pop()!
  let folder: FileSystemDirectoryHandle = root
  for (const part of parts) folder = await folder.getDirectoryHandle(part, { create })
  return folder.getFileHandle(filename, { create })
}

async function localRequest(op: string, data: Record<string, unknown> = {}) {
  const response = await fetch('/__trendly/workspace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op, ...data }),
  })
  if (response.status === 409) throw new WorkspaceConflict()
  if (!response.ok) {
    if (response.headers.get('Content-Type')?.includes('application/json')) {
      const { error } = await response.json()
      throw new Error(error)
    }
    throw new Error('To open a folder in this browser, start Trendly with npm run workspace -- "path-to-folder" and open the address it prints.')
  }
  return response
}

async function openLocalWorkspace(): Promise<Workspace> {
  await localRequest('open')
  return {
    mode: 'disk',
    async read(path) { return (await localRequest('read', { path })).json() },
    async list(folder) { return (await localRequest('list', { folder })).json() },
    async write(path, raw, expected) { await localRequest('write', { path, raw, expected }) },
    async asset(path) {
      const response = await localRequest('asset', { path })
      return response.status === 204 ? undefined : response.blob()
    },
  }
}

export async function openWorkspace(): Promise<Workspace> {
  const picker = (window as PickerWindow).showDirectoryPicker
  if (!picker) return openLocalWorkspace()
  const root = await picker.call(window, { mode: 'readwrite', id: 'trendly-workspace' })

  const workspace: Workspace = {
    mode: 'disk',
    async read(path) {
      try { return await (await (await fileAt(root, path)).getFile()).text() }
      catch (error) { if (missing(error)) return null; throw error }
    },
    async list(folder) {
      try {
        const directory = await root.getDirectoryHandle(folder) as Directory
        const files: string[] = []
        for await (const entry of directory.values()) if (entry.kind === 'file') files.push(entry.name)
        return files.sort()
      } catch (error) { if (missing(error)) return []; throw error }
    },
    async write(path, raw, expected) {
      if (await workspace.read(path) !== expected) throw new WorkspaceConflict()
      const handle = await fileAt(root, path, expected === null)
      const options = { mode: 'exclusive' } as FileSystemCreateWritableOptions
      const stream = await handle.createWritable(options)
      try {
        await stream.write(raw)
        if (await workspace.read(path) !== (expected ?? '')) throw new WorkspaceConflict()
        await stream.close()
      } catch (error) {
        await stream.abort().catch(() => {})
        throw error
      }
    },
    async asset(path) {
      try { return await (await fileAt(root, path)).getFile() }
      catch (error) { if (missing(error)) return undefined; throw error }
    },
  }

  if (await workspace.read('workspace.yaml') === null) {
    const contents = await root.values().next()
    if (!contents.done) throw new Error('Choose an empty folder or a Trendly workspace with a workspace.yaml file.')
    await workspace.write('workspace.yaml', stringify({ version: 1, name: root.name }), null)
    for (const folder of ['posts', 'feeds', 'suggestions', 'assets']) {
      await root.getDirectoryHandle(folder, { create: true })
    }
  }
  return workspace
}

export function demoWorkspace(): Workspace {
  const fixtures = import.meta.glob('../example-workspace/**/*.{md,yaml}', { query: '?raw', import: 'default', eager: true })
  const files = new Map(Object.entries(fixtures).map(([path, text]) => [path.replace('../example-workspace/', ''), text as string]))
  return {
    mode: 'demo',
    async read(path) { return files.get(path) ?? null },
    async list(folder) {
      return [...files.keys()].filter((path) => path.startsWith(folder + '/')).map((path) => path.slice(folder.length + 1)).sort()
    },
    async write(path, raw, expected) {
      if ((files.get(path) ?? null) !== expected) throw new WorkspaceConflict()
      files.set(path, raw)
    },
    async asset() { return undefined },
  }
}

export async function scanWorkspace(workspace: Workspace): Promise<Snapshot> {
  const manifest = await workspace.read('workspace.yaml')
  if (manifest === null) throw new Error('This folder is missing workspace.yaml.')
  const data = readYaml(manifest)
  if (data.version !== 1 || typeof data.name !== 'string' || !data.name.trim()) {
    throw new Error('workspace.yaml must include version: 1 and a workspace name.')
  }
  const issues: string[] = []
  async function collect<T>(folder: Folder, pattern: RegExp, decode: (name: string, raw: string) => T) {
    const records: T[] = []
    for (const file of await workspace.list(folder)) {
      if (file.startsWith('.') || !pattern.test(file)) continue
      const raw = await workspace.read(`${folder}/${file}`)
      if (raw === null) continue
      try { records.push(decode(file, raw)) }
      catch (error) {
        issues.push(`${folder}/${file} — ${error instanceof Error ? error.message : 'Invalid file'}`)
      }
    }
    return records
  }
  const [posts, feeds, suggestions] = await Promise.all([
    collect('posts', /\.md$/i, readPost),
    collect('feeds', /\.yaml$/i, readFeed),
    collect('suggestions', /\.yaml$/i, readSuggestion),
  ])
  for (const post of posts) for (const issue of post.issues) issues.push(`posts/${post.file} — ${issue}`)
  posts.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || a.file.localeCompare(b.file))
  feeds.sort((a, b) => a.name.localeCompare(b.name))
  const theme = data.theme === 'dark' || data.theme === 'light' ? data.theme : undefined
  return { name: data.name.trim(), theme, posts, feeds, suggestions, issues }
}
