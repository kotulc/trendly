import { useEffect, useState, type FormEvent } from 'react'
import { diffLines } from 'diff'
import type { FeedSettings } from './config'
import { ModalDialog } from './ModalDialog'
import type { Commit, ConfigChange, ConfigFile, Repository } from './repository'

export type PendingConfigChange = {
  change: ConfigChange
  action: 'Publish post' | 'Save changes'
  postTitle?: string
  successMessage?: string
}

type SettingsEditor =
  | { kind: 'feed'; value: FeedSettings; onChange: (value: FeedSettings) => void }
  | { kind: 'source'; value: string; onChange: (value: string) => void }

function inlineDiff(before: string | undefined, after: string) {
  return diffLines(before ?? '', after, { stripTrailingCr: true, ignoreNewlineAtEof: true }).flatMap(part => {
    const sign = part.added ? '+' : part.removed ? '-' : ' '
    const lines = part.value.split('\n')
    if (part.value.endsWith('\n')) lines.pop()
    return lines.map(line => ({ sign, line }))
  })
}

export function ConfigDialog({ path, before, repo, pending, editor, prepareChange, onDiscard, onClose, onWrite }: {
  path: ConfigFile
  before?: string
  repo: Repository
  pending?: PendingConfigChange
  editor?: SettingsEditor
  prepareChange?: () => ConfigChange
  onDiscard: () => void
  onClose: () => void
  onWrite: (commit?: Commit) => void
}) {
  const sourceSettings = path === 'feeds.yaml'
  const [configOpen, setConfigOpen] = useState(true)
  const [exportChange, setExportChange] = useState<ConfigChange>()
  const [exportFile, setExportFile] = useState<{ change: ConfigChange; url: string }>()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const canWrite = !!(repo.publication || repo.writeConfig)
  const fileChange = !canWrite ? pending?.change ?? exportChange : undefined
  const editing = !pending && !fileChange ? editor : undefined
  const canSave = !!pending || !!prepareChange
  const canDiscard = canSave && !pending?.postTitle

  useEffect(() => {
    if (!fileChange) return
    const url = URL.createObjectURL(new Blob([fileChange.after], { type: 'text/yaml;charset=utf-8' }))
    setExportFile({ change: fileChange, url })
    // Give the browser time to open the download after the dialog closes.
    return () => { window.setTimeout(() => URL.revokeObjectURL(url), 2000) }
  }, [fileChange])

  function getChange() {
    if (pending) return pending.change
    if (prepareChange) return prepareChange()
    throw new Error('Make a change before saving.')
  }

  let configChange: ConfigChange | undefined
  let configError = ''
  if (configOpen && canSave) {
    try {
      configChange = fileChange ?? getChange()
    } catch (failure) { configError = failure instanceof Error ? failure.message : 'Unable to preview these settings.' }
  }

  async function write(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || !canSave || fileChange) return
    const form = new FormData(event.currentTarget)
    setSaving(true)
    setError('')
    try {
      const update = getChange()
      if (repo.publication) {
        const token = String(form.get('token') || '').trim()
        if (!token) throw new Error('Enter a GitHub token with repository write access.')
        onWrite(await repo.publication.writeConfig(update, token))
      } else if (repo.writeConfig) {
        await repo.writeConfig(update)
        onWrite()
      } else {
        setExportChange(update)
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to save the changes. Refresh before retrying.')
    } finally { setSaving(false) }
  }

  return <ModalDialog className="publication-dialog config-dialog" labelledBy="config-title" saving={saving} onClose={onClose}>
    <form onSubmit={write}>
      <h2 id="config-title">{pending?.postTitle ? pending.action : sourceSettings ? 'Subscription settings' : 'Feed settings'}</h2>
      {pending?.postTitle && <p><strong>{pending.postTitle}</strong></p>}
      {repo.publication && canSave && <p>Save to <strong>{repo.label}</strong> on <code>{repo.publication.branch}</code>.</p>}
      {fileChange && <p>To save to your checkout, right-click <strong>Save changes</strong> and choose <strong>Save Link As</strong>. Replace <code>{path}</code> at the repository root, then reopen the folder.</p>}
      {editing?.kind === 'source' && <>
        <label>Feed proxy URL<input value={editing.value} inputMode="url" placeholder="https://example.com/rss-proxy"
          disabled={saving} aria-describedby="source-proxy-help" onChange={event => {
            editing.onChange(event.target.value)
            setError('')
          }} /></label>
        <p id="source-proxy-help">Used when a feed blocks direct browser requests. Leave blank to clear the proxy.</p>
      </>}
      {editing?.kind === 'feed' && <>
        <label>Feed section<input value={editing.value.section} placeholder="posts" disabled={saving} onChange={event => editing.onChange({ ...editing.value, section: event.target.value })} /></label>
        <label className="config-checkbox"><input type="checkbox" checked={editing.value.expandable} disabled={saving} onChange={event => editing.onChange({ ...editing.value, expandable: event.target.checked })} /> Expandable feed</label>
        <label>Published site URL<input value={editing.value.siteUrl} placeholder="https://example.com" disabled={saving} onChange={event => editing.onChange({ ...editing.value, siteUrl: event.target.value })} /></label>
      </>}
      {!pending?.postTitle && <details className="config-preview" open={configOpen} onToggle={event => setConfigOpen(event.currentTarget.open)}>
        <summary><code>{path}</code></summary>
        {configOpen && (configError ? <p>{configError}</p> : configChange
          ? <pre className="yaml-diff" aria-label="YAML changes" tabIndex={0}>{inlineDiff(configChange.before, configChange.after).map(({ sign, line }, index) =>
              <span key={index} data-sign={sign}>{sign} {line}</span>)}</pre>
          : before?.trim() ? <pre className="yaml-diff" aria-label="Saved settings YAML" tabIndex={0}>{before}</pre>
            : <p>No saved config.</p>)}
      </details>}
      {repo.publication && canSave && <label>GitHub personal access token<input type="password" name="token" autoComplete="off" disabled={saving} required /></label>}
      {error && <p role="alert">{error}</p>}
      <div className="publication-buttons">
        <button className="button" type="button" disabled={saving} onClick={canDiscard ? onDiscard : onClose}>
          {canDiscard ? 'Discard changes' : pending?.postTitle ? 'Cancel' : 'Close'}
        </button>
        {fileChange ? exportFile?.change === fileChange && <a className="button primary" href={exportFile.url} download={path}
          onClick={() => window.setTimeout(onClose, 0)}>Save changes</a>
          : canSave && <button className="button primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : pending?.action ?? 'Save changes'}
          </button>}
      </div>
    </form>
  </ModalDialog>
}
