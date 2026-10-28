import { Plugin } from "@opencode/plugin";
import { spawn } from "node:child_process";
import { closeSync, existsSync, openSync, statSync, unlinkSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Starts the local doc reader when OpenCode's server comes up, if it is not already
 * answering on :4599.
 *
 * There is deliberately no cleanup function. A config save reloads plugins, and cleanup
 * would kill the page you are reading in the middle of a paragraph. Leaving the process
 * alone also means a restart of OpenCode never takes the reader down with it; the port
 * check keeps later setups from starting a second copy.
 *
 * OpenCode loads this plugin once per active location, so several setups can run at the
 * same moment. A lock file makes exactly one of them do the build and the spawn.
 */

const READER_DIR = join(homedir(), "projects", "personal", "reader");
const PROBE = "http://127.0.0.1:4599/api/tree";
const LOG = "/tmp/reader.log";
const LOCK = "/tmp/reader-spawn.lock";
const MISE_BUN = join(homedir(), ".local", "share", "mise", "installs", "bun", "latest", "bin", "bun");

const bun = existsSync(MISE_BUN) ? MISE_BUN : "bun";

async function isUp(): Promise<boolean> {
  try {
    const response = await fetch(PROBE, { signal: AbortSignal.timeout(700) });
    return response.ok;
  } catch {
    return false;
  }
}

/** `bun run start` rebuilds the stylesheet and vendor bundle, then scans ~/projects. */
async function waitForUp(attempts = 24): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (await isUp()) return true;
  }
  return false;
}

function takeLock(): boolean {
  try {
    const fd = openSync(LOCK, "wx");
    writeSync(fd, String(process.pid));
    closeSync(fd);
    return true;
  } catch {
    try {
      // A starter that died mid-build should not block every future attempt.
      if (Date.now() - statSync(LOCK).mtimeMs > 30_000) {
        unlinkSync(LOCK);
        return takeLock();
      }
    } catch {
      // Lock vanished between the failed open and the stat; that is fine.
    }
    return false;
  }
}

function releaseLock(): void {
  try {
    unlinkSync(LOCK);
  } catch {
    // Nothing to release.
  }
}

async function ensureReader(): Promise<"already-up" | "started-by-me" | "starting-elsewhere" | "failed"> {
  if (await isUp()) return "already-up";
  if (!existsSync(join(READER_DIR, "package.json"))) return "failed";
  if (!takeLock()) return (await waitForUp()) ? "starting-elsewhere" : "failed";

  try {
    const fd = openSync(LOG, "a");
    const child = spawn(bun, ["run", "start"], {
      cwd: READER_DIR,
      detached: true,
      stdio: ["ignore", fd, fd],
    });
    child.unref();
    closeSync(fd);
    return (await waitForUp()) ? "started-by-me" : "failed";
  } finally {
    releaseLock();
  }
}

export default Plugin.define({
  id: "reader",
  async setup() {
    const result = await ensureReader();
    if (result === "failed") {
      console.error(`[reader] could not start http://localhost:4599 from ${READER_DIR}`);
    }

    // A crash or a kill would otherwise leave the reader down until OpenCode reloads
    // plugins. The check is one localhost request, and starting is idempotent, so every
    // loaded location can run it.
    const watchdog = setInterval(() => {
      void ensureReader().catch(() => {});
    }, 10_000);

    return () => clearInterval(watchdog);
  },
});
