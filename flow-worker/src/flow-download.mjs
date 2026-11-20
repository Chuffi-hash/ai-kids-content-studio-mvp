import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { detectImageType, parseImageDimensions } from "./image-validation.mjs";

export function getFirstLocator(loc) {
  if (!loc) return null;
  return typeof loc.first === "function"
    ? loc.first()
    : typeof loc.nth === "function"
      ? loc.nth(0)
      : loc;
}

/**
 * Downloads a generated image asset from Google Flow with explicit stage transitions,
 * discrete timeouts, and validation.
 *
 * @param {Object} options
 * @param {import("playwright").Page} options.page
 * @param {Object} options.job
 * @param {Object} options.output
 * @param {number} [options.timeoutMs=20000]
 * @param {string} [options.downloadDir]
 * @param {Object} [options.logger=console]
 * @returns {Promise<Object>}
 */
export async function downloadFlowImage({
  page,
  job,
  output,
  timeoutMs = 20000,
  downloadDir,
  logger = console,
}) {
  const startedAt = Date.now();
  let currentPhase = "output_detected";

  const logPhase = (phase, details = {}) => {
    currentPhase = phase;
    if (job) {
      job.downloadPhase = phase;
      job.lastProgressAt = new Date().toISOString();
    }
    const entry = {
      jobId: job?.id,
      backendJobId: job?.backendJobId,
      workerJobId: job?.id,
      sceneId: job?.sceneId,
      phase,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      ...details,
    };
    if (logger && typeof logger.info === "function") {
      logger.info(`[FlowDownload] ${JSON.stringify(entry)}`);
    } else {
      console.log(`[FlowDownload] Phase: ${phase}`, JSON.stringify(entry));
    }
  };

  logPhase("output_detected");

  if (!page || (typeof page.isClosed === "function" && page.isClosed())) {
    return {
      success: false,
      code: "FLOW_PAGE_CLOSED",
      phase: currentPhase,
      message: "Browser page is closed or unavailable",
      jobId: job?.id,
    };
  }

  // 1. opening_editor
  logPhase("opening_editor");
  let editorOpened = false;
  try {
    const tileEl = output?.optionLocator;
    if (tileEl) {
      const openEditorBtn = getFirstLocator(
        tileEl.locator(
          'div.image-container[aria-label="Open image in editor"], div[role="button"][aria-label*="editor" i], div.image-container, flow-a2ui-image-option',
        ),
      );
      if (openEditorBtn && (await openEditorBtn.count().catch(() => 0)) > 0) {
        await openEditorBtn.click({ timeout: 5000 }).catch(() => {});
        editorOpened = true;
      } else if (typeof tileEl.click === "function") {
        await tileEl.click({ timeout: 5000 }).catch(() => {});
        editorOpened = true;
      }
    }
  } catch (openErr) {
    // Non-fatal if direct interaction works
  }

  // 2. editor_opened
  logPhase("editor_opened", { editorOpened });

  // 3. download_button_found
  let downloadBtn = null;
  const buttonTimeoutMs = 5000;
  const findButtonStart = Date.now();

  while (Date.now() - findButtonStart < buttonTimeoutMs) {
    if (typeof page.locator === "function") {
      const candidates = page.locator(
        'button[aria-label*="download" i], button[title*="download" i], button:has-text("Download"), [data-testid*="download" i]',
      );
      const count = await candidates.count().catch(() => 0);
      for (let i = 0; i < count; i++) {
        const btn = candidates.nth(i);
        const visible = await btn.isVisible().catch(() => false);
        const enabled = await btn.isEnabled().catch(() => false);
        if (visible && enabled) {
          downloadBtn = btn;
          break;
        }
      }
    } else if (typeof page.getByRole === "function") {
      const roleBtn = page.getByRole("button", { name: /download/i });
      if (
        (await roleBtn.count().catch(() => 0)) > 0 &&
        (await roleBtn.first().isVisible().catch(() => false))
      ) {
        downloadBtn = roleBtn.first();
      }
    }
    if (downloadBtn) break;
    await new Promise((r) => setTimeout(r, 300));
  }

  if (!downloadBtn) {
    return {
      success: false,
      code: "FLOW_BUTTON_NOT_FOUND",
      phase: "download_button_found",
      message: "Download button was not found or was not visible/enabled in editor view",
      jobId: job?.id,
    };
  }

  logPhase("download_button_found");

  // 4. download_started & 5. download_event_received
  logPhase("download_started");
  let downloadEvent = null;
  const downloadWaitTimeout = Math.min(timeoutMs, 20000);

  try {
    if (typeof page.waitForEvent !== "function") {
      throw new Error("page.waitForEvent is not supported in current environment");
    }

    const downloadPromise = page.waitForEvent("download", { timeout: downloadWaitTimeout });
    await downloadBtn.click({ timeout: 5000 });
    downloadEvent = await downloadPromise;
  } catch (eventErr) {
    return {
      success: false,
      code: "FLOW_DOWNLOAD_TIMEOUT",
      phase: "download_event_received",
      message: `Playwright download event was not received: ${eventErr.message}`,
      jobId: job?.id,
    };
  }

  logPhase("download_event_received");

  // 6. download_saved
  if (!downloadEvent || typeof downloadEvent.saveAs !== "function") {
    return {
      success: false,
      code: "FLOW_DOWNLOAD_INVALID",
      phase: "download_saved",
      message: "Download event did not contain a valid saveAs method",
      jobId: job?.id,
    };
  }

  const targetDir = downloadDir || path.join(os.tmpdir(), "flow-downloads");
  await fs.mkdir(targetDir, { recursive: true, mode: 0o700 }).catch(() => {});
  const tempPath = path.join(
    targetDir,
    `temp-${job?.id || Date.now()}-${Date.now()}.bin`,
  );

  try {
    await downloadEvent.saveAs(tempPath);
  } catch (saveErr) {
    return {
      success: false,
      code: "FLOW_SAVE_FAILED",
      phase: "download_saved",
      message: `Failed to save downloaded file: ${saveErr.message}`,
      jobId: job?.id,
    };
  }

  const buf = await fs.readFile(tempPath).catch(() => null);
  if (!buf || buf.length === 0) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    return {
      success: false,
      code: "FLOW_DOWNLOAD_ZERO_BYTES",
      phase: "download_saved",
      message: "Downloaded file is zero bytes or unreadable",
      jobId: job?.id,
    };
  }

  logPhase("download_saved", { fileSize: buf.length });

  // 7. image_validated
  const detected = detectImageType(buf);
  if (!detected) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    return {
      success: false,
      code: "FLOW_IMAGE_INVALID_TYPE",
      phase: "image_validated",
      message: "Downloaded file is not a supported image format (PNG, JPEG, WebP)",
      jobId: job?.id,
    };
  }

  const dims = parseImageDimensions(buf);
  if (
    !Number.isInteger(dims.width) ||
    !Number.isInteger(dims.height) ||
    dims.width < 32 ||
    dims.height < 32
  ) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    return {
      success: false,
      code: "FLOW_IMAGE_INVALID_DIMENSIONS",
      phase: "image_validated",
      message: `Downloaded image has invalid dimensions: ${dims.width}x${dims.height}`,
      jobId: job?.id,
    };
  }

  const finalPath = path.join(
    targetDir,
    `flow-${job?.id || Date.now()}.${detected.extension}`,
  );
  if (tempPath !== finalPath) {
    await fs.rename(tempPath, finalPath).catch(() => {});
  }

  logPhase("image_validated", {
    mimeType: detected.mimeType,
    width: dims.width,
    height: dims.height,
  });

  // Attempt clean close of editor modal
  try {
    const closeBtn = getFirstLocator(
      page.locator(
        'button[aria-label="Close"], button[aria-label="Back"], button:has-text("Close"), button:has-text("Back")',
      ),
    );
    if (
      closeBtn &&
      (await closeBtn.count().catch(() => 0)) > 0 &&
      (await closeBtn.isVisible().catch(() => false))
    ) {
      await closeBtn.click().catch(() => {});
    } else if (page.keyboard) {
      await page.keyboard.press("Escape").catch(() => {});
    }
  } catch {}

  return {
    success: true,
    jobId: job?.id,
    path: finalPath,
    fileName: path.basename(finalPath),
    fileSize: buf.length,
    mimeType: detected.mimeType,
    width: dims.width,
    height: dims.height,
    buffer: buf,
  };
}
