# Using Trendly

Trendly loads the host site's configuration, Markdown posts, drafts, and media from the repository you open. It reads RSS and Atom subscriptions from the feed URLs configured in that repository's `feeds.yaml`. Use an external editor or agent to edit posts, and use Trendly to publish or unpublish from a GitHub branch.

## Open a repository

Run `npm ci` and `npm run dev` from the Trendly project folder and open the address Vite prints. On Windows PowerShell, use `npm.cmd` in place of `npm` if necessary. The app opens an example repository so you can try it immediately.

- **Open folder** selects a checkout from your computer. Choose the folder containing `mndsite.yaml`. Chrome and Edge can reread the selected folder and check for changes while the tab is visible. In Firefox, choose the folder again after editing files to import a fresh snapshot.
- **Open GitHub** accepts a public repository as `owner/repository` or its GitHub URL. You can enter a branch, tag, or commit. Trendly shows the commit it loaded. For a private repository, use a local checkout.

## Browse and preview

Search from the header to filter the current view. Press `/` to focus the search field. In **External feeds**, use the refresh icon in the header to reload subscriptions.

In **Posts** and **Site feed**, select a publisher or citation in the sidebar to filter the cards. Select **All publishers** to clear that filter.

- **Posts** shows the repository's Markdown. Search the text or filter by tag or status. Tags and metadata chips such as `essay` appear beside the media chip in lowercase, with spaces between words. Select the `draft` tag to see unpublished posts. Select a post to open it at full column width and see its summary and content.
- **Site feed** starts with every post in the open repository and uses the same filters as Posts. Select a card's **Published** or **Unpublished** switch to review a change to its publication status.
- **External feeds** reads RSS and Atom subscriptions from `feeds.yaml`. Select a subscription in the sidebar, search, filter by tags provided by the feed or by media type, and sort newest or oldest first.
- **Sources** lists feeds by URL. Filter by subscription status or format, and sort by name or feed entry count. Expand a feed card to edit its subscription or inspect a loading error.

## View media in expanded cards

Expand a card to see inline images and audio or video controls. Use **Play video** for a YouTube or Vimeo embed, or **Open audio player** or **Open video player** for attached media. Playback depends on the browser's file format support and whether the publisher makes the media available to other sites. **Open full post** takes you to the publisher's page when the feed has only an excerpt or playback is blocked.

For your own Markdown posts, use `![Description](photo.jpg)` for an image and `[Watch the clip](clip.mp4 "embed")` for a player. You can use a repository-relative media file or a public URL.

## Edit feed settings and subscriptions

Use **Feed settings** above the Site feed filters to edit the feed section, expandable layout, and public site URL in `mndsite.yaml`. Use **Source settings** above the Sources filters to view the saved `feeds.yaml`. Sources shows configured subscriptions, the host site's configured RSS URL, and feed citations marked `kind: rss` or `kind: atom` or linked directly to an identifiable feed URL. Use a card's subscription switch or select **Add subscriptions** to enter another feed URL.

Subscription changes take effect in **External feeds** for the current session. Select **Review subscription changes** on Sources to save them. For site feed changes, select **Review YAML** in Feed settings. **Write to repository** commits the file to the open GitHub branch after you enter a token with write access, or writes it to a local folder after you grant browser write access. With a read-only import or the example repository, download the YAML and place it in your checkout before reopening it. Removing a subscription leaves post citations intact.

## Update or publish a post

Edit Markdown files in the repository, then return to Trendly and refresh.

For posts in the site's content directory, the **Site feed** switch updates the `drafts` list in `mndsite.yaml`. Select **Write to repository** after reviewing the change. For a local folder, grant write access. For a GitHub branch, provide a token with repository write access. With a read-only workspace, download the YAML and apply it to the repository. When the site rebuilds with draft-list support in mndsite, it omits those posts from public pages and RSS. Publishing again removes the path from `drafts` and restores its previous URL.

Files in the separate `drafts/` directory still publish by moving into the configured content directory. Trendly can commit that move on a writable GitHub branch. For a local checkout, move the Markdown into the content directory before using the Site feed switch. The **Posts** page also offers the file-move workflow. Drafts in public repositories remain visible on GitHub. Keep draft-only assets outside the published asset directories. A post needs a valid date and a path under the configured feed section to appear in the public feed.

To enable the expandable feed on the published site, set `expandable_feed: true` and choose an existing section with `feed_url` in `mndsite.yaml`. Add `rss.site_url` with the full public base URL to generate `rss.xml`. Once mndsite deploys the site, open **Sources** and use the subscription switch beside the host site's feed URL. [mndsite](https://github.com/kotulc/mndsite)
