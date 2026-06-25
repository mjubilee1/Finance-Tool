#!/usr/bin/env node

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const RELEASE_COMMIT_RE = /^chore: release v\d+\.\d+\.\d+$/;

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
  execSync(`npm version ${semverType} -m "chore: release v%s"`, { stdio: "inherit" });
}

async function promptForBumpType(currentVersion) {
  const rl = createInterface({ input, output });

  console.log(`\nPush to main — bump version? (current: v${currentVersion})`);
  console.log("  1) patch  — bug fixes / small changes");
  console.log("  2) minor  — new features");
  console.log("  3) major  — breaking changes");
  console.log("  4) skip   — push without bumping\n");

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

async function main() {
  const manual = process.argv.includes("--manual");

  if (process.env.SKIP_VERSION_BUMP === "1") {
    console.log("Skipping version bump (SKIP_VERSION_BUMP=1).");
    return;
  }

  if (!process.stdin.isTTY || process.env.CI) {
    console.log("Skipping version bump (non-interactive environment).");
    return;
  }

  if (isReleaseCommit()) {
    console.log("Latest commit is already a release bump — continuing push.");
    return;
  }

  const currentVersion = getCurrentVersion();
  const bumpType = await promptForBumpType(currentVersion);

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
