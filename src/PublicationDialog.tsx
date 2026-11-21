import { useState, type FormEvent } from 'react'
import type { FeedEntry } from './feed/Feed'
import { ModalDialog } from './ModalDialog'
import { publicationPath, type Repository, type Snapshot } from './repository'

type Publication = NonNullable<Repository['publication']>
export type PublicationCommit = Awaited<ReturnType<Publication['move']>>

export function PublicationDialog({ entry, publication, repository, snapshot, initialDestination, onClose, onCommit }: {
  entry: FeedEntry
  publication: Publication
  repository: string
  snapshot: Snapshot
  initialDestination: string
  onClose: () => void
  onCommit: (commit: PublicationCommit) => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const action = entry.draft ? 'Publish' : 'Unpublish'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const form = new FormData(event.currentTarget)
    setSaving(true)
    setError('')
    try {
      const destination = publicationPath(snapshot, entry, String(form.get('destination')))
      const token = String(form.get('token')).trim()
      if (!token) throw new Error('Enter a GitHub token with repository write access.')
      const commit = await publication.move(entry.path, destination, `${action} ${entry.path.split('/').at(-1)}`, token)
      onCommit(commit)
    } catch (failure) {
      setError(failure instanceof TypeError || failure instanceof DOMException
        ? 'Could not confirm the change with GitHub. Refresh the branch before retrying.'
        : failure instanceof Error ? failure.message : 'Unable to commit the change.')
    } finally { setSaving(false) }
  }

  return <ModalDialog className="publication-dialog" labelledBy="publication-title" saving={saving} onClose={onClose}>
    <form onSubmit={submit}>
      <h2 id="publication-title">{action} post</h2>
      <p><strong>{entry.title}</strong> in {repository} on <code>{publication.branch}</code></p>
      <p>This commits a Markdown file move. GitHub runs any deployment workflow configured for this push.</p>
      {!entry.draft && <p>The draft will still be visible in this public repository.</p>}
      {entry.draft && !entry.date && <p>Add a date in the Markdown to include this post in the site feed.</p>}
      <p>Current path <code>{entry.path}</code></p>
      <label>Destination<input name="destination" defaultValue={initialDestination} disabled={saving} required /></label>
      <label>GitHub personal access token<input type="password" name="token" autoComplete="off" disabled={saving} required /></label>
      {error && <p role="alert">{error}</p>}
      <div className="publication-buttons">
        <button className="button" type="button" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="button primary" type="submit" disabled={saving}>{saving ? 'Committing…' : `${action} on GitHub`}</button>
      </div>
    </form>
  </ModalDialog>
}
