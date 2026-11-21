import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  detectImageType,
  parseImageDimensions,
} from "./image-validation.mjs";

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
 * Controller to manage Windows UIAutomation powershell script for native
 * Chrome context-menu "Save image as" and the Windows "Save As" file dialog.
 */
export function startWindowsSaveAsAutomation({
  outputPath,
  timeoutMs = 30000,
  browserProcessId = 0,
  spawnFn = spawn,
  scriptPathOverride,
  onProgress,
}) {
  if (process.platform !== "win32" && !scriptPathOverride && spawnFn === spawn) {
    throw new Error(
      "NATIVE_SAVE_AS_UNSUPPORTED: This implementation requires Windows.",
    );
  }

  const scriptPath =
    scriptPathOverride ||
    fileURLToPath(new URL("./windows-save-image-as.ps1", import.meta.url));

  const args = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-WindowStyle",
    "Hidden",
    "-File",
    scriptPath,
    "-OutputPath",
    outputPath,
    "-TimeoutSeconds",
    String(Math.ceil(timeoutMs / 1000)),
  ];

  if (browserProcessId > 0) {
    args.push("-BrowserProcessId", String(browserProcessId));
  }

  const child = spawnFn("powershell.exe", args, {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";

  let readyResolve;
  let readyReject;

  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });

  let readyReceived = false;

  child.stdout?.on("data", (chunk) => {
    const text = chunk.toString();
    stdout += text;

    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (!readyReceived && line === "READY") {
        readyReceived = true;
        readyResolve();
      } else if (readyReceived && onProgress) {
        onProgress(line);
      }
    }
  });

  child.stderr?.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const result = new Promise((resolve, reject) => {
    child.on("error", (error) => {
      readyReject(error);
      reject(error);
    });

    child.on("close", (code) => {
      const lines = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .filter(
          (line) =>
            ![
              "READY",
              "NATIVE_MENU_ITEM_FOUND",
              "SAVE_DIALOG_FOUND",
              "FILE_NAME_SET",
              "SAVE_BUTTON_INVOKED",
              "FILE_EXISTS_VERIFIED",
            ].includes(line),
        );

      const jsonLine = lines.at(-1);

      let resultData;

      try {
        resultData = JSON.parse(jsonLine || "{}");
      } catch {
        reject(
          new Error(
            `Invalid PowerShell result. Exit code=${code}. stderr=${stderr}`,
          ),
        );
        return;
      }

      if (code !== 0 || resultData.success !== true) {
        reject(
          new Error(
            resultData.error ||
              `Native Save As failed. Exit code=${code}. ${stderr}`,
          ),
        );
        return;
      }

      resolve(resultData);
    });
  });

  const readyTimeout = setTimeout(() => {
    if (!readyReceived) {
      try {
        child.kill();
      } catch {}
      readyReject(new Error("Native Save As controller did not become ready."));
    }
  }, 10000);

  ready.finally(() => clearTimeout(readyTimeout)).catch(() => {});

  const operationTimeout = setTimeout(() => {
    try {
      child.kill();
    } catch {}
  }, timeoutMs + 5000);

  result.finally(() => clearTimeout(operationTimeout)).catch(() => {});

  return {
    ready,
    result,
    cancel: () => {
      try {
        child.kill();
      } catch {}
    },
  };
}

/**
 * Diagnostic helper that inspects all <img> tags in the page DOM.
 */
export async function inspectVisibleImages(page) {
  if (!page || typeof page.locator !== "function") return [];
  try {
    return await page.locator("img").evaluateAll((images) => {
      return images.map((img, index) => {
        const rect = img.getBoundingClientRect();

        return {
          index,
          src: img.currentSrc || img.src,
          alt: img.alt || "",
          complete: Boolean(img.complete),
          naturalWidth: img.naturalWidth || 0,
          naturalHeight: img.naturalHeight || 0,
          visible:
            rect.width > 0 &&
            rect.height > 0 &&
            window.getComputedStyle(img).visibility !== "hidden" &&
            window.getComputedStyle(img).display !== "none",
          rect: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
          parentTag: img.parentElement?.tagName || "",
          parentClass: img.parentElement?.className || "",
          grandParentTag: img.parentElement?.parentElement?.tagName || "",
          grandParentClass: img.parentElement?.parentElement?.className || "",
        };
      });
    });
  } catch {
    return [];
  }
}

/**
 * Saves the active enlarged image by dispatching a right-click and invoking
 * Chrome's native "Save image as" context menu through Windows UI Automation.
 */
export async function saveImageUsingNativeContextMenu({
  page,
  imageLocator,
  job,
  downloadDir,
  timeoutMs = 30000,
  browserProcessId = 0,
  logger = console,
  automationRunner,
  onPhase,
}) {
  if (!page || (typeof page.isClosed === "function" && page.isClosed())) {
    throw new Error("FLOW_PAGE_CLOSED");
  }

  if (process.platform !== "win32" && !automationRunner) {
    throw new Error("NATIVE_SAVE_AS_UNSUPPORTED");
  }

  if (!imageLocator) {
    throw new Error("ACTIVE_IMAGE_LOCATOR_MISSING");
  }

  const imageCount = await imageLocator.count().catch(() => 0);
  if (imageCount !== 1) {
    throw new Error(
      `ACTIVE_IMAGE_NOT_UNIQUE: Expected one image, found ${imageCount}`,
    );
  }

  if (typeof imageLocator.waitFor === "function") {
    await imageLocator.waitFor({
      state: "visible",
      timeout: 10000,
    });
  }

  if (typeof imageLocator.scrollIntoViewIfNeeded === "function") {
    await imageLocator.scrollIntoViewIfNeeded().catch(() => {});
  }

  const imageInfo = await imageLocator.evaluate((img) => ({
    src: img.currentSrc || img.src,
    complete: Boolean(img.complete),
    naturalWidth: img.naturalWidth || 0,
    naturalHeight: img.naturalHeight || 0,
    tagName: img.tagName,
  }));

  if (
    imageInfo.tagName !== "IMG" ||
    !imageInfo.complete ||
    imageInfo.naturalWidth < 32 ||
    imageInfo.naturalHeight < 32
  ) {
    throw new Error(`ACTIVE_IMAGE_INVALID: ${JSON.stringify(imageInfo)}`);
  }

  const bounds = await imageLocator.boundingBox();
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    throw new Error("ACTIVE_IMAGE_HAS_NO_VISIBLE_BOUNDS");
  }

  const targetDir = downloadDir || path.join(os.tmpdir(), "flow-downloads");
  await fs.mkdir(targetDir, { recursive: true, mode: 0o700 });

  const outputPath = path.join(
    targetDir,
    `flow-${job?.id || Date.now()}-${Date.now()}.png`,
  );

  logger?.info?.(
    `[FlowDownload] NATIVE_CONTEXT_MENU_CONTROLLER_STARTING ${job?.id || ""}`,
  );

  // Map progress signals from PowerShell into truthful phase events
  const handleProgress = (progressMsg) => {
    switch (progressMsg) {
      case "NATIVE_MENU_ITEM_FOUND":
        onPhase?.("NATIVE_CONTEXT_MENU_SAVE_IMAGE_FOUND", {
          success: true,
          downloadMethod: "native_context_menu_save_as",
        });
        break;
      case "SAVE_DIALOG_FOUND":
        onPhase?.("NATIVE_SAVE_AS_DIALOG_FOUND", {
          success: true,
          downloadMethod: "native_context_menu_save_as",
        });
        break;
      case "FILE_NAME_SET":
        onPhase?.("NATIVE_SAVE_AS_FILENAME_SET", {
          success: true,
          downloadMethod: "native_context_menu_save_as",
        });
        break;
      case "SAVE_BUTTON_INVOKED":
        onPhase?.("NATIVE_SAVE_AS_CONFIRMED", {
          success: true,
          downloadMethod: "native_context_menu_save_as",
        });
        break;
      case "FILE_EXISTS_VERIFIED":
        onPhase?.("FILE_EXISTS_VERIFIED", {
          success: true,
          downloadMethod: "native_context_menu_save_as",
        });
        break;
    }
  };

  // Start native menu controller BEFORE right-click.
  const runner = automationRunner || startWindowsSaveAsAutomation;
  const nativeController = runner({
    outputPath,
    timeoutMs,
    browserProcessId,
    onProgress: handleProgress,
  });

  try {
    // Wait until PowerShell UI Automation is ready.
    await nativeController.ready;

    // Right-click the actual displayed image.
    if (page.mouse && typeof page.mouse.click === "function") {
      await page.mouse.click(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2,
        {
          button: "right",
        },
      );
    } else if (typeof imageLocator.click === "function") {
      await imageLocator.click({ button: "right", timeout: 4000 });
    }

    onPhase?.("IMAGE_RIGHT_CLICK_DISPATCHED", {
      success: true,
      downloadMethod: "native_context_menu_save_as",
    });

    logger?.info?.(`[FlowDownload] IMAGE_RIGHT_CLICK_DISPATCHED ${job?.id || ""}`);

    // Wait for native Chrome Save image as and Windows Save As.
    const saved = await nativeController.result;

    const stat = await fs.stat(saved.path);
    if (!stat.isFile() || stat.size <= 0) {
      throw new Error("NATIVE_SAVE_AS_FILE_INVALID");
    }

    const buffer = await fs.readFile(saved.path);
    const detected = detectImageType(buffer);
    if (!detected) {
      throw new Error("NATIVE_SAVE_AS_INVALID_IMAGE_FORMAT");
    }

    const dimensions = parseImageDimensions(buffer);
    if (
      !Number.isInteger(dimensions.width) ||
      !Number.isInteger(dimensions.height) ||
      dimensions.width < 32 ||
      dimensions.height < 32
    ) {
      throw new Error(
        `NATIVE_SAVE_AS_INVALID_DIMENSIONS: ${dimensions.width}x${dimensions.height}`,
      );
    }

    onPhase?.("IMAGE_CONTENT_VALIDATED", {
      success: true,
      mimeType: detected.mimeType,
      width: dimensions.width,
      height: dimensions.height,
      downloadMethod: "native_context_menu_save_as",
    });

    // Rename to canonical path matching detected format
    const finalPath = path.join(
      targetDir,
      `flow-${job?.id || Date.now()}-${Date.now()}.${detected.extension}`,
    );

    if (saved.path !== finalPath) {
      await fs.rename(saved.path, finalPath).catch(() => {});
    }

    if (job) {
      job.downloadPath = finalPath;
      job.sourceImageUrl = imageInfo.src;
      job.mimeType = detected.mimeType;
      job.width = dimensions.width;
      job.height = dimensions.height;
      job.fileSize = buffer.length;
      job.downloadMethod = "native_context_menu_save_as";
    }

    logger?.info?.(
      `[FlowDownload] NATIVE_SAVE_AS_VERIFIED ${JSON.stringify({
        backendJobId: job?.backendJobId || job?.id,
        workerJobId: job?.id,
        sceneId: job?.sceneId,
        path: finalPath,
        fileSize: buffer.length,
        mimeType: detected.mimeType,
        width: dimensions.width,
        height: dimensions.height,
      })}`,
    );

    return {
      success: true,
      downloadMethod: "native_context_menu_save_as",
      path: finalPath,
      fileName: path.basename(finalPath),
      fileSize: buffer.length,
      mimeType: detected.mimeType,
      width: dimensions.width,
      height: dimensions.height,
      buffer,
    };
  } catch (error) {
    try {
      nativeController.cancel();
    } catch {}

    logger?.error?.(
      `[FlowDownload] NATIVE_SAVE_AS_FAILED ${JSON.stringify({
        workerJobId: job?.id,
        sceneId: job?.sceneId,
        error: error.message,
      })}`,
    );

    throw error;
  }
}

/**
 * Downloads a generated image asset from Google Flow.
 * Operates through the chat DOM, clicks the generated option to open the editor/viewer,
 * verifies the real viewer image, and executes native context-menu Save As.
 */
export async function downloadFlowImage({
  page,
  job,
  output,
  timeoutMs = 30000,
  downloadDir,
  browserProcessId = 0,
  logger = console,
  automationRunner,
}) {
  const startedAt = Date.now();
  let currentPhase = "CHAT_SCROLL_BOTTOM_REACHED";

  const logTransition = (phase, details = {}) => {
    currentPhase = phase;
    if (job) {
      job.downloadPhase = phase;
      job.lastProgressAt = new Date().toISOString();
      if (details.downloadMethod) {
        job.downloadMethod = details.downloadMethod;
      }
    }
    const entry = {
      backendJobId: job?.backendJobId || job?.id,
      workerJobId: job?.id,
      storyId: job?.storyId,
      sceneId: job?.sceneId,
      phase,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      success: details.success !== false,
      errorCode: details.errorCode || undefined,
      downloadMethod: details.downloadMethod || job?.downloadMethod || undefined,
      ...details,
    };

    if (logger && typeof logger.info === "function") {
      logger.info(`[FlowDownload] ${JSON.stringify(entry)}`);
    } else {
      console.log(`[FlowDownload] ${phase}`, JSON.stringify(entry));
    }
  };

  if (!page || (typeof page.isClosed === "function" && page.isClosed())) {
    const errorEntry = {
      success: false,
      code: "FLOW_PAGE_CLOSED",
      phase: currentPhase,
      message: "Browser page is closed or unavailable",
      jobId: job?.id,
    };
    logTransition("FLOW_PAGE_CLOSED", { success: false, errorCode: "FLOW_PAGE_CLOSED" });
    return errorEntry;
  }

  // 1. Scroll chat viewport to bottom and verify bottom reached
  const viewport = page.locator("flow-chat-scroller .scroll-viewport");
  if (typeof viewport.waitFor === "function") {
    await viewport.waitFor({
      state: "visible",
      timeout: 10000,
    });
  }

  await viewport.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });

  const reachedBottom = await viewport.evaluate((element) => {
    return (element.scrollHeight - element.scrollTop - element.clientHeight) <= 5;
  });

  if (!reachedBottom) {
    const scrollErr = {
      success: false,
      code: "FLOW_CHAT_SCROLL_BOTTOM_FAILED",
      phase: "CHAT_SCROLL_BOTTOM_REACHED",
      message: "Chat viewport could not be scrolled to the bottom.",
      jobId: job?.id,
    };
    logTransition("CHAT_SCROLL_BOTTOM_REACHED", {
      success: false,
      errorCode: "FLOW_CHAT_SCROLL_BOTTOM_FAILED",
    });
    return scrollErr;
  }

  logTransition("CHAT_SCROLL_BOTTOM_REACHED", { success: true });

  // 2. Identify latest assistant message and gallery
  const assistantMessages = page.locator(
    "flow-chat-scroller .messages-list > .agent-row.message-row, flow-chat-scroller .messages-list > .agent-row, .agent-row.message-row, .agent-row",
  );

  let assistantCount = 0;
  try {
    assistantCount = await assistantMessages.count().catch(() => 0);
  } catch {}

  const sourceMessageIndex = assistantCount > 0 ? assistantCount - 1 : 0;
  logTransition("LATEST_ASSISTANT_MESSAGE_FOUND", {
    success: true,
    sourceMessageIndex,
  });

  const latestAssistant =
    assistantCount > 0
      ? typeof assistantMessages.last === "function"
        ? assistantMessages.last()
        : assistantMessages.nth(assistantCount - 1)
      : page;

  const galleries =
    latestAssistant && typeof latestAssistant.locator === "function"
      ? latestAssistant.locator(
          'flow-a2ui-multiple-choice [role="group"][aria-label="Media options gallery"], flow-a2ui-multiple-choice .gallery-container, flow-a2ui-multiple-choice',
        )
      : page.locator('flow-a2ui-multiple-choice [role="group"][aria-label="Media options gallery"]');

  logTransition("NEW_IMAGE_GALLERY_FOUND", { success: true });

  // 3. IMAGE_OPTION_IDENTIFIED (Use exact target option from output detection)
  let selectedOption = null;
  if (output?.optionLocator) {
    selectedOption = output.optionLocator;
  } else if (galleries && typeof galleries.locator === "function") {
    const imageOptions = galleries.locator("flow-a2ui-image-option");
    const optCount = await imageOptions.count().catch(() => 0);
    if (optCount > 0) {
      const idx = Number.isInteger(job?.outputIndex) ? job.outputIndex : 0;
      selectedOption = getNthLocator(imageOptions, idx);
    }
  }

  if (!selectedOption) {
    const err = {
      success: false,
      code: "IMAGE_OPTION_NOT_FOUND",
      phase: "IMAGE_OPTION_IDENTIFIED",
      message: "No generation image option could be identified in the gallery.",
      jobId: job?.id,
    };
    logTransition("IMAGE_OPTION_IDENTIFIED", {
      success: false,
      errorCode: "IMAGE_OPTION_NOT_FOUND",
    });
    return err;
  }

  logTransition("IMAGE_OPTION_IDENTIFIED", { success: true });

  // 4. IMAGE_OPTION_CLICKED (Click image container to open enlarged viewer)
  const imageButtons = selectedOption.locator
    ? selectedOption.locator(
        'div.image-container[role="button"][aria-label="Open image in editor"], div.image-container.clickable, div.image-container',
      )
    : null;

  let clickTarget = selectedOption;
  if (imageButtons && (await imageButtons.count().catch(() => 0)) > 0) {
    clickTarget = getFirstLocator(imageButtons);
  }

  if (!clickTarget) {
    throw new Error("FLOW_IMAGE_CLICK_TARGET_MISSING");
  }

  const clickCount = await clickTarget.count().catch(() => 0);
  if (clickCount !== 1) {
    throw new Error(`FLOW_IMAGE_CLICK_TARGET_NOT_UNIQUE: ${clickCount}`);
  }

  if (typeof clickTarget.waitFor === "function") {
    await clickTarget.waitFor({
      state: "visible",
      timeout: 10000,
    });
  }

  if (typeof clickTarget.scrollIntoViewIfNeeded === "function") {
    await clickTarget.scrollIntoViewIfNeeded().catch(() => {});
  }

  await clickTarget.click({
    timeout: 10000,
  });

  logTransition("IMAGE_OPTION_CLICKED", { success: true });

  // 5. IMAGE_VIEWER_VERIFIED & ACTIVE_IMAGE_VERIFIED
  // Inspect DOM diagnostics for visible images
  await new Promise((r) => setTimeout(r, 600));

  const imageDiagnostics = await inspectVisibleImages(page);
  logger?.info?.(
    `[FlowDownload] VIEWER_IMAGE_DIAGNOSTICS ${JSON.stringify(imageDiagnostics)}`,
  );

  // Locate the actual enlarged viewer image (inside editor, dialog, viewer container)
  const viewerLocators = page.locator(
    'flow-image-editor img, .editor-container img, flow-creative-agent-image-viewer img, flow-image-viewer img, div[role="dialog"] img.editor-image, div[role="dialog"] img, .image-viewer img',
  );

  let activeViewerImage = null;
  const viewerCount = await viewerLocators.count().catch(() => 0);
  if (viewerCount === 1) {
    activeViewerImage = viewerLocators.first();
  } else if (viewerCount > 1) {
    // If multiple candidates exist inside the viewer, pick the one with natural dimensions >= 32
    for (let i = 0; i < viewerCount; i++) {
      const cand = viewerLocators.nth(i);
      const isVis = await cand.isVisible().catch(() => false);
      if (isVis) {
        const info = await cand
          .evaluate((img) => ({
            complete: Boolean(img.complete),
            naturalWidth: img.naturalWidth || 0,
            naturalHeight: img.naturalHeight || 0,
          }))
          .catch(() => null);
        if (info && info.complete && info.naturalWidth >= 32 && info.naturalHeight >= 32) {
          activeViewerImage = cand;
          break;
        }
      }
    }
  }

  // Strictly enforce that viewer image must be verifiable
  if (!activeViewerImage) {
    const viewerError = {
      success: false,
      code: "FLOW_IMAGE_VIEWER_NOT_FOUND",
      phase: "IMAGE_VIEWER_VERIFIED",
      message:
        "The selected Google Flow output did not open a verifiable image viewer.",
      jobId: job?.id,
    };
    logTransition("IMAGE_VIEWER_VERIFIED", {
      success: false,
      errorCode: "FLOW_IMAGE_VIEWER_NOT_FOUND",
    });
    return viewerError;
  }

  logTransition("IMAGE_VIEWER_VERIFIED", { success: true });
  logTransition("ACTIVE_IMAGE_VERIFIED", { success: true });

  // 6. Right-click and invoke Chrome native "Save image as"
  const targetDir = downloadDir || path.join(os.tmpdir(), "flow-downloads");
  try {
    const nativeResult = await saveImageUsingNativeContextMenu({
      page,
      imageLocator: activeViewerImage,
      job,
      downloadDir: targetDir,
      timeoutMs,
      browserProcessId,
      logger,
      automationRunner,
      onPhase: (ph, details) => logTransition(ph, details),
    });

    // Close viewer cleanly
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
      downloadMethod: "native_context_menu_save_as",
      path: nativeResult.path,
      fileName: nativeResult.fileName,
      fileSize: nativeResult.fileSize,
      mimeType: nativeResult.mimeType,
      width: nativeResult.width,
      height: nativeResult.height,
      buffer: nativeResult.buffer,
      jobId: job?.id,
      backendJobId: job?.backendJobId || job?.id,
      storyId: job?.storyId,
      sceneId: job?.sceneId,
    };
  } catch (nativeErr) {
    logTransition("NATIVE_SAVE_AS_FAILED", {
      success: false,
      errorCode: nativeErr.message,
      downloadMethod: "native_context_menu_save_as",
    });
    return {
      success: false,
      code: "NATIVE_SAVE_AS_FAILED",
      phase: currentPhase,
      message: nativeErr.message,
      jobId: job?.id,
    };
  }
}
