import { chromium } from "playwright";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  assertAllowedFlowUrl,
  buildCharacterViewPrompt,
  FLOW_HOME_URL,
  CHARACTER_VIEW_LABELS,
} from "./prompts.mjs";
import {
  detectImageType,
  parseImageDimensions,
  safeFilename,
} from "./image-validation.mjs";

const VALID_ASSET_TYPES = new Set([
  "main",
  "turnaround",
  "expression",
  "pose",
  "custom",
]);
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

export function getFirstLocator(loc) {
  if (!loc) return null;
  return typeof loc.first === "function"
    ? loc.first()
    : typeof loc.nth === "function"
      ? loc.nth(0)
      : loc;
}

function defaultDataDirectory(name) {
  return path.join(os.homedir(), ".ai-kids-content-studio", name);
}

export function getDefaultFlowProfileDir() {
  if (process.env.FLOW_PROFILE_DIR && process.env.FLOW_PROFILE_DIR.trim()) {
    return path.resolve(process.env.FLOW_PROFILE_DIR.trim());
  }
  if (process.platform === "win32") {
    const localAppData =
      process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    return path.join(
      localAppData,
      "AIKidsContentStudio",
      "GoogleFlowChromeProfile",
    );
  }
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "AIKidsContentStudio",
      "GoogleFlowChromeProfile",
    );
  }
  return path.join(
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
    "ai-kids-content-studio",
    "GoogleFlowChromeProfile",
  );
}

export function isGoogleLoginUrl(value) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    return (
      host === "accounts.google.com" ||
      (host.endsWith(".google.com") && pathname.includes("/servicelogin")) ||
      pathname.includes("/v3/signin")
    );
  } catch {
    return false;
  }
}

export function isGoogleSigninRejected(value) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const full = (parsed.pathname + parsed.search).toLowerCase();
    if (host.includes("accounts.google")) {
      return (
        full.includes("/signin/rejected") ||
        full.includes("signin/rejected") ||
        full.includes("rejected") ||
        full.includes("/denied")
      );
    }
    return false;
  } catch {
    return false;
  }
}

export function isFlowUrl(value) {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      (parsed.hostname === "labs.google" ||
        parsed.hostname === "flow.google.com")
    );
  } catch {
    return false;
  }
}

export function isValidFlowDownloadSource(page, activePage, context) {
  if (!page) return false;
  if (typeof page.isClosed === "function" && page.isClosed()) return false;
  if (
    context &&
    typeof page.context === "function" &&
    page.context() !== context
  ) {
    return false;
  }
  if (
    !activePage ||
    (typeof activePage.isClosed === "function" && activePage.isClosed())
  ) {
    return false;
  }
  if (page !== activePage) {
    return false;
  }
  try {
    const url =
      typeof page.url === "function" ? page.url() : String(page.url || "");
    return isFlowUrl(url);
  } catch {
    return false;
  }
}

export class FlowBrowserWorker {
  constructor() {
    this.context = null;
    this.page = null;
    this.jobs = new Map();
    this.activeJobId = null;
    this.profileDir = getDefaultFlowProfileDir();
    this.downloadDir = path.resolve(
      process.env.FLOW_DOWNLOAD_DIR || defaultDataDirectory("flow-downloads"),
    );
    this.backendUrl = (
      process.env.FLOW_BACKEND_URL || "http://127.0.0.1:5001"
    ).replace(/\/$/, "");
    this.browserChannel = process.env.FLOW_BROWSER_CHANNEL || "";
    this.promptSelector = process.env.FLOW_PROMPT_SELECTOR || "";
    this.downloadInProgress = false;
    this.attachedPages = new WeakSet();
  }

  configure(config = {}) {
    if (this.context) {
      const currentChannel =
        this.browserChannel === "chrome" ? "chrome" : "bundled-chromium";
      const requestedChannel = config.browserChannel
        ? config.browserChannel === "chrome"
          ? "chrome"
          : "bundled-chromium"
        : currentChannel;
      const currentProfile = path.resolve(this.profileDir);
      const requestedProfile = config.profileDir
        ? path.resolve(config.profileDir)
        : currentProfile;

      if (
        requestedChannel !== currentChannel ||
        requestedProfile !== currentProfile
      ) {
        const error = new Error(
          "Cannot change browser channel or profile directory while browser session is running. Please close the active browser window first.",
        );
        error.statusCode = 409;
        throw error;
      }
    }

    if (config.browserChannel !== undefined) {
      const chan = String(config.browserChannel).trim();
      if (chan === "chrome" || chan === "bundled-chromium" || chan === "") {
        this.browserChannel = chan === "bundled-chromium" ? "" : chan;
      } else {
        const error = new Error(
          `Unsupported browser channel "${chan}". Only "chrome" and "bundled-chromium" are supported.`,
        );
        error.statusCode = 400;
        throw error;
      }
    }

    if (
      config.profileDir &&
      typeof config.profileDir === "string" &&
      config.profileDir.trim()
    ) {
      this.profileDir = path.resolve(config.profileDir.trim());
    }

    return {
      success: true,
      browserChannel:
        this.browserChannel === "chrome" ? "chrome" : "bundled-chromium",
      profileDir: this.profileDir,
    };
  }

  async launch(projectUrl, config = {}) {
    if (config && Object.keys(config).length > 0) {
      this.configure(config);
    }

    if (!this.context) {
      await fs.mkdir(this.profileDir, { recursive: true });
      await fs.mkdir(this.downloadDir, { recursive: true });

      const options = {
        headless: false,
        acceptDownloads: true,
        viewport: null,
        args: ["--start-maximized"],
      };

      if (this.browserChannel === "chrome") {
        options.channel = "chrome";
      }

      try {
        this.context = await chromium.launchPersistentContext(
          this.profileDir,
          options,
        );
      } catch (launchErr) {
        const msg = String(launchErr?.message || "");
        if (
          msg.includes("ProcessSingleton") ||
          msg.includes("EBUSY") ||
          msg.includes("Target closed") ||
          msg.includes("already in use")
        ) {
          throw new Error(
            `Google Flow profile is locked by another running browser process (${this.profileDir}). Close any active Chrome windows using this profile and try again.`,
          );
        }
        if (
          msg.includes("Executable doesn't exist") ||
          msg.includes("Cannot find chrome")
        ) {
          throw new Error(
            `Selected browser channel "${this.browserChannel}" was not found on this machine. Switch to bundled Chromium or install Google Chrome.`,
          );
        }
        throw launchErr;
      }
      this.context.on("page", (page) => this.attachPage(page));
    }

    // A user may close the Flow tab without closing the browser context.
    // Recover an existing tab or create a new one, and attach handlers exactly once.
    if (!this.page || this.page.isClosed()) {
      const pages = this.context.pages();
      this.page =
        pages.find((candidate) => isFlowUrl(candidate.url())) ||
        pages[0] ||
        (await this.context.newPage());
      this.attachPage(this.page);
    }

    const target = assertAllowedFlowUrl(projectUrl || FLOW_HOME_URL);

    if (
      !isFlowUrl(this.page.url()) ||
      (projectUrl && this.page.url() !== target)
    ) {
      await this.page.goto(target, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
    }

    return this.getSessionStatus();
  }

  attachPage(page) {
    if (this.attachedPages.has(page)) return;
    this.attachedPages.add(page);

    if (!this.page || this.page.isClosed() || isFlowUrl(page.url())) {
      this.page = page;
    }

    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame() && isFlowUrl(page.url())) {
        this.page = page;
      }
    });

    page.on("download", (download) => {
      this.handleDownload(download, page).catch((error) => {
        console.error("[FlowWorker] Download handling failed:", error.message);
      });
    });

    page.on("close", () => {
      if (this.page === page) this.page = null;
    });
  }

  async getSessionStatus() {
    let profileDirExists = false;
    try {
      const stat = await fs.stat(this.profileDir);
      profileDirExists = stat.isDirectory();
    } catch {
      profileDirExists = false;
    }

    const browserChannel = this.browserChannel || "bundled-chromium";
    const configuredProfileDir = this.profileDir;

    if (!this.context) {
      return {
        connected: false,
        workerOnline: true,
        browserRunning: false,
        flowPageOpen: false,
        googleAuthenticated: false,
        manualLoginRequired: false,
        googleSigninBlocked: false,
        projectSelected: false,
        authenticationStatus: "unknown",
        canPrepareJob: false,
        canGenerateJob: false,
        state: "browser_not_started",
        message: "Open a persistent Google Flow browser session first.",
        browserChannel,
        configuredProfileDir,
        profileDirExists,
        ownsActiveBrowser: false,
        diagnostics: {
          browserChannel,
          configuredProfileDir,
          profileDirExists,
          ownsActiveBrowser: false,
          googleSigninRequired: false,
          googleSigninBlocked: false,
          authenticationStatus: "unknown",
          canPrepareJob: false,
        },
      };
    }

    if (
      !this.page ||
      (typeof this.page.isClosed === "function" && this.page.isClosed())
    ) {
      return {
        connected: false,
        workerOnline: true,
        browserRunning: false,
        flowPageOpen: false,
        googleAuthenticated: false,
        manualLoginRequired: false,
        googleSigninBlocked: false,
        projectSelected: false,
        authenticationStatus: "unknown",
        canPrepareJob: false,
        canGenerateJob: false,
        state: "browser_page_closed",
        message: "The Flow browser page is closed. Open the session again.",
        browserChannel,
        configuredProfileDir,
        profileDirExists,
        ownsActiveBrowser: true,
        diagnostics: {
          browserChannel,
          configuredProfileDir,
          profileDirExists,
          ownsActiveBrowser: true,
          googleSigninRequired: false,
          googleSigninBlocked: false,
          authenticationStatus: "unknown",
          canPrepareJob: false,
        },
      };
    }

    const currentUrl =
      typeof this.page.url === "function"
        ? this.page.url()
        : String(this.page.url || "");
    const signinBlocked = isGoogleSigninRejected(currentUrl);
    const loginUrl = isGoogleLoginUrl(currentUrl);
    const flowPage = isFlowUrl(currentUrl);
    const projectSelected = Boolean(
      flowPage && currentUrl.match(/\/project\/[a-zA-Z0-9\-_]+/i),
    );

    let title = "";
    try {
      if (typeof this.page.title === "function") {
        title = await this.page.title();
      }
    } catch {
      // The page may be navigating; status remains available without a title.
    }

    let googleAuthenticated = false;
    let manualLoginRequired = false;
    let googleSigninBlocked = false;
    let authenticationStatus = "unknown";
    let state = "browser_open";
    let message = "";

    if (signinBlocked) {
      googleSigninBlocked = true;
      manualLoginRequired = true;
      googleAuthenticated = false;
      authenticationStatus = "blocked";
      state = "google_signin_blocked";
      message =
        "Google sign-in was rejected by Google (accounts.google.com/v3/signin/rejected). Please complete sign-in in your standard browser or review network/proxy configuration.";
    } else if (loginUrl) {
      manualLoginRequired = true;
      googleAuthenticated = false;
      googleSigninBlocked = false;
      authenticationStatus = "login_required";
      state = "manual_login_required";
      message =
        "Sign in manually in the visible browser. The worker does not handle passwords, MFA, or CAPTCHA.";
    } else if (flowPage) {
      state = "flow_page_open";
      try {
        let domStatus = "unknown";
        if (typeof this.page.evaluate === "function") {
          domStatus = await this.page.evaluate(() => {
            const doc = document;
            if (!doc) return "unknown";

            const signInEl = doc.querySelector(
              'a[href*="accounts.google.com"], button[data-action="sign-in"], a[data-action="sign-in"], [aria-label*="Sign in" i]',
            );

            const accountEl = doc.querySelector(
              'a[href*="SignOutOptions"], [aria-label*="Google Account" i], img[src*="googleusercontent.com"], [data-email]',
            );

            const workspaceEl = doc.querySelector(
              '[data-testid="project-workspace"], textarea, [contenteditable="true"], button[aria-label*="Generate" i]',
            );

            if (signInEl && !accountEl) {
              return "login_required";
            }
            if (accountEl || workspaceEl) {
              return "authenticated";
            }
            return "unknown";
          });
        }

        if (domStatus === "authenticated") {
          googleAuthenticated = true;
          manualLoginRequired = false;
          googleSigninBlocked = false;
          authenticationStatus = "authenticated";
          message = projectSelected
            ? "Google Flow session is authenticated with active project selected."
            : "Google Flow session is authenticated. Ready for character and background workflows.";
        } else if (domStatus === "login_required") {
          googleAuthenticated = false;
          manualLoginRequired = true;
          googleSigninBlocked = false;
          authenticationStatus = "login_required";
          state = "manual_login_required";
          message = "Sign in to your Google account in the visible browser.";
        } else {
          googleAuthenticated = false;
          manualLoginRequired = false;
          googleSigninBlocked = false;
          authenticationStatus = "unknown";
          message =
            "Authentication status unknown. Confirm your login in the visible browser.";
        }
      } catch {
        googleAuthenticated = false;
        authenticationStatus = "unknown";
        message =
          "Authentication status unknown. Confirm your login in the visible browser.";
      }
    } else {
      state = "browser_open";
      authenticationStatus = "unknown";
      message = `Browser is open on ${currentUrl}. Navigate to Google Flow.`;
    }

    const canPrepareJob = Boolean(
      this.context &&
      this.page &&
      (typeof this.page.isClosed !== "function" || !this.page.isClosed()) &&
      flowPage &&
      googleAuthenticated &&
      !manualLoginRequired &&
      !googleSigninBlocked,
    );

    const diagnostics = {
      browserChannel,
      configuredProfileDir,
      profileDirExists,
      ownsActiveBrowser: true,
      googleSigninRequired:
        manualLoginRequired || authenticationStatus === "login_required",
      googleSigninBlocked,
      authenticationStatus,
      canPrepareJob,
    };

    return {
      connected: true, // for backwards compatibility
      workerOnline: true,
      browserRunning: true,
      flowPageOpen: flowPage,
      googleAuthenticated,
      manualLoginRequired,
      googleSigninBlocked,
      projectSelected,
      authenticationStatus,
      canPrepareJob,
      canGenerateJob: Boolean(
        canPrepareJob && this.activeJob?.status === "prompt_ready",
      ),
      state,
      currentUrl,
      title,
      message,
      browserChannel,
      configuredProfileDir,
      profileDirExists,
      ownsActiveBrowser: true,
      diagnostics,
    };
  }

  async close() {
    if (this.context) {
      await this.context.close();
      this.context = null;
      this.page = null;
    }

    return this.getSessionStatus();
  }

  async resetProfile() {
    await this.close();
    const defaultDir = getDefaultFlowProfileDir();
    if (
      this.profileDir !== defaultDir &&
      !this.profileDir.includes("GoogleFlowChromeProfile")
    ) {
      throw new Error(
        "Refusing to reset profile: path is not a dedicated Google Flow profile.",
      );
    }
    try {
      await fs.rm(this.profileDir, { recursive: true, force: true });
      await fs.mkdir(this.profileDir, { recursive: true, mode: 0o700 });
      return {
        success: true,
        message: "Dedicated Google Flow browser profile reset successfully.",
      };
    } catch (err) {
      throw new Error(`Failed to reset profile directory: ${err.message}`);
    }
  }

  createJob(input) {
    const targetType =
      input.targetType || (input.sceneId ? "background" : "character");

    if (targetType === "background") {
      const sceneId = String(input.sceneId || "").trim();
      const storyId = String(input.storyId || "").trim();
      if (!sceneId) throw new Error("sceneId is required for background jobs.");

      const projectUrl = input.projectUrl
        ? assertAllowedFlowUrl(input.projectUrl)
        : undefined;
      const prompt = String(input.prompt || "").trim();
      if (!prompt)
        throw new Error("A non-empty prompt is required for background jobs.");

      const job = {
        id: randomUUID(),
        targetType: "background",
        sceneId,
        storyId,
        aspectRatio: input.aspectRatio || "16:9",
        projectUrl,
        prompt,
        status: "created",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        message: "Background job created. Prepare it after opening Flow.",
      };

      this.jobs.set(job.id, job);
      return job;
    }

    const characterId = String(input.characterId || "").trim();
    const characterName = String(input.characterName || "").trim();
    const view = String(input.view || "front");

    if (!characterId) throw new Error("characterId is required.");
    if (!characterName) throw new Error("characterName is required.");
    if (!CHARACTER_VIEW_LABELS[view])
      throw new Error("Unsupported character view: " + view);

    const assetType = String(
      input.assetType ||
        (view === "front" && input.isMasterReference === true
          ? "main"
          : "custom"),
    );

    if (!VALID_ASSET_TYPES.has(assetType)) {
      throw new Error(
        "assetType must be one of: " + Array.from(VALID_ASSET_TYPES).join(", "),
      );
    }

    const projectUrl = input.projectUrl
      ? assertAllowedFlowUrl(input.projectUrl)
      : undefined;
    const prompt = String(
      input.prompt ||
        buildCharacterViewPrompt({
          characterName,
          view,
          additionalInstructions: input.additionalInstructions,
        }),
    ).trim();

    if (!prompt) throw new Error("A non-empty prompt is required.");

    const job = {
      id: randomUUID(),
      targetType: "character",
      characterId,
      characterName,
      view,
      assetType,
      isMasterReference: input.isMasterReference === true,
      projectUrl,
      prompt,
      status: "created",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      message:
        "Job created. Prepare it after opening Flow and completing any required manual sign-in.",
    };

    this.jobs.set(job.id, job);
    return job;
  }

  extractProjectId(url) {
    if (!url || typeof url !== "string") return null;
    const match = url.match(/\/project\/([a-zA-Z0-9\-_]+)/i);
    return match ? match[1] : null;
  }

  setJobTerminal(job, terminalStatus, error = undefined, message = undefined) {
    if (!job) return;
    job.status = terminalStatus;
    if (error !== undefined) job.error = error;
    if (message !== undefined) job.message = message;
    if (terminalStatus === "completed") {
      job.completedAt = new Date().toISOString();
      job.error = undefined;
    }
    if (this.activeJobId === job.id) {
      this.activeJobId = null;
    }
    this.touch(job);
  }

  recoverActiveJobLock(force = false) {
    if (!this.activeJobId) return;
    const active = this.jobs.get(this.activeJobId);
    if (
      !active ||
      force ||
      ["completed", "cancelled", "failed"].includes(active.status)
    ) {
      this.activeJobId = null;
      return;
    }

    const ageMs =
      Date.now() - new Date(active.updatedAt || active.createdAt).getTime();
    const isActivelyGenerating = [
      "generating",
      "output_detected",
      "downloading",
      "importing",
    ].includes(active.status);
    const timeoutThresholdMs = isActivelyGenerating ? 120000 : 30000;

    if (ageMs > timeoutThresholdMs) {
      console.warn(
        `[FlowBrowser] Recovering stale activeJobId lock for job ${this.activeJobId} (${Math.round(ageMs / 1000)}s old, status=${active.status}).`,
      );
      this.setJobTerminal(
        active,
        "failed",
        `Job was inactive in status "${active.status}" and active lock was safely recovered.`,
        "Active lock recovered due to timeout.",
      );
    }
  }

  cancelActiveJob(reason = "Active job cancelled by user or system recovery.") {
    this.recoverActiveJobLock();
    if (!this.activeJobId) {
      return { cancelled: false, message: "No active job was running." };
    }
    const active = this.jobs.get(this.activeJobId);
    const id = this.activeJobId;
    if (active) {
      this.setJobTerminal(active, "cancelled", undefined, reason);
    } else {
      this.activeJobId = null;
    }
    return {
      cancelled: true,
      jobId: id,
      message: `Active job ${id} was cancelled and worker lock released.`,
    };
  }

  async detectInterfaceMode() {
    if (
      !this.page ||
      (typeof this.page.isClosed === "function" && this.page.isClosed())
    ) {
      return "unknown";
    }

    try {
      if (typeof this.page.locator === "function") {
        // 1. Check for Agent mode elements
        const agentBox = this.page.locator("flow-creative-agent-prompt-box");
        if ((await agentBox.count().catch(() => 0)) > 0) return "agent";

        const agentTextbox = this.page.locator(
          '[role="textbox"][aria-label="What do you want to create?"]',
        );
        if ((await agentTextbox.count().catch(() => 0)) > 0) return "agent";

        const agentSubmit = this.page.locator(
          'button[aria-label="Start generation"]',
        );
        if ((await agentSubmit.count().catch(() => 0)) > 0) return "agent";

        // 2. Check for Standard mode elements
        const standardBtn = this.page.locator(
          'button:has-text("Generate Image"), button[aria-label="Generate Image"]',
        );
        if ((await standardBtn.count().catch(() => 0)) > 0) return "standard";
      }
      return "unknown";
    } catch {
      return "unknown";
    }
  }

  async getOutputAssetBaseline() {
    if (
      !this.page ||
      (typeof this.page.isClosed === "function" && this.page.isClosed())
    ) {
      return { count: 0, identifiers: new Set() };
    }

    try {
      if (typeof this.page.locator !== "function") {
        return { count: 0, identifiers: new Set() };
      }

      const options = this.page.locator(
        "flow-a2ui-multiple-choice flow-a2ui-image-option, .gallery-container flow-a2ui-image-option, flow-a2ui-image-option.media-option, flow-a2ui-image-option",
      );
      const count = await options.count().catch(() => 0);
      const identifiers = new Set();

      for (let i = 0; i < count; i++) {
        const option = options.nth(i);
        const image = option.locator("img.image-thumbnail, img");
        const imgCount = await image.count().catch(() => 0);
        if (imgCount >= 1) {
          const src =
            typeof image.first().getAttribute === "function"
              ? await image
                  .first()
                  .getAttribute("src")
                  .catch(() => null)
              : null;
          if (src) {
            try {
              identifiers.add(new URL(src, this.page.url()).href);
            } catch {
              identifiers.add(src);
            }
          }
        }
      }

      // Legacy fallback
      if (identifiers.size === 0) {
        const legacyImgs = this.page.locator(
          "flow-output-tile img, .generation-tile img, .output-tile img, [data-asset-id]",
        );
        const legCount = await legacyImgs.count().catch(() => 0);
        for (let i = 0; i < legCount; i++) {
          const el = legacyImgs.nth(i);
          const src =
            typeof el.getAttribute === "function"
              ? await el.getAttribute("src").catch(() => null)
              : null;
          const assetId =
            typeof el.getAttribute === "function"
              ? await el.getAttribute("data-asset-id").catch(() => null)
              : null;
          const id = src || assetId || `legacy-${i}`;
          identifiers.add(id);
        }
      }

      return { count: identifiers.size, identifiers };
    } catch {
      return { count: 0, identifiers: new Set() };
    }
  }

  async collectNewAgentOutputs(
    job,
    baseline = { count: 0, identifiers: new Set() },
  ) {
    if (
      !this.page ||
      (typeof this.page.isClosed === "function" && this.page.isClosed())
    ) {
      return [];
    }

    const results = [];
    try {
      if (typeof this.page.locator !== "function") return results;

      const options = this.page.locator(
        "flow-a2ui-multiple-choice flow-a2ui-image-option, .gallery-container flow-a2ui-image-option, flow-a2ui-image-option.media-option, flow-a2ui-image-option",
      );
      const count = await options.count().catch(() => 0);

      for (let i = 0; i < count; i++) {
        const option = options.nth(i);
        const image = option.locator("img.image-thumbnail, img");
        const imgCount = await image.count().catch(() => 0);
        if (imgCount >= 1) {
          const imgEl = image.first();
          const src =
            typeof imgEl.getAttribute === "function"
              ? await imgEl.getAttribute("src").catch(() => null)
              : null;
          if (!src) continue;

          let fullUrl = src;
          try {
            fullUrl = new URL(src, this.page.url()).href;
          } catch {}

          if (
            !baseline.identifiers.has(fullUrl) &&
            !baseline.identifiers.has(src)
          ) {
            let naturalWidth = 0;
            let naturalHeight = 0;
            let alt = "";
            try {
              if (typeof imgEl.evaluate === "function") {
                const evalRes = await imgEl
                  .evaluate((img) => ({
                    naturalWidth: img.naturalWidth || 0,
                    naturalHeight: img.naturalHeight || 0,
                    alt: img.alt || "",
                  }))
                  .catch(() => null);
                if (evalRes) {
                  naturalWidth = evalRes.naturalWidth;
                  naturalHeight = evalRes.naturalHeight;
                  alt = evalRes.alt;
                }
              }
            } catch {}

            results.push({
              sourceUrl: fullUrl,
              rawSrc: src,
              naturalWidth,
              naturalHeight,
              alt,
              optionLocator: option,
              imageLocator: imgEl,
            });
          }
        }
      }

      if (results.length === 0) {
        const legacyImgs = this.page.locator(
          "flow-output-tile img, .generation-tile img, .output-tile img, [data-asset-id]",
        );
        const legCount = await legacyImgs.count().catch(() => 0);
        for (let i = 0; i < legCount; i++) {
          const el = legacyImgs.nth(i);
          const src =
            typeof el.getAttribute === "function"
              ? await el.getAttribute("src").catch(() => null)
              : null;
          const assetId =
            typeof el.getAttribute === "function"
              ? await el.getAttribute("data-asset-id").catch(() => null)
              : null;
          const id = src || assetId || `legacy-${i}`;
          if (src && !baseline.identifiers.has(id)) {
            let fullUrl = src;
            try {
              fullUrl = new URL(src, this.page.url()).href;
            } catch {}
            results.push({
              sourceUrl: fullUrl,
              rawSrc: src,
              naturalWidth: 1024,
              naturalHeight: 576,
              alt: "",
              optionLocator: el,
              imageLocator: el,
            });
          }
        }
      }
    } catch (err) {
      console.warn("[FlowBrowser] collectNewAgentOutputs error:", err.message);
    }

    return results;
  }

  async configureOutputCount(count) {
    if (count !== 1) {
      throw new Error("This workflow currently supports one output only.");
    }
    if (
      !this.page ||
      (typeof this.page.isClosed === "function" && this.page.isClosed())
    )
      return;
    try {
      if (typeof this.page.locator !== "function") return;
      const countButton = getFirstLocator(
        this.page.locator(
          'button[aria-label="1 image"], button[aria-label="1"], [data-value="1"], button:has-text("1 image")',
        ),
      );
      if (
        countButton &&
        (await countButton.count().catch(() => 0)) > 0 &&
        (await countButton.isVisible().catch(() => false))
      ) {
        await countButton.click({ timeout: 3000 }).catch(() => {});
      }
    } catch (err) {
      console.warn("[FlowBrowser] configureOutputCount notice:", err.message);
    }
  }

  async startImageResponseCapture(job) {
    const captured = new Map();
    job.capturedImageResponses = captured;
    job.pendingImageCaptures = [];
    const startedAt = Date.now();

    const onResponse = (response) => {
      const capturePromise = (async () => {
        try {
          const url = typeof response.url === "function" ? response.url() : "";
          if (!url) return;

          let parsed;
          try {
            parsed = new URL(url);
          } catch {
            return;
          }

          if (parsed.origin !== "https://flow.google.com") {
            return;
          }
          if (!parsed.pathname.startsWith("/asb/")) {
            return;
          }
          const status =
            typeof response.status === "function" ? response.status() : 200;
          if (status !== 200) {
            return;
          }

          const request =
            typeof response.request === "function" ? response.request() : null;
          if (request && typeof request.resourceType === "function") {
            const rType = request.resourceType();
            if (rType !== "image") return;
          }

          const headers =
            typeof response.headers === "function" ? response.headers() : {};
          const mimeType = (headers["content-type"] || "")
            .split(";")[0]
            .trim()
            .toLowerCase();
          if (!["image/png", "image/jpeg", "image/webp"].includes(mimeType)) {
            return;
          }

          const body =
            typeof response.body === "function"
              ? await response.body().catch(() => null)
              : null;
          if (!Buffer.isBuffer(body) || body.length <= 500) {
            return;
          }
          if (body.length > MAX_IMAGE_BYTES) {
            return;
          }

          captured.set(url, {
            buffer: body,
            mimeType,
            url,
            capturedAt: Date.now(),
            generationStartedAt: startedAt,
          });
        } catch (error) {
          console.warn(
            "[FlowBrowser] Image response capture failed:",
            error.message,
          );
        }
      })();

      job.pendingImageCaptures.push(capturePromise);
    };

    if (typeof this.page.on === "function") {
      this.page.on("response", onResponse);
      job._cleanupResponseListener = () => {
        try {
          if (typeof this.page.off === "function")
            this.page.off("response", onResponse);
          else if (typeof this.page.removeListener === "function")
            this.page.removeListener("response", onResponse);
        } catch {}
      };
    }

    return captured;
  }

  findCapturedOutput(output, capturedResponses) {
    if (!output || !capturedResponses) return null;
    const exactUrl = output.sourceUrl;
    if (exactUrl && capturedResponses.has(exactUrl)) {
      return capturedResponses.get(exactUrl);
    }
    const rawSrc = output.rawSrc;
    if (rawSrc && capturedResponses.has(rawSrc)) {
      return capturedResponses.get(rawSrc);
    }
    return null;
  }

  async prepareJob(jobId) {
    const job = this.requireJob(jobId);

    if (!this.context || !this.page || this.page.isClosed()) {
      throw new Error(
        "Open a Google Flow browser session before preparing a job.",
      );
    }

    this.recoverActiveJobLock();

    if (this.activeJobId && this.activeJobId !== jobId) {
      const active = this.jobs.get(this.activeJobId);
      if (
        active &&
        !["completed", "cancelled", "failed"].includes(active.status)
      ) {
        const isActivelyWorking = [
          "generating",
          "output_detected",
          "downloading",
          "importing",
        ].includes(active.status);
        const ageSec = Math.round(
          (Date.now() -
            new Date(active.updatedAt || active.createdAt).getTime()) /
            1000,
        );

        // If previous job is not actively generating (e.g. idle or waiting) or if cancelPrevious is requested:
        if (job.cancelPrevious || !isActivelyWorking) {
          console.log(
            `[FlowBrowser] Automatically superseding inactive previous job ${active.id} (status: ${active.status}, ${ageSec}s old).`,
          );
          this.setJobTerminal(
            active,
            "cancelled",
            undefined,
            "Superseded by new generation request.",
          );
        } else {
          const err = new Error(
            `Another Flow job (${active.id}) is actively generating in the browser (status: ${active.status}, started ${ageSec}s ago). Complete or cancel it before starting another.`,
          );
          err.statusCode = 409;
          err.activeJob = {
            id: active.id,
            status: active.status,
            ageSeconds: ageSec,
          };
          throw err;
        }
      }
    }

    const currentUrl =
      typeof this.page.url === "function"
        ? this.page.url()
        : String(this.page.url || "");
    const currentProjectId = this.extractProjectId(currentUrl);
    const targetProjectId = this.extractProjectId(job.projectUrl);

    if (targetProjectId && currentProjectId === targetProjectId) {
      // Already on the requested Flow project page! Avoid reloading the SPA.
    } else if (job.projectUrl && currentUrl !== job.projectUrl) {
      await this.page.goto(job.projectUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
    } else if (!isFlowUrl(currentUrl) && !isGoogleLoginUrl(currentUrl)) {
      await this.page.goto(FLOW_HOME_URL, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
    }

    if (isGoogleLoginUrl(this.page.url())) {
      job.status = "awaiting_manual_login";
      job.message =
        "Sign in manually in the browser, open the intended Flow project, then call prepare again.";
      this.touch(job);
      return job;
    }

    if (!isFlowUrl(this.page.url())) {
      job.status = "awaiting_project_selection";
      job.message =
        "Open the intended Google Flow project in the visible browser, then call prepare again.";
      this.touch(job);
      return job;
    }

    this.activeJobId = job.id;

    try {
      const promptEditor = await this.findPromptEditor();
      if (typeof promptEditor.locator.click === "function") {
        await promptEditor.locator.click().catch(() => {});
      }
      try {
        if (typeof promptEditor.locator.fill === "function") {
          await promptEditor.locator.fill(job.prompt);
        }
      } catch {
        if (typeof promptEditor.locator.evaluate === "function") {
          await promptEditor.locator
            .evaluate((node, text) => {
              node.innerText = text;
              node.dispatchEvent(new Event("input", { bubbles: true }));
            }, job.prompt)
            .catch(() => {});
        }
      }
      job.promptSelectorUsed = promptEditor.selector;
      job.status = "prompt_ready";
      job.message =
        "Prompt filled. Review it in Flow and attach/select the saved @character reference before confirming generation.";
      job.error = undefined;
      this.touch(job);
      return job;
    } catch (error) {
      job.diagnosticScreenshotPath = await this.saveDiagnosticScreenshot(
        job.id,
      );
      this.setJobTerminal(
        job,
        "prompt_editor_not_found",
        error.message,
        "The Flow prompt editor could not be identified safely. Inspect the visible browser and configure FLOW_PROMPT_SELECTOR if needed.",
      );
      return job;
    }
  }

  async findPromptEditor() {
    if (!this.page || this.page.isClosed())
      throw new Error("Flow page is not available.");

    if (this.promptSelector) {
      const configured = this.page.locator(this.promptSelector);
      const count = await configured.count();
      if (
        count !== 1 ||
        !(await configured.isVisible()) ||
        !(await configured.isEnabled())
      ) {
        throw new Error(
          "FLOW_PROMPT_SELECTOR must identify exactly one visible and enabled prompt editor; found " +
            count +
            ".",
        );
      }
      return { locator: configured, selector: this.promptSelector };
    }

    const candidates = this.page.locator(
      'textarea, [contenteditable="true"], [role="textbox"]',
    );
    const scored = [];

    for (let index = 0; index < (await candidates.count()); index += 1) {
      const candidate = candidates.nth(index);
      if (!(await candidate.isVisible()) || !(await candidate.isEnabled()))
        continue;

      const placeholder = (await candidate.getAttribute("placeholder")) || "";
      const ariaLabel = (await candidate.getAttribute("aria-label")) || "";
      const dataPlaceholder =
        (await candidate.getAttribute("data-placeholder")) || "";
      const title = (await candidate.getAttribute("title")) || "";
      const name = (await candidate.getAttribute("name")) || "";
      const id = (await candidate.getAttribute("id")) || "";
      const className = (await candidate.getAttribute("class")) || "";
      const testId =
        (await candidate.getAttribute("data-testid")) ||
        (await candidate.getAttribute("data-test-id")) ||
        "";

      const label = [
        placeholder,
        ariaLabel,
        dataPlaceholder,
        title,
        name,
        id,
        className,
        testId,
      ]
        .join(" ")
        .toLowerCase();

      // Disqualify clearly unrelated inputs
      if (
        /search|filter|session|collection|comment|chat|login|email|password|username|tag|url/.test(
          label,
        )
      ) {
        continue;
      }

      let score = 0;
      // Exact Google Flow Agent prompt box match gets highest priority
      if (/what do you want to create/i.test(ariaLabel)) {
        score += 25;
      } else if (
        /prompt|describe|what.*to (see|generate|create)|enter.*prompt/.test(
          label,
        )
      ) {
        score += 10;
      } else if (/generate|image|create|scene|character|visual/.test(label)) {
        score += 5;
      }

      // Contenteditable bonus only if there is already prompt affinity
      if (
        score > 0 &&
        (await candidate.getAttribute("contenteditable")) === "true"
      ) {
        score += 1;
      }

      scored.push({
        locator: candidate,
        score,
        selector: "auto-detected visible text editor #" + index,
      });
    }

    if (scored.length === 0) {
      throw new Error(
        "No visible textarea or contenteditable textbox was found.",
      );
    }

    scored.sort((a, b) => b.score - a.score);

    // Requirement: Never accept a zero-score field
    if (scored[0].score <= 0) {
      throw new Error(
        "No confident prompt editor candidate was found (top candidate score is 0). Set FLOW_PROMPT_SELECTOR to a stable, unique selector.",
      );
    }

    // Requirement: If multiple candidates are ambiguous, stop instead of guessing
    if (scored.length > 1 && scored[0].score === scored[1].score) {
      throw new Error(
        "Multiple prompt-like fields are visible with ambiguous scores. Set FLOW_PROMPT_SELECTOR to a stable, unique selector.",
      );
    }

    return scored[0];
  }

  async submitAgentPrompt(job, confirmation) {
    if (
      !this.page ||
      (typeof this.page.isClosed === "function" && this.page.isClosed())
    ) {
      throw new Error("Flow page is not available.");
    }

    // 1. Verify correct Flow page
    if (typeof this.page.url === "function" && !isFlowUrl(this.page.url())) {
      throw new Error(
        `Current page is not a valid Google Flow URL: ${this.page.url()}`,
      );
    }

    // 2. Locate unique prompt textbox
    const promptLocator = this.page.locator(
      'flow-creative-agent-prompt-box [role="textbox"], flow-creative-agent-prompt-box div.ProseMirror, [role="textbox"][aria-label="What do you want to create?"]',
    );
    const count = await promptLocator.count().catch(() => 0);
    const promptEditor = getFirstLocator(promptLocator);

    if (
      count === 0 ||
      !promptEditor ||
      !(await promptEditor.isVisible().catch(() => false))
    ) {
      throw new Error(
        "Could not find visible 'What do you want to create?' prompt textbox in Google Flow Agent mode.",
      );
    }

    // 3. Fill the prompt into ProseMirror
    if (typeof promptEditor.click === "function") {
      await promptEditor.click().catch(() => {});
    }

    if (this.page.keyboard) {
      await this.page.keyboard.press("ControlOrMeta+A").catch(() => {});
      await this.page.keyboard.press("Backspace").catch(() => {});
    }

    try {
      if (typeof promptEditor.fill === "function") {
        await promptEditor.fill(job.prompt);
      }
    } catch {
      if (typeof promptEditor.evaluate === "function") {
        await promptEditor
          .evaluate((node, text) => {
            node.innerText = text;
            node.dispatchEvent(new Event("input", { bubbles: true }));
            node.dispatchEvent(new Event("change", { bubbles: true }));
          }, job.prompt)
          .catch(() => {});
      }
    }

    // 4. Verify text was entered
    let enteredText = "";
    if (typeof promptEditor.innerText === "function") {
      enteredText = await promptEditor.innerText().catch(() => "");
    }
    if (!enteredText.trim() && typeof promptEditor.textContent === "function") {
      enteredText = await promptEditor.textContent().catch(() => "");
    }
    if (
      !enteredText.trim() &&
      this.page.keyboard &&
      typeof this.page.keyboard.insertText === "function"
    ) {
      if (typeof promptEditor.click === "function")
        await promptEditor.click().catch(() => {});
      await this.page.keyboard.insertText(job.prompt).catch(() => {});
      if (typeof promptEditor.innerText === "function") {
        enteredText = await promptEditor.innerText().catch(() => "");
      }
    }

    job.status = "prompt_filled";
    job.message = "Prompt populated into Google Flow Agent box.";
    this.touch(job);

    // 5. Wait for Start generation button to become enabled
    const submitLocator = this.page.locator(
      'flow-creative-agent-prompt-box button[aria-label="Start generation"], flow-creative-agent-prompt-box button[type="submit"], button[aria-label="Start generation"]',
    );
    const btnCount = await submitLocator.count().catch(() => 0);
    const submitBtn = getFirstLocator(submitLocator);

    if (
      btnCount === 0 ||
      !submitBtn ||
      !(await submitBtn.isVisible().catch(() => false))
    ) {
      throw new Error(
        "Could not find visible 'Start generation' submit button in Google Flow Agent mode.",
      );
    }

    let isEnabled = false;
    const waitStart = Date.now();
    while (Date.now() - waitStart < 10000) {
      const disabledAttr =
        typeof submitBtn.getAttribute === "function"
          ? await submitBtn.getAttribute("disabled").catch(() => null)
          : null;
      const enabled =
        typeof submitBtn.isEnabled === "function"
          ? await submitBtn.isEnabled().catch(() => false)
          : true;
      const isNotDisabled =
        disabledAttr === null ||
        disabledAttr === false ||
        disabledAttr === "false";
      if (isNotDisabled && enabled) {
        isEnabled = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    if (!isEnabled) {
      throw new Error(
        "'Start generation' button remained disabled after populating the prompt.",
      );
    }

    // 6. Capture screenshot before submission
    job.preSubmitScreenshot = await this.saveDiagnosticScreenshot(
      `${job.id}-before-submit`,
    ).catch(() => null);

    // 7. Record asset baseline
    const baseline = await this.getOutputAssetBaseline();

    // 7b. Attach Job-Scoped Network Response Interceptor to capture generation image streams (WebP/PNG/JPEG)
    await this.startImageResponseCapture(job);

    // 8. Click Start generation
    try {
      if (typeof submitBtn.click === "function") {
        await submitBtn.click({ timeout: 15000 });
      }
      job.status = "agent_prompt_submitted";
      job.generationRequestedAt = new Date().toISOString();
      job.message = "Agent prompt submitted to Google Flow.";
      this.touch(job);
    } catch (btnErr) {
      this.setJobTerminal(
        job,
        "failed",
        btnErr.message,
        "Could not click 'Start generation' submit button.",
      );
      throw btnErr;
    }

    // 9. Capture screenshot after submission
    job.postSubmitScreenshot = await this.saveDiagnosticScreenshot(
      `${job.id}-after-submit`,
    ).catch(() => null);

    // 10. Observe Agent response & handle confirmation
    await new Promise((r) => setTimeout(r, 2000));
    const confirmationInfo = await this.inspectAgentConfirmation(job);

    if (confirmationInfo.required) {
      job.status = "awaiting_agent_confirmation";
      job.message =
        "Google Flow Agent requested confirmation before generating media.";
      this.touch(job);

      if (
        confirmation?.confirmGenerate === true &&
        confirmation?.referenceConfirmed === true
      ) {
        await this.handleAgentConfirmationAction(job);
        job.status = "generation_submitted";
        this.touch(job);
      } else {
        return job;
      }
    } else {
      job.status = "generation_submitted";
      this.touch(job);
    }

    // 11. Autonomous download monitoring
    this.monitorGenerationAndDownload(job.id, baseline).catch((err) => {
      console.warn(
        `[FlowBrowser] Generation monitor notice for job ${job.id}:`,
        err.message,
      );
    });

    return job;
  }

  async inspectAgentConfirmation(job) {
    if (
      !this.page ||
      (typeof this.page.isClosed === "function" && this.page.isClosed())
    ) {
      return { required: false, actionAvailable: false };
    }

    try {
      if (typeof this.page.locator !== "function")
        return { required: false, actionAvailable: false };

      const agentMessages = this.page.locator(
        'flow-creative-agent-message, [data-message-author="agent"], .agent-message',
      );
      const msgCount = await agentMessages.count().catch(() => 0);
      if (msgCount > 0) {
        const lastMsg = agentMessages.last();
        const confirmBtn = getFirstLocator(
          lastMsg.locator(
            'button:has-text("Generate"), button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Proceed")',
          ),
        );
        if (
          confirmBtn &&
          (await confirmBtn.count().catch(() => 0)) > 0 &&
          (await confirmBtn.isVisible().catch(() => false)) &&
          (await confirmBtn.isEnabled().catch(() => false))
        ) {
          return {
            required: true,
            actionAvailable: true,
            selector: 'button:has-text("Generate"), button:has-text("Confirm")',
            reason: "Agent requested explicit user confirmation to proceed.",
          };
        }
      }
      return { required: false, actionAvailable: false };
    } catch {
      return { required: false, actionAvailable: false };
    }
  }

  async detectAgentConfirmationRequired(job) {
    const info = await this.inspectAgentConfirmation(job);
    return info.required;
  }

  async handleAgentConfirmationAction(job) {
    if (
      !this.page ||
      (typeof this.page.isClosed === "function" && this.page.isClosed())
    )
      return;

    try {
      if (typeof this.page.locator !== "function") return;

      const agentMessages = this.page.locator(
        'flow-creative-agent-message, [data-message-author="agent"], .agent-message',
      );
      const msgCount = await agentMessages.count().catch(() => 0);
      if (msgCount > 0) {
        const lastMsg = agentMessages.last();
        const confirmBtn = getFirstLocator(
          lastMsg.locator(
            'button:has-text("Generate"), button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Proceed")',
          ),
        );
        if (
          confirmBtn &&
          (await confirmBtn.count().catch(() => 0)) > 0 &&
          (await confirmBtn.isVisible().catch(() => false)) &&
          (await confirmBtn.isEnabled().catch(() => false))
        ) {
          await confirmBtn.click({ timeout: 10000 });
          job.message = "Confirmed generation with Google Flow Agent.";
          return;
        }
      }

      const generalConfirmBtn = getFirstLocator(
        this.page.locator(
          'button:has-text("Confirm"), button:has-text("Generate Image")',
        ),
      );
      if (
        generalConfirmBtn &&
        (await generalConfirmBtn.count().catch(() => 0)) > 0 &&
        (await generalConfirmBtn.isVisible().catch(() => false)) &&
        (await generalConfirmBtn.isEnabled().catch(() => false))
      ) {
        await generalConfirmBtn.click({ timeout: 10000 });
        job.message = "Confirmed generation action.";
      }
    } catch (err) {
      console.warn(
        "[FlowBrowser] Agent confirmation action error:",
        err.message,
      );
    }
  }

  async attachFlowIngredients(job, referenceAssets) {
    if (!Array.isArray(referenceAssets) || referenceAssets.length === 0) {
      return true;
    }
    if (
      !this.page ||
      (typeof this.page.isClosed === "function" && this.page.isClosed())
    ) {
      throw new Error("Flow page is not available for ingredient attachment.");
    }

    try {
      if (typeof this.page.locator !== "function") return false;

      for (const asset of referenceAssets) {
        const cleanName = String(asset.flowCharacterName || asset.name || "")
          .replace(/^[-–—•*_#\s]+|[-–—•*_#:\s]+$/g, "")
          .trim();
        if (!cleanName) continue;

        const ingredientsBtn = getFirstLocator(
          this.page.locator(
            'button[aria-label="Add ingredients to the prompt box"], button[aria-label*="Add ingredients" i], flow-creative-agent-prompt-box button:has-text("+")',
          ),
        );

        if (
          ingredientsBtn &&
          (await ingredientsBtn.count().catch(() => 0)) > 0 &&
          (await ingredientsBtn.isVisible().catch(() => false))
        ) {
          await ingredientsBtn.click({ timeout: 5000 }).catch(() => {});
          await new Promise((r) => setTimeout(r, 600));

          if (asset.type === "character") {
            const charTab = getFirstLocator(
              this.page.locator(
                '[role="tab"]:has-text("Characters"), button:has-text("Characters")',
              ),
            );
            if (
              charTab &&
              (await charTab.count().catch(() => 0)) > 0 &&
              (await charTab.isVisible().catch(() => false))
            ) {
              await charTab.click({ timeout: 3000 }).catch(() => {});
              await new Promise((r) => setTimeout(r, 300));
            }
          } else if (asset.type === "image") {
            const imgTab = getFirstLocator(
              this.page.locator(
                '[role="tab"]:has-text("Images"), button:has-text("Images")',
              ),
            );
            if (
              imgTab &&
              (await imgTab.count().catch(() => 0)) > 0 &&
              (await imgTab.isVisible().catch(() => false))
            ) {
              await imgTab.click({ timeout: 3000 }).catch(() => {});
              await new Promise((r) => setTimeout(r, 300));
            }
          }

          const searchInput = getFirstLocator(
            this.page.locator(
              'input[placeholder*="Search" i], input[aria-label*="Search" i]',
            ),
          );
          if (
            searchInput &&
            (await searchInput.count().catch(() => 0)) > 0 &&
            (await searchInput.isVisible().catch(() => false))
          ) {
            await searchInput.fill(cleanName).catch(() => {});
            await new Promise((r) => setTimeout(r, 400));
          }

          const charItem = getFirstLocator(
            this.page.locator(
              `[role="option"]:has-text("${cleanName}"), button:has-text("${cleanName}"), .ingredient-item:has-text("${cleanName}"), mat-option:has-text("${cleanName}")`,
            ),
          );

          if (
            charItem &&
            (await charItem.count().catch(() => 0)) > 0 &&
            (await charItem.isVisible().catch(() => false))
          ) {
            await charItem.click({ timeout: 5000 }).catch(() => {});

            const addToPromptBtn = getFirstLocator(
              this.page.locator(
                'button:has-text("Add to prompt"), button[aria-label*="Add to prompt" i]',
              ),
            );
            if (
              addToPromptBtn &&
              (await addToPromptBtn.count().catch(() => 0)) > 0 &&
              (await addToPromptBtn.isVisible().catch(() => false))
            ) {
              await addToPromptBtn.click({ timeout: 5000 }).catch(() => {});
            }

            await new Promise((r) => setTimeout(r, 400));
          }
        }
      }

      job.referencesAttached = true;
      this.touch(job);
      return true;
    } catch {
      return false;
    }
  }

  async attachCharacterReference(characterName) {
    return await this.attachFlowIngredients({ id: "legacy-call" }, [
      {
        type: "character",
        name: characterName,
        flowCharacterName: characterName,
      },
    ]);
  }

  async requestGeneration(jobId, confirmation) {
    const job = this.requireJob(jobId);

    if (
      confirmation?.confirmGenerate !== true ||
      confirmation?.referenceConfirmed !== true
    ) {
      throw new Error(
        "Explicit confirmation is required: confirmGenerate=true and referenceConfirmed=true.",
      );
    }

    this.recoverActiveJobLock();

    if (
      !this.page ||
      (typeof this.page.isClosed === "function" && this.page.isClosed())
    )
      throw new Error("Flow page is not available.");

    const mode = await this.detectInterfaceMode();

    if (mode === "agent") {
      return await this.submitAgentPrompt(job, confirmation);
    }

    // Standard mode:
    let button;
    if (typeof this.page.locator === "function") {
      button = getFirstLocator(
        this.page.locator(
          'button:has-text("Generate Image"), button[aria-label="Generate Image"]',
        ),
      );
    } else if (typeof this.page.getByRole === "function") {
      button = this.page.getByRole("button", {
        name: "Generate Image",
        exact: true,
      });
    }

    const count = button ? await button.count().catch(() => 0) : 0;

    if (
      count !== 1 ||
      !(await button.isVisible().catch(() => false)) ||
      !(await button.isEnabled().catch(() => false))
    ) {
      job.status = "awaiting_manual_generate";
      job.message =
        "The visible Generate Image button was not uniquely identifiable or enabled. Review the prompt and click Generate Image manually in Flow; the worker is listening for the resulting image download.";
      this.touch(job);
      return job;
    }

    try {
      const baseline = await this.getOutputAssetBaseline();
      await button.click({ timeout: 15000 });
      job.status = "generation_submitted";
      job.generationRequestedAt = new Date().toISOString();
      job.message =
        "Generation was submitted through the visible Flow UI. When the result is ready, use Flow's normal Download action; the worker will capture and import the downloaded image.";

      this.monitorGenerationAndDownload(job.id, baseline).catch((err) => {
        console.warn(
          `[FlowBrowser] Generation monitor notice for job ${job.id}:`,
          err.message,
        );
      });
    } catch (clickError) {
      job.status = "awaiting_manual_generate";
      job.error =
        clickError instanceof Error
          ? clickError.message
          : "The Flow generation button could not be clicked.";
      job.message =
        "The visible Generate Image button could not be clicked reliably. Review the prepared prompt and start generation manually in Flow; the worker will still capture the subsequent download.";
    }
    this.touch(job);
    return job;
  }

  async monitorGenerationAndDownload(
    jobId,
    baseline = { count: 0, identifiers: new Set() },
  ) {
    const job = this.jobs.get(jobId);
    if (
      !job ||
      !this.page ||
      (typeof this.page.isClosed === "function" && this.page.isClosed())
    )
      return;

    try {
      job.status = "generating";
      job.message =
        "Generation in progress in Google Flow. Waiting for rendered output...";
      this.touch(job);

      const maxWaitMs = 90000;
      const startTime = Date.now();
      const pollIntervalMs = 1500;
      let targetOutput = null;

      while (Date.now() - startTime < maxWaitMs) {
        if (
          !this.page ||
          (typeof this.page.isClosed === "function" && this.page.isClosed()) ||
          job.status === "completed" ||
          job.status === "cancelled"
        ) {
          return;
        }

        const newOutputs = await this.collectNewAgentOutputs(job, baseline);
        if (newOutputs.length > 0) {
          if (newOutputs.length > 1) {
            const err = new Error(
              `OUTPUT_COUNT_MISMATCH: Expected exactly 1 generated image, received ${newOutputs.length}.`,
            );
            job.status = "failed";
            job.error = err.message;
            this.touch(job);
            throw err;
          }
          targetOutput = newOutputs[0];
          job.status = "output_detected";
          job.message = "New generation output tile identified in Google Flow.";
          this.touch(job);
          break;
        }

        await new Promise((r) => setTimeout(r, pollIntervalMs));
      }

      if (targetOutput) {
        job.status = "downloading";
        job.message = "Downloading new asset from Google Flow...";
        this.touch(job);

        let downloadedBuffer = null;
        let downloadedType = null;

        // Path A: Click image container to open full editor and trigger visible Download
        try {
          const tileEl = targetOutput.optionLocator;
          const openEditorBtn = getFirstLocator(
            tileEl.locator(
              'div.image-container[aria-label="Open image in editor"], div[role="button"][aria-label*="editor" i], div.image-container',
            ),
          );

          let editorOpened = false;
          if (
            openEditorBtn &&
            (await openEditorBtn.count().catch(() => 0)) > 0
          ) {
            await openEditorBtn.click({ timeout: 5000 }).catch(() => {});
            editorOpened = true;
          } else if (typeof tileEl.click === "function") {
            await tileEl.click({ timeout: 5000 }).catch(() => {});
            editorOpened = true;
          }

          if (editorOpened) {
            await new Promise((r) => setTimeout(r, 600));

            const downloadBtn = getFirstLocator(
              this.page.locator(
                'button[aria-label*="download" i], button[title*="download" i], button:has-text("Download"), [data-testid*="download" i]',
              ),
            );

            if (
              downloadBtn &&
              (await downloadBtn.count().catch(() => 0)) > 0 &&
              (await downloadBtn.isVisible().catch(() => false))
            ) {
              if (typeof this.page.waitForEvent === "function") {
                const [download] = await Promise.all([
                  this.page
                    .waitForEvent("download", { timeout: 12000 })
                    .catch(() => [null]),
                  downloadBtn.click({ timeout: 5000 }).catch(() => {}),
                ]);

                if (download && typeof download.saveAs === "function") {
                  const tempDir = path.join(this.profileDir, "..", "downloads");
                  await fs
                    .mkdir(tempDir, { recursive: true, mode: 0o700 })
                    .catch(() => {});
                  const tempFilePath = path.join(
                    tempDir,
                    `flow-temp-${job.id}-${Date.now()}.bin`,
                  );
                  await download.saveAs(tempFilePath);
                  const buf = await fs.readFile(tempFilePath).catch(() => null);
                  if (buf && buf.length > 500) {
                    const detected = detectImageType(buf);
                    if (detected) {
                      const finalPath = path.join(
                        tempDir,
                        `flow-${job.id}-${Date.now()}.${detected.extension}`,
                      );
                      await fs.rename(tempFilePath, finalPath).catch(() => {});
                      downloadedBuffer = buf;
                      downloadedType = detected;
                    }
                  }
                }
              }
            }

            // Close editor view
            const closeBtn = getFirstLocator(
              this.page.locator(
                'button[aria-label="Close"], button[aria-label="Back"], button:has-text("Close"), button:has-text("Back")',
              ),
            );
            if (
              closeBtn &&
              (await closeBtn.count().catch(() => 0)) > 0 &&
              (await closeBtn.isVisible().catch(() => false))
            ) {
              await closeBtn.click().catch(() => {});
            } else if (this.page.keyboard) {
              await this.page.keyboard.press("Escape").catch(() => {});
            }
          }
        } catch (uiDlErr) {
          console.warn(
            "[FlowBrowser] UI download attempt notice:",
            uiDlErr.message,
          );
        }

        // Path B: Fallback to exact Network Response Interceptor capture
        if (!downloadedBuffer && job.capturedImageResponses) {
          if (
            Array.isArray(job.pendingImageCaptures) &&
            job.pendingImageCaptures.length > 0
          ) {
            await Promise.all(job.pendingImageCaptures).catch(() => {});
          }

          const match = this.findCapturedOutput(
            targetOutput,
            job.capturedImageResponses,
          );
          if (match && match.buffer && match.buffer.length > 500) {
            downloadedBuffer = match.buffer;
            downloadedType = detectImageType(match.buffer);
          }
        }

        if (downloadedBuffer && downloadedType) {
          const dims = parseImageDimensions(downloadedBuffer);
          if (
            !Number.isInteger(dims.width) ||
            !Number.isInteger(dims.height) ||
            dims.width < 32 ||
            dims.height < 32
          ) {
            throw new Error(
              `Invalid image dimensions: ${dims.width}x${dims.height}`,
            );
          }

          job.status = "importing";
          this.touch(job);
          await this.importDownloadedAsset(
            job,
            downloadedBuffer,
            downloadedType,
          );
          return;
        }

        // If bytes were not captured, report OUTPUT_BYTES_NOT_CAPTURED safely without importing arbitrary images
        job.status = "awaiting_download";
        job.error =
          "OUTPUT_BYTES_NOT_CAPTURED: Generation output was detected, but image bytes could not be automatically acquired.";
        job.message =
          "Generation output detected in Google Flow. Use Flow's Download button to complete import.";
        this.touch(job);
        return;
      }

      if (job.status === "generating" || job.status === "output_detected") {
        job.status = "awaiting_download";
        job.message =
          "Generation was submitted. When the tile appears in Flow, click Download; the worker will automatically capture and import it.";
        this.touch(job);
      }
    } catch (monitorErr) {
      if (monitorErr.message?.includes("OUTPUT_COUNT_MISMATCH")) {
        throw monitorErr;
      }
      if (job.status === "generating" || job.status === "output_detected") {
        job.status = "awaiting_download";
        job.message =
          "Generation in progress. Worker listening for download event.";
        this.touch(job);
      }
    } finally {
      if (typeof job._cleanupResponseListener === "function") {
        job._cleanupResponseListener();
        delete job._cleanupResponseListener;
      }
    }
  }

  async inspectFlowPage() {
    if (
      !this.page ||
      (typeof this.page.isClosed === "function" && this.page.isClosed())
    ) {
      return {
        isOpen: false,
        message: "Browser session is not open.",
      };
    }

    const url = typeof this.page.url === "function" ? this.page.url() : "";
    const title =
      typeof this.page.title === "function"
        ? await this.page.title().catch(() => "")
        : "";

    let activeProjectId = null;
    const projectMatch = url.match(/\/project\/([a-f0-9-]+)/i);
    if (projectMatch) {
      activeProjectId = projectMatch[1];
    }

    const sessionStatus = await this.getSessionStatus();
    const googleAuthStatus =
      sessionStatus.googleAuth || sessionStatus.authenticationStatus;
    const interfaceMode = await this.detectInterfaceMode();

    const promptEditors = [];
    if (typeof this.page.locator === "function") {
      const editorCandidates = this.page.locator(
        'flow-creative-agent-prompt-box, [role="textbox"], div.ProseMirror, textarea',
      );
      const editorCount = await editorCandidates.count().catch(() => 0);
      for (let i = 0; i < Math.min(editorCount, 10); i++) {
        const el = editorCandidates.nth(i);
        if (await el.isVisible().catch(() => false)) {
          promptEditors.push({
            tagName:
              typeof el.evaluate === "function"
                ? await el
                    .evaluate((n) => n.tagName.toLowerCase())
                    .catch(() => "")
                : "",
            role:
              typeof el.getAttribute === "function"
                ? await el.getAttribute("role").catch(() => null)
                : null,
            ariaLabel:
              typeof el.getAttribute === "function"
                ? await el.getAttribute("aria-label").catch(() => null)
                : null,
            contentEditable:
              typeof el.getAttribute === "function"
                ? await el.getAttribute("contenteditable").catch(() => null)
                : null,
            className:
              typeof el.getAttribute === "function"
                ? await el.getAttribute("class").catch(() => null)
                : null,
            isEnabled:
              typeof el.isEnabled === "function"
                ? await el.isEnabled().catch(() => false)
                : true,
            textPreview:
              typeof el.innerText === "function"
                ? (await el.innerText().catch(() => "")).slice(0, 100)
                : "",
          });
        }
      }
    }

    const buttons = [];
    if (typeof this.page.locator === "function") {
      const btnCandidates = this.page.locator('button, [role="button"]');
      const btnCount = await btnCandidates.count().catch(() => 0);
      for (let i = 0; i < Math.min(btnCount, 25); i++) {
        const btn = btnCandidates.nth(i);
        if (await btn.isVisible().catch(() => false)) {
          const text =
            typeof btn.innerText === "function"
              ? (await btn.innerText().catch(() => "")).trim()
              : "";
          const ariaLabel =
            typeof btn.getAttribute === "function"
              ? await btn.getAttribute("aria-label").catch(() => null)
              : null;
          const isEnabled =
            typeof btn.isEnabled === "function"
              ? await btn.isEnabled().catch(() => false)
              : true;
          const type =
            typeof btn.getAttribute === "function"
              ? await btn.getAttribute("type").catch(() => null)
              : null;
          buttons.push({ text: text.slice(0, 50), ariaLabel, isEnabled, type });
        }
      }
    }

    const frames =
      typeof this.page.frames === "function" ? this.page.frames() : [];
    const relevantIframeUrls = frames
      .map((f) => (typeof f.url === "function" ? f.url() : ""))
      .filter(
        (u) => u && u !== "about:blank" && !u.startsWith("chrome-extension://"),
      );

    const agentMessages = [];
    if (typeof this.page.locator === "function") {
      const msgElements = this.page.locator(
        'flow-creative-agent-message, [data-message-author="agent"], .agent-message',
      );
      const msgCount = await msgElements.count().catch(() => 0);
      for (let i = Math.max(0, msgCount - 5); i < msgCount; i++) {
        const msg = msgElements.nth(i);
        const text =
          typeof msg.innerText === "function"
            ? (await msg.innerText().catch(() => "")).trim()
            : "";
        if (text) agentMessages.push(text.slice(0, 200));
      }
    }

    const indicators =
      typeof this.page.locator === "function"
        ? this.page.locator(
            '[role="progressbar"], .generating, .loading-spinner, [aria-label*="generating" i], [aria-label*="loading" i]',
          )
        : null;
    const hasActiveGeneration = indicators
      ? (await indicators.count().catch(() => 0)) > 0
      : false;

    const timestamp = Date.now();
    const diagDir = path.resolve(this.profileDir, "..", "diagnostics");
    await fs.mkdir(diagDir, { recursive: true, mode: 0o700 }).catch(() => {});

    const screenshotPath = path.join(diagDir, `inspect-${timestamp}.png`);
    if (typeof this.page.screenshot === "function") {
      await this.page
        .screenshot({ path: screenshotPath, fullPage: false })
        .catch(() => {});
    }

    const domSnapshotPath = path.join(diagDir, `inspect-${timestamp}.html`);
    if (typeof this.page.content === "function") {
      const rawHtml = await this.page.content().catch(() => "");
      const sanitizedHtml = rawHtml
        .replace(
          /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
          "<!-- script removed -->",
        )
        .replace(
          /data:image\/[^;]+;base64,[^"']+/g,
          "data:image/...[truncated]",
        );
      await fs
        .writeFile(domSnapshotPath, sanitizedHtml, {
          mode: 0o600,
          encoding: "utf8",
        })
        .catch(() => {});
    }

    return {
      isOpen: true,
      url,
      title,
      activeProjectId,
      googleAuthStatus,
      interfaceMode,
      promptEditors,
      buttons,
      relevantIframeUrls,
      agentMessages,
      activeGenerationIndicators: hasActiveGeneration,
      diagnostics: {
        screenshotPath,
        domSnapshotPath,
        timestamp,
      },
    };
  }

  async synchronizeCharacter(input) {
    const characterId = String(input.characterId || "").trim();
    const characterName = String(input.characterName || "").trim();
    const description = String(input.description || "").trim();
    const referenceImagePath = input.referenceImagePath || null;
    const projectUrl = input.projectUrl
      ? assertAllowedFlowUrl(input.projectUrl)
      : undefined;

    if (!characterId) throw new Error("characterId is required.");
    if (!characterName) throw new Error("characterName is required.");

    if (
      !this.context ||
      !this.page ||
      (typeof this.page.isClosed === "function" && this.page.isClosed())
    ) {
      throw new Error(
        "Open a Google Flow browser session before synchronizing a character.",
      );
    }

    if (
      projectUrl &&
      typeof this.page.url === "function" &&
      this.page.url() !== projectUrl
    ) {
      if (typeof this.page.goto === "function") {
        await this.page.goto(projectUrl, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });
      }
    }

    const currentUrl =
      typeof this.page.url === "function" ? this.page.url() : "";
    if (isGoogleLoginUrl(currentUrl)) {
      return {
        success: false,
        status: "awaiting_manual_login",
        message:
          "Sign in manually in the visible browser before synchronizing characters.",
      };
    }

    if (!isFlowUrl(currentUrl)) {
      return {
        success: false,
        status: "awaiting_project_selection",
        message:
          "Open the intended Google Flow project before synchronizing characters.",
      };
    }

    // Check if character already exists in project
    try {
      if (typeof this.page.locator === "function") {
        const existingLocator = this.page.locator(
          `text="@${characterName}", text="${characterName}"`,
        );
        if ((await existingLocator.count()) > 0) {
          return {
            success: true,
            status: "synced",
            alreadyExists: true,
            flowCharacterName: characterName,
            message: `Character "${characterName}" already exists in the Google Flow project.`,
          };
        }
      }
    } catch {}

    // Navigate to Characters section if available
    try {
      if (typeof this.page.getByRole === "function") {
        const charTab = getFirstLocator(
          this.page
            .getByRole("tab", { name: /character/i })
            .or(this.page.getByRole("button", { name: /character/i }))
            .or(
              this.page.locator(
                '[data-testid*="character" i], [aria-label*="character" i]',
              ),
            ),
        );
        if (
          charTab &&
          (await charTab.count().catch(() => 0)) > 0 &&
          (await charTab.isVisible().catch(() => false))
        ) {
          await charTab.click({ timeout: 5000 });
        }
      }
    } catch {}

    // Click New Character / Add Character if available
    try {
      if (typeof this.page.getByRole === "function") {
        const newBtn = getFirstLocator(
          this.page
            .getByRole("button", { name: /(new|create|add).*character/i })
            .or(
              this.page.locator(
                'button:has-text("New Character"), button:has-text("Add Character")',
              ),
            ),
        );
        if (
          newBtn &&
          (await newBtn.count().catch(() => 0)) > 0 &&
          (await newBtn.isVisible().catch(() => false))
        ) {
          await newBtn.click({ timeout: 5000 });
        }
      }
    } catch {}

    // Fill character name if input field exists
    try {
      if (typeof this.page.getByRole === "function") {
        const nameInput = getFirstLocator(
          this.page
            .getByRole("textbox", { name: /(name|character name)/i })
            .or(
              this.page.locator(
                'input[placeholder*="name" i], input[aria-label*="name" i]',
              ),
            ),
        );
        if (
          nameInput &&
          (await nameInput.count().catch(() => 0)) > 0 &&
          (await nameInput.isVisible().catch(() => false))
        ) {
          await nameInput.fill(characterName);
        }
      }
    } catch {}

    // Upload master reference image if path provided
    if (referenceImagePath) {
      try {
        if (typeof this.page.locator === "function") {
          const fileInput = getFirstLocator(
            this.page.locator('input[type="file"]'),
          );
          if (fileInput && (await fileInput.count().catch(() => 0)) > 0) {
            await fileInput.setInputFiles(referenceImagePath);
          }
        }
      } catch (uploadErr) {
        console.warn(
          "[FlowBrowserWorker] Reference image input failed:",
          uploadErr.message,
        );
      }
    }

    // Click Create / Save button if available
    try {
      if (typeof this.page.getByRole === "function") {
        const saveBtn = getFirstLocator(
          this.page.getByRole("button", {
            name: /(create|save|confirm|done)/i,
          }),
        );
        if (
          saveBtn &&
          (await saveBtn.count().catch(() => 0)) > 0 &&
          (await saveBtn.isVisible().catch(() => false))
        ) {
          await saveBtn.click({ timeout: 5000 });
        }
      }
    } catch {}

    return {
      success: true,
      status: "synced",
      flowCharacterName: characterName,
      message: `Character "${characterName}" synchronized with Google Flow project.`,
    };
  }

  async handleDownload(download, originatingPage) {
    const page =
      originatingPage && typeof originatingPage.url === "function"
        ? originatingPage
        : typeof download?.page === "function"
          ? download.page()
          : null;

    if (page && !isValidFlowDownloadSource(page, this.page, this.context)) {
      // Ignore downloads from unrelated tabs, non-Flow pages, or closed sessions
      return;
    }

    if (this.downloadInProgress || !this.activeJobId) return;

    const job = this.jobs.get(this.activeJobId);
    if (
      !job ||
      ![
        "generating",
        "output_detected",
        "downloading",
        "awaiting_download",
        "awaiting_manual_generate",
      ].includes(job.status)
    )
      return;

    this.downloadInProgress = true;

    try {
      await fs.mkdir(this.downloadDir, { recursive: true });

      const suggested = safeFilename(
        download.suggestedFilename(),
        "flow-image",
      );
      const temporaryPath = path.join(
        this.downloadDir,
        job.id + "-" + suggested,
      );
      await download.saveAs(temporaryPath);

      const buffer = await fs.readFile(temporaryPath);
      if (buffer.length > MAX_IMAGE_BYTES) {
        await fs.rm(temporaryPath, { force: true });
        throw new Error(
          "Downloaded image exceeds the 25 MB worker safety limit.",
        );
      }

      const imageType = detectImageType(buffer);
      if (!imageType) {
        await fs.rm(temporaryPath, { force: true });
        job.message =
          "A download was detected, but it was not a supported PNG, JPEG, or WebP image. Download the generated image asset from Flow, not a project archive.";
        this.touch(job);
        return;
      }

      const { width, height } = parseImageDimensions(buffer);
      if ((width > 0 && width < 32) || (height > 0 && height < 32)) {
        await fs.rm(temporaryPath, { force: true });
        job.message = `Downloaded image is a placeholder or corrupted (${width}x${height}px). Ensure you download the full generated image from Flow.`;
        this.touch(job);
        return;
      }

      const finalPath = path.join(
        this.downloadDir,
        job.id + "." + imageType.extension,
      );
      if (temporaryPath !== finalPath) {
        await fs.rename(temporaryPath, finalPath);
      }

      job.downloadPath = finalPath;
      job.status = "importing";
      job.message =
        "Image downloaded and validated. Importing it into the selected character.";
      this.touch(job);

      await this.importDownloadedAsset(job, buffer, imageType);
    } catch (error) {
      if (job.importResult) {
        // The image file was already uploaded to backend storage, but metadata registration failed
        job.status = "import_metadata_failed";
        job.error = error.message;
        job.message =
          "The file exists in backend storage. Retry metadata registration instead of downloading the image again.";
      } else {
        this.setJobTerminal(
          job,
          "failed",
          error.message,
          "The image download or import failed. Inspect the job error before retrying.",
        );
      }
      this.touch(job);
    } finally {
      this.downloadInProgress = false;
    }
  }

  async importDownloadedAsset(job, buffer, imageType) {
    if (!job.importResult) {
      const dataUri =
        "data:" + imageType.mimeType + ";base64," + buffer.toString("base64");

      const dims = parseImageDimensions(buffer);
      if (
        (Number.isInteger(dims.width) && dims.width > 0 && dims.width < 32) ||
        (Number.isInteger(dims.height) && dims.height > 0 && dims.height < 32)
      ) {
        throw new Error(
          `Invalid image dimensions: ${dims.width}x${dims.height}`,
        );
      }

      if (job.targetType === "background" || job.sceneId) {
        let bgResponse;
        try {
          bgResponse = await fetch(
            this.backendUrl + "/api/background-studio/import-flow",
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                sceneId: job.sceneId,
                storyId: job.storyId,
                imageBufferOrBase64: dataUri,
                aspectRatio: job.aspectRatio || "16:9",
                filename:
                  "flow-bg-" +
                  (job.sceneId || job.id) +
                  "." +
                  imageType.extension,
                notes:
                  "Imported from Google Flow via Playwright loopback worker",
                prompt: job.prompt,
                generationJobId: job.id,
                flowProjectId: job.flowProjectId,
                provider: "google_flow",
                ...(job.model ? { model: job.model } : {}),
                mimeType: imageType.mimeType,
                width: dims.width,
                height: dims.height,
              }),
            },
          );
        } catch (uploadErr) {
          throw new Error(
            "Backend file upload network error: " +
              (uploadErr instanceof Error
                ? uploadErr.message
                : String(uploadErr)),
          );
        }

        const bgPayload = await bgResponse.json().catch(() => ({}));
        if (!bgResponse.ok || bgPayload.success !== true || !bgPayload.asset) {
          throw new Error(
            "Backend background import failed with HTTP " +
              bgResponse.status +
              ".",
          );
        }

        job.importResult = bgPayload.asset;
        job.detectedMimeType = imageType.mimeType;
        this.setJobTerminal(
          job,
          "completed",
          undefined,
          "Background image downloaded and applied to scene successfully.",
        );
        return;
      }

      const characterPath =
        "/api/character-studio/characters/" +
        encodeURIComponent(job.characterId) +
        "/import-flow";

      let importResponse;
      try {
        importResponse = await fetch(this.backendUrl + characterPath, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            characterName: job.characterName,
            assetType: job.assetType,
            imageBufferOrBase64: dataUri,
            filename:
              "flow-" + job.view + "-" + job.id + "." + imageType.extension,
            notes:
              "Imported from Google Flow through the local Playwright worker.",
            prompt: job.prompt,
            storyId: job.storyId,
            generationJobId: job.id,
            flowProjectId: job.flowProjectId,
            provider: "google_flow",
            ...(job.model ? { model: job.model } : {}),
            mimeType: imageType.mimeType,
            width: dims.width,
            height: dims.height,
          }),
        });
      } catch (uploadErr) {
        throw new Error(
          "Backend file upload network error: " +
            (uploadErr instanceof Error
              ? uploadErr.message
              : String(uploadErr)),
        );
      }

      const importPayload = await importResponse.json().catch(() => ({}));
      if (
        !importResponse.ok ||
        importPayload.success !== true ||
        !importPayload.result
      ) {
        throw new Error(
          "Backend file import failed with HTTP " + importResponse.status + ".",
        );
      }

      job.importResult = importPayload.result;
      job.detectedMimeType = imageType.mimeType;
      this.touch(job);
    }

    await this.persistAssetMetadata(job);
  }

  async persistAssetMetadata(job) {
    if (job.targetType === "background" || job.sceneId) {
      this.setJobTerminal(
        job,
        "completed",
        undefined,
        "Background asset import and registration completed successfully.",
      );
      return;
    }

    if (!job.importResult)
      throw new Error("There is no imported file result to register.");

    const result = job.importResult;
    const assetPath =
      "/api/character-studio/characters/" +
      encodeURIComponent(job.characterId) +
      "/assets";

    try {
      const assetResponse = await fetch(this.backendUrl + assetPath, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: result.assetId,
          assetType: job.assetType,
          direction: job.view,
          prompt: job.prompt,
          provider: "google_flow",
          model: "google_flow_ui",
          url: result.url,
          storagePath: result.storagePath,
          isMasterReference: job.isMasterReference,
          createdAt: new Date().toISOString(),
        }),
      });

      const assetPayload = await assetResponse.json().catch(() => ({}));
      if (!assetResponse.ok || assetPayload.success !== true) {
        job.status = "import_metadata_failed";
        job.error =
          "The image file was saved, but character metadata registration failed with HTTP " +
          assetResponse.status +
          ".";
        job.message =
          "The file exists in backend storage. Retry metadata registration instead of downloading the image again.";
        this.touch(job);
        return job;
      }

      job.asset = assetPayload.asset || result;
      this.setJobTerminal(
        job,
        "completed",
        undefined,
        "Google Flow image imported and registered against the character.",
      );
      return job;
    } catch (networkOrParseError) {
      job.status = "import_metadata_failed";
      job.error =
        "The image file was saved, but character metadata registration network request failed: " +
        (networkOrParseError instanceof Error
          ? networkOrParseError.message
          : String(networkOrParseError));
      job.message =
        "The file exists in backend storage. Retry metadata registration instead of downloading the image again.";
      this.touch(job);
      return job;
    }
  }

  async retryMetadataImport(jobId) {
    const job = this.requireJob(jobId);
    if (!job.importResult) {
      throw new Error(
        "This job has no pending metadata registration to retry (no uploaded image found).",
      );
    }

    if (
      job.status !== "import_metadata_failed" &&
      job.status !== "failed" &&
      job.status !== "completed"
    ) {
      throw new Error(
        "This job has no pending metadata registration to retry. Current status: " +
          job.status,
      );
    }

    return this.persistAssetMetadata(job);
  }

  async cancelJob(jobId) {
    const job = this.requireJob(jobId);
    this.setJobTerminal(
      job,
      "cancelled",
      undefined,
      "Job cancelled. Any already generated Flow media remains in the Google Flow project.",
    );
    return job;
  }

  async saveDiagnosticScreenshot(jobId) {
    if (!this.page || this.page.isClosed()) return undefined;

    try {
      await fs.mkdir(this.downloadDir, { recursive: true });
      const screenshotPath = path.join(
        this.downloadDir,
        "diagnostic-" + jobId + ".png",
      );
      await this.page.screenshot({ path: screenshotPath, fullPage: false });
      return screenshotPath;
    } catch {
      return undefined;
    }
  }

  requireJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error("Flow job not found: " + jobId);
    return job;
  }

  touch(job) {
    job.updatedAt = new Date().toISOString();
  }

  getJob(jobId) {
    return this.requireJob(jobId);
  }

  listJobs() {
    return Array.from(this.jobs.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }
}
