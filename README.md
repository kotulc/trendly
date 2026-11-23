# Trendly

Trendly is a browser-first workspace for previewing a site's Git-managed posts and reading subscribed feeds. Open a local checkout or a public GitHub repository to load the host site's configuration, Markdown posts, drafts, and media. External editors and agents such as Herder edit the files. Trendly can commit publish and unpublish moves on a GitHub branch, where the repository's existing publishing workflow deploys the public site.

## Explore a repository

- **Browse the host site.** Use **Posts** and **Site feed** to work with the content from the open repository. Local and remote inputs produce the same in-memory view.
- **Preview the published feed.** A compact list shows each post's media type, title, source, and date. Open one post at a time to see its summary, metadata, full Markdown, and rich media across the column. Trendly's local preview can also show clearly marked drafts and reload after an editor or agent changes the files.
- **Read external feeds.** Browse combined or individual RSS, Atom, and JSON Feed subscriptions in **External feeds**. Use **Subscriptions** to manage them. Direct browser fetch is the default, with an optional proxy for feeds that block browser reads.
- **Manage feed configuration.** Save site feed options and subscriptions directly in Trendly, with optional YAML review.

## Repository and publishing

The host repository stores the site's posts and configuration. `mndsite.yaml` configures the published content directory, assets, and supported frontmatter settings. `feeds.yaml` stores the feed URLs Trendly subscribes to. Post frontmatter stores publisher and citation details for the post cards and filters.

mndsite can build a public site from the host repository and publish `rss.xml` when `rss.site_url` is set in `mndsite.yaml`. To read that site's published posts in **External feeds**, subscribe to the deployed `rss.xml` URL. Trendly and mndsite share the post card layout and can run independently. [mndsite](https://github.com/kotulc/mndsite)

Use the **Site feed** switches to preview publication states in Trendly, then select **Save changes** whenever you want to keep those changes for posts in the content tree. mndsite builds with draft-list support omit content paths listed under `drafts` in `mndsite.yaml`. Files in `drafts/` can be published by moving them into the content tree. Keep draft-only media outside the published asset directories. The [user guide](user_guide.md) covers writing changes and deployment.

## Run locally

Use Node.js 22.12 or later, install dependencies with `npm ci`, and start with `npm run dev`. On Windows PowerShell, use `npm.cmd` in place of `npm` if needed. The app opens the bundled [example repository](example-workspace). Select its title, **Field Notes**, in the sidebar to open **Repository settings** and choose a local checkout or GitHub repository.

Keep **Open folder** pointed at the same checkout your editor or agent uses. When the browser grants a directory handle, Trendly checks for changes about every two seconds while the tab is visible and refreshes when you return to it. Saved working-tree edits appear without a Git commit. Firefox's folder import is a read-only snapshot. Select **Reopen folder** after editing files.

The static build is available with `npm run build`. See the [user guide](user_guide.md) for remote browsing and GitHub writes, and the [implementation plan](implementation_plan.md) for the architecture and remaining work.

## Run indexed search

Run `npm run dev:full` to start Vite and the API together. Search in **Posts** or **External feeds** with the example repository loaded. Ranked results show a matching excerpt and expand in the usual cards. The index watches the example workspace for changes to published posts and indexes the Planet Money subscription. Browser search continues to cover drafts, other subscriptions, and repositories opened through the folder or GitHub picker.

For a hosted setup, run `npm run build`, serve `dist/`, and route `/api` on the same origin to `npm run start:api`. For an app hosted under a base path, route its `api/` subpath to the same API paths. The API listens on `127.0.0.1:8787` by default. Set `PORT` or `TRENDLY_API_HOST` for the deployment. Put `TRENDLY_INDEX_DB` on persistent storage, or keep the default `.trendly/search.sqlite`.

The API indexes one operator-selected workspace and one approved feed. Set `TRENDLY_INDEX_ROOT` to index a different checkout for API use. Set `TRENDLY_INDEX_FEED` to an exact URL present in that checkout's `feeds.yaml` to change the indexed subscription. The browser integration currently uses the example workspace. `GET /api/search` takes `q`, `scope` (`posts` or `feeds`), and optional `tag`, `media`, `from`, and `to` filters. Test the API with `npm run test:server`.

## External subscriptions

In `feeds.yaml`, list subscription names and URLs under `feeds`. If some sources block browser reads, set a **Feed proxy URL** in **Subscription settings**. The saved `proxy_url` should point to a trusted service that accepts the feed URL as a `url` query parameter. Trendly tries the original feed first.

When running `npm run dev`, Trendly can read NPR podcast feeds such as Planet Money through a same-origin development route. Keep the original NPR URL in `feeds.yaml`. A deployed static build uses the configured HTTPS `proxy_url` for blocked feeds. The endpoint should fetch only approved feed URLs server-side, return the feed XML, and allow requests from the deployed Trendly origin.

**Subscriptions** lists configured subscriptions, recognized feeds from post citations, and the host site's RSS URL when configured. Trendly detects RSS, Atom, and JSON Feed from the fetched content. The server's `/api/feed?url=...` can serve as a same-origin proxy for the approved subscription using the indexer's fetch cache. [Implementation plan](implementation_plan.md#5-refine-subscriptions-and-expand-feed-format-support)

## Post cards

Use `description` for the card excerpt and `site` for a publication label. The first source determines the media icon from its type or URL. Status, categories, and tags appear as chips. Add other fields under `frontmatter.facets` in `mndsite.yaml`. Trendly also uses the configured tags and status for the Posts filters.

In Markdown, use standard image syntax and give a YouTube, Vimeo, or direct audio or video link the title `"embed"` to show a player when the card expands. Source metadata also accepts `audio_url` and `video_url` for direct media files. Set `placement: inline` on the corresponding source entry when the body already contains the player.

Expanded feed cards show images and native audio and video from feed content, including RSS and Atom enclosures and JSON Feed attachments. They also recognize YouTube and Vimeo embeds. The feed must supply a media file, an image URL, or a supported embed. For feeds that publish excerpts, use **Open full post** to see media that appears only on the publisher's page.

The portable feed component, metadata helper, and stylesheet come from mndsite and are vendored in `src/feed/` so either project can build independently. Keep those files in sync when changing the shared cards.
