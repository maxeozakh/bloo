# Bloo

Bloo is a local-first auto-publishing blog MVP.

## How it works

- Write posts in `posts/*.md`.
- Run `npm run autopublish`.
- Every few minutes, Bloo checks for changed Markdown.
- If the files have been untouched for the cooldown window, Bloo builds `public/`, commits, and pushes.

## Post format

Use frontmatter at the top of each file:

```md
---
title: My Post
date: 2026-04-02
draft: false
---

Your Markdown here.
```

`draft: true` skips publishing that post.

## Config

Edit `bloo.config.json`:

- `checkIntervalMinutes`: how often Bloo checks for changes
- `cooldownMinutes`: how long a file must sit unchanged before publishing
- `branch`: branch to push to
- `siteTitle`: title shown in generated HTML

## Commands

- `npm run build` builds the static site once
- `npm run publish:once` runs one publish cycle
- `npm run autopublish` runs the loop
