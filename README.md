# Trendly

Trendly is becoming a browser-first, read-only explorer for Git-managed Markdown, media, and feeds. Open a local checkout or a remote repository, browse posts and sources, and search or filter the results. External editors and agents such as Herder manage the files. Git records revisions, and the repository's publishing workflow deploys the public site.

## Planned experience

- **Browse a repository.** Use a simple Pages CMS–style sidebar and list for posts, sources, and subscribed feeds. Local and remote inputs produce the same in-memory view.
- **Preview the published feed.** A compact list shows each post's title, date, and summary. Select a post to expand its full Markdown and rich-media cards inline. Trendly's local preview can also show clearly marked drafts and reload after an editor or agent changes the files.
- **Read external feeds.** Load RSS and Atom from repository-defined subscriptions. Show each feed's status and merge the available entries into the browsing experience. Direct browser fetch is the default, with an optional proxy for feeds that block browser reads.

## Repository and publishing

The repository owns the source files and configuration. Read `mndsite.yaml` for the published content directory, assets, and supported frontmatter settings. Keep external subscription URLs in a separate, small `feeds.yaml`. Use the same post files and source metadata for the explorer and the published site.

[mndsite](https://github.com/kotulc/mndsite) remains a standalone static-site builder. Extend it where useful with a general-purpose expandable Markdown feed that any mndsite site can opt into. Reuse the portable feed view in Trendly so the rows and expanded posts match the published site. mndsite owns its configuration and deployment workflow. Trendly owns repository browsing, runtime RSS, and draft preview. Each application can be used independently.

For the initial draft workflow, keep drafts and their draft-only media outside mndsite's published inputs. An author or agent promotes a reviewed post into the published content tree. Local preview reads the working files. Public preview and publishing use the selected Git revision.

## Current prototype

The current checkout still contains the earlier local authoring prototype. Use Node.js 22.12 or later, install dependencies with `npm ci`, and start it with `npm run dev`. On Windows PowerShell, `npm.cmd` can be used in place of `npm`.

See the [user guide](user_guide.md) for the current app and the [implementation plan](implementation_plan.md) for the repository-driven explorer and mndsite work.
