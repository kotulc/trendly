# Using Trendly

Trendly loads the host site's configuration, Markdown posts, drafts, and media from the repository you open. It reads RSS and Atom subscriptions from the feed URLs configured in that repository's `feeds.yaml`. Use an external editor or agent to edit posts, and use Trendly to publish or unpublish from a GitHub branch.

## Open a repository

Run `npm ci` and `npm run dev` from the Trendly project folder and open the address Vite prints. On Windows PowerShell, use `npm.cmd` in place of `npm` if necessary. The app opens an example repository so you can try it immediately.

- **Open folder** selects a checkout from your computer. Choose the folder containing `mndsite.yaml`. In Chrome and Edge, **Live local checkout** checks the working tree about every two seconds while the tab is visible and checks again when you return to the tab. Keep editing the same checkout with your editor or agent. In Firefox, **Imported snapshot** shows the selected files. Use **Reopen folder** after saving edits.
- **Open GitHub** accepts a public repository as `owner/repository` or its GitHub URL. Enter a branch, tag, or commit, or leave the ref blank for the default branch. Trendly reads the posts, media, and config from one commit and shows the ref and commit in the sidebar. Use **Refresh** to resolve a branch again. For a private repository, use a local checkout.

### Save to GitHub

Browsing public repositories requires no token. To save a supported change from a branch, paste a personal access token in the save dialog. A fine-grained token should grant **Contents** read and write access to the selected repository. Trendly sends the token directly to GitHub for that operation. It submits a commit against the loaded branch head, so a concurrent push requires you to refresh and review the change again. GitHub branch protection still applies. Tags and commit SHAs open for browsing. [GitHub token permissions](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents) · [GitHub commit API](https://docs.github.com/en/graphql/reference/commits#createcommitonbranch)

## Browse and preview

Search from the header to filter the current view. Press `/` to focus the search field. In **External feeds**, use the refresh icon in the header to reload subscriptions.

In **Posts** and **Site feed**, select a publisher or citation in the sidebar to filter the cards. Select **All publishers** to clear that filter.

- **Posts** shows the repository's Markdown. Search the text or filter by tag or status. Tags and metadata chips such as `essay` appear beside the media chip in lowercase, with spaces between words. Select the `draft` tag to see unpublished posts. Select a post to open it at full column width and see its summary and content.
- **Site feed** starts with every post in the open repository and uses the same filters as Posts. Each card shows **Draft** or **Published** and also shows **Archived** when applicable. Use the status filter to find posts with any of those statuses. Select **Publish** or **Unpublish** on a card to change its preview immediately. Select **Save changes** when you want to keep publication changes for posts in the site's content directory.
- **External feeds** reads RSS and Atom subscriptions from `feeds.yaml`. Select a subscription in the sidebar, search, filter by tags provided by the feed or by media type, and sort newest or oldest first.
- **Sources** lists feeds by URL. Filter by subscription status or format, and sort by name or feed entry count. Expand a feed card to edit its subscription or inspect a loading error.

## View media in expanded cards

Expanding a card loads its images, attached audio and video players, and supported YouTube and Vimeo embeds. Use the player's controls to start playback. Playback depends on the browser's file format support and whether the publisher makes the media available to other sites. **Open full post** takes you to the publisher's page when the feed has only an excerpt or playback is blocked.

For your own Markdown posts, use `![Description](photo.jpg)` for an image and `[Watch the clip](clip.mp4 "embed")` for a player. You can use a repository-relative media file or a public URL.

## Edit feed settings and subscriptions

Use **Feed settings** above the Site feed filters to edit the feed section, expandable layout, and public site URL. In **Source settings**, set or clear the **Feed proxy URL** for feeds that block direct browser requests. The **mndsite.yaml** and **feeds.yaml** sections open by default and show the saved YAML or a preview of pending changes. Select the filename to collapse the section. Sources shows configured subscriptions, the host site's configured RSS URL, and feed citations marked `kind: rss` or `kind: atom` or linked directly to an identifiable feed URL. Use a card's subscription switch or select **Add subscriptions** to enter another feed URL.

Subscription changes take effect in **External feeds** for the current session. You can close either settings dialog and keep editing or browsing. **Save changes** and **Discard changes** are available on the page while edits are pending. Saving applies the settings fields together with pending publication or subscription changes. Local saves use browser write access, and GitHub saves require a token with write access. The config section shows the full YAML file and highlights additions and removals inline. Removing a subscription leaves post citations intact.

With a read-only folder import, clicking the **Save changes** link starts the download and closes the dialog. To choose the checkout directly, right-click the link and choose **Save Link As**, then choose your repository root and replace the file with the displayed filename. Reopen the folder to load the updated config. To get a location prompt from a regular click, enable **Always ask you where to save files** in Firefox’s download settings.

## Update or publish a post

Edit Markdown files in the repository. A live local checkout updates after the files are saved. For an imported snapshot, reopen the folder.

The **Publish** and **Unpublish** buttons in **Site feed** change the preview in Trendly for the open workspace session. **Save changes** updates the `drafts` list in `mndsite.yaml` for posts in the content directory. You can save directly from Site feed. In the example workspace, try selecting **Publish** on **A quieter reading list**. mndsite builds with draft-list support omit entries in the draft list from the public site and RSS after a rebuild.

Files in the separate `drafts/` directory publish by moving into the configured content directory. Trendly can commit that move from **Posts** on a writable GitHub branch. In a local checkout, move the Markdown into the content directory. Drafts in public repositories remain visible on GitHub. Keep draft-only assets outside the published asset directories. A post needs a valid date and a path under the configured feed section to appear in the public feed.

To enable the expandable feed on the published site, set `expandable_feed: true` and choose an existing section with `feed_url` in `mndsite.yaml`. Add `rss.site_url` with the full public base URL to generate `rss.xml`. Once mndsite deploys the site, open **Sources** and use the subscription switch beside the host site's feed URL. [mndsite](https://github.com/kotulc/mndsite)
