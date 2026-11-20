# Trendly

Trendly is a browser-first, read-only explorer for Git-managed Markdown, media, and feeds. Open a local checkout or a public GitHub repository, browse posts and sources, and search or filter the results. External editors and agents such as Herder manage the files. Git records revisions, and the repository's publishing workflow deploys the public site.

## Explore a repository

- **Browse a repository.** Use a simple Pages CMS–style sidebar and list for posts, sources, and subscribed feeds. Local and remote inputs produce the same in-memory view.
- **Preview the published feed.** A compact list shows each post's title, date, and summary. Select a post to expand its full Markdown and rich-media cards inline. Trendly's local preview can also show clearly marked drafts and reload after an editor or agent changes the files.
- **Read external feeds.** Load RSS and Atom from repository-defined subscriptions. Show each feed's status and merge the available entries into the browsing experience. Direct browser fetch is the default, with an optional proxy for feeds that block browser reads.

## Repository and publishing

The repository owns the source files and configuration. Read `mndsite.yaml` for the published content directory, assets, and supported frontmatter settings. Keep external subscription URLs in a separate, small `feeds.yaml`. Use the same post files and source metadata for the explorer and the published site.

[mndsite](https://github.com/kotulc/mndsite) remains a standalone static-site builder. Extend it where useful with a general-purpose expandable Markdown feed that any mndsite site can opt into. Reuse the portable feed view in Trendly so the rows and expanded posts match the published site. mndsite owns its configuration and deployment workflow. Trendly owns repository browsing, runtime RSS, and draft preview. Each application can be used independently.

For the initial draft workflow, keep drafts and their draft-only media outside mndsite's published inputs. An author or agent promotes a reviewed post into the published content tree. Local preview reads the working files. Public preview and publishing use the selected Git revision.

## Run locally

Use Node.js 22.12 or later, install dependencies with `npm ci`, and start with `npm run dev`. On Windows PowerShell, use `npm.cmd` in place of `npm` if needed. The app opens the bundled [example repository](example-workspace). Use **Open folder** to choose it on disk or to open your own checkout.

The static build is available with `npm run build`. Chrome and Edge can reread an open folder. Firefox imports a read-only snapshot, so reselect the directory after editing files. See the [user guide](user_guide.md) for the walkthrough and the [implementation plan](implementation_plan.md) for the architecture and remaining work.

## External subscriptions

In `feeds.yaml`, list subscription names and URLs under `feeds`. If some sources block browser reads, set an optional `proxy_url` pointing to a trusted service that accepts the feed URL as a `url` query parameter. Trendly tries the original feed first.

The portable feed view and stylesheet come from mndsite and are vendored in `src/feed/` so either project can build independently. Keep those two files in sync when changing their markup or styling.
