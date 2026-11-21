# Trendly

Trendly is a browser-first explorer for Git-managed Markdown, media, and feeds. Open a local checkout or a public GitHub repository, browse posts and sources, and search or filter the results. External editors and agents such as Herder edit the files. Trendly can commit publish and unpublish moves on a GitHub branch, where the repository's existing publishing workflow deploys the public site.

## Explore a repository

- **Browse a repository.** Use a simple Pages CMS–style sidebar and list for posts, sources, and subscribed feeds. Local and remote inputs produce the same in-memory view.
- **Preview the published feed.** A compact list shows each post's media type, title, source, and date. Open one post at a time to see its summary, metadata, full Markdown, and rich media across the column. Trendly's local preview can also show clearly marked drafts and reload after an editor or agent changes the files.
- **Read external feeds.** Browse combined or individual RSS and Atom subscriptions. To include your site's posts, subscribe to its published RSS feed. Direct browser fetch is the default, with an optional proxy for feeds that block browser reads.
- **Manage feed configuration.** Edit site feed options in `mndsite.yaml` and subscriptions in `feeds.yaml`. Review the staged YAML changes before writing to the checkout or committing to GitHub.

## Repository and publishing

The repository owns the source files and configuration. Read `mndsite.yaml` for the published content directory, assets, and supported frontmatter settings. Keep external subscription URLs in a separate, small `feeds.yaml`. Use the same post files and source metadata for the explorer and the published site.

[mndsite](https://github.com/kotulc/mndsite) remains a standalone static-site builder. Extend it where useful with a general-purpose expandable Markdown feed that any mndsite site can opt into. Reuse the portable feed view in Trendly so the rows and expanded posts match the published site. mndsite owns its configuration and deployment workflow. Trendly owns repository browsing, runtime RSS, and draft preview. Each application can be used independently.

Keep drafts and their draft-only media outside mndsite's published inputs. Open a GitHub branch to use **Publish** or **Unpublish** from Posts. The action commits the Markdown move between `drafts/` and the published content tree. The [user guide](user_guide.md) covers authentication, destination paths, and deployment.

## Run locally

Use Node.js 22.12 or later, install dependencies with `npm ci`, and start with `npm run dev`. On Windows PowerShell, use `npm.cmd` in place of `npm` if needed. The app opens the bundled [example repository](example-workspace). Use **Open folder** to choose it on disk or to open your own checkout.

The static build is available with `npm run build`. Chrome and Edge can reread an open folder. Firefox imports a read-only snapshot, so reselect the directory after editing files. See the [user guide](user_guide.md) for the walkthrough and the [implementation plan](implementation_plan.md) for the architecture and remaining work.

## External subscriptions

In `feeds.yaml`, list subscription names and URLs under `feeds`. If some sources block browser reads, set an optional `proxy_url` pointing to a trusted service that accepts the feed URL as a `url` query parameter. Trendly tries the original feed first.

## Post cards

Use `description` for the card excerpt and `site` for a publication label. The first source determines the media icon from its type or URL. Status, categories, and tags appear as chips. Add other fields under `frontmatter.facets` in `mndsite.yaml`. Trendly also uses the configured tags and status for the Posts filters.

Inside the Markdown body, give a YouTube or direct audio link the title `"embed"` to show a click-to-load player. The original link remains available. Set `placement: inline` on the corresponding source entry to show the player only in the body.

The portable feed component, metadata helper, and stylesheet come from mndsite and are vendored in `src/feed/` so either project can build independently. Keep those files in sync when changing the shared cards.
