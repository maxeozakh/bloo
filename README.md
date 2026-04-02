# bloo

bloo is a local-first auto-publishing blog.

Write Markdown in `posts/`. bloo turns each file into a plain HTML page in `docs/` and rebuilds the homepage as a minimal list of post links and dates.

## How it works

- Write or edit `posts/*.md`
- Run `npm run autopublish`
- bloo watches for changes
- After the cooldown window, it rebuilds `docs/`, commits, and pushes

## Post format

Frontmatter is optional, but supported:

```md
---
title: My Post
date: 2026-04-02
slug: my-post
draft: false
---

Your Markdown here.
```

Notes:

- `title` defaults to the filename
- `date` defaults to today
- `slug` defaults to a slugified filename
- `draft: true` skips publishing

## Config

Edit `bloo.config.json`:

- `siteTitle`: HTML title for the site
- `postsDir`: source Markdown directory
- `outputDir`: generated site directory
- `branch`: branch to push to
- `checkIntervalSeconds`: how often bloo checks for changes
- `cooldownSeconds`: how long files must stay untouched before publishing

## Commands

- `npm run build` builds the site once
- `npm run publish:once` runs one publish cycle
- `npm run autopublish` runs the publish loop
