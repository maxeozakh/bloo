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

  const baseName = path.basename(filePath, path.extname(filePath));
  const slug = slugify(data.slug || baseName);
  const title = data.title || humanizeTitle(baseName);
  const publishedAt = data.date || new Date().toISOString().slice(0, 10);
  const html = marked.parse(content);

  posts.push({
    slug,
    title,
    publishedAt,
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
      body: renderPost(post),
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

function humanizeTitle(value) {
  return String(value)
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function renderIndex(posts, config) {
  const items = posts.length
    ? posts
        .map(
          (post) => `
            <li>
              <a href="./${post.slug}/">${escapeHtml(humanizeTitle(post.title))}</a>
              <div>${escapeHtml(post.publishedAt)}</div>
            </li>
          `,
        )
        .join("")
    : `<p>No published posts yet.</p><p>Add a Markdown file in <code>${escapeHtml(config.postsDir)}/</code>.</p>`;

  return `
    ${posts.length ? `<ul>${items}</ul>` : items}
  `;
}

function renderPost(post) {
  return `
    <p><a href="../">Home</a></p>
    <p>${escapeHtml(post.publishedAt)}</p>
    <h1>${escapeHtml(humanizeTitle(post.title))}</h1>
    <article>${post.html}</article>
  `;
}

function renderPage({ title, body }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
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
