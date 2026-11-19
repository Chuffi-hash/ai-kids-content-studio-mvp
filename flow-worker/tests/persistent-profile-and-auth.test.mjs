import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  FlowBrowserWorker,
  getDefaultFlowProfileDir,
  isGoogleLoginUrl,
  isGoogleSigninRejected,
} from "../src/flow-browser.mjs";

test("getDefaultFlowProfileDir respects env override and platform defaults", () => {
  const originalEnv = process.env.FLOW_PROFILE_DIR;
  try {
    process.env.FLOW_PROFILE_DIR = path.resolve("./custom-profile-test");
    assert.strictEqual(getDefaultFlowProfileDir(), path.resolve("./custom-profile-test"));

    delete process.env.FLOW_PROFILE_DIR;
    const defaultDir = getDefaultFlowProfileDir();
    assert.ok(defaultDir.length > 0);
    assert.ok(defaultDir.includes("GoogleFlowChromeProfile"));
    // Ensure it does not contain undefined or literal '%LOCALAPPDATA%'
    assert.ok(!defaultDir.includes("%LOCALAPPDATA%"));
  } finally {
    if (originalEnv !== undefined) {
      process.env.FLOW_PROFILE_DIR = originalEnv;
    } else {
      delete process.env.FLOW_PROFILE_DIR;
    }
  }
});

test("isGoogleLoginUrl correctly detects login pages", () => {
  assert.strictEqual(isGoogleLoginUrl("https://accounts.google.com/ServiceLogin"), true);
  assert.strictEqual(isGoogleLoginUrl("https://accounts.google.com/v3/signin/identifier"), true);
  assert.strictEqual(isGoogleLoginUrl("https://sub.google.com/servicelogin?continue=x"), true);
  assert.strictEqual(isGoogleLoginUrl("https://labs.google/fx/tools/flow"), false);
  assert.strictEqual(isGoogleLoginUrl("invalid-url"), false);
});

test("isGoogleSigninRejected detects rejection routes", () => {
  assert.strictEqual(
    isGoogleSigninRejected("https://accounts.google.com/v3/signin/rejected?continue=..."),
    true
  );
  assert.strictEqual(
    isGoogleSigninRejected("https://accounts.google.com/signin/rejected"),
    true
  );
  assert.strictEqual(
    isGoogleSigninRejected("https://accounts.google.com/ServiceLogin"),
    false
  );
  assert.strictEqual(
    isGoogleSigninRejected("https://labs.google/fx/tools/flow"),
    false
  );
});

test("getSessionStatus reports multi-state status without context", async () => {
  const worker = new FlowBrowserWorker();
  const status = await worker.getSessionStatus();

  assert.strictEqual(status.connected, false);
  assert.strictEqual(status.workerOnline, true);
  assert.strictEqual(status.browserRunning, false);
  assert.strictEqual(status.googleAuthenticated, false);
  assert.strictEqual(status.manualLoginRequired, false);
  assert.strictEqual(status.googleSigninBlocked, false);
  assert.strictEqual(status.authenticationStatus, "unknown");
  assert.strictEqual(status.ownsActiveBrowser, false);
  assert.ok(status.configuredProfileDir);
  assert.ok(status.diagnostics);
  assert.strictEqual(status.diagnostics.ownsActiveBrowser, false);
  assert.strictEqual(status.diagnostics.authenticationStatus, "unknown");
});

test("getSessionStatus detects signin rejected state truthfully", async () => {
  const worker = new FlowBrowserWorker();
  worker.context = {}; // simulated context
  worker.page = {
    isClosed: () => false,
    url: () => "https://accounts.google.com/v3/signin/rejected?continue=https://labs.google/fx/tools/flow",
    title: async () => "Couldn't sign you in",
  };

  const status = await worker.getSessionStatus();
  assert.strictEqual(status.browserRunning, true);
  assert.strictEqual(status.googleSigninBlocked, true);
  assert.strictEqual(status.manualLoginRequired, true);
  assert.strictEqual(status.googleAuthenticated, false);
  assert.strictEqual(status.authenticationStatus, "blocked");
  assert.strictEqual(status.state, "google_signin_blocked");
  assert.strictEqual(status.diagnostics.googleSigninBlocked, true);
});

test("getSessionStatus detects login required state truthfully", async () => {
  const worker = new FlowBrowserWorker();
  worker.context = {};
  worker.page = {
    isClosed: () => false,
    url: () => "https://accounts.google.com/ServiceLogin?service=flow",
    title: async () => "Sign in - Google Accounts",
  };

  const status = await worker.getSessionStatus();
  assert.strictEqual(status.browserRunning, true);
  assert.strictEqual(status.manualLoginRequired, true);
  assert.strictEqual(status.googleAuthenticated, false);
  assert.strictEqual(status.googleSigninBlocked, false);
  assert.strictEqual(status.authenticationStatus, "login_required");
  assert.strictEqual(status.state, "manual_login_required");
});

test("getSessionStatus checks DOM on Flow pages truthfully", async () => {
  const worker = new FlowBrowserWorker();
  worker.context = {};

  // Case A: Flow page with sign-in button
  worker.page = {
    isClosed: () => false,
    url: () => "https://labs.google/fx/tools/flow",
    title: async () => "Google Flow",
    evaluate: async (fn) => "login_required",
  };
  let status = await worker.getSessionStatus();
  assert.strictEqual(status.flowPageOpen, true);
  assert.strictEqual(status.googleAuthenticated, false);
  assert.strictEqual(status.manualLoginRequired, true);
  assert.strictEqual(status.authenticationStatus, "login_required");

  // Case B: Flow page with authenticated workspace
  worker.page = {
    isClosed: () => false,
    url: () => "https://labs.google/fx/tools/flow/project/prj_abc123",
    title: async () => "My Project - Google Flow",
    evaluate: async (fn) => "authenticated",
  };
  status = await worker.getSessionStatus();
  assert.strictEqual(status.flowPageOpen, true);
  assert.strictEqual(status.projectSelected, true);
  assert.strictEqual(status.googleAuthenticated, true);
  assert.strictEqual(status.manualLoginRequired, false);
  assert.strictEqual(status.authenticationStatus, "authenticated");

  // Case C: Flow page with uncertain/unknown DOM
  worker.page = {
    isClosed: () => false,
    url: () => "https://labs.google/fx/tools/flow",
    title: async () => "Google Flow",
    evaluate: async (fn) => "unknown",
  };
  status = await worker.getSessionStatus();
  assert.strictEqual(status.flowPageOpen, true);
  assert.strictEqual(status.googleAuthenticated, false);
  assert.strictEqual(status.authenticationStatus, "unknown");
});

test("close() preserves profile directory on disk", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flow-test-profile-"));
  try {
    const worker = new FlowBrowserWorker();
    worker.profileDir = tempDir;
    // Context simulated
    let contextClosed = false;
    worker.context = {
      close: async () => {
        contextClosed = true;
      },
    };
    worker.page = {};

    const status = await worker.close();
    assert.strictEqual(contextClosed, true);
    assert.strictEqual(worker.context, null);
    assert.strictEqual(worker.page, null);
    assert.strictEqual(status.browserRunning, false);

    // Profile directory must NOT be deleted
    const stat = await fs.stat(tempDir);
    assert.ok(stat.isDirectory(), "Profile directory should still exist after close()");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});
