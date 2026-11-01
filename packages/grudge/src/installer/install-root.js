// OWNER: lane-c
import { access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

/** Markers that make a directory a project boundary for both Git and the host. */
const REPOSITORY_MARKERS = [".git", ".hg", ".svn"];

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

/**
 * Nearest directory at or above `start` that carries a repository marker.
 *
 * `.git` is a directory in a normal clone and a file in a worktree or a
 * submodule; `access` covers both. The walk stops at `home`, so a directory
 * outside every repository never reports the user's home directory as its
 * project root.
 */
export async function repositoryRoot(start, home) {
  const homeDir = resolve(home);
  let current = resolve(start);
  while (true) {
    for (const marker of REPOSITORY_MARKERS) {
      if (await exists(join(current, marker))) return current;
    }
    if (current === homeDir) return null;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/** True when `dir` carries an installed runtime and config. */
export async function hasInstall(dir) {
  return exists(join(dir, ".grudge/config.json"));
}

/**
 * Find the install that belongs to `launchDir`.
 *
 * The upward walk stops at the first repository boundary. A nested repository
 * (submodule, worktree, vendored checkout) must not bind to the enclosing
 * project's install: the host does not load the enclosing project's settings
 * there, so reporting its install as healthy would be a false pass, and
 * acting on it would modify a directory the caller never meant to touch.
 *
 * Returns `null` when this directory tree has no install. Callers must not
 * fall back to an unrelated parent.
 */
export async function findInstallRoot({ launchDir, home }) {
  const homeDir = resolve(home);
  const boundary = (await repositoryRoot(launchDir, homeDir)) ?? homeDir;
  let current = resolve(launchDir);
  while (true) {
    if (await hasInstall(current)) return current;
    if (current === boundary || current === homeDir) return null;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * The install `uninstall` may act on.
 *
 * Stricter than `findInstallRoot`: only this repository's install is eligible.
 * Without a repository boundary the launch directory alone is considered, so
 * running `grudge uninstall` in an unrelated directory can never remove a
 * user-scope install that merely happens to sit above it.
 */
export async function findProjectInstallRoot({ launchDir, home }) {
  const launch = resolve(launchDir);
  const homeDir = resolve(home);
  if (launch === homeDir) return (await hasInstall(homeDir)) ? homeDir : null;
  const boundary = await repositoryRoot(launch, homeDir);
  let current = launch;
  while (true) {
    if (await hasInstall(current)) return current;
    if (!boundary || current === boundary) return null;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * The install `doctor` should inspect.
 *
 * A project install inside this repository wins; otherwise a user-scope
 * install at `home` is still usable from every directory. With neither, the
 * answer is "nothing here" - the root is the launch directory, so the report
 * never names a directory the caller did not ask about.
 */
export async function resolveInstallRoot({ launchDir, home }) {
  const homeDir = resolve(home);
  const project = await findInstallRoot({ launchDir, home: homeDir });
  if (project) return { root: project, kind: project === homeDir ? "user" : "project" };
  if (await hasInstall(homeDir)) return { root: homeDir, kind: "user" };
  return { root: resolve(launchDir), kind: "none" };
}
