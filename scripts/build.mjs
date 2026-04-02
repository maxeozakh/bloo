import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { marked } from "marked";

const rootDir = process.cwd();
const config = JSON.parse(
  await fs.readFile(path.join(rootDir, "bloo.config.json"), "utf8"),
);
const postsDir = path.join(rootDir, config.postsDir);
const outputDir = path.join(rootDir, config.outputDir);

await ensureDir(outputDir);
await clearDir(outputDir);

const postFiles = await listMarkdownFiles(postsDir);
const posts = [];

for (const filePath of postFiles) {
  const raw = await fs.readFile(filePath, "utf8");
  const { data, content } = matter(raw);

  if (data.draft === true) {
    continue;
  }

  const slug = slugify(data.slug || path.basename(filePath, path.extname(filePath)));
  const title = data.title || slug;
  const publishedAt = data.date || new Date().toISOString().slice(0, 10);
  const html = marked.parse(content);
  const excerpt = extractExcerpt(content);

  posts.push({
    slug,
    title,
    publishedAt,
    excerpt,
    html,
  });
}

posts.sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));

for (const post of posts) {
  const postDir = path.join(outputDir, post.slug);
  await ensureDir(postDir);
  await fs.writeFile(
    path.join(postDir, "index.html"),
    renderPage({
      title: `${post.title} | ${config.siteTitle}`,
      body: renderPost(post, config),
    }),
  );
}

await fs.writeFile(
  path.join(outputDir, "index.html"),
  renderPage({
    title: config.siteTitle,
    body: renderIndex(posts, config),
  }),
);

console.log(`Built ${posts.length} post(s) into ${config.outputDir}/`);

async function listMarkdownFiles(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => path.join(dir, entry.name))
      .sort();
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function clearDir(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  await Promise.all(
    entries.map((entry) =>
      fs.rm(path.join(dir, entry.name), { recursive: true, force: true }),
    ),
  );
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractExcerpt(markdown) {
  const firstParagraph = markdown
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .find(Boolean);

  return (firstParagraph || "")
    .replace(/[#*_`\[\]]/g, "")
    .slice(0, 180);
}

function renderIndex(posts, config) {
  const cards = posts.length
    ? posts
        .map(
          (post) => `
            <article class="card">
              <p class="meta">${escapeHtml(post.publishedAt)}</p>
              <h2><a href="./${post.slug}/">${escapeHtml(post.title)}</a></h2>
              <p>${escapeHtml(post.excerpt)}</p>
            </article>
          `,
        )
        .join("")
    : `<article class="card"><h2>No published posts yet.</h2><p>Add a Markdown file in <code>${escapeHtml(config.postsDir)}/</code>.</p></article>`;

  return `
    <header class="hero">
      <p class="eyebrow">Auto-publishing blog</p>
      <h1>${escapeHtml(config.siteTitle)}</h1>
      <p class="lede">${escapeHtml(config.siteDescription)}</p>
    </header>
    <main class="stack">${cards}</main>
  `;
}

function renderPost(post, config) {
  return `
    <main class="post">
      <p><a href="../">Back to home</a></p>
      <p class="meta">${escapeHtml(post.publishedAt)}</p>
      <h1>${escapeHtml(post.title)}</h1>
      <article class="prose">${post.html}</article>
      <footer class="footer">Published by ${escapeHtml(config.siteTitle)}</footer>
    </main>
  `;
}

function renderPage({ title, body }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f6f0e8;
        --card: #fffaf4;
        --text: #2d241d;
        --muted: #746354;
        --accent: #bf5a36;
        --line: rgba(45, 36, 29, 0.12);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(191, 90, 54, 0.14), transparent 28%),
          linear-gradient(180deg, #fbf6ef 0%, var(--bg) 100%);
      }
      a { color: var(--accent); }
      .hero, .stack, .post {
        width: min(760px, calc(100% - 32px));
        margin: 0 auto;
      }
      .hero {
        padding: 72px 0 32px;
      }
      .eyebrow, .meta, .footer {
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 0.75rem;
      }
      h1, h2 {
        line-height: 1.05;
      }
      h1 {
        font-size: clamp(2.5rem, 8vw, 5rem);
        margin: 0 0 12px;
      }
      .lede {
        font-size: 1.15rem;
        max-width: 42rem;
      }
      .stack {
        display: grid;
        gap: 16px;
        padding-bottom: 48px;
      }
      .card, .post {
        background: color-mix(in srgb, var(--card) 92%, white);
        border: 1px solid var(--line);
        border-radius: 20px;
        padding: 24px;
        box-shadow: 0 12px 40px rgba(45, 36, 29, 0.06);
      }
      .post {
        margin-top: 48px;
        margin-bottom: 48px;
      }
      .prose {
        font-size: 1.1rem;
        line-height: 1.8;
      }
      .prose img {
        max-width: 100%;
      }
      code {
        background: rgba(45, 36, 29, 0.06);
        padding: 0.12rem 0.3rem;
        border-radius: 6px;
      }
    </style>
  </head>
  <body>${body}</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
