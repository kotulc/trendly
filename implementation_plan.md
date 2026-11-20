# Trendly implementation plan

Build Trendly as a lightweight, read-only repository explorer with a Pages CMS–style interface. Keep Markdown, media, and YAML authoritative in the repository. Use an in-memory model for posts, sources, and external feeds. Editing happens in an external editor or agent, and publishing stays in the repository's existing Git and mndsite workflow.

## 1. Replace the authoring shell with a repository explorer

- Reuse the Pages CMS sidebar, header, list patterns, and styling where they can be adapted without its server runtime. Keep React, TypeScript, and Vite. Use a small shell with **Posts**, **Feeds**, and **Sources**. Bring forward Trendly's Markdown, YAML, and source-card code where useful.
- Retire the editor, mutation paths, conflict handling, suggestion writes, and Firefox write launcher as the reader takes over. Keep the prototype fixtures useful during the transition. Avoid adding an app database or a dependency on the Pages CMS authentication stack.
- Put local folder selection and remote GitHub access behind a single read interface that lists paths, opens text, and resolves media. Start with public GitHub repositories, resolving a branch or tag to a commit for consistent reads. Handle private content through local checkouts initially.
- Read `mndsite.yaml` for the content directory, asset conventions, and supported field mappings. Parse one root `feeds.yaml` for external subscriptions. Keep source metadata in Markdown frontmatter. Add repository, branch, or folder diagnostics where they help explain missing content.
- Normalize posts and sources in memory and provide basic search and filters. Start with a readable post list and detail view to establish the navigation before adding RSS and preview parity.

**Exit check.** Open the same fixture from a Firefox-selected local checkout and a public GitHub revision. Confirm that both show the same posts, source cards, paths, and search results.

## 2. Add a reusable expandable feed to mndsite

- Start from mndsite's existing listing cards, excerpt logic, and Markdown rendering. Add an opt-in feed view that can be used by any mndsite content repository. Collapsed rows show title, date, and summary. Expanding a row reveals the full post and its source cards, with a permanent post link for published entries.
- Use the configured frontmatter description as the summary when available and fall back to the generated excerpt. Keep sorting, asset resolution, and keyboard interaction consistent. Exercise site base paths and the existing article URLs.
- Separate feed rendering from repository loading and Next.js routing. Define a portable entry shape and a presentation component with styles that work in both mndsite and Trendly. Pass through resolved links and media. Keep Next.js routing and build-time data in mndsite's adapter, and keep repo selection and draft awareness in Trendly's adapter.
- Extend mndsite's existing standalone build and watch workflows as needed. Generate feed data from the site content tree, which already supplies the regular article pages. Keep the feature generic and usable without installing Trendly. Reuse mndsite's existing publishing workflow and pinned builder version in consumer repositories.

**Exit check.** Build a plain mndsite site with the optional feed and publish it independently. Expand posts with an image, video, or podcast source and verify their summaries, media, and permanent links.

## 3. Bring the same feed into Trendly's working preview

- Mount the shared feed view inside Trendly. Use working-tree files for local preview and the selected commit for remote browsing. Show which source or revision is open so the user can tell what they are reviewing.
- Add an explicit local draft location outside the published content and asset inputs. Show drafts in local preview with a visible label. Keep draft bodies and draft-only files out of the generated site and its feed data.
- Start with **Refresh** where a browser retains a directory handle. In Firefox, reselect the folder for an updated snapshot. For automatic refresh on file saves, extend mndsite's existing development watcher and dev preview to pick up post, feed configuration, and relevant asset changes. Keep that workflow optional and independent of the static browser app.
- Give Herder and other agents the repository layout and frontmatter conventions. An author or agent can create, edit, and promote posts through normal file operations and Git. Consider MCP only if a concrete workflow needs a notification beyond refresh or watch.

**Exit check.** Use one repository fixture containing published content and a draft. Compare the published post in both views. Edit the draft with an external tool, refresh or watch it update, then check the public build for the absence of the draft and its assets.

## 4. Add external feeds and source browsing

- Load RSS and Atom at runtime from `feeds.yaml`. Fetch directly in the browser where allowed. Support an optional operator-configured proxy for feeds that block browser reads. Keep working feeds and repository posts visible if one source fails.
- Give repository posts and external entries distinct labels and link behaviors in the mixed view. Build a source list from post frontmatter and associate recurring sources with the posts that discuss them.
- Start with in-memory results, refresh controls, and error states per feed. Add IndexedDB only if repeat loading or offline reading warrants it.

**Exit check.** Load one directly accessible feed and one feed blocked by CORS. Verify that repository views remain usable and that a configured proxy can retrieve the blocked feed.

## Later

Revisit authenticated remote repositories, richer feed filtering, offline caching, and automatic refresh after the read path and standalone publishing work well. Remote semantic indexing and social integrations remain deferred.
