# trendly

A local content aggregator, markdown based protocol, and distributed publishing platform and search index.

Trendly locally manages and stores markdown content for a user, publishing new and updated content to both a remote git repo for static site publication (including an RSS feed via the mndSite project) and to a remote index service for searching and supporting dynamic linking between users of this distributed platform (one way automatic publication to major social platforms as a future capability) 
 
The user should be able to use any LLM/chat service to generate a new markdown post (related to a user selected article, podcast, video or other media) and be able to publish the post with a single action -- pushing to the remote repository and publishing to a static site (possibly via a workflow from that repository, but setup should be minimal). This de-couples this service from LLM services and simply acts as a simple protocol/template that any model can use as a target when generating a document to post. 

This application may have several components:
- A simple, responsive, modern web application interface to browse, create and publish content
- Apple iOS and Android native apps (once the web interface has been refined)
- A git-based static publication engine (see mndsite: https://github.com/kotulc/mndsite)
- A search component and index service to aggregate published content
- Possible MCP interface or agent parsable/friendly form factor/workflows for content generation

The idea would not be to simply generate AI slop content but to leverage a set of simple LLM workflows to engage the user in searching for new content based on their interests and then prompt them to engage with the content and think critically about it and instead publish their own insight, with the agent simply formatting and tagging their post for publication and acting as a sounding board and educator through the process. Ideally this would not require integrating any existing language service or API but instead simply work through prompts for an existing service. The extract from these conversations would be in markdown format for easy storage, version control, and publication to a static site.

