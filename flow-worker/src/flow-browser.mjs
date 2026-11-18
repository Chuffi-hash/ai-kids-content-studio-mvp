import { chromium } from "playwright";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  assertAllowedFlowUrl,
  buildCharacterViewPrompt,
  FLOW_HOME_URL,
  CHARACTER_VIEW_LABELS
} from "./prompts.mjs";
import { detectImageType, safeFilename } from "./image-validation.mjs";

const VALID_ASSET_TYPES = new Set(["main", "turnaround", "expression", "pose", "custom"]);
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

function defaultDataDirectory(name) {
  return path.join(os.homedir(), ".ai-kids-content-studio", name);
}

function isGoogleLoginUrl(value) {
  try {
    return new URL(value).hostname === "accounts.google.com";
  } catch {
    return false;
  }
}

function isFlowUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" &&
      (parsed.hostname === "labs.google" || parsed.hostname === "flow.google.com");
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
    this.profileDir = path.resolve(
      process.env.FLOW_PROFILE_DIR || defaultDataDirectory("google-flow-profile")
    );
    this.downloadDir = path.resolve(
      process.env.FLOW_DOWNLOAD_DIR || defaultDataDirectory("flow-downloads")
    );
    this.backendUrl = (process.env.FLOW_BACKEND_URL || "http://127.0.0.1:5001").replace(/\/$/, "");
    this.browserChannel = process.env.FLOW_BROWSER_CHANNEL || "";
    this.promptSelector = process.env.FLOW_PROMPT_SELECTOR || "";
    this.downloadInProgress = false;
  }

  async launch(projectUrl) {
    if (!this.context) {
      await fs.mkdir(this.profileDir, { recursive: true });
      await fs.mkdir(this.downloadDir, { recursive: true });

      const options = {
        headless: false,
        acceptDownloads: true,
        viewport: null,
        args: ["--start-maximized"]
      };

      if (this.browserChannel) options.channel = this.browserChannel;

      this.context = await chromium.launchPersistentContext(this.profileDir, options);
      this.context.on("page", (page) => this.attachPage(page));

      const pages = this.context.pages();
      this.page = pages[0] || await this.context.newPage();
      this.attachPage(this.page);
    }

    const target = assertAllowedFlowUrl(projectUrl || FLOW_HOME_URL);

    if (!isFlowUrl(this.page.url()) || (projectUrl && this.page.url() !== target)) {
      await this.page.goto(target, {
        waitUntil: "domcontentloaded",
        timeout: 60000
      });
    }

    return this.getSessionStatus();
  }

  attachPage(page) {
    page.on("download", (download) => {
      this.handleDownload(download).catch((error) => {
        console.error("[FlowWorker] Download handling failed:", error.message);
      });
    });

    page.on("close", () => {
      if (this.page === page) this.page = null;
    });
  }

  async getSessionStatus() {
    if (!this.context) {
      return {
        connected: false,
        state: "browser_not_started",
        message: "Open a visible Google Flow browser session first."
      };
    }

    if (!this.page || this.page.isClosed()) {
      return {
        connected: false,
        state: "browser_page_closed",
        message: "The Flow browser page is closed. Open the session again."
      };
    }

    const currentUrl = this.page.url();
    const loginRequired = isGoogleLoginUrl(currentUrl);
    let title = "";

    try {
      title = await this.page.title();
    } catch {
      // The page may be navigating; status remains available without a title.
    }

    return {
      connected: true,
      state: loginRequired ? "manual_login_required" : (isFlowUrl(currentUrl) ? "flow_page_open" : "browser_open"),
      currentUrl,
      title,
      manualLoginRequired: loginRequired,
      message: loginRequired
        ? "Sign in manually in the visible browser. The worker does not handle passwords, MFA, or CAPTCHA."
        : "Confirm that the intended Flow project and saved character are visible before preparing a generation."
    };
  }

  async close() {
    if (this.context) {
      await this.context.close();
      this.context = null;
      this.page = null;
    }

    return { connected: false, state: "browser_closed" };
  }

  createJob(input) {
    const characterId = String(input.characterId || "").trim();
    const characterName = String(input.characterName || "").trim();
    const view = String(input.view || "front");

    if (!characterId) throw new Error("characterId is required.");
    if (!characterName) throw new Error("characterName is required.");
    if (!CHARACTER_VIEW_LABELS[view]) throw new Error("Unsupported character view: " + view);

    const assetType = String(
      input.assetType || (view === "front" && input.isMasterReference === true ? "main" : "custom")
    );

    if (!VALID_ASSET_TYPES.has(assetType)) {
      throw new Error("assetType must be one of: " + Array.from(VALID_ASSET_TYPES).join(", "));
    }

    const projectUrl = input.projectUrl ? assertAllowedFlowUrl(input.projectUrl) : undefined;
    const prompt = String(input.prompt || buildCharacterViewPrompt({
      characterName,
      view,
      additionalInstructions: input.additionalInstructions
    })).trim();

    if (!prompt) throw new Error("A non-empty prompt is required.");

    const job = {
      id: randomUUID(),
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
      message: "Job created. Prepare it after opening Flow and completing any required manual sign-in."
    };

    this.jobs.set(job.id, job);
    return job;
  }

  async prepareJob(jobId) {
    const job = this.requireJob(jobId);

    if (!this.context || !this.page || this.page.isClosed()) {
      throw new Error("Open a Google Flow browser session before preparing a job.");
    }

    if (this.activeJobId && this.activeJobId !== jobId) {
      const active = this.jobs.get(this.activeJobId);
      if (active && !["completed", "cancelled", "failed"].includes(active.status)) {
        throw new Error("Another Flow job is active. Complete or cancel it before starting another.");
      }
    }

    if (job.projectUrl && this.page.url() !== job.projectUrl) {
      await this.page.goto(job.projectUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    } else if (!isFlowUrl(this.page.url()) && !isGoogleLoginUrl(this.page.url())) {
      await this.page.goto(FLOW_HOME_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    }

    if (isGoogleLoginUrl(this.page.url())) {
      job.status = "awaiting_manual_login";
      job.message = "Sign in manually in the browser, open the intended Flow project, then call prepare again.";
      this.touch(job);
      return job;
    }

    if (!isFlowUrl(this.page.url())) {
      job.status = "awaiting_project_selection";
      job.message = "Open the intended Google Flow project in the visible browser, then call prepare again.";
      this.touch(job);
      return job;
    }

    this.activeJobId = job.id;

    try {
      const promptEditor = await this.findPromptEditor();
      await promptEditor.locator.fill(job.prompt);
      job.promptSelectorUsed = promptEditor.selector;
      job.status = "prompt_ready";
      job.message = "Prompt filled. Review it in Flow and attach/select the saved @character reference before confirming generation.";
      job.error = undefined;
      this.touch(job);
      return job;
    } catch (error) {
      job.diagnosticScreenshotPath = await this.saveDiagnosticScreenshot(job.id);
      job.status = "prompt_editor_not_found";
      job.error = error.message;
      job.message = "The Flow prompt editor could not be identified safely. Inspect the visible browser and configure FLOW_PROMPT_SELECTOR if needed.";
      this.touch(job);
      return job;
    }
  }

  async findPromptEditor() {
    if (!this.page || this.page.isClosed()) throw new Error("Flow page is not available.");

    if (this.promptSelector) {
      const configured = this.page.locator(this.promptSelector);
      const count = await configured.count();
      if (count !== 1 || !(await configured.isVisible())) {
        throw new Error("FLOW_PROMPT_SELECTOR must identify exactly one visible prompt editor; found " + count + ".");
      }
      return { locator: configured, selector: this.promptSelector };
    }

    const candidates = this.page.locator('textarea, [contenteditable="true"], [role="textbox"]');
    const scored = [];

    for (let index = 0; index < await candidates.count(); index += 1) {
      const candidate = candidates.nth(index);
      if (!(await candidate.isVisible()) || !(await candidate.isEnabled())) continue;

      const placeholder = (await candidate.getAttribute("placeholder")) || "";
      const ariaLabel = (await candidate.getAttribute("aria-label")) || "";
      const dataPlaceholder = (await candidate.getAttribute("data-placeholder")) || "";
      const label = [placeholder, ariaLabel, dataPlaceholder].join(" ").toLowerCase();

      if (/search|filter|session|collection/.test(label)) continue;

      let score = 0;
      if (/prompt|describe|generate|image/.test(label)) score += 5;
      if (await candidate.getAttribute("contenteditable") === "true") score += 1;
      scored.push({ locator: candidate, score, selector: "auto-detected visible text editor #" + index });
    }

    if (scored.length === 0) {
      throw new Error("No visible textarea or contenteditable textbox was found.");
    }

    scored.sort((a, b) => b.score - a.score);
    if (scored.length > 1 && scored[0].score === scored[1].score) {
      throw new Error("Multiple prompt-like fields are visible. Set FLOW_PROMPT_SELECTOR to a stable, unique selector.");
    }

    if (scored.length > 1 && scored[0].score === 0) {
      throw new Error("The prompt editor is ambiguous. Set FLOW_PROMPT_SELECTOR to a stable, unique selector.");
    }

    return scored[0];
  }

  async requestGeneration(jobId, confirmation) {
    const job = this.requireJob(jobId);

    if (confirmation?.confirmGenerate !== true || confirmation?.referenceConfirmed !== true) {
      throw new Error("Explicit confirmation is required: confirmGenerate=true and referenceConfirmed=true.");
    }

    if (job.status !== "prompt_ready" && job.status !== "awaiting_manual_generate") {
      throw new Error("The job must be prepared before generation can be requested. Current status: " + job.status);
    }

    if (!this.page || this.page.isClosed()) throw new Error("Flow page is not available.");

    // Generation can consume the user's Google Flow allowance. Only attempt the documented,
    // visible Generate Image button after the caller has explicitly confirmed.
    const button = this.page.getByRole("button", { name: "Generate Image", exact: true });
    const count = await button.count();

    if (count !== 1 || !(await button.isVisible()) || !(await button.isEnabled())) {
      job.status = "awaiting_manual_generate";
      job.message = "The exact visible Generate Image button was not uniquely identifiable. Review the prompt and click Generate Image manually in Flow; the worker is listening for the resulting image download.";
      this.touch(job);
      return job;
    }

    await button.click({ timeout: 15000 });
    job.status = "awaiting_download";
    job.generationRequestedAt = new Date().toISOString();
    job.message = "Generation was submitted through the visible Flow UI. When the result is ready, use Flow's normal Download action; the worker will capture and import the downloaded image.";
    this.touch(job);
    return job;
  }

  async handleDownload(download) {
    if (this.downloadInProgress || !this.activeJobId) return;

    const job = this.jobs.get(this.activeJobId);
    if (!job || !["awaiting_download", "awaiting_manual_generate"].includes(job.status)) return;

    this.downloadInProgress = true;

    try {
      await fs.mkdir(this.downloadDir, { recursive: true });

      const suggested = safeFilename(download.suggestedFilename(), "flow-image");
      const temporaryPath = path.join(this.downloadDir, job.id + "-" + suggested);
      await download.saveAs(temporaryPath);

      const buffer = await fs.readFile(temporaryPath);
      if (buffer.length > MAX_IMAGE_BYTES) {
        await fs.rm(temporaryPath, { force: true });
        throw new Error("Downloaded image exceeds the 25 MB worker safety limit.");
      }

      const imageType = detectImageType(buffer);
      if (!imageType) {
        await fs.rm(temporaryPath, { force: true });
        job.message = "A download was detected, but it was not a supported PNG, JPEG, or WebP image. Download the generated image asset from Flow, not a project archive.";
        this.touch(job);
        return;
      }

      const finalPath = path.join(
        this.downloadDir,
        job.id + "." + imageType.extension
      );
      if (temporaryPath !== finalPath) {
        await fs.rename(temporaryPath, finalPath);
      }

      job.downloadPath = finalPath;
      job.status = "importing";
      job.message = "Image downloaded and validated. Importing it into the selected character.";
      this.touch(job);

      await this.importDownloadedAsset(job, buffer, imageType);
    } catch (error) {
      job.status = "failed";
      job.error = error.message;
      job.message = "The image download or import failed. Inspect the job error before retrying.";
      this.touch(job);
    } finally {
      this.downloadInProgress = false;
    }
  }

  async importDownloadedAsset(job, buffer, imageType) {
    const dataUri = "data:" + imageType.mimeType + ";base64," + buffer.toString("base64");
    const characterPath = "/api/character-studio/characters/" +
      encodeURIComponent(job.characterId) + "/import-flow";

    const importResponse = await fetch(this.backendUrl + characterPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        characterName: job.characterName,
        assetType: job.assetType,
        imageBufferOrBase64: dataUri,
        filename: "flow-" + job.view + "-" + job.id + "." + imageType.extension,
        notes: "Imported from Google Flow through the local Playwright worker."
      })
    });

    const importPayload = await importResponse.json().catch(() => ({}));
    if (!importResponse.ok || importPayload.success !== true || !importPayload.result) {
      throw new Error("Backend file import failed with HTTP " + importResponse.status + ".");
    }

    job.importResult = importPayload.result;
    job.detectedMimeType = imageType.mimeType;

    await this.persistAssetMetadata(job);
  }

  async persistAssetMetadata(job) {
    if (!job.importResult) throw new Error("There is no imported file result to register.");

    const result = job.importResult;
    const assetPath = "/api/character-studio/characters/" +
      encodeURIComponent(job.characterId) + "/assets";

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
        createdAt: new Date().toISOString()
      })
    });

    const assetPayload = await assetResponse.json().catch(() => ({}));
    if (!assetResponse.ok || assetPayload.success !== true) {
      job.status = "import_metadata_failed";
      job.error = "The image file was saved, but character metadata registration failed with HTTP " + assetResponse.status + ".";
      job.message = "The file exists in backend storage. Retry metadata registration instead of downloading the image again.";
      this.touch(job);
      return job;
    }

    job.status = "completed";
    job.asset = assetPayload.asset || result;
    job.completedAt = new Date().toISOString();
    job.message = "Google Flow image imported and registered against the character.";
    job.error = undefined;
    this.touch(job);
    return job;
  }

  async retryMetadataImport(jobId) {
    const job = this.requireJob(jobId);
    if (job.status !== "import_metadata_failed" || !job.importResult) {
      throw new Error("This job has no pending metadata registration to retry.");
    }

    return this.persistAssetMetadata(job);
  }

  async cancelJob(jobId) {
    const job = this.requireJob(jobId);
    job.status = "cancelled";
    job.message = "Job cancelled. Any already generated Flow media remains in the Google Flow project.";
    if (this.activeJobId === jobId) this.activeJobId = null;
    this.touch(job);
    return job;
  }

  async saveDiagnosticScreenshot(jobId) {
    if (!this.page || this.page.isClosed()) return undefined;

    try {
      await fs.mkdir(this.downloadDir, { recursive: true });
      const screenshotPath = path.join(this.downloadDir, "diagnostic-" + jobId + ".png");
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
      b.createdAt.localeCompare(a.createdAt)
    );
  }
}
