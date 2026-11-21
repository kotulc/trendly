import { useEffect, useRef, useState, type FormEvent } from 'react'
import { feedSettings, updateFeedSettings } from './config'
import type { Commit, ConfigChange, ConfigFile, Repository } from './repository'

function diff(before: string | undefined, after: string) {
  const previous = before?.trimEnd().split(/\r?\n/) ?? []
  const current = after.trimEnd().split(/\r?\n/)
  let start = 0
  while (start < previous.length && previous[start] === current[start]) start++
  let end = 0
  while (end < Math.min(previous.length, current.length) - start &&
    previous[previous.length - 1 - end] === current[current.length - 1 - end]) end++
  return [
    ...previous.slice(Math.max(0, start - 2), start).map(line => [' ', line]),
    ...previous.slice(start, previous.length - end).map(line => ['-', line]),
    ...current.slice(start, current.length - end).map(line => ['+', line]),
    ...current.slice(current.length - end, current.length - end + 2).map(line => [' ', line]),
  ]
}

export function ConfigDialog({ path, before, repo, preview, subscriptionChange, onClose, onWrite }: {
  path: ConfigFile
  before?: string
  repo: Repository
  preview?: ConfigChange
  subscriptionChange?: () => ConfigChange
  onClose: () => void
  onWrite: (commit?: Commit) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const sourceSettings = path === 'feeds.yaml'
  const [settings, setSettings] = useState(() => feedSettings(sourceSettings || preview ? undefined : before))
  const [change, setChange] = useState(preview)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const canWrite = !!(repo.publication || repo.writeConfig)

  useEffect(() => { dialog.current?.showModal() }, [])

  function stage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    try {
      if (sourceSettings) {
        if (subscriptionChange) setChange(subscriptionChange())
        return
      }
      if (JSON.stringify(settings) === JSON.stringify(feedSettings(before))) throw new Error('Make a change before reviewing the YAML.')
      const after = updateFeedSettings(before, settings)
      if (after === before) throw new Error('Make a change before reviewing the YAML.')
      setChange({ path, before, after })
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to update this YAML.') }
  }

  async function write(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!change || saving) return
    const form = new FormData(event.currentTarget)
    setSaving(true)
    setError('')
    try {
      if (repo.publication) {
        const token = String(form.get('token') || '').trim()
        if (!token) throw new Error('Enter a GitHub token with repository write access.')
        onWrite(await repo.publication.writeConfig(change, token))
      } else if (repo.writeConfig) {
        await repo.writeConfig(change)
        onWrite()
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to write the YAML. Refresh before retrying.')
    } finally { setSaving(false) }
  }

  function download() {
    if (!change) return
    const url = URL.createObjectURL(new Blob([change.after], { type: 'text/yaml;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = change.path
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  return <dialog ref={dialog} className="publication-dialog config-dialog" aria-labelledby="config-title" onCancel={event => {
    event.preventDefault()
    if (!saving) onClose()
  }}>
    {change ? <form key="review" onSubmit={write}>
      <h2 id="config-title">Review {path}</h2>
      <p>{repo.publication
        ? `Write these changes to ${repo.label} on ${repo.publication.branch}.`
        : repo.writeConfig ? `Write these changes to ${repo.label}.`
        : 'Download the edited YAML and place it at the root of your checkout.'}</p>
      <pre className="yaml-diff" aria-label="YAML changes">{diff(change.before, change.after).map(([sign, line], index) =>
        <span key={index} data-sign={sign}>{sign} {line}</span>)}</pre>
      {repo.publication && <label>GitHub personal access token<input type="password" name="token" autoComplete="off" disabled={saving} required /></label>}
      {error && <p role="alert">{error}</p>}
      <div className="publication-buttons">
        <button className="button" type="button" disabled={saving} onClick={() => {
          if (preview) { onClose(); return }
          setChange(undefined)
          setError('')
        }}>{preview ? 'Cancel' : sourceSettings ? 'Back to settings' : 'Back to editing'}</button>
        {canWrite ? <button className="button primary" type="submit" disabled={saving}>
          {saving ? 'Writing…' : 'Write to repository'}
        </button> : <button className="button primary" type="button" onClick={download}>Download YAML</button>}
      </div>
    </form> : sourceSettings ? <form key="sources" onSubmit={stage}>
      <h2 id="config-title">Source settings</h2>
      {before === undefined ? <p>This workspace has no feeds.yaml file yet.</p>
        : before.trim() ? <pre className="yaml-diff" aria-label="Saved feeds.yaml" tabIndex={0}>{before}</pre>
          : <p>The saved feeds.yaml file is empty.</p>}
      {error && <p role="alert">{error}</p>}
      <div className="publication-buttons">
        <button className="button" type="button" onClick={onClose}>Close</button>
        {subscriptionChange && <button className="button primary" type="submit">Review YAML</button>}
      </div>
    </form> : <form key="edit" onSubmit={stage}>
      <h2 id="config-title">Feed settings</h2>
      <p>Edit the site feed settings in mndsite.yaml.</p>
      <label>Feed section<input value={settings.section} placeholder="posts" onChange={event => setSettings({ ...settings, section: event.target.value })} /></label>
      <label className="config-checkbox"><input type="checkbox" checked={settings.expandable} onChange={event => setSettings({ ...settings, expandable: event.target.checked })} /> Expandable feed</label>
      <label>Published site URL<input value={settings.siteUrl} placeholder="https://example.com" onChange={event => setSettings({ ...settings, siteUrl: event.target.value })} /></label>
      {error && <p role="alert">{error}</p>}
      <div className="publication-buttons">
        <button className="button" type="button" onClick={onClose}>Cancel</button>
        <button className="button primary" type="submit">Review YAML</button>
      </div>
    </form>}
  </dialog>
}
