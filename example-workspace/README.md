# Field Notes

This content-only folder is the example repository bundled with Trendly. Open it directly in Trendly, or copy its contents into a separate Git repository to test content changes and mndsite publishing without needing the Trendly source tree.

- `mndsite.yaml` defines the public content directory and shared site feed.
- `content/posts/` contains published example posts with excerpts, tags, status, site, and formats.
- `content/_assets/` contains local photographs used as inline images.
- `drafts/` contains local preview content outside the public build.
- `feeds.yaml` contains subscriptions for Trendly's External feeds view.

The two FR Wheelworks examples adapt excerpts and photos from the original posts. The [original license](frwheelworks-license.txt) is included. The full archive and screenshots live in the [FR Wheelworks repository](https://github.com/kotulc/frwheelworks).

Point a standalone mndsite build at this folder's `mndsite.yaml`. When publishing to a real destination, set `rss.site_url` to the public base URL. Subscribe to the deployed `rss.xml` URL to read the published entries in Trendly's **External feeds**. Open the folder in Trendly to review posts and drafts as you edit.
