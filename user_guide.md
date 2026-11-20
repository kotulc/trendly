# Using Trendly

Trendly is a read-only browser for Markdown posts, sources, and RSS subscriptions. Your repository supplies the content and configuration. Use an external editor or agent to make changes.

## Open a repository

Run `npm ci` and `npm run dev` from the Trendly project folder and open the address Vite prints. On Windows PowerShell, use `npm.cmd` in place of `npm` if necessary. The app opens an example repository so you can try it immediately.

- **Open folder** selects a checkout from your computer. Choose the folder containing `mndsite.yaml`. Chrome and Edge can reread the selected folder and check for changes while the tab is visible. In Firefox, choose the folder again after editing files to import a fresh snapshot.
- **Open GitHub** accepts a public repository as `owner/repository` or its GitHub URL. You can enter a branch, tag, or commit. Trendly shows the commit it loaded. For a private repository, use a local checkout.

## Browse and preview

- **Posts** shows the repository's Markdown. Search the text, filter by tag or status, or choose **Drafts only**. Select a post to open it at full column width and close the previously selected post. Summaries, format, and tags appear in the expanded header.
- **Site feed** previews the mndsite feed. The same cards show titles, summaries, full posts, and source media. Use **Include drafts** to switch between the local working preview and the published selection.
- **External feeds** reads RSS and Atom listed in `feeds.yaml`. Select a subscription or choose **Include repository posts** to view both together.
- **Sources** lists the links referenced in posts and shows which posts discuss each one.

## Update or publish a post

Edit Markdown files in the repository, then return to Trendly and refresh. Keep drafts and their assets under `drafts/`, outside the content and asset directories configured for publication. To publish, move the reviewed files into the published content tree and use your repository's normal Git and mndsite workflow.

To enable the expandable feed on the published site, set `expandable_feed: true` and choose an existing section with `feed_url` in `mndsite.yaml`. Add `rss.site_url` with the full public base URL to generate `rss.xml`. [mndsite](https://github.com/kotulc/mndsite)
