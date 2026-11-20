# Using Trendly

This guide describes the current local authoring prototype. The planned repository explorer and expandable feed are described in the [implementation plan](implementation_plan.md).

Trendly is a local workspace for writing about articles, videos, and podcasts. **Feeds** are channels that organize your posts. **Post cards** open your drafts. A live preview shows how a draft reads and displays cards linking to its sources.

## Open a workspace

1. From the Trendly folder, run `npm ci` to install dependencies. On Windows PowerShell, use `npm.cmd ci` if needed.
2. Run `npm run dev` or `npm.cmd run dev`. Open the address it prints in desktop Chrome or Edge.
3. Explore the example workspace. Its edits reset when you reload the page.
4. To keep your work, click **Open workspace** and choose an empty folder. You can also copy the [example workspace](example-workspace) to a new folder and open that copy. Grant access when your browser asks.

Your saved work lives in the folder you chose. To resume in a fresh browser session, use **Open workspace** to select that same folder.

## Use Firefox

Firefox uses Trendly's local launcher to access a folder. Create an empty folder or use an existing Trendly workspace, then run this from the Trendly project folder:

```powershell
npm.cmd run workspace -- "C:\path\to\your\workspace"
```

On macOS or Linux, use `npm run workspace -- "/path/to/workspace"`. Open the address the terminal prints in Firefox and click **Open workspace**. Trendly opens the folder you passed in. Keep the terminal running while you work. To switch folders, stop the launcher and run it again with the other folder's path.

## Write and preview a post

1. Select an existing post card or click **New draft**. If you start a draft from a feed, Trendly assigns the draft to that feed.
2. Click **Split** to see your Markdown and its preview together, or switch between **Markdown** and **Preview**. The preview updates as you type.
3. Write below the closing `---`. Use the fields at the top to set the title, tags, feeds, and sources. The example posts show how to add a source URL.
4. Click **Save draft** to write the post to the workspace folder.

Source cards always link to the original. YouTube cards offer click-to-play video. A podcast card can offer audio playback when it has a direct audio URL.

## Work with an agent

Give Herder or another agent the path to your workspace and share the [example files](example-workspace). Ask it to create or revise a post in `posts/` or suggest a feed in `suggestions/`. Use a stable ID matching the filename stem. Return to Trendly and click **Refresh workspace** if the changes haven’t already appeared.

If a file changes while you have unsaved edits, **Load disk version** opens the external version and discards your unsaved edits. **Save edits as a copy** keeps both versions as separate drafts.

## Review feed suggestions

Open **Feed suggestions**. Click **Follow** to add a suggested feed to the sidebar or **Dismiss** to remove the suggestion from the list. To add a feed by hand, click **+** next to **Feeds** and enter a name and optional URL.

This prototype uses feeds to organize local posts. The planned explorer will read live RSS where available, and publishing will use the repository's mndsite workflow.
