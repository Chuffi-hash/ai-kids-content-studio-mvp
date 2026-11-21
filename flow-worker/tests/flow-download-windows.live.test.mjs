import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FlowBrowserWorker } from "../src/flow-browser.mjs";
import { downloadFlowImage } from "../src/flow-download.mjs";
import { detectImageType, parseImageDimensions } from "../src/image-validation.mjs";

describe("Google Flow Live Windows Context Menu Download Integration", () => {
  const isEnabled = process.env.RUN_FLOW_NATIVE_DOWNLOAD_TEST === "1";

  it("Executes live right-click context menu and Windows Save As on active Google Flow session", async (t) => {
    if (!isEnabled) {
      t.skip("Opt-in live test skipped. Set $env:RUN_FLOW_NATIVE_DOWNLOAD_TEST='1' to run against live headed Chrome.");
      return;
    }

    if (process.platform !== "win32") {
      t.skip("Windows UI Automation test requires Windows.");
      return;
    }

    const worker = new FlowBrowserWorker();
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flow-live-dl-"));

    const loggedPhases = [];
    const liveLogger = {
      info: (msg) => {
        try {
          const parsed = JSON.parse(msg.replace(/^\[FlowDownload\]\s*/, ""));
          if (parsed.phase) loggedPhases.push(parsed.phase);
        } catch {}
        console.log(msg);
      },
      warn: console.warn,
      error: console.error,
    };

    try {
      // Connect to or open existing Google Flow session
      const status = await worker.getStatus();
      if (!status.session?.isOpen) {
        await worker.openBrowser({ headless: false });
      }

      assert.ok(worker.page, "Browser page must be open");

      const pageUrl = worker.page.url();
      assert.ok(
        pageUrl.includes("flow.google.com"),
        `Page must be on flow.google.com, current URL: ${pageUrl}`,
      );

      const job = worker.createJob({
        targetType: "background",
        prompt: "Live Windows Native Save As Verification",
        sceneId: "scene-live-test",
      });

      // Use already generated image from latest assistant chat response without submitting a new generation
      const dlResult = await downloadFlowImage({
        page: worker.page,
        job,
        output: null,
        timeoutMs: 35000,
        downloadDir: tempDir,
        logger: liveLogger,
      });

      assert.equal(dlResult.success, true, `Download must succeed: ${dlResult.message}`);
      assert.equal(dlResult.downloadMethod, "native_context_menu_save_as");
      assert.ok(dlResult.path, "Result path must exist");

      // Verify file exists on disk
      const fileStat = await fs.stat(dlResult.path);
      assert.ok(fileStat.isFile(), "Saved asset must be a regular file");
      assert.ok(fileStat.size > 1000, "Image file must have non-trivial size");

      // Verify image bytes and dimensions
      const buffer = await fs.readFile(dlResult.path);
      const detected = detectImageType(buffer);
      assert.ok(detected, "Saved file must be a valid image format (PNG, WebP, JPEG)");

      const dimensions = parseImageDimensions(buffer);
      assert.ok(dimensions.width >= 32, `Width must be >= 32, got ${dimensions.width}`);
      assert.ok(dimensions.height >= 32, `Height must be >= 32, got ${dimensions.height}`);

      // Verify all required native phases actually occurred
      assert.ok(loggedPhases.includes("CHAT_SCROLL_BOTTOM_REACHED"), "Must reach bottom of chat");
      assert.ok(loggedPhases.includes("LATEST_ASSISTANT_MESSAGE_FOUND"), "Must find latest assistant message");
      assert.ok(loggedPhases.includes("NEW_IMAGE_GALLERY_FOUND"), "Must find image gallery");
      assert.ok(loggedPhases.includes("IMAGE_OPTION_IDENTIFIED"), "Must identify image option");
      assert.ok(loggedPhases.includes("IMAGE_OPTION_CLICKED"), "Must click image option");
      assert.ok(loggedPhases.includes("IMAGE_VIEWER_VERIFIED"), "Must verify image viewer");
      assert.ok(loggedPhases.includes("ACTIVE_IMAGE_VERIFIED"), "Must verify active viewer image");
      assert.ok(loggedPhases.includes("FLOW_IMAGE_EDITOR_OPENED"), "Must log FLOW_IMAGE_EDITOR_OPENED");
      assert.ok(loggedPhases.includes("NATIVE_SAVE_IMAGE_AS_STARTED"), "Must log NATIVE_SAVE_IMAGE_AS_STARTED");
      assert.ok(loggedPhases.includes("IMAGE_RIGHT_CLICK_DISPATCHED"), "Must right-click image");
      assert.ok(loggedPhases.includes("NATIVE_CONTEXT_MENU_SAVE_IMAGE_FOUND"), "Must find native context menu item");
      assert.ok(loggedPhases.includes("NATIVE_SAVE_AS_DIALOG_FOUND"), "Must find native Save As dialog");
      assert.ok(loggedPhases.includes("NATIVE_SAVE_AS_CONFIRMED"), "Must invoke Save button");
      assert.ok(loggedPhases.includes("FILE_EXISTS_VERIFIED"), "Must verify saved file exists");
      assert.ok(loggedPhases.includes("NATIVE_SAVE_IMAGE_AS_COMPLETED"), "Must log NATIVE_SAVE_IMAGE_AS_COMPLETED");
      assert.ok(loggedPhases.includes("BACKGROUND_IMAGE_VALIDATED"), "Must log BACKGROUND_IMAGE_VALIDATED");
      assert.ok(loggedPhases.includes("IMAGE_CONTENT_VALIDATED"), "Must validate image bytes");
      assert.ok(loggedPhases.includes("FLOW_EDITOR_DONE_CLICK_STARTED"), "Must log FLOW_EDITOR_DONE_CLICK_STARTED");
      assert.ok(loggedPhases.includes("FLOW_IMAGE_EDITOR_CLOSED"), "Must log FLOW_IMAGE_EDITOR_CLOSED");
      assert.equal(dlResult.editorClosed, true, "Image editor must be closed via Done button");

      console.log(
        `[LiveTest] Native Save As successfully verified: ${dlResult.path} (${fileStat.size} bytes, ${dimensions.width}x${dimensions.height} ${detected.mimeType})`,
      );
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
