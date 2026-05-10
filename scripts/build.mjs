import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import matter from "gray-matter";
import { marked } from "marked";

const rootDir = process.cwd();
const execFileAsync = promisify(execFile);
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
	const publishedAt = await resolvePublishedAt(data.date, filePath);
	const html = marked.parse(content, { breaks: true });

	posts.push({
		slug,
		title,
		publishedAt,
		html,
	});
}

posts.sort(
	(a, b) => toTimestampMs(b.publishedAt) - toTimestampMs(a.publishedAt),
);

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
		body: renderIndex(posts),
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

async function getPublishedAt(filePath) {
	try {
		const { stdout } = await execFileAsync(
			"git",
			// Pick the oldest add commit for this exact path, ignoring later resurrection adds.
			[
				"log",
				"--all",
				"--full-history",
				"--diff-filter=A",
				"--reverse",
				"--format=%aI",
				"--",
				filePath,
			],
			{ cwd: rootDir },
		);
		const originalCommitDate = stdout.trim().split("\n")[0];
		return originalCommitDate || new Date().toISOString();
	} catch {
		return new Date().toISOString();
	}
}

async function resolvePublishedAt(frontmatterDate, filePath) {
	if (frontmatterDate !== undefined && frontmatterDate !== null) {
		const normalized = normalizeFrontmatterDate(frontmatterDate);
		if (normalized) {
			return normalized;
		}
	}
	return getPublishedAt(filePath);
}

function slugify(value) {
	return String(value)
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function humanizeTitle(value) {
	return String(value).trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function renderIndex(posts) {
	const items = posts.length
		? posts
				.map(
					(post) => `
            <div>
              <a href="./${post.slug}/">${escapeHtml(humanizeTitle(post.title))}</a>
              <time datetime="${escapeHtml(post.publishedAt)}">${escapeHtml(toDisplayDate(post.publishedAt))}</time>
            </div>
          `,
				)
				.join("")
		: "";

	return `
    ${items}
    ${renderSleepyBot()}
  `;
}

function renderPost(post) {
	return `
    <p><a href="../">Home</a></p>
    <time datetime="${escapeHtml(post.publishedAt)}">${escapeHtml(toDisplayDate(post.publishedAt))}</time>
    <h1>${escapeHtml(humanizeTitle(post.title))}</h1>
    <article>${post.html}</article>
    ${renderSleepyBot()}
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
      body {
        margin: 0;
        padding: 24px;
        max-width: 800px;
        margin-inline: auto;
        position: relative;
      }

      ul {
        margin: 0;
        padding: 0;
      }

      time {
        display: block;
        font-size: smaller;
      }

      .sleepy-bot {
        position: absolute;
        right: 24px;
        top: 18px;
        margin: 0;
        line-height: 1.1;
        pointer-events: none;
        white-space: pre;
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

function toDisplayDate(value) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return String(value).slice(0, 10);
	}
	return date.toISOString().slice(0, 10);
}

function toTimestampMs(value) {
	const ms = new Date(value).getTime();
	if (Number.isNaN(ms)) {
		return 0;
	}
	return ms;
}

function normalizeFrontmatterDate(value) {
	const raw = String(value).trim();
	if (!raw) {
		return "";
	}

	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
		return `${raw}T00:00:00Z`;
	}

	const parsed = new Date(raw);
	if (Number.isNaN(parsed.getTime())) {
		return "";
	}
	return parsed.toISOString();
}

function renderSleepyBot() {
	return `<pre class="sleepy-bot" aria-hidden="true">  z
      z
        z

      [::::]
      [- -]
     /(____)\\
       /  \\</pre>`;
}
