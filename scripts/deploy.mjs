import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEPLOY_CONFIG_FILE = ".bloo-deploy.json";

// Upload the built site (config.outputDir) to a remote host over SSH.
// Connection details live in .bloo-deploy.json (gitignored, keeps secrets out
// of the committed bloo.config.json). Returns true if it deployed.
//
// method "sftp" (default): works on Namecheap shared hosting even when shell
//   access is disabled. Re-uploads every file; cannot delete remote files.
// method "rsync": incremental + can delete stale files, but needs shell access
//   enabled on the account.
export async function deploy({ rootDir = process.cwd() } = {}) {
  const deployConfig = await readDeployConfig(rootDir);

  if (!deployConfig) {
    console.log(`No ${DEPLOY_CONFIG_FILE} found — skipping deploy.`);
    return false;
  }
  if (deployConfig.enabled === false) {
    console.log(`Deploy disabled in ${DEPLOY_CONFIG_FILE} — skipping.`);
    return false;
  }

  const blooConfig = JSON.parse(
    await fs.readFile(path.join(rootDir, "bloo.config.json"), "utf8"),
  );
  const outputDir = path.join(rootDir, blooConfig.outputDir);

  const { host, username } = deployConfig;
  if (!host || !username) {
    throw new Error(`${DEPLOY_CONFIG_FILE} must include "host" and "username".`);
  }

  // Namecheap shared hosting exposes SSH/SFTP on 21098, not 22.
  const port = deployConfig.port ?? 21098;
  const remoteDir = deployConfig.remoteDir ?? "public_html";
  const identityFile = deployConfig.identityFile
    ? expandHome(deployConfig.identityFile)
    : null;
  const method = deployConfig.method ?? "sftp";

  console.log(
    `Deploying ${blooConfig.outputDir}/ → ${username}@${host}:${remoteDir}/ (port ${port}, ${method})`,
  );

  if (method === "rsync") {
    await deployRsync({ outputDir, host, username, port, remoteDir, identityFile, deployConfig });
  } else if (method === "sftp") {
    await deploySftp({ outputDir, host, username, port, remoteDir, identityFile });
  } else {
    throw new Error(`Unknown deploy method "${method}" (use "sftp" or "rsync").`);
  }

  console.log("Deploy complete.");
  return true;
}

async function deploySftp({ outputDir, host, username, port, remoteDir, identityFile }) {
  const { dirs, files } = await walk(outputDir);

  const lines = [];
  // Create subdirectories first (the `-` prefix ignores "already exists").
  for (const dir of dirs) {
    lines.push(`-mkdir ${quote(joinRemote(remoteDir, dir))}`);
  }
  // Upload every file to its matching remote path.
  for (const file of files) {
    lines.push(`put ${quote(path.join(outputDir, file))} ${quote(joinRemote(remoteDir, file))}`);
  }
  lines.push("bye");

  const args = [
    "-P", String(port),
    "-o", "StrictHostKeyChecking=accept-new",
    "-b", "-",
  ];
  if (identityFile) {
    args.unshift("-i", identityFile);
  }
  args.push(`${username}@${host}`);

  await run("sftp", args, lines.join("\n") + "\n");
}

async function deployRsync({ outputDir, host, username, port, remoteDir, identityFile, deployConfig }) {
  const useDelete = deployConfig.delete !== false;
  const sshCommand = ["ssh", "-p", String(port), "-o", "StrictHostKeyChecking=accept-new"];
  if (identityFile) {
    sshCommand.push("-i", identityFile);
  }
  // -rz: recurse + compress, without preserving perms/owner/times that shared
  // hosting often rejects. Trailing slash on the source copies its contents.
  const rsyncArgs = ["-rz", "--no-perms"];
  if (useDelete) {
    rsyncArgs.push("--delete");
  }
  rsyncArgs.push("-e", sshCommand.join(" "));
  rsyncArgs.push(`${outputDir}/`, `${username}@${host}:${remoteDir}/`);
  await run("rsync", rsyncArgs);
}

// Recursively list directories and files under root, as paths relative to root
// using forward slashes. Dirs are ordered shallow→deep so mkdir works in order.
async function walk(root) {
  const dirs = [];
  const files = [];

  async function visit(relDir) {
    const absDir = path.join(root, relDir);
    const entries = await fs.readdir(absDir, { withFileTypes: true });
    for (const entry of entries) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        dirs.push(rel);
        await visit(rel);
      } else if (entry.isFile()) {
        files.push(rel);
      }
    }
  }

  await visit("");
  return { dirs, files };
}

function joinRemote(...parts) {
  return parts.filter(Boolean).join("/");
}

function quote(value) {
  return `"${value}"`;
}

async function readDeployConfig(rootDir) {
  try {
    return JSON.parse(
      await fs.readFile(path.join(rootDir, DEPLOY_CONFIG_FILE), "utf8"),
    );
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function expandHome(filePath) {
  if (filePath === "~" || filePath.startsWith("~/")) {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return filePath;
}

function run(command, args, stdinInput) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: [stdinInput === undefined ? "inherit" : "pipe", "inherit", "inherit"],
      // Force a locale the server supports; otherwise SSH forwards LC_CTYPE
      // ("UTF-8" on macOS) and the remote shell spams locale warnings.
      env: { ...process.env, LC_ALL: "C", LC_CTYPE: "C" },
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
    if (stdinInput !== undefined) {
      child.stdin.write(stdinInput);
      child.stdin.end();
    }
  });
}

// Allow `node scripts/deploy.mjs` / `npm run deploy` as a standalone deploy.
const invokedDirectly =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invokedDirectly) {
  deploy().catch((error) => {
    console.error(`Deploy failed: ${error.message}`);
    process.exit(1);
  });
}
