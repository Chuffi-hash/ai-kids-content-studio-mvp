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
import { detectImageType, safeFilename } from "./image-validation.mjs";

const VALID_ASSET_TYPES = new Set([
  "main",
  "turnaround",
  "expression",
  "pose",
  "custom",
]);
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

function defaultDataDirectory(name) {
  return path.join(os.homedir(), ".ai-kids-content-studio", name);
}

export function getDefaultFlowProfileDir() {
  if (process.env.FLOW_PROFILE_DIR && process.env.FLOW_PROFILE_DIR.trim()) {
    return path.resolve(process.env.FLOW_PROFILE_DIR.trim());
  }
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    return path.join(localAppData, "AIKidsContentStudio", "GoogleFlowChromeProfile");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "AIKidsContentStudio", "GoogleFlowChromeProfile");
  }
  return path.join(
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
    "ai-kids-content-studio",
    "GoogleFlowChromeProfile"
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
  if (context && typeof page.context === "function" && page.context() !== context) {
    return false;
  }
  if (!activePage || (typeof activePage.isClosed === "function" && activePage.isClosed())) {
    return false;
  }
  if (page !== activePage) {
    return false;
  }
  try {
    const url = typeof page.url === "function" ? page.url() : String(page.url || "");
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
      const currentChannel = this.browserChannel === "chrome" ? "chrome" : "bundled-chromium";
      const requestedChannel = config.browserChannel
        ? (config.browserChannel === "chrome" ? "chrome" : "bundled-chromium")
        : currentChannel;
      const currentProfile = path.resolve(this.profileDir);
      const requestedProfile = config.profileDir ? path.resolve(config.profileDir) : currentProfile;

      if (requestedChannel !== currentChannel || requestedProfile !== currentProfile) {
        const error = new Error(
          "Cannot change browser channel or profile directory while browser session is running. Please close the active browser window first."
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
        const error = new Error(`Unsupported browser channel "${chan}". Only "chrome" and "bundled-chromium" are supported.`);
        error.statusCode = 400;
        throw error;
      }
    }

    if (config.profileDir && typeof config.profileDir === "string" && config.profileDir.trim()) {
      this.profileDir = path.resolve(config.profileDir.trim());
    }

    return {
      success: true,
      browserChannel: this.browserChannel === "chrome" ? "chrome" : "bundled-chromium",
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
            `Google Flow profile is locked by another running browser process (${this.profileDir}). Close any active Chrome windows using this profile and try again.`
          );
        }
        if (msg.includes("Executable doesn't exist") || msg.includes("Cannot find chrome")) {
          throw new Error(
            `Selected browser channel "${this.browserChannel}" was not found on this machine. Switch to bundled Chromium or install Google Chrome.`
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

    if (!this.page || (typeof this.page.isClosed === "function" && this.page.isClosed())) {
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

    const currentUrl = typeof this.page.url === "function" ? this.page.url() : String(this.page.url || "");
    const signinBlocked = isGoogleSigninRejected(currentUrl);
    const loginUrl = isGoogleLoginUrl(currentUrl);
    const flowPage = isFlowUrl(currentUrl);
    const projectSelected = Boolean(flowPage && currentUrl.match(/\/project\/[a-zA-Z0-9\-_]+/i));

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
      message = "Google sign-in was rejected by Google (accounts.google.com/v3/signin/rejected). Please complete sign-in in your standard browser or review network/proxy configuration.";
    } else if (loginUrl) {
      manualLoginRequired = true;
      googleAuthenticated = false;
      googleSigninBlocked = false;
      authenticationStatus = "login_required";
      state = "manual_login_required";
      message = "Sign in manually in the visible browser. The worker does not handle passwords, MFA, or CAPTCHA.";
    } else if (flowPage) {
      state = "flow_page_open";
      try {
        let domStatus = "unknown";
        if (typeof this.page.evaluate === "function") {
          domStatus = await this.page.evaluate(() => {
            const doc = document;
            if (!doc) return "unknown";

            const signInEl = doc.querySelector(
              'a[href*="accounts.google.com"], button[data-action="sign-in"], a[data-action="sign-in"], [aria-label*="Sign in" i]'
            );

            const accountEl = doc.querySelector(
              'a[href*="SignOutOptions"], [aria-label*="Google Account" i], img[src*="googleusercontent.com"], [data-email]'
            );

            const workspaceEl = doc.querySelector(
              '[data-testid="project-workspace"], textarea, [contenteditable="true"], button[aria-label*="Generate" i]'
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
          message = "Authentication status unknown. Confirm your login in the visible browser.";
        }
      } catch {
        googleAuthenticated = false;
        authenticationStatus = "unknown";
        message = "Authentication status unknown. Confirm your login in the visible browser.";
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
      !googleSigninBlocked
    );

    const diagnostics = {
      browserChannel,
      configuredProfileDir,
      profileDirExists,
      ownsActiveBrowser: true,
      googleSigninRequired: manualLoginRequired || authenticationStatus === "login_required",
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
      canGenerateJob: Boolean(canPrepareJob && this.activeJob?.status === "prompt_ready"),
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
    if (this.profileDir !== defaultDir && !this.profileDir.includes("GoogleFlowChromeProfile")) {
      throw new Error("Refusing to reset profile: path is not a dedicated Google Flow profile.");
    }
    try {
      await fs.rm(this.profileDir, { recursive: true, force: true });
      await fs.mkdir(this.profileDir, { recursive: true, mode: 0o700 });
      return { success: true, message: "Dedicated Google Flow browser profile reset successfully." };
    } catch (err) {
      throw new Error(`Failed to reset profile directory: ${err.message}`);
    }
  }

  createJob(input) {
    const targetType = input.targetType || (input.sceneId ? "background" : "character");

    if (targetType === "background") {
      const sceneId = String(input.sceneId || "").trim();
      const storyId = String(input.storyId || "").trim();
      if (!sceneId) throw new Error("sceneId is required for background jobs.");

      const projectUrl = input.projectUrl
        ? assertAllowedFlowUrl(input.projectUrl)
        : undefined;
      const prompt = String(input.prompt || "").trim();
      if (!prompt) throw new Error("A non-empty prompt is required for background jobs.");

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

  async prepareJob(jobId) {
    const job = this.requireJob(jobId);

    if (!this.context || !this.page || this.page.isClosed()) {
      throw new Error(
        "Open a Google Flow browser session before preparing a job.",
      );
    }

    if (this.activeJobId && this.activeJobId !== jobId) {
      const active = this.jobs.get(this.activeJobId);
      if (
        active &&
        !["completed", "cancelled", "failed"].includes(active.status)
      ) {
        throw new Error(
          "Another Flow job is active. Complete or cancel it before starting another.",
        );
      }
    }

    if (job.projectUrl && this.page.url() !== job.projectUrl) {
      await this.page.goto(job.projectUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
    } else if (
      !isFlowUrl(this.page.url()) &&
      !isGoogleLoginUrl(this.page.url())
    ) {
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
      await promptEditor.locator.fill(job.prompt);
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
      job.status = "prompt_editor_not_found";
      job.error = error.message;
      job.message =
        "The Flow prompt editor could not be identified safely. Inspect the visible browser and configure FLOW_PROMPT_SELECTOR if needed.";
      this.touch(job);
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
      const testId =
        (await candidate.getAttribute("data-testid")) ||
        (await candidate.getAttribute("data-test-id")) ||
        "";

      const label = [placeholder, ariaLabel, dataPlaceholder, title, name, id, testId]
        .join(" ")
        .toLowerCase();

      // Disqualify clearly unrelated inputs
      if (/search|filter|session|collection|comment|chat|login|email|password|username|tag|url/.test(label)) {
        continue;
      }

      let score = 0;
      // High-confidence prompt indicators
      if (/prompt|describe|what.*to (see|generate|create)|enter.*prompt/.test(label)) {
        score += 10;
      } else if (/generate|image|create|scene|character|visual/.test(label)) {
        score += 5;
      }

      // Contenteditable bonus only if there is already prompt affinity
      if (score > 0 && (await candidate.getAttribute("contenteditable")) === "true") {
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

    if (
      job.status !== "prompt_ready" &&
      job.status !== "awaiting_manual_generate"
    ) {
      throw new Error(
        "The job must be prepared before generation can be requested. Current status: " +
          job.status,
      );
    }

    if (!this.page || this.page.isClosed())
      throw new Error("Flow page is not available.");

    // Generation can consume the user's Google Flow allowance. Only attempt the documented,
    // visible Generate Image button after the caller has explicitly confirmed.
    const button = this.page.getByRole("button", {
      name: "Generate Image",
      exact: true,
    });
    const count = await button.count();

    if (
      count !== 1 ||
      !(await button.isVisible()) ||
      !(await button.isEnabled())
    ) {
      job.status = "awaiting_manual_generate";
      job.message =
        "The exact visible Generate Image button was not uniquely identifiable. Review the prompt and click Generate Image manually in Flow; the worker is listening for the resulting image download.";
      this.touch(job);
      return job;
    }

    try {
      await button.click({ timeout: 15000 });
      job.status = "awaiting_download";
      job.generationRequestedAt = new Date().toISOString();
      job.message =
        "Generation was submitted through the visible Flow UI. When the result is ready, use Flow's normal Download action; the worker will capture and import the downloaded image.";
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

  async handleDownload(download, originatingPage) {
    const page =
      originatingPage ||
      (typeof download?.page === "function" ? download.page() : null);

    if (!isValidFlowDownloadSource(page, this.page, this.context)) {
      // Ignore downloads from unrelated tabs, non-Flow pages, or closed sessions
      return;
    }

    if (this.downloadInProgress || !this.activeJobId) return;

    const job = this.jobs.get(this.activeJobId);
    if (
      !job ||
      !["awaiting_download", "awaiting_manual_generate"].includes(job.status)
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
        job.status = "failed";
        job.error = error.message;
        job.message =
          "The image download or import failed. Inspect the job error before retrying.";
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

      if (job.targetType === "background" || job.sceneId) {
        let bgResponse;
        try {
          bgResponse = await fetch(this.backendUrl + "/api/background-studio/import-flow", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              sceneId: job.sceneId,
              storyId: job.storyId,
              imageBufferOrBase64: dataUri,
              aspectRatio: job.aspectRatio || "16:9",
              filename: "flow-bg-" + (job.sceneId || job.id) + "." + imageType.extension,
              notes: "Imported from Google Flow via Playwright loopback worker",
              prompt: job.prompt,
            }),
          });
        } catch (uploadErr) {
          throw new Error(
            "Backend file upload network error: " +
              (uploadErr instanceof Error ? uploadErr.message : String(uploadErr)),
          );
        }

        const bgPayload = await bgResponse.json().catch(() => ({}));
        if (!bgResponse.ok || bgPayload.success !== true || !bgPayload.asset) {
          throw new Error("Backend background import failed with HTTP " + bgResponse.status + ".");
        }

        job.importResult = bgPayload.asset;
        job.detectedMimeType = imageType.mimeType;
        job.status = "completed";
        job.message = "Background image downloaded and applied to scene successfully.";
        this.touch(job);
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
          }),
        });
      } catch (uploadErr) {
        throw new Error(
          "Backend file upload network error: " +
            (uploadErr instanceof Error ? uploadErr.message : String(uploadErr)),
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
      job.status = "completed";
      job.message = "Background asset import and registration completed successfully.";
      this.touch(job);
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

      job.status = "completed";
      job.asset = assetPayload.asset || result;
      job.completedAt = new Date().toISOString();
      job.message =
        "Google Flow image imported and registered against the character.";
      job.error = undefined;
      this.touch(job);
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
    job.status = "cancelled";
    job.message =
      "Job cancelled. Any already generated Flow media remains in the Google Flow project.";
    if (this.activeJobId === jobId) this.activeJobId = null;
    this.touch(job);
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
