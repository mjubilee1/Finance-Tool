#!/usr/bin/env node

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const RELEASE_COMMIT_RE = /^chore: release v\d+\.\d+\.\d+$/;
const VALID_BUMP_TYPES = new Set(["patch", "minor", "major", "skip"]);

function getCurrentVersion() {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  return pkg.version;
}

function isReleaseCommit() {
  try {
    const message = execSync("git log -1 --pretty=%s", { encoding: "utf8" }).trim();
    return RELEASE_COMMIT_RE.test(message);
  } catch {
    return false;
  }
}

function bumpVersion(semverType) {
  execSync(`npm version ${semverType} --no-git-tag-version`, { stdio: "inherit" });
  const version = getCurrentVersion();
  const message = `chore: release v${version}`;

  execSync("git add package.json package-lock.json", { stdio: "inherit" });
  execSync(`git commit package.json package-lock.json -m "${message}"`, { stdio: "inherit" });

  try {
    execSync(`git tag -a "v${version}" -m "${message}"`, { stdio: "inherit" });
  } catch {
    execSync(`git tag -f -a "v${version}" -m "${message}"`, { stdio: "inherit" });
  }
}

function getBumpTypeFromEnv() {
  const value = process.env.VERSION_BUMP?.trim().toLowerCase();
  return VALID_BUMP_TYPES.has(value) ? value : null;
}

async function promptForBumpType(currentVersion) {
  const rl = createInterface({ input, output });

  console.log(`\nPush to main — bump version? (current: v${currentVersion})`);
  console.log("  1) patch  — bug fixes / small changes");
  console.log("  2) minor  — new features");
  console.log("  3) major  — breaking changes");
  console.log("  4) skip   — push without bumping");
  console.log("\nTip: set VERSION_BUMP=minor (or patch/major/skip) to choose without prompting.\n");

  const answer = await rl.question("Choose [1-4] (default: 1): ");
  rl.close();

  const choice = answer.trim() || "1";
  const bumpTypes = {
    1: "patch",
    2: "minor",
    3: "major",
    4: "skip",
  };

  return bumpTypes[choice] ?? null;
}

async function resolveBumpType(currentVersion) {
  const fromEnv = getBumpTypeFromEnv();
  if (fromEnv) {
    console.log(`Using VERSION_BUMP=${fromEnv}.`);
    return fromEnv;
  }

  if (process.env.CI === "true" || process.env.CI === "1") {
    console.log("Skipping version bump in CI.");
    return "skip";
  }

  if (process.stdin.isTTY) {
    return promptForBumpType(currentVersion);
  }

  console.log("Non-interactive push detected — auto-bumping patch.");
  console.log("Set VERSION_BUMP=minor|major|patch|skip to override (e.g. in Cursor terminal).");
  return "patch";
}

async function main() {
  const manual = process.argv.includes("--manual");
  const noPrompt = process.argv.includes("--no-prompt");

  if (process.env.SKIP_VERSION_BUMP === "1") {
    console.log("Skipping version bump (SKIP_VERSION_BUMP=1).");
    return;
  }

  if (!manual && isReleaseCommit()) {
    console.log("Latest commit is already a release bump — continuing push.");
    return;
  }

  const currentVersion = getCurrentVersion();
  let bumpType = null;

  if (manual && noPrompt) {
    bumpType = getBumpTypeFromEnv();
    if (!bumpType) {
      console.error("VERSION_BUMP must be patch, minor, major, or skip when using --no-prompt.");
      process.exit(1);
    }
  } else if (manual) {
    bumpType = await promptForBumpType(currentVersion);
  } else {
    bumpType = await resolveBumpType(currentVersion);
  }

  if (!bumpType) {
    console.error("Invalid choice. Push aborted.");
    process.exit(1);
  }

  if (bumpType === "skip") {
    console.log("Skipping version bump.");
    return;
  }

  bumpVersion(bumpType);
  const nextVersion = getCurrentVersion();

  if (manual) {
    console.log(`\nBumped to v${nextVersion}.\n`);
    return;
  }

  console.log(
    `\nBumped to v${nextVersion}. A release commit was created — run git push again to include it.\n`,
  );
  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
