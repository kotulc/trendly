# Using Trendly

Trendly is a local workspace for writing about articles, videos, and podcasts. **Feeds** are channels that organize your posts. **Post cards** open your drafts. A live preview shows how a draft reads and displays cards linking to its sources.

## Open a workspace

1. From the Trendly folder, run `npm ci` to install dependencies. On Windows PowerShell, use `npm.cmd ci` if needed.
2. Run `npm run dev` or `npm.cmd run dev`. Open the address it prints in desktop Chrome or Edge.
3. Explore the example workspace. Its edits reset when you reload the page.
4. To keep your work, click **Open workspace** and choose an empty folder. You can also copy the [example workspace](example-workspace) to a new folder and open that copy. Grant access when your browser asks.

Your saved work lives in the folder you chose. To resume in a fresh browser session, use **Open workspace** to select that same folder.

## Write and preview a post

1. Select an existing post card or click **New draft**. If you start a draft from a feed, Trendly assigns the draft to that feed.
2. Click **Split** to see your Markdown and its preview together, or switch between **Markdown** and **Preview**. The preview updates as you type.
3. Write below the closing `---`. Use the fields at the top to set the title, tags, feeds, and sources. The example posts show how to add a source URL.
4. Click **Save draft** to write the post to the workspace folder.

Source cards always link to the original. YouTube cards offer click-to-play video. A podcast card can offer audio playback when it has a direct audio URL.

## Work with an agent

Give Herder or another agent the path to your workspace and share the [file format](README.md#workspace-file-format). Ask it to create or revise a post in `posts/` or suggest a feed in `suggestions/`. Return to Trendly and click **Refresh workspace** if the changes haven’t already appeared.

If a file changes while you have unsaved edits, **Load disk version** opens the external version and discards your unsaved edits. **Save edits as a copy** keeps both versions as separate drafts.

## Review feed suggestions

Open **Feed suggestions**. Click **Follow** to add a suggested feed to the sidebar or **Dismiss** to remove the suggestion from the list. To add a feed by hand, click **+** next to **Feeds** and enter a name and optional URL.

This release uses feeds to organize local posts. Live RSS fetching and Git publishing are upcoming milestones. See the [implementation plan](IMPLEMENTATION_PLAN.md) for what’s next.
