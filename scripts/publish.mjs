import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const rootDir = process.cwd();
const config = JSON.parse(
  await fs.readFile(path.join(rootDir, "bloo.config.json"), "utf8"),
);
const statePath = path.join(rootDir, ".bloo-state.json");
const once = process.argv.includes("--once");

if (once) {
  await runCycle({ forceBuild: true });
} else {
  console.log(
    `Watching ${config.postsDir}/ every ${config.checkIntervalMinutes} minute(s). Cooldown: ${config.cooldownMinutes} minute(s).`,
  );
  await runCycle();
  setInterval(runCycle, config.checkIntervalMinutes * 60 * 1000);
}

async function runCycle({ forceBuild = false } = {}) {
  try {
    const postFiles = await listMarkdownFiles(path.join(rootDir, config.postsDir));
    const state = await readState();
    const contentHash = postFiles.length > 0 ? await hashFiles(postFiles) : null;

    if (!forceBuild) {
      if (postFiles.length === 0) {
        console.log("No Markdown posts found.");
        return;
      }

      if (contentHash === state.lastPublishedHash) {
        console.log("No content changes since last publish.");
        return;
      }

      const latestEditAt = await getLatestMtime(postFiles);
      const ageMs = Date.now() - latestEditAt;
      const cooldownMs = config.cooldownMinutes * 60 * 1000;

      if (ageMs < cooldownMs) {
        const minutesLeft = Math.ceil((cooldownMs - ageMs) / 60000);
        console.log(`Content changed but is still cooling down. Retry in about ${minutesLeft} minute(s).`);
        return;
      }
    }

    await npmRun("build");

    const statusBeforeCommit = await git(["status", "--porcelain"]);
    if (!statusBeforeCommit.trim()) {
      console.log("Build completed but there is nothing new to commit.");
      if (contentHash) {
        await writeState({ lastPublishedHash: contentHash });
      }
      return;
    }

    await git(["add", config.postsDir, config.outputDir, "bloo.config.json", "package.json", "package-lock.json", ".gitignore"]);

    const commitMessage = `auto-publish ${new Date().toISOString()}`;
    await git(["commit", "-m", commitMessage]);

    const remote = await git(["remote"]);
    if (!remote.trim()) {
      console.log("Committed locally. No git remote configured, so nothing was pushed.");
      if (contentHash) {
        await writeState({ lastPublishedHash: contentHash });
      }
      return;
    }

    await git(["push", "origin", config.branch]);
    if (contentHash) {
      await writeState({ lastPublishedHash: contentHash });
    }
    console.log(`Published to origin/${config.branch}.`);
  } catch (error) {
    const message = error.stderr || error.stdout || error.message;
    console.error(`Publish failed: ${message}`.trim());
  }
}

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

async function hashFiles(filePaths) {
  const hash = crypto.createHash("sha256");

  for (const filePath of filePaths) {
    const content = await fs.readFile(filePath);
    hash.update(path.basename(filePath));
    hash.update(content);
  }

  return hash.digest("hex");
}

async function getLatestMtime(filePaths) {
  let latest = 0;

  for (const filePath of filePaths) {
    const stat = await fs.stat(filePath);
    latest = Math.max(latest, stat.mtimeMs);
  }

  return latest;
}

async function readState() {
  try {
    return JSON.parse(await fs.readFile(statePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function writeState(state) {
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

async function git(args) {
  const result = await execFileAsync("git", args, { cwd: rootDir });
  return `${result.stdout}${result.stderr}`;
}

async function npmRun(scriptName) {
  await execFileAsync("npm", ["run", scriptName], { cwd: rootDir });
}
