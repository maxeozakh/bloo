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

## Deploy to Namecheap

bloo can mirror the built `docs/` to your Namecheap hosting over rsync+SSH on
each publish, alongside the git push.

1. In cPanel → SSH Access, add your public key (e.g. `~/.ssh/id_namecheap.pub`).
2. Copy `.bloo-deploy.example.json` to `.bloo-deploy.json` (gitignored — keeps
   your host/user out of the committed config) and fill it in:
   - `method`: `rsync` (incremental + deletes stale files; needs SSH shell
     access enabled) or `sftp` (re-uploads everything, no delete; works even
     without shell access)
   - `host`: SSH host from cPanel (e.g. `serverXXX.web-hosting.com`)
   - `port`: Namecheap shared hosting uses `21098`
   - `username`: your cPanel username
   - `identityFile`: path to your private key
   - `remoteDir`: usually `public_html` (or a subfolder for an addon domain)
   - `delete`: `true` removes remote files no longer in `docs/`
   - `enabled`: set to `true` to turn deploy on
3. Test the connection once manually: `npm run build && npm run deploy`

After that, `npm run autopublish` will build → deploy → commit/push on every
change. Deploy is skipped if `.bloo-deploy.json` is missing or `enabled: false`.

## Commands

- `npm run build` builds the site once
- `npm run publish:once` runs one publish cycle
- `npm run autopublish` runs the publish loop
- `npm run deploy` uploads `docs/` to Namecheap (uses `.bloo-deploy.json`)
