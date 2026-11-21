import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FlowBrowserWorker } from "../src/flow-browser.mjs";
import { downloadFlowImage } from "../src/flow-download.mjs";

describe("Flow Download Lifecycle & Stale Recovery Test Suite", () => {
  it("1. downloadFlowImage contract: Successfully downloads, saves, validates image, and reports all phase states", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flow-dl-test-"));
    const samplePng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAALUlEQVRYR+3QQREAAAzCQPr39g4fXgYk0L2Sqm8cAAAAAAAAAAAAAAAAAAB+1gO4/AH4rE2gOAAAAABJRU5ErkJggg==",
      "base64",
    );

    let clickCount = 0;
    const mockPage = {
      isClosed: () => false,
      locator: (selector) => ({
        count: async () => 1,
        nth: () => ({
          isVisible: async () => true,
          isEnabled: async () => true,
          click: async () => {
            clickCount++;
          },
        }),
        first: () => ({
          count: async () => 1,
          isVisible: async () => true,
          click: async () => {},
        }),
      }),
      waitForEvent: async (eventName) => {
        assert.equal(eventName, "download");
        return {
          saveAs: async (savePath) => {
            await fs.writeFile(savePath, samplePng);
          },
        };
      },
    };

    const job = {
      id: "job-dl-test-1",
      backendJobId: "bjob-1",
      sceneId: "scene-42",
    };

    const output = {
      optionLocator: {
        locator: () => ({ count: async () => 1, click: async () => {} }),
      },
    };

    const loggedPhases = [];
    const mockLogger = {
      info: (msg) => {
        const parsed = JSON.parse(msg.replace(/^\[FlowDownload\]\s*/, ""));
        loggedPhases.push(parsed.phase);
      },
    };

    const result = await downloadFlowImage({
      page: mockPage,
      job,
      output,
      timeoutMs: 5000,
      downloadDir: tempDir,
      logger: mockLogger,
    });

    assert.equal(result.success, true);
    assert.equal(result.jobId, "job-dl-test-1");
    assert.equal(result.mimeType, "image/png");
    assert.equal(result.width, 32);
    assert.equal(result.height, 32);
    assert.ok(result.fileSize > 0);
    assert.ok(await fs.stat(result.path));

    // Verify complete phase progression
    assert.ok(loggedPhases.includes("CHAT_SCROLL_STARTED"));
    assert.ok(loggedPhases.includes("CHAT_SCROLL_BOTTOM_REACHED"));
    assert.ok(loggedPhases.includes("LATEST_ASSISTANT_MESSAGE_FOUND"));
    assert.ok(loggedPhases.includes("NEW_IMAGE_GALLERY_FOUND"));
    assert.ok(loggedPhases.includes("IMAGE_OPTION_COUNT_VERIFIED"));
    assert.ok(loggedPhases.includes("IMAGE_THUMBNAIL_LOADED"));
    assert.ok(loggedPhases.includes("IMAGE_OPTION_CLICKED"));
    assert.ok(loggedPhases.includes("IMAGE_VIEWER_OPENED"));
    assert.ok(loggedPhases.includes("ACTIVE_IMAGE_IDENTIFIED"));
    assert.ok(loggedPhases.includes("IMAGE_RIGHT_CLICKED"));
    assert.ok(loggedPhases.includes("CONTEXT_MENU_DETECTED"));
    assert.ok(loggedPhases.includes("SAVE_IMAGE_ACTION_SELECTED"));
    assert.ok(loggedPhases.includes("DOWNLOAD_EVENT_RECEIVED"));
    assert.ok(loggedPhases.includes("IMAGE_SAVED_TO_DISK"));
    assert.ok(loggedPhases.includes("IMAGE_VALIDATION_COMPLETED"));

    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("2. downloadFlowImage timeout: Emits FLOW_DOWNLOAD_TIMEOUT when download event is not received", async () => {
    const mockPage = {
      isClosed: () => false,
      locator: () => ({
        count: async () => 1,
        nth: () => ({
          isVisible: async () => true,
          isEnabled: async () => true,
          click: async () => {},
        }),
      }),
      waitForEvent: async () => {
        throw new Error("Timeout 100ms exceeded");
      },
    };

    const job = { id: "job-dl-timeout" };
    const result = await downloadFlowImage({
      page: mockPage,
      job,
      output: null,
      timeoutMs: 50,
    });

    assert.equal(result.success, false);
    assert.equal(result.code, "FLOW_DOWNLOAD_TIMEOUT");
    assert.equal(result.phase, "DOWNLOAD_EVENT_RECEIVED");
    assert.equal(result.jobId, "job-dl-timeout");
  });

  it("3. recoverActiveJobLock Case 1: Reconciles downloaded file on disk and resumes import", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flow-rec-c1-"));
    const worker = new FlowBrowserWorker();
    const samplePng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAALUlEQVRYR+3QQREAAAzCQPr39g4fXgYk0L2Sqm8cAAAAAAAAAAAAAAAAAAB+1gO4/AH4rE2gOAAAAABJRU5ErkJggg==",
      "base64",
    );
    const downloadedFilePath = path.join(tempDir, "flow-stale-c1.png");
    await fs.writeFile(downloadedFilePath, samplePng);

    let importedJob = null;
    let importedBuffer = null;
    worker.importDownloadedAsset = async (j, buf) => {
      importedJob = j;
      importedBuffer = buf;
      j.status = "completed";
      j.importResult = { id: "asset-rec-1", url: "/storage/images/rec.png" };
    };

    const staleJob = worker.createJob({
      targetType: "background",
      prompt: "Stale job case 1",
      sceneId: "scene-c1",
      storyId: "story-c1",
    });
    staleJob.status = "downloading";
    staleJob.downloadPath = downloadedFilePath;
    staleJob.updatedAt = new Date(Date.now() - 200000).toISOString();
    worker.activeJobId = staleJob.id;

    worker.recoverActiveJobLock();
    // Wait brief microtask for async reconcile
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(worker.activeJobId, null, "Active lock must be released");
    assert.equal(staleJob.status, "completed", "Job must be reconciled to completed");
    assert.ok(importedJob, "importDownloadedAsset must have been called");
    assert.equal(importedBuffer.length, samplePng.length);

    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("4. recoverActiveJobLock Case 2: Reconciles captured image artifact in memory and resumes import", async () => {
    const worker = new FlowBrowserWorker();
    const samplePng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAALUlEQVRYR+3QQREAAAzCQPr39g4fXgYk0L2Sqm8cAAAAAAAAAAAAAAAAAAB+1gO4/AH4rE2gOAAAAABJRU5ErkJggg==",
      "base64",
    );

    let imported = false;
    worker.importDownloadedAsset = async (j) => {
      imported = true;
      j.status = "completed";
    };

    const staleJob = worker.createJob({
      targetType: "background",
      prompt: "Stale job case 2",
      sceneId: "scene-c2",
      storyId: "story-c2",
    });
    staleJob.status = "downloading";
    staleJob.capturedImageResponses = new Map([
      ["https://flow.google.com/asb/image-c2=s1600-rw", { buffer: samplePng, mimeType: "image/png" }],
    ]);
    staleJob.updatedAt = new Date(Date.now() - 200000).toISOString();
    worker.activeJobId = staleJob.id;

    worker.recoverActiveJobLock();
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(worker.activeJobId, null);
    assert.equal(staleJob.status, "completed");
    assert.equal(imported, true);
  });

  it("5. recoverActiveJobLock Case 4: Safely fails and clears lock when no recoverable artifact exists", async () => {
    const worker = new FlowBrowserWorker();
    const staleJob = worker.createJob({
      targetType: "background",
      prompt: "Stale job case 4",
      sceneId: "scene-c4",
      storyId: "story-c4",
    });
    staleJob.status = "awaiting_download";
    staleJob.updatedAt = new Date(Date.now() - 200000).toISOString();
    worker.activeJobId = staleJob.id;

    worker.recoverActiveJobLock();
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(worker.activeJobId, null, "Active lock must be released immediately");
    assert.equal(staleJob.status, "failed");
    assert.equal(staleJob.errorCode, "STALE_DOWNLOAD_JOB");
    assert.ok(staleJob.error.includes("STALE_DOWNLOAD_JOB"));
  });

  it("6. downloadFlowImage: Captures image using in-tab authenticated fetch fallback when native context menu is outside DOM", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flow-dl-eval-"));
    const samplePngBase64 =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAALUlEQVRYR+3QQREAAAzCQPr39g4fXgYk0L2Sqm8cAAAAAAAAAAAAAAAAAAB+1gO4/AH4rE2gOAAAAABJRU5ErkJggg==";

    const mockPage = {
      isClosed: () => false,
      url: () => "https://flow.google.com/project/test-1",
      locator: () => ({
        count: async () => 0,
        nth: () => ({
          isVisible: async () => false,
          isEnabled: async () => false,
        }),
        first: () => ({
          isVisible: async () => false,
        }),
      }),
      evaluate: async (fn, arg) => {
        // Simulates in-tab fetch of the full resolution image
        return samplePngBase64;
      },
    };

    const job = {
      id: "job-dl-eval-1",
      backendJobId: "bjob-eval",
      sceneId: "scene-eval",
    };

    const output = {
      sourceUrl: "https://flow.google.com/asb/test-eval-image=s1600-rw",
    };

    const result = await downloadFlowImage({
      page: mockPage,
      job,
      output,
      downloadDir: tempDir,
    });

    assert.equal(result.success, true);
    assert.equal(result.mimeType, "image/png");
    assert.equal(result.width, 32);
    assert.equal(result.height, 32);
    assert.ok(result.fileSize > 0);
    assert.equal(job.outputIndex, 0);
    assert.equal(job.sourceImageUrl, "https://flow.google.com/asb/test-eval-image=s1600-rw");

    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });
});
