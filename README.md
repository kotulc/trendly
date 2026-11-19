# Trendly

Trendly is a browser-based workspace for writing about articles, podcasts, and videos and publishing to a site you own. Bring a Markdown draft from any chat service or write one in Trendly. Review it alongside the original source, then publish to GitHub Pages. Your published posts remain editable Markdown in your GitHub repository.

## From source to published post

1. **Start a draft.** Paste Markdown, drop a `.md` file, or start writing. An optional **Copy writing prompt** action gives you a prompt for the chat service you already use. It asks what stood out, what evidence supports your takeaway, and what questions remain before formatting your draft. Trendly can accept the resulting Markdown without connecting to the chat service.
2. **Review in one place.** The editor displays the draft, its rendered preview, and a card for each source. Edit the title, tags, or source details directly in the interface. If the frontmatter needs attention, Trendly preserves the draft and points to the fields that need fixing. The editor and preview sit side by side on desktop and switch by tab on smaller screens.
3. **Connect GitHub when ready.** Signing in is part of first publish. Trendly guides you through creating a personal publishing repository or connecting an existing Trendly repository, authorizing access to that repository, and enabling GitHub Pages. Setup happens in the browser. GitHub may open a consent or repository selection screen. You return to the same draft when setup finishes.
4. **Publish.** After setup, one action commits the reviewed post and starts deployment. The UI shows whether the post is deploying, live, or needs attention, with a link to the site when it is live. Opening a published post to edit it brings you back to the same editor and keeps its public URL stable.

## Workspace

- **Posts** lists drafts and published posts, with their source, last edited date, and publishing status. Drafts are stored in the current browser and can be exported as Markdown. Published posts can be reopened from the connected repository.
- **Sources** collects the articles, episodes, and videos referenced in your posts. Repeat references to the same source link back to one entry, so you can see everything you have written about it.
- **Feeds** lets you follow a publication or podcast from a recognized feed URL in an imported post, or add a feed URL yourself. Trendly suggests the subscription for review. You can see recent entries, refresh, or unfollow. An entry can open a new draft with the source already attached.

You can try the workspace before connecting GitHub.

## Source cards and media

The same source data drives cards in the draft preview and on the published site. Every card links to the original and can show the title, publisher or show, thumbnail, and date when available. A source URL is enough to produce a card, so metadata lookup never blocks review or publishing.

| Source | Card behavior |
| --- | --- |
| Article | Show headline, publisher, and an optional image and description. Open the original article from the card. |
| YouTube | Show a preview with a click-to-play player. Keep a direct video link available. |
| Podcast | Show episode and show details. Offer audio playback when the episode's verified RSS feed supplies an audio enclosure, and link to the episode page. |
| Other link | Show the supplied title or the link's hostname and a link to the original. |

The renderer builds supported players from recognized source URLs or verified feed entries. Imported Markdown supports text, images, and links through a safe renderer. Any supplied HTML or iframe code is treated as untrusted input.

## Markdown format

The first format uses standard Markdown with versioned YAML frontmatter. The editor can fill in or correct these fields, so people can work in the UI or use the format directly.

```markdown
---
version: 1
title: What makes a local news story worth following?
tags: [local-news, journalism]
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

`title` and each source's `url` are required. `kind`, `publisher`, source title, `tags`, and `feed_url` are optional. Source URLs identify individual items. Feed URLs identify subscriptions. Trendly assigns a stable post ID and publication timestamps, and keeps the original publication date across edits.

## First release

Build the responsive editor, source cards, a basic feed view, and the GitHub publishing flow. A hosted backend handles GitHub authorization, repository operations, and public metadata and feed fetches. The first-time setup should be tested with a fresh personal GitHub account. The publishing check is to import and preview a post, approve access to one repository, publish it, and then publish an edit at the same URL. It should also be possible to retry a failed deployment from the workspace.

The first release targets a personal GitHub account with a public publishing repository. Explain during setup that publishing makes the committed Markdown and rendered site public. [GitHub Pages setup](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) · [GitHub Pages API permissions](https://docs.github.com/en/rest/pages/pages#create-a-github-pages-site)

Evaluate [mndsite](https://github.com/kotulc/mndsite) as the static renderer with a proof of concept for matching source cards in preview and on the published site. Generate the author's outbound RSS feed from published post metadata in the deployment workflow.

Automatic source discovery, shared search and cross-site links, native apps, MCP, and social syndication can follow once the authoring and publishing workflow is established.
