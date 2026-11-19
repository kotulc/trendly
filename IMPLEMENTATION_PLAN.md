# Trendly implementation plan

Trendly moves a personal observation from source to draft, review, and publication. The browser app owns the review experience. The folder on disk owns the working files. Git owns the publication history. Those boundaries let an author start writing immediately and let local agents contribute without taking on publishing permissions.

## 1. Local authoring and agent handoff

Implemented in the first browser app. React, TypeScript, and Vite provide a static UI. The storage interface supports a selected filesystem folder and the example workspace. The UI reads versioned Markdown and YAML, renders source cards and local images, shows feed channels, and preserves unsaved edits when an external change is detected. The app polls while visible and refreshes on focus or request.

The workspace text files are the interoperability interface. Give Herder or another agent the folder and the README schema. Have the agent create or edit a post, leave its ID intact, and put recommended subscriptions in `suggestions/`. Return to Trendly to review. A new feed can be added directly or approved from a suggestion.

**Exit check.** Open the example on disk, create a new draft in the browser, change it from an external agent, and see Trendly pick up the edit. Make concurrent edits and verify that the author can keep a separate copy and reload the agent's revision.

## 2. Harden the workspace and deepen the editor

- Formalize the v1 validation rules, add compatibility fixtures, and distinguish fields that are required to publish from fields an incomplete draft can omit. Preserve unknown frontmatter when editing named fields. Use stable IDs across file changes and display friendly names in the UI.
- Remember the last folder handle when supported and restore the workspace after permission is renewed. Add a workspace switcher and permission recovery. Keep the visible-tab scan as a baseline, test file observation before enabling it, and index file metadata for larger workspaces.
- Strengthen multi-writer behavior with revisions and a shared atomic-write protocol when the local helper is installed. Detect deletions, moves, and malformed intermediate writes. Add side-by-side conflict review and a merge option. Keep manual save until the conflict and recovery behavior is covered.
- Add local asset import, preview refresh on replaced files, and accessible media fallbacks. Add structured title, tags, feed assignment, and source fields alongside raw Markdown. Add post search and filters by source, feed, tag, and status.
- Improve small-screen navigation, keyboard editing, and theme preferences. Add a first-run walkthrough based on opening a folder and editing one post.

**Exit check.** Reopen a workspace, recover from a revoked permission, edit representative Markdown without losing frontmatter, and preserve both versions through simultaneous updates.

## 3. Git publication, history, and synchronization

- Define an explicit **Review and publish** action. Validate the post and freeze the exact Markdown and referenced assets the author reviewed. Show the destination, file list, and resulting URL before confirmation. Restrict export to paths inside the managed content tree and resolve attachments under `assets/`. Keep the workspace and managed publishing checkout in separate folder trees.
- Start with a small local Git adapter for GitHub. Let it provision or connect a publishing checkout and use the platform's native Git credential helper. The browser can keep authoring when the adapter is absent. For a low-friction path, explore a launcher that serves the built UI locally and exposes only named publishing operations on loopback. Evaluate browser Git once transport, credential handling, and repository access work cleanly in a static app.
- Publish only the selected snapshot. Verify that the checkout, branch, remote, staged paths, and base revision match expectations. Fetch before writing, catch non-fast-forward updates, and use the last published commit and stable post ID for comparisons. Preserve a pending commit on push failure and retry it idempotently. Keep synchronization of published changes separate from importing those changes into drafts.
- Integrate a pinned mndsite build through the content repository's workflow. Verify Markdown, local assets, base paths, and source cards using shared representative fixtures. Generate the author's RSS from successfully published posts with canonical post URLs and stable IDs. Add a rebuild and retry path.
- Expose **Ready**, **Uploading**, **Deploying**, **Live**, and actionable failures with the commit and site URL. Add published version history and review-before-restore. Design onboarding around GitHub consent and one destination choice, with repository creation or connection guided by the app.

**Exit check.** Publish and update a post at the same URL, verify the matching site preview and RSS item, and recover from an interrupted push or failed deploy. A checkout audit should show only approved content and referenced assets, even with unrelated files in the workspace.

## 4. Source library and feed reading

- Derive a source library from post frontmatter and normalize provider URLs while preserving original links. Associate sources with the posts that discuss them. Provide source capture from a URL or a selected feed item, then prefill a draft.
- Add feed validation, unread state, and optional RSS/Atom ingestion. Try direct browser fetch for feeds with compatible cross-origin policies. The local helper can retrieve the remaining feeds and cache entries in the workspace. Define refresh, error, and offline states. Support unsubscribe and OPML transfer if needed.
- Add metadata lookup and local caching for article descriptions, supported thumbnails, and verified podcast enclosures. Keep a usable card when enrichment fails. Align click-to-play behavior, safe Markdown rendering, and asset handling between the app and mndsite.

**Exit check.** Follow an agent recommendation, refresh its entries, start a draft from an item, and publish a post whose source card survives unavailable metadata.

## 5. Optional agent controls

- Add a workspace instruction file and a small request format for drafting, editing, or recommending feeds. Keep changes visible as Markdown or YAML with revisions the author can inspect. Store recommendations separately until approved.
- Test an optional Herder adapter with file-level scoping, lifecycle status, and cancellation. Keep standard folder access sufficient for other agents. Evaluate MCP after the workspace and publish interfaces stabilize. Start with read and draft-edit tools and leave final publishing to explicit author action.

**Exit check.** Start a writing session, answer the agent's questions, receive a proposed revision and feed recommendation, and review both in Trendly without copying text between windows.

## 6. Features after the core workflow

- Consider mobile packaging or an optional synchronization adapter once there is a portable way for users to access their local workspace across devices.
- Add opt-in discovery and cross-site links from public site manifests after the publish format stabilizes. Track updates and removals by stable IDs. Evaluate semantic indexing only after basic search and discovery prove useful.
- Add one-way social syndication after canonical URLs and publish status are reliable. Keep credentials and per-platform failures out of the draft workspace and expose an explicit send action.

These releases depend on a reliable source-to-publication flow, including recovery from conflicts, offline operation, and exportable content.
