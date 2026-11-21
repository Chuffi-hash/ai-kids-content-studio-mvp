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

export function getNthLocator(loc, n = 0) {
  if (!loc) return null;
  if (typeof loc.nth === "function") return loc.nth(n);
  if (n === 0 && typeof loc.first === "function") return loc.first();
  return loc;
}

/**
 * Downloads a generated image asset from Google Flow with explicit stage transitions,
 * discrete timeouts, chat scrolling, right-click context menu handling, and validation.
 *
 * @param {Object} options
 * @param {import("playwright").Page} options.page
 * @param {Object} options.job
 * @param {Object} [options.output]
 * @param {number} [options.timeoutMs=25000]
 * @param {string} [options.downloadDir]
 * @param {Object} [options.logger=console]
 * @returns {Promise<Object>}
 */
export async function downloadFlowImage({
  page,
  job,
  output,
  timeoutMs = 25000,
  downloadDir,
  logger = console,
}) {
  const startedAt = Date.now();
  let currentPhase = "CHAT_SCROLL_STARTED";

  const logTransition = (phase, details = {}) => {
    currentPhase = phase;
    if (job) {
      job.downloadPhase = phase;
      job.lastProgressAt = new Date().toISOString();
    }
    const entry = {
      backendJobId: job?.backendJobId || job?.id,
      workerJobId: job?.id,
      sceneId: job?.sceneId,
      storyId: job?.storyId,
      phase,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      ...details,
    };
    if (logger && typeof logger.info === "function") {
      logger.info(`[FlowDownload] ${JSON.stringify(entry)}`);
    } else {
      console.log(`[FlowDownload] ${phase}`, JSON.stringify(entry));
    }
  };

  if (!page || (typeof page.isClosed === "function" && page.isClosed())) {
    return {
      success: false,
      code: "FLOW_PAGE_CLOSED",
      phase: currentPhase,
      message: "Browser page is closed or unavailable",
      jobId: job?.id,
    };
  }

  // 1. CHAT_SCROLL_STARTED & CHAT_SCROLL_BOTTOM_REACHED
  logTransition("CHAT_SCROLL_STARTED");
  const chatViewport = page.locator("flow-chat-scroller .scroll-viewport");
  try {
    const isViewportVisible = await chatViewport
      .first()
      .isVisible()
      .catch(() => false);
    if (isViewportVisible) {
      await chatViewport.first().evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
    }
  } catch (scrollErr) {
    // Non-fatal if viewport not present
  }
  logTransition("CHAT_SCROLL_BOTTOM_REACHED");

  // 2. LATEST_ASSISTANT_MESSAGE_FOUND & NEW_IMAGE_GALLERY_FOUND
  const messagesList = page.locator("flow-chat-scroller .messages-list");
  const assistantMessages = page.locator(
    "flow-chat-scroller .messages-list > .agent-row.message-row, flow-chat-scroller .messages-list > .agent-row, flow-chat-scroller .messages-list > .message-row.agent-row, .agent-row.message-row, .agent-row",
  );

  let assistantCount = 0;
  try {
    assistantCount = await assistantMessages.count().catch(() => 0);
  } catch {}

  const sourceMessageIndex = assistantCount > 0 ? assistantCount - 1 : 0;
  logTransition("LATEST_ASSISTANT_MESSAGE_FOUND", { sourceMessageIndex });

  // Locate media gallery
  let latestAssistant = page;
  if (assistantCount > 0) {
    if (typeof assistantMessages.last === "function") {
      latestAssistant = assistantMessages.last();
    } else if (typeof assistantMessages.nth === "function") {
      latestAssistant = assistantMessages.nth(assistantCount - 1);
    }
  }

  const imageGallery =
    latestAssistant && typeof latestAssistant.locator === "function"
      ? latestAssistant.locator(
          'flow-a2ui-multiple-choice [role="group"][aria-label="Media options gallery"], flow-a2ui-multiple-choice .gallery-container, flow-a2ui-multiple-choice',
        )
      : typeof page.locator === "function"
        ? page.locator("flow-a2ui-multiple-choice")
        : null;

  logTransition("NEW_IMAGE_GALLERY_FOUND");

  // 3. IMAGE_OPTION_COUNT_VERIFIED
  let imageOptions =
    imageGallery && typeof imageGallery.locator === "function"
      ? imageGallery.locator("flow-a2ui-image-option")
      : null;
  let optionCount = imageOptions
    ? await imageOptions.count().catch(() => 0)
    : 0;

  if (optionCount === 0 && output?.optionLocator) {
    imageOptions = output.optionLocator;
    optionCount = 1;
  }

  // Enforce single output constraint if not explicitly configured
  const selectedIndex = Number.isInteger(job?.outputIndex)
    ? job.outputIndex
    : 0;
  if (optionCount > 1 && job?.outputIndex === undefined) {
    const mismatchErr = new Error(
      `OUTPUT_COUNT_MISMATCH: Expected exactly 1 generated image, received ${optionCount}.`,
    );
    return {
      success: false,
      code: "OUTPUT_COUNT_MISMATCH",
      phase: "IMAGE_OPTION_COUNT_VERIFIED",
      message: mismatchErr.message,
      jobId: job?.id,
    };
  }

  logTransition("IMAGE_OPTION_COUNT_VERIFIED", {
    optionCount,
    selectedIndex,
  });

  const selectedOption =
    optionCount > 0 ? getNthLocator(imageOptions, selectedIndex) : null;

  // 4. IMAGE_THUMBNAIL_LOADED
  let sourceImageUrl = output?.sourceUrl || output?.rawSrc || null;
  let thumbnailEl = null;

  if (selectedOption && typeof selectedOption.locator === "function") {
    thumbnailEl = getFirstLocator(
      selectedOption.locator("img.image-thumbnail, img"),
    );
    if (
      thumbnailEl &&
      typeof thumbnailEl.evaluate === "function" &&
      (await thumbnailEl.count().catch(() => 0)) > 0
    ) {
      const evalRes = await thumbnailEl
        .evaluate((img) => ({
          naturalWidth: img.naturalWidth || 0,
          naturalHeight: img.naturalHeight || 0,
          src: img.src || null,
        }))
        .catch(() => null);

      if (evalRes?.src) {
        sourceImageUrl = evalRes.src;
      }
    }
  }

  logTransition("IMAGE_THUMBNAIL_LOADED", { sourceImageUrl });

  // 5. IMAGE_OPTION_CLICKED
  let editorOpened = false;
  if (selectedOption) {
    const imageButton = getFirstLocator(
      selectedOption.locator(
        'div.image-container[role="button"][aria-label="Open image in editor"], div.image-container.clickable, div.image-container',
      ),
    );

    if (imageButton && (await imageButton.count().catch(() => 0)) > 0) {
      if (typeof imageButton.scrollIntoViewIfNeeded === "function") {
        await imageButton.scrollIntoViewIfNeeded().catch(() => {});
      }
      await imageButton.click({ timeout: 5000 }).catch(() => {});
      editorOpened = true;
    } else if (typeof selectedOption.click === "function") {
      if (typeof selectedOption.scrollIntoViewIfNeeded === "function") {
        await selectedOption.scrollIntoViewIfNeeded().catch(() => {});
      }
      await selectedOption.click({ timeout: 5000 }).catch(() => {});
      editorOpened = true;
    }
  } else if (output?.optionLocator) {
    await output.optionLocator.click({ timeout: 5000 }).catch(() => {});
    editorOpened = true;
  }

  logTransition("IMAGE_OPTION_CLICKED", { editorOpened });

  // 6. IMAGE_VIEWER_OPENED & ACTIVE_IMAGE_IDENTIFIED
  await new Promise((r) => setTimeout(r, 600));
  logTransition("IMAGE_VIEWER_OPENED");

  let activeImage = null;
  const viewerCandidates = page.locator(
    'flow-image-editor img, .editor-container img, div[role="dialog"] img, img.editor-image, img.full-image, .image-viewer img',
  );

  if ((await viewerCandidates.count().catch(() => 0)) > 0) {
    activeImage = getFirstLocator(viewerCandidates);
  } else if (thumbnailEl) {
    activeImage = thumbnailEl;
  } else if (output?.imageLocator) {
    activeImage = output.imageLocator;
  }

  let activeImageUrl = sourceImageUrl;
  if (activeImage && typeof activeImage.getAttribute === "function") {
    const candidateSrc = await activeImage
      .getAttribute("src")
      .catch(() => null);
    if (candidateSrc) {
      try {
        activeImageUrl = new URL(candidateSrc, page.url()).href;
      } catch {
        activeImageUrl = candidateSrc;
      }
    }
  }

  logTransition("ACTIVE_IMAGE_IDENTIFIED", { activeImageUrl });

  // 7. IMAGE_RIGHT_CLICKED
  if (activeImage && typeof activeImage.click === "function") {
    try {
      if (typeof activeImage.scrollIntoViewIfNeeded === "function") {
        await activeImage.scrollIntoViewIfNeeded().catch(() => {});
      }
      await activeImage.click({ button: "right", timeout: 4000 });
    } catch (rcErr) {
      // Non-fatal if right click dispatched via dom
    }
  }
  logTransition("IMAGE_RIGHT_CLICKED");

  // 8. CONTEXT_MENU_DETECTED & SAVE_IMAGE_ACTION_SELECTED
  let contextMenuFound = false;
  let saveMenuBtn = null;

  try {
    const contextMenu = page.locator(
      '.cdk-overlay-container [role="menu"], [role="menu"], .context-menu, mat-menu',
    );
    if ((await contextMenu.count().catch(() => 0)) > 0) {
      contextMenuFound = true;
      const saveItem = contextMenu.locator(
        'button[role="menuitem"]:has-text("Save"), button[role="menuitem"]:has-text("Download"), [role="menuitem"]',
      );
      if ((await saveItem.count().catch(() => 0)) > 0) {
        saveMenuBtn = getFirstLocator(saveItem);
      }
    }
  } catch {}

  logTransition("CONTEXT_MENU_DETECTED", { contextMenuFound });

  // Check for toolbar download button if no context menu button
  if (!saveMenuBtn) {
    const toolbarBtn = page.locator(
      'button[aria-label*="download" i], button[title*="download" i], button:has-text("Download"), [data-testid*="download" i]',
    );
    const firstToolbar = getFirstLocator(toolbarBtn);
    if (
      (await toolbarBtn.count().catch(() => 0)) > 0 &&
      (await firstToolbar.isVisible().catch(() => false))
    ) {
      saveMenuBtn = firstToolbar;
    }
  }

  logTransition("SAVE_IMAGE_ACTION_SELECTED", {
    hasButton: Boolean(saveMenuBtn),
  });

  // 9. DOWNLOAD_EVENT_RECEIVED (Dual capture: Playwright download event + in-tab authenticated fetch)
  let downloadedBuffer = null;
  const targetDir = downloadDir || path.join(os.tmpdir(), "flow-downloads");
  await fs.mkdir(targetDir, { recursive: true, mode: 0o700 }).catch(() => {});
  const tempPath = path.join(
    targetDir,
    `temp-${job?.id || Date.now()}-${Date.now()}.bin`,
  );

  // Strategy A: Try clicking save action and catching browser download event
  if (saveMenuBtn && typeof page.waitForEvent === "function") {
    try {
      const [downloadEvent] = await Promise.all([
        page.waitForEvent("download", { timeout: 8000 }).catch(() => null),
        saveMenuBtn.click({ timeout: 4000 }).catch(() => {}),
      ]);

      if (downloadEvent && typeof downloadEvent.saveAs === "function") {
        await downloadEvent.saveAs(tempPath);
        const buf = await fs.readFile(tempPath).catch(() => null);
        if (buf && buf.length > 50) {
          downloadedBuffer = buf;
        }
      }
    } catch {}
  }

  // Strategy B: In-tab authenticated fetch of the exact active image URL
  if (!downloadedBuffer && activeImageUrl && typeof page.evaluate === "function") {
    try {
      const base64Data = await page.evaluate(async (url) => {
        try {
          const res = await fetch(url, { credentials: "include" });
          if (!res.ok) return null;
          const blob = await res.blob();
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch {
          return null;
        }
      }, activeImageUrl);

      if (
        typeof base64Data === "string" &&
        base64Data.startsWith("data:")
      ) {
        const parts = base64Data.split(",");
        if (parts[1]) {
          const buf = Buffer.from(parts[1], "base64");
          if (buf.length > 50) {
            downloadedBuffer = buf;
            await fs.writeFile(tempPath, buf);
          }
        }
      }
    } catch (evalErr) {
      // Handled below
    }
  }

  // Strategy C: Correlate with job.capturedImageResponses
  if (!downloadedBuffer && job?.capturedImageResponses) {
    const targetUrl = activeImageUrl || sourceImageUrl;
    if (targetUrl && job.capturedImageResponses.has(targetUrl)) {
      downloadedBuffer = job.capturedImageResponses.get(targetUrl).buffer;
      await fs.writeFile(tempPath, downloadedBuffer);
    }
  }

  if (!downloadedBuffer || downloadedBuffer.length === 0) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    return {
      success: false,
      code: "FLOW_DOWNLOAD_TIMEOUT",
      phase: "DOWNLOAD_EVENT_RECEIVED",
      message:
        "Playwright download event or authenticated image stream was not received",
      jobId: job?.id,
    };
  }

  logTransition("DOWNLOAD_EVENT_RECEIVED", {
    byteLength: downloadedBuffer.length,
  });

  // 10. IMAGE_SAVED_TO_DISK
  logTransition("IMAGE_SAVED_TO_DISK", {
    fileSize: downloadedBuffer.length,
    tempPath,
  });

  // 11. IMAGE_VALIDATION_COMPLETED
  const detected = detectImageType(downloadedBuffer);
  if (!detected) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    return {
      success: false,
      code: "FLOW_IMAGE_INVALID_TYPE",
      phase: "IMAGE_VALIDATION_COMPLETED",
      message:
        "Downloaded file is not a supported image format (PNG, JPEG, WebP)",
      jobId: job?.id,
    };
  }

  const dims = parseImageDimensions(downloadedBuffer);
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
      phase: "IMAGE_VALIDATION_COMPLETED",
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

  logTransition("IMAGE_VALIDATION_COMPLETED", {
    mimeType: detected.mimeType,
    width: dims.width,
    height: dims.height,
  });

  // Close viewer view cleanly
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

  // Correlation metadata
  if (job) {
    job.outputIndex = selectedIndex;
    job.sourceMessageIndex = sourceMessageIndex;
    job.sourceImageUrl = activeImageUrl || sourceImageUrl;
    job.downloadPath = finalPath;
    job.mimeType = detected.mimeType;
    job.width = dims.width;
    job.height = dims.height;
    job.fileSize = downloadedBuffer.length;
  }

  return {
    success: true,
    jobId: job?.id,
    backendJobId: job?.backendJobId || job?.id,
    storyId: job?.storyId,
    sceneId: job?.sceneId,
    outputIndex: selectedIndex,
    sourceMessageIndex,
    sourceImageUrl: activeImageUrl || sourceImageUrl,
    path: finalPath,
    fileName: path.basename(finalPath),
    fileSize: downloadedBuffer.length,
    mimeType: detected.mimeType,
    width: dims.width,
    height: dims.height,
    buffer: downloadedBuffer,
  };
}
