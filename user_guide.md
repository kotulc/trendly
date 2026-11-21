# Using Trendly

Trendly browses Markdown posts, sources, and RSS subscriptions. Your repository supplies the content and configuration. Use an external editor or agent to edit posts, and use Trendly to publish or unpublish from a GitHub branch.

## Open a repository

Run `npm ci` and `npm run dev` from the Trendly project folder and open the address Vite prints. On Windows PowerShell, use `npm.cmd` in place of `npm` if necessary. The app opens an example repository so you can try it immediately.

- **Open folder** selects a checkout from your computer. Choose the folder containing `mndsite.yaml`. Chrome and Edge can reread the selected folder and check for changes while the tab is visible. In Firefox, choose the folder again after editing files to import a fresh snapshot.
- **Open GitHub** accepts a public repository as `owner/repository` or its GitHub URL. You can enter a branch, tag, or commit. Trendly shows the commit it loaded. For a private repository, use a local checkout.

## Browse and preview

Search from the header to filter the current view. Press `/` to focus the search field. In **External feeds**, use the refresh icon in the header to reload subscriptions.

In **Posts** and **Site feed**, select a publisher or cited source in the sidebar to filter the cards. Select **All sources** to clear that filter.

- **Posts** shows the repository's Markdown. Search the text or filter by tag or status. Tags and metadata chips such as `essay` appear beside the media chip in lowercase, with spaces between words. Select the `draft` tag to see unpublished posts. Select a post to open it at full column width and see its summary and content.
- **Site feed** starts with every post in the open repository and uses the same filters as Posts. On a GitHub branch, use **Publish** and **Unpublish** beside each card's media chip.
- **External feeds** reads RSS and Atom subscriptions from `feeds.yaml`. Select a subscription in the sidebar, search, filter by tags provided by the feed or by media type, and sort newest or oldest first. To include your own site's posts, add its published RSS URL as a subscription.
- **Sources** groups subscriptions and post publishers by name. **Posts** counts published repository posts attributed to that source. **Items** counts entries fetched from its subscriptions. Expand a card to follow links to related posts or edit subscription settings. Use the toolbar to filter source types or sort by name or published post count.

## Edit feed settings and subscriptions

Use **Feed settings** beside the Site feed heading to edit the feed section, expandable layout, and public site URL in `mndsite.yaml`. Source cards with an RSS or Atom feed have a subscription switch. Trendly recognizes configured subscriptions and post citations marked `kind: rss` or `kind: atom`, or linked directly to an identifiable feed URL. Expand the card to edit individual subscription settings. Use **Add subscriptions** below the list to enter a feed URL and **Review YAML** beside the Sources heading to review the changes to `feeds.yaml`.

Select **Review YAML** to see the staged changes. **Write to repository** commits the file to the open GitHub branch after you enter a token with write access, or writes it to a local folder after you grant browser write access. With a read-only import or the example repository, download the YAML and place it in your checkout before reopening it. Removing a subscription leaves post citations intact.

## Update or publish a post

Edit Markdown files in the repository, then return to Trendly and refresh. Keep drafts under `drafts/`, outside the content and asset directories configured for publication.

To publish through Trendly, open a public GitHub repository on its deployment branch. Commit drafts to `drafts/` before opening them in Trendly. In **Posts** or **Site feed**, select **Publish** or **Unpublish**, review the destination path, and enter a GitHub personal access token with write access to that repository's contents. Trendly commits the Markdown file move to the branch. The existing workflow runs if its push filters match the commit. Use the commit link to check GitHub's deployment status.

Publishing moves the Markdown into the configured content directory. For a top-level draft, the suggested destination uses the configured feed section, when present. Unpublishing moves the Markdown under `drafts/`. Drafts in public repositories remain visible on GitHub. Check relative links and move linked assets separately when needed. Add a valid date to the Markdown for the post to appear in **Site feed**. For local or private checkouts, move files and commit with your existing Git workflow.

To enable the expandable feed on the published site, set `expandable_feed: true` and choose an existing section with `feed_url` in `mndsite.yaml`. Add `rss.site_url` with the full public base URL to generate `rss.xml`. [mndsite](https://github.com/kotulc/mndsite)
