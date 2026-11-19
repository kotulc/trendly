# Trendly

Trendly is a browser-first workspace for writing about articles, podcasts, and videos and publishing to a site you own. Feeds appear as channels, posts appear as cards, and the editor renders an early Markdown draft as you write. Your drafts, feed definitions, suggestions, and media are ordinary files in a folder you control. An external agent can work with those same files.

## Try the first version

See the [user guide](USER_GUIDE.md) for a walkthrough of the app.

Use Node.js 22.12 or later and desktop Chrome or Edge.

```sh
npm ci
npm run dev
```

On Windows PowerShell, use `npm.cmd` if the PowerShell npm shim is blocked. Follow Vite's localhost URL. `npm run build` type-checks the app and produces the static bundle in `dist/`.

The app opens in an interactive example workspace. Changes there last until reload. To work on disk, select **Open workspace** and choose an empty folder or a folder containing `workspace.yaml`. You can copy [example-workspace](example-workspace) to a writable location to start with posts and feeds.

- **Read and write.** Choose a channel and a post, then use **Split** to edit and preview together. **Save draft** writes the Markdown file. YouTube URLs get click-to-play cards. Podcasts with an `audio_url` get an audio player. Other sources link back to the original and can display supplied metadata. Markdown can reference local images under `assets/`. Playback and remote images contact their original hosts.
- **Collaborate with an agent.** Give the agent the workspace folder and [file format](#workspace-file-format). Ask it to create a post or suggest a feed. Changes appear on refresh, when the window regains focus, or during the three-second polling interval while the tab is visible.
- **Review external edits.** Trendly reloads a changed draft when the editor is clean. If you have unsaved edits, it offers to load the disk version or save your edits as a separate draft. Save checks the file again for changes. Avoid editing the same file at the same instant in both tools until cross-process coordination is in place.
- **Review suggested feeds.** In **Feed suggestions**, follow to save a local feed definition or dismiss the recommendation. Feed channels show posts assigned to them through frontmatter.

The first version runs locally with a static frontend and uses file-backed storage. Git publishing, deployment status, and live RSS ingestion are planned in the [implementation plan](IMPLEMENTATION_PLAN.md).

## Workspace file format

```text
workspace.yaml
posts/<post-id>.md
feeds/<feed-id>.yaml
suggestions/<suggestion-id>.yaml
assets/<filename>
```

`workspace.yaml` contains `version: 1`, a `name`, and an optional `theme` of `light` or `dark`. See the [example workspace](example-workspace) for complete files. IDs use lowercase letters, digits, and hyphens, match their filename stem, and stay the same when a title changes. Use UTF-8 and a UUID if you need to generate a new ID. An agent should check for a current revision before editing, write via an atomic replacement where possible, and restrict its work to the selected workspace.

```markdown
---
version: 1
id: local-news
title: What makes a local news story worth following?
feeds: [civic-life]
tags: [local-news, journalism]
updated_at: 2026-11-18
sources:
  - url: https://example.org/podcasts/local-news/episode-12
    kind: podcast
    title: Who covers city hall?
    publisher: Civic Desk
    feed_url: https://example.org/podcasts/local-news/feed.xml
---

The episode made me wonder how often city hall coverage follows an issue
past the first public hearing.
```

The post body is standard Markdown. `version` and `id` should be supplied by producers, and the reader accepts plain Markdown and uses its filename and first heading as fallbacks. `feeds` contains local feed IDs. `updated_at` is an optional ISO date or timestamp used for ordering. Each source needs an HTTP or HTTPS `url`. The remaining source fields are optional. The renderer recognizes YouTube links and supports `kind: article`, `kind: podcast`, descriptions, image links, and direct audio links. Separate individual source URLs from subscription URLs.

A feed YAML file has `id`, `name`, and optional `description` and `url`. A suggestion uses the same fields and requires a `url`. A dismissed suggestion has `status: dismissed`. Following creates a feed and hides the matching suggestion. An agent can use a feed URL from post frontmatter to propose a separate suggestion file.

## Publishing direction

Trendly will publish reviewed snapshots to a separate Git checkout. A small optional local helper can use the machine's existing Git credentials and handle commits and pushes behind the UI. [mndsite](https://github.com/kotulc/mndsite) remains the static site builder. The workspace stays on disk, and a publish operation selects the reviewed post and its referenced assets explicitly. Published Markdown remains portable, with history in the user's Git repository.
