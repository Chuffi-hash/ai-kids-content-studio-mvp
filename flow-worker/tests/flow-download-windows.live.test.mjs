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
        timeoutMs: 30000,
        downloadDir: tempDir,
        logger: console,
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
      assert.ok(detected, "Saved file must be a valid image format");

      const dimensions = parseImageDimensions(buffer);
      assert.ok(dimensions.width >= 32, `Width must be >= 32, got ${dimensions.width}`);
      assert.ok(dimensions.height >= 32, `Height must be >= 32, got ${dimensions.height}`);

      console.log(
        `[LiveTest] Native Save As successfully verified: ${dlResult.path} (${fileStat.size} bytes, ${dimensions.width}x${dimensions.height} ${detected.mimeType})`,
      );
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
