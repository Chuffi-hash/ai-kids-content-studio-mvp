import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FlowBrowserWorker } from "../src/flow-browser.mjs";
import {
  downloadFlowImage,
  saveImageUsingNativeContextMenu,
  inspectVisibleImages,
} from "../src/flow-download.mjs";

describe("Flow Download Lifecycle & Stale Recovery Test Suite", () => {
  const samplePngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAALUlEQVRYR+3QQREAAAzCQPr39g4fXgYk0L2Sqm8cAAAAAAAAAAAAAAAAAAB+1gO4/AH4rE2gOAAAAABJRU5ErkJggg==";
  const samplePngBuffer = Buffer.from(samplePngBase64, "base64");

  it("1. downloadFlowImage: Uses chat DOM selectors, clicks target option, and verifies viewer", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flow-dl-dom-"));

    let viewportScrolled = false;
    let optionClicked = false;
    let rightClicked = false;
    let readyCheckedBeforeClick = false;

    const mockOption = {
      count: async () => 1,
      waitFor: async () => {},
      scrollIntoViewIfNeeded: async () => {},
      click: async () => {
        optionClicked = true;
      },
      locator: () => ({
        count: async () => 1,
        first: () => ({
          count: async () => 1,
          waitFor: async () => {},
          scrollIntoViewIfNeeded: async () => {},
          click: async () => {
            optionClicked = true;
          },
        }),
      }),
    };

    const mockViewerImg = {
      count: async () => 1,
      waitFor: async () => {},
      scrollIntoViewIfNeeded: async () => {},
      evaluate: async (fn) =>
        fn({
          currentSrc: "https://flow.google.com/asb/test-image=s1600-rw",
          src: "https://flow.google.com/asb/test-image=s1600-rw",
          complete: true,
          naturalWidth: 1024,
          naturalHeight: 576,
          tagName: "IMG",
        }),
      boundingBox: async () => ({ x: 100, y: 100, width: 600, height: 400 }),
      click: async ({ button }) => {
        if (button === "right") {
          rightClicked = true;
        }
      },
    };

    const mockPage = {
      isClosed: () => false,
      mouse: {
        click: async (x, y, opts) => {
          if (opts?.button === "right") {
            rightClicked = true;
          }
        },
      },
      locator: (selector) => {
        if (selector === "flow-chat-scroller .scroll-viewport") {
          return {
            waitFor: async () => {},
            evaluate: async (fn) => {
              viewportScrolled = true;
              return fn({ scrollTop: 500, scrollHeight: 1000, clientHeight: 500 });
            },
            first: () => ({
              isVisible: async () => true,
              evaluate: async (fn) => {
                viewportScrolled = true;
                return fn({ scrollTop: 500, scrollHeight: 1000, clientHeight: 500 });
              },
            }),
          };
        }
        if (selector.includes("flow-image-editor img") || selector.includes(".editor-container img")) {
          return {
            count: async () => 1,
            first: () => mockViewerImg,
            nth: () => mockViewerImg,
          };
        }
        return {
          count: async () => 1,
          first: () => ({
            count: async () => 1,
            waitFor: async () => {},
            isVisible: async () => true,
            click: async () => {},
          }),
          last: () => ({
            locator: () => ({
              locator: () => mockOption,
            }),
          }),
          nth: () => ({
            count: async () => 1,
            waitFor: async () => {},
            isVisible: async () => true,
            click: async () => {},
          }),
        };
      },
    };

    // Inject mock automationRunner to simulate native UI automation and machine-readable progress
    const mockAutomationRunner = ({ outputPath, onProgress }) => {
      let isReady = false;
      const ready = new Promise((resolve) => {
        isReady = true;
        readyCheckedBeforeClick = true;
        resolve();
      });

      const result = (async () => {
        await ready;
        assert.ok(isReady, "Native controller must be ready before right-click");
        onProgress?.("NATIVE_MENU_ITEM_FOUND");
        onProgress?.("SAVE_DIALOG_FOUND");
        onProgress?.("FILE_NAME_SET");
        onProgress?.("SAVE_BUTTON_INVOKED");
        await fs.writeFile(outputPath, samplePngBuffer);
        onProgress?.("FILE_EXISTS_VERIFIED");
        return {
          success: true,
          path: outputPath,
          fileSize: samplePngBuffer.length,
        };
      })();

      return {
        ready,
        result,
        cancel: () => {},
      };
    };

    const loggedPhases = [];
    const mockLogger = {
      info: (msg) => {
        try {
          const parsed = JSON.parse(msg.replace(/^\[FlowDownload\]\s*/, ""));
          if (parsed.phase) loggedPhases.push(parsed.phase);
        } catch {}
      },
      error: () => {},
    };

    const job = {
      id: "job-native-1",
      backendJobId: "bjob-native-1",
      sceneId: "scene-101",
    };

    const result = await downloadFlowImage({
      page: mockPage,
      job,
      output: { optionLocator: mockOption },
      downloadDir: tempDir,
      logger: mockLogger,
      automationRunner: mockAutomationRunner,
    });

    assert.equal(result.success, true);
    assert.equal(result.downloadMethod, "native_context_menu_save_as");
    assert.equal(viewportScrolled, true, "Chat viewport must be scrolled");
    assert.equal(optionClicked, true, "Option must be clicked");
    assert.equal(rightClicked, true, "Image must be right-clicked");
    assert.equal(readyCheckedBeforeClick, true, "Native runner must be ready before click");
    assert.ok(result.width >= 32);
    assert.ok(result.height >= 32);
    assert.equal(result.mimeType, "image/png");

    assert.ok(loggedPhases.includes("CHAT_SCROLL_BOTTOM_REACHED"));
    assert.ok(loggedPhases.includes("IMAGE_OPTION_IDENTIFIED"));
    assert.ok(loggedPhases.includes("IMAGE_OPTION_CLICKED"));
    assert.ok(loggedPhases.includes("IMAGE_VIEWER_VERIFIED"));
    assert.ok(loggedPhases.includes("ACTIVE_IMAGE_VERIFIED"));
    assert.ok(loggedPhases.includes("IMAGE_RIGHT_CLICK_DISPATCHED"));
    assert.ok(loggedPhases.includes("NATIVE_CONTEXT_MENU_SAVE_IMAGE_FOUND"));
    assert.ok(loggedPhases.includes("NATIVE_SAVE_AS_DIALOG_FOUND"));
    assert.ok(loggedPhases.includes("NATIVE_SAVE_AS_CONFIRMED"));
    assert.ok(loggedPhases.includes("FILE_EXISTS_VERIFIED"));
    assert.ok(loggedPhases.includes("IMAGE_CONTENT_VALIDATED"));

    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("2. downloadFlowImage: Fails with FLOW_IMAGE_VIEWER_NOT_FOUND when viewer does not open", async () => {
    const mockOption = {
      count: async () => 1,
      waitFor: async () => {},
      scrollIntoViewIfNeeded: async () => {},
      click: async () => {},
      locator: () => ({ count: async () => 0 }),
    };

    const mockPage = {
      isClosed: () => false,
      locator: (sel) => {
        if (sel === "flow-chat-scroller .scroll-viewport") {
          return {
            waitFor: async () => {},
            evaluate: async (fn) => fn({ scrollTop: 500, scrollHeight: 1000, clientHeight: 500 }),
          };
        }
        return {
          count: async () => 0,
          first: () => ({
            count: async () => 0,
            isVisible: async () => false,
          }),
        };
      },
    };

    const job = { id: "job-no-viewer" };
    const result = await downloadFlowImage({
      page: mockPage,
      job,
      output: { optionLocator: mockOption },
    });

    assert.equal(result.success, false);
    assert.equal(result.code, "FLOW_IMAGE_VIEWER_NOT_FOUND");
    assert.equal(result.phase, "IMAGE_VIEWER_VERIFIED");
  });

  it("3. saveImageUsingNativeContextMenu: Rejects invalid or corrupted image bytes", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flow-corrupt-"));
    const corruptedBuffer = Buffer.from("NOT_AN_IMAGE_HEADER_AT_ALL");

    const mockViewerImg = {
      count: async () => 1,
      waitFor: async () => {},
      scrollIntoViewIfNeeded: async () => {},
      evaluate: async (fn) =>
        fn({
          src: "https://flow.google.com/asb/test.png",
          complete: true,
          naturalWidth: 200,
          naturalHeight: 200,
          tagName: "IMG",
        }),
      boundingBox: async () => ({ x: 50, y: 50, width: 200, height: 200 }),
    };

    const mockAutomationRunner = ({ outputPath }) => ({
      ready: Promise.resolve(),
      result: (async () => {
        await fs.writeFile(outputPath, corruptedBuffer);
        return { success: true, path: outputPath, fileSize: corruptedBuffer.length };
      })(),
      cancel: () => {},
    });

    const mockPage = {
      isClosed: () => false,
      mouse: { click: async () => {} },
    };

    const job = { id: "job-corrupt-test" };

    await assert.rejects(
      async () => {
        await saveImageUsingNativeContextMenu({
          page: mockPage,
          imageLocator: mockViewerImg,
          job,
          downloadDir: tempDir,
          automationRunner: mockAutomationRunner,
        });
      },
      /NATIVE_SAVE_AS_INVALID_IMAGE_FORMAT/,
    );

    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("4. saveImageUsingNativeContextMenu: Propagates native automation error and cancels controller", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flow-fail-"));
    let cancelled = false;

    const mockViewerImg = {
      count: async () => 1,
      waitFor: async () => {},
      scrollIntoViewIfNeeded: async () => {},
      evaluate: async (fn) =>
        fn({
          src: "https://flow.google.com/asb/test.png",
          complete: true,
          naturalWidth: 200,
          naturalHeight: 200,
          tagName: "IMG",
        }),
      boundingBox: async () => ({ x: 50, y: 50, width: 200, height: 200 }),
    };

    const mockAutomationRunner = () => ({
      ready: Promise.resolve(),
      result: Promise.reject(new Error("Windows Save As dialog did not appear.")),
      cancel: () => {
        cancelled = true;
      },
    });

    const mockPage = {
      isClosed: () => false,
      mouse: { click: async () => {} },
    };

    const job = { id: "job-native-err" };

    await assert.rejects(
      async () => {
        await saveImageUsingNativeContextMenu({
          page: mockPage,
          imageLocator: mockViewerImg,
          job,
          downloadDir: tempDir,
          automationRunner: mockAutomationRunner,
        });
      },
      /Windows Save As dialog did not appear/,
    );

    assert.equal(cancelled, true, "Controller must be cancelled on error");
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("5. inspectVisibleImages: Accurately reports geometry and attributes of image tags", async () => {
    const mockPage = {
      locator: (sel) => {
        assert.equal(sel, "img");
        return {
          evaluateAll: async (fn) => {
            const fakeImgs = [
              {
                src: "https://flow.google.com/thumb.png",
                alt: "thumb",
                complete: true,
                naturalWidth: 100,
                naturalHeight: 100,
                getBoundingClientRect: () => ({ x: 10, y: 20, width: 100, height: 100 }),
                parentElement: {
                  tagName: "DIV",
                  className: "image-container",
                  parentElement: { tagName: "FLOW-A2UI-IMAGE-OPTION", className: "media-option" },
                },
              },
            ];
            global.window = {
              getComputedStyle: () => ({ visibility: "visible", display: "block" }),
            };
            return fn(fakeImgs);
          },
        };
      },
    };

    const images = await inspectVisibleImages(mockPage);
    assert.equal(images.length, 1);
    assert.equal(images[0].src, "https://flow.google.com/thumb.png");
    assert.equal(images[0].visible, true);
    assert.equal(images[0].parentTag, "DIV");
  });

  it("6. recoverActiveJobLock: Preserves original status in STALE_DOWNLOAD_JOB error message", async () => {
    const worker = new FlowBrowserWorker();
    const staleJob = worker.createJob({
      targetType: "background",
      prompt: "Stale job test",
      sceneId: "scene-stale-status",
      storyId: "story-stale-status",
    });
    staleJob.status = "awaiting_download";
    staleJob.updatedAt = new Date(Date.now() - 200000).toISOString();
    worker.activeJobId = staleJob.id;

    worker.recoverActiveJobLock();
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(worker.activeJobId, null, "Active lock must be released");
    assert.equal(staleJob.status, "failed");
    assert.equal(staleJob.errorCode, "STALE_DOWNLOAD_JOB");
    assert.ok(
      staleJob.error.includes('in status "awaiting_download"'),
      `Error message should contain original status awaiting_download, got: ${staleJob.error}`,
    );
  });

  it("7. recoverActiveJobLock Case 1: Reconciles downloaded file on disk and resumes import", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flow-rec-c1-"));
    const worker = new FlowBrowserWorker();
    const downloadedFilePath = path.join(tempDir, "flow-stale-c1.png");
    await fs.writeFile(downloadedFilePath, samplePngBuffer);

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
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(worker.activeJobId, null, "Active lock must be released");
    assert.equal(staleJob.status, "completed", "Job must be reconciled to completed");
    assert.ok(importedJob, "importDownloadedAsset must have been called");
    assert.equal(importedBuffer.length, samplePngBuffer.length);

    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });
});
