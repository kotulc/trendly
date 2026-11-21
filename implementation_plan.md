# Trendly implementation plan

Build Trendly as a lightweight host-site workspace and feed reader with a Pages CMS–style interface. The open repository supplies the host site's Markdown posts, drafts, media, and YAML configuration. Editing happens in an external editor or agent. Trendly commits publication changes on a GitHub branch, and the repository's existing Git and mndsite workflow handles deployment.

The initial explorer, standalone mndsite feed and RSS export, and Trendly preview are implemented. The two apps build independently using matching copies of the portable feed view. Sections 5 and 6 cover additional feed formats, indexed search, and server-side feed fetching.

## 1. Replace the authoring shell with a repository explorer

- Reuse the Pages CMS sidebar, header, list patterns, and styling where they can be adapted without its server runtime. Keep React, TypeScript, and Vite. Use a small shell with **Posts**, **Feeds**, and **Sources**. Bring forward Trendly's Markdown, YAML, and source-card code where useful.
- Retire the editor, mutation paths, conflict handling, suggestion writes, and Firefox write launcher as the reader takes over. Keep the prototype fixtures useful during the transition. Avoid adding an app database or a dependency on the Pages CMS authentication stack.
- Put local folder selection and remote GitHub access behind a single read interface that lists paths, opens text, and resolves media. Start with public GitHub repositories, resolving a branch or tag to a commit for consistent reads. Handle private content through local checkouts initially.
- Read `mndsite.yaml` for the content directory, asset conventions, and supported field mappings. Parse one root `feeds.yaml` for external subscriptions. Keep publisher and citation metadata in Markdown frontmatter. Add repository, branch, or folder diagnostics where they help explain missing content.
- Normalize host posts and their metadata in memory and provide basic search and filters. Start with a readable post list and detail view to establish the navigation before adding RSS and preview parity.

**Exit check.** Open the same fixture from a Firefox-selected local checkout and a public GitHub revision. Confirm that both show the same posts, citation details, paths, and search results.

## 2. Add a reusable expandable feed to mndsite

- Start from mndsite's existing listing cards, excerpt logic, and Markdown rendering. Add an opt-in feed view that can be used by any mndsite content repository. Collapsed rows show a media-type icon, title, source, and date. Open one row at a time to see its summary and metadata above the full post and source cards, with a permanent post link for published entries.
- Use the configured frontmatter description as the summary when available and fall back to the generated excerpt. Keep sorting, asset resolution, and keyboard interaction consistent. Exercise site base paths and the existing article URLs.
- Separate feed rendering from repository loading and Next.js routing. Define a portable entry shape and a presentation component with styles that work in both mndsite and Trendly. Pass through resolved links and media. Keep Next.js routing and build-time data in mndsite's adapter, and keep repo selection and draft awareness in Trendly's adapter.
- Extend mndsite's existing standalone build and watch workflows as needed. Generate feed data from the site content tree, which already supplies the regular article pages. Keep the feature generic and usable without installing Trendly. Reuse mndsite's existing publishing workflow and pinned builder version in consumer repositories.
- mndsite's initial RSS implementation uses `rss.site_url` to enable a static `rss.xml`, a subscribe link, and feed autodiscovery. It emits titles, summaries, publication dates, and permanent post URLs as item IDs. When the expandable HTML feed lands, use the same published post selection and summary fallback for both outputs.

**Exit check.** Build a plain mndsite site with the optional feed and publish it independently. Expand posts with an image, video, or podcast source and verify their summaries, media, and permanent links. Subscribe to its RSS feed and confirm that editing a post keeps the same item ID.

## 3. Bring the same feed into Trendly's working preview

- Mount the shared feed view inside Trendly. Use working-tree files for local preview and the selected commit for remote browsing. Show which folder or repository revision is open so the user can tell what they are reviewing.
- Keep drafts outside the published content and asset inputs. List them in Posts and let authors opt into seeing them in Site feed. Keep draft bodies and draft-only files out of the generated site and its feed data.
- Start with **Refresh** where a browser retains a directory handle. In Firefox, reselect the folder for an updated snapshot. For automatic refresh on file saves, extend mndsite's existing development watcher and dev preview to pick up post, feed configuration, and relevant asset changes. Keep that workflow optional and independent of the static browser app.
- Give Herder and other agents the repository layout and frontmatter conventions. An author or agent can create, edit, and promote posts through normal file operations and Git. Consider MCP only if a concrete workflow needs a notification beyond refresh or watch.
- On a GitHub branch, expose Publish and Unpublish as a single commit that moves the Markdown between the draft and content trees. Check the expected branch head before writing and let the existing push workflow deploy the commit.
- For posts in the content tree, use the Site feed switches to add or remove their repository-relative paths in `mndsite.yaml` under `drafts`. Apply the list during mndsite ingestion so excluded posts stay available in Trendly and disappear from the public site and both generated feeds after the next build.
- Use the same post filters and counts in Posts and Site feed. Show drafts by default in the working feed. Stage changes to `mndsite.yaml` for review before writing them to a folder or branch.

**Exit check.** Use one repository fixture containing published content and a draft. Compare the published post in both views. Edit the draft with an external tool, refresh or watch it update, then check the public build for the absence of the draft and its assets.

## 4. Add RSS and Atom subscriptions

- Load RSS and Atom at runtime from `feeds.yaml`. Fetch directly in the browser where allowed. Support an optional operator-configured proxy for feeds that block browser reads. Keep working feeds and repository posts visible if one source fails.
- Classify host posts and external entries with the same media chips. Support date sorting and filtering by media and tags. The initial Sources page groups subscriptions and recurring post publishers by name and shows separate published post and feed entry counts.
- Add, edit, or remove subscriptions in Sources. Review changes to `feeds.yaml` before writing, and reload the subscription data after saving.
- Start with in-memory results, refresh controls, and error states per feed. Add IndexedDB only if repeat loading or offline reading warrants it.

**Exit check.** Load one directly accessible feed and one feed blocked by CORS. Verify that repository views remain usable and that a configured proxy can retrieve the blocked feed.

## 5. Refine Sources and expand feed format support

- **Implemented.** Sources lists subscriptions in `feeds.yaml`, recognized feed URLs from post citations, and the host site's configured RSS URL. Feed URLs identify subscriptions, even when publishers or display names match. The toolbar filters by format or subscription status and can sort by feed entry count. Publisher and citation metadata stays on post cards and in post filters.
- **Implemented.** The open repository supplies **Posts** and **Site feed**. Subscribe to a site built with mndsite by adding its deployed `rss.xml` URL to `feeds.yaml`. Sources offers the configured host RSS URL as a subscription when available.
- **Planned.** Evaluate JSON Feed as the first additional syndication format. Detect each supported format from the feed response and normalize entries for the existing reader. Keep existing RSS and Atom subscription URLs compatible, reuse direct fetching and the optional proxy, and report unsupported or invalid feeds per subscription.

**Exit check.** Open a host repository with posts that cite both ordinary links and supported feed URLs. Verify that **Sources** shows the feed URLs and that the citations still appear on post cards. Subscribe to a deployed mndsite `rss.xml` and read its published entries in **External feeds**. Verify that RSS, Atom, and the first additional format can be read together and that a failed subscription leaves the other feeds available.

## 6. Build indexed search and a shared feed fetcher

- Build on the header search and its `/` shortcut. Add ranked full-text results for published host posts and subscribed feed entries, with scope, tag, date, and media filters. Show the source and a matched excerpt. Open results in the existing post or feed card. Keep the current in-browser search available when the service is unavailable and for local drafts.
- Add an optional indexing service that reads published host content at a repository revision and ingests entries from configured subscriptions. Index titles, summaries, available body text, and metadata using stable post paths and feed entry IDs. Update the index as content and feeds change. Remove unpublished posts and entries for removed subscriptions from the workspace's search results.
- Use the same server-side feed fetcher for background indexing and on-demand proxy requests. Support Trendly's existing `proxy_url` contract by accepting the feed URL in a `url` query parameter and returning the feed body. Keep direct browser fetching for feeds that allow it. Restrict the service to approved feed URLs and validate redirect targets. Set request timeouts and response size limits, and cache responses so the reader and indexer can reuse them.
- Deploy the service independently of the static Trendly app. Connect a deployed Trendly instance through `proxy_url` and share the fetcher with the indexing pipeline. Use Planet Money's NPR RSS feed to verify the deployed path that the local development proxy currently covers.

**Exit check.** On a deployed Trendly instance, subscribe to Planet Money and verify that it loads in **External feeds** and its episodes appear in indexed search. Edit and unpublish a host post, then verify that search reflects both changes. Stop the service and check that local post search and directly accessible feeds still work.

## Later

Revisit authenticated remote repositories, richer feed filtering, offline caching, and automatic refresh after the read path and standalone publishing work well. Semantic search and social integrations remain deferred.
