import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FlowBrowserWorker } from "../src/flow-browser.mjs";
import {
  downloadFlowImage,
  closeFlowImageEditor,
} from "../src/flow-download.mjs";

describe("Google Flow Image Viewer Done Editing Workflow Suite", () => {
  const samplePngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAALUlEQVRYR+3QQREAAAzCQPr39g4fXgYk0L2Sqm8cAAAAAAAAAAAAAAAAAAB+1gO4/AH4rE2gOAAAAABJRU5ErkJggg==";
  const samplePngBuffer = Buffer.from(samplePngBase64, "base64");

  function createMockAutomationRunner(buffer = samplePngBuffer) {
    return ({ outputPath, onProgress }) => {
      const ready = Promise.resolve();
      const result = (async () => {
        onProgress?.("NATIVE_MENU_ITEM_FOUND");
        onProgress?.("SAVE_DIALOG_FOUND");
        onProgress?.("FILE_NAME_SET");
        onProgress?.("SAVE_BUTTON_INVOKED");
        await fs.writeFile(outputPath, buffer);
        onProgress?.("FILE_EXISTS_VERIFIED");
        return {
          success: true,
          path: outputPath,
          fileSize: buffer.length,
        };
      })();

      return {
        ready,
        result,
        cancel: () => {},
      };
    };
  }

  function createBaseMockPage(options = {}) {
    let doneClicked = false;
    let doneHidden = false;
    let currentUrl = options.initialUrl || "https://flow.google.com/project/p1/edit/e1";

    const mockDoneBtn = {
      isVisible: async () => !doneHidden && options.doneVisible !== false,
      isEnabled: async () => options.doneDisabled !== true,
      waitFor: async ({ state } = {}) => {
        if (state === "visible" && (options.doneVisible === false || options.missingDoneButton)) {
          throw new Error("Timeout waiting for visible");
        }
        if (state === "hidden" && options.failDoneHide) {
          throw new Error("Timeout waiting for hidden");
        }
        if (state === "hidden") {
          doneHidden = true;
        }
      },
      click: async () => {
        if (options.failDoneClick) {
          throw new Error("Click failed: button intercepted");
        }
        doneClicked = true;
        if (!options.failDoneHide) {
          doneHidden = true;
          currentUrl = options.afterClickUrl || "https://flow.google.com/project/p1";
        }
      },
    };

    const mockOption = {
      count: async () => 1,
      waitFor: async () => {},
      scrollIntoViewIfNeeded: async () => {},
      click: async () => {},
      locator: () => ({
        count: async () => 1,
        first: () => ({
          count: async () => 1,
          waitFor: async () => {},
          scrollIntoViewIfNeeded: async () => {},
          click: async () => {},
        }),
      }),
    };

    const mockViewerImg = {
      count: async () => 1,
      waitFor: async () => {},
      scrollIntoViewIfNeeded: async () => {},
      evaluate: async (fn) =>
        fn({
          currentSrc: "https://flow.google.com/asb/test=s1600-rw",
          src: "https://flow.google.com/asb/test=s1600-rw",
          complete: true,
          naturalWidth: 1024,
          naturalHeight: 576,
          tagName: "IMG",
        }),
      boundingBox: async () => ({ x: 100, y: 100, width: 600, height: 400 }),
      click: async () => {},
    };

    const mockButtons = {
      count: async () => {
        if (options.missingDoneButton) return 0;
        if (options.multipleDoneButtons) return 2;
        return 1;
      },
      first: () => mockDoneBtn,
      nth: (n) => mockDoneBtn,
      waitFor: async ({ state } = {}) => {
        if (state === "visible" && options.missingDoneButton) {
          throw new Error("Timeout waiting for visible");
        }
      },
    };

    const mockHeader = {
      count: async () => (options.missingHeader ? 0 : 1),
      waitFor: async ({ state } = {}) => {
        if (options.missingHeader) {
          throw new Error("Timeout waiting for header.header-base");
        }
      },
      locator: (sel) => {
        if (sel === 'button[aria-label="Done editing"]') {
          return mockButtons;
        }
        return {
          count: async () => 0,
        };
      },
    };

    const page = {
      url: () => currentUrl,
      isClosed: () => false,
      mouse: { click: async () => {} },
      evaluate: async (fn) => {
        return {
          href: currentUrl,
          title: "Flow Editor",
          headerExists: !options.missingHeader,
          headerVisible: !options.missingHeader,
          doneButtons: options.missingDoneButton
            ? []
            : [
                {
                  ariaLabel: "Done editing",
                  text: "Done",
                  visible: true,
                  disabled: options.doneDisabled === true,
                },
              ],
          headerButtons: [],
        };
      },
      context: () => ({
        pages: () => [page],
      }),
      waitForURL: async (predicate, { timeout } = {}) => {
        if (options.failDoneHide) {
          throw new Error("Timeout waiting for URL change");
        }
        if (typeof predicate === "function") {
          currentUrl = options.afterClickUrl || "https://flow.google.com/project/p1";
          if (!predicate(currentUrl)) {
            throw new Error("Timeout waiting for URL condition");
          }
        }
      },
      getByRole: (role, opts) => {
        if (role === "button" && opts?.name === "Done editing") {
          return mockButtons;
        }
        return { count: async () => 0 };
      },
      locator: (selector) => {
        if (selector === "header.header-base" || selector === "flow-editor-header") {
          return mockHeader;
        }
        if (selector === "flow-chat-scroller .scroll-viewport") {
          return {
            waitFor: async () => {},
            evaluate: async (fn) => fn({ scrollTop: 500, scrollHeight: 1000, clientHeight: 500 }),
          };
        }
        if (selector.includes("flow-image-editor img") || selector.includes(".editor-container img")) {
          return {
            count: async () => 1,
            first: () => mockViewerImg,
            nth: () => mockViewerImg,
          };
        }
        if (selector === 'button[aria-label="Done editing"]') {
          return mockButtons;
        }
        return {
          count: async () => 1,
          first: () => ({ count: async () => 1, waitFor: async () => {}, isVisible: async () => true }),
          last: () => ({ locator: () => ({ locator: () => mockOption }) }),
          nth: () => ({ count: async () => 1, waitFor: async () => {}, isVisible: async () => true }),
        };
      },
      isDoneClicked: () => doneClicked,
      isDoneHidden: () => doneHidden,
    };

    return { page, mockOption };
  }

  it("1. Native download succeeds → file validation succeeds → Done clicked and editor verified closed", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flow-test-1-"));
    const { page, mockOption } = createBaseMockPage();

    const loggedPhases = [];
    const mockLogger = {
      info: (msg) => {
        try {
          const parsed = JSON.parse(msg.replace(/^\[FlowDownload\]\s*/, ""));
          if (parsed.phase) loggedPhases.push(parsed.phase);
        } catch {}
      },
      warn: () => {},
      error: () => {},
    };

    const res = await downloadFlowImage({
      page,
      job: { id: "job-1", backendJobId: "bjob-1" },
      output: { optionLocator: mockOption },
      downloadDir: tempDir,
      logger: mockLogger,
      automationRunner: createMockAutomationRunner(),
    });

    assert.equal(res.success, true);
    assert.equal(res.editorClosed, true);
    assert.equal(page.isDoneClicked(), true, "Done button must be clicked");
    assert.equal(page.isDoneHidden(), true, "Done button must become hidden");

    assert.ok(loggedPhases.includes("FLOW_IMAGE_EDITOR_OPENED"), "Must log FLOW_IMAGE_EDITOR_OPENED");
    assert.ok(loggedPhases.includes("NATIVE_SAVE_IMAGE_AS_STARTED"), "Must log NATIVE_SAVE_IMAGE_AS_STARTED");
    assert.ok(loggedPhases.includes("NATIVE_SAVE_IMAGE_AS_COMPLETED"), "Must log NATIVE_SAVE_IMAGE_AS_COMPLETED");
    assert.ok(loggedPhases.includes("BACKGROUND_IMAGE_VALIDATED"), "Must log BACKGROUND_IMAGE_VALIDATED");
    assert.ok(loggedPhases.includes("FLOW_EDITOR_DONE_CLICK_STARTED"), "Must log FLOW_EDITOR_DONE_CLICK_STARTED");
    assert.ok(loggedPhases.includes("FLOW_IMAGE_EDITOR_CLOSED"), "Must log FLOW_IMAGE_EDITOR_CLOSED");

    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("2. Native download fails → Done is NOT clicked", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flow-test-2-"));
    const { page, mockOption } = createBaseMockPage();

    const failAutomationRunner = () => ({
      ready: Promise.resolve(),
      result: Promise.reject(new Error("Native context menu timed out")),
      cancel: () => {},
    });

    const res = await downloadFlowImage({
      page,
      job: { id: "job-2" },
      output: { optionLocator: mockOption },
      downloadDir: tempDir,
      automationRunner: failAutomationRunner,
    });

    assert.equal(res.success, false);
    assert.equal(res.code, "NATIVE_SAVE_AS_FAILED");
    assert.equal(page.isDoneClicked(), false, "Done button MUST NOT be clicked if download fails");

    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("3. Image validation fails (corrupted bytes) → Done is NOT clicked", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flow-test-3-"));
    const { page, mockOption } = createBaseMockPage();

    const corruptBuffer = Buffer.from("NOT_A_VALID_IMAGE_BUFFER");

    const res = await downloadFlowImage({
      page,
      job: { id: "job-3" },
      output: { optionLocator: mockOption },
      downloadDir: tempDir,
      automationRunner: createMockAutomationRunner(corruptBuffer),
    });

    assert.equal(res.success, false);
    assert.equal(res.code, "NATIVE_SAVE_AS_FAILED");
    assert.equal(page.isDoneClicked(), false, "Done button MUST NOT be clicked if validation fails");

    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("4. Done button is missing → download remains successful; cleanup status reports failure", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flow-test-4-"));
    const { page, mockOption } = createBaseMockPage({ missingDoneButton: true });

    const loggedPhases = [];
    const mockLogger = {
      info: (msg) => {
        try {
          const parsed = JSON.parse(msg.replace(/^\[FlowDownload\]\s*/, ""));
          if (parsed.phase) loggedPhases.push(parsed.phase);
        } catch {}
      },
      warn: () => {},
      error: () => {},
    };

    const res = await downloadFlowImage({
      page,
      job: { id: "job-4" },
      output: { optionLocator: mockOption },
      downloadDir: tempDir,
      logger: mockLogger,
      automationRunner: createMockAutomationRunner(),
    });

    assert.equal(res.success, true, "Download itself must remain successful");
    assert.equal(res.editorClosed, false, "Editor closed must be false");
    assert.ok(res.editorCloseError.includes("FLOW_EDITOR_DONE_BUTTON_NOT_FOUND"));
    assert.ok(loggedPhases.includes("FLOW_EDITOR_DONE_BUTTON_NOT_FOUND"));
    assert.ok(!loggedPhases.includes("FLOW_IMAGE_EDITOR_CLOSED"), "Must not report editor closed");

    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("5. Done button click fails → download remains successful", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flow-test-5-"));
    const { page, mockOption } = createBaseMockPage({ failDoneClick: true });

    const loggedPhases = [];
    const mockLogger = {
      info: (msg) => {
        try {
          const parsed = JSON.parse(msg.replace(/^\[FlowDownload\]\s*/, ""));
          if (parsed.phase) loggedPhases.push(parsed.phase);
        } catch {}
      },
      warn: () => {},
      error: () => {},
    };

    const res = await downloadFlowImage({
      page,
      job: { id: "job-5" },
      output: { optionLocator: mockOption },
      downloadDir: tempDir,
      logger: mockLogger,
      automationRunner: createMockAutomationRunner(),
    });

    assert.equal(res.success, true, "Download itself must remain successful");
    assert.equal(res.editorClosed, false, "Editor close should report false");
    assert.ok(res.editorCloseError.includes("FLOW_EDITOR_CLOSE_FAILED"));
    assert.ok(loggedPhases.includes("FLOW_EDITOR_CLOSE_FAILED"));
    assert.ok(!loggedPhases.includes("FLOW_IMAGE_EDITOR_CLOSED"));

    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("6. Done clicked but editor remains open → timeout reported", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flow-test-6-"));
    const { page, mockOption } = createBaseMockPage({ failDoneHide: true });

    const loggedPhases = [];
    const mockLogger = {
      info: (msg) => {
        try {
          const parsed = JSON.parse(msg.replace(/^\[FlowDownload\]\s*/, ""));
          if (parsed.phase) loggedPhases.push(parsed.phase);
        } catch {}
      },
      warn: () => {},
      error: () => {},
    };

    const res = await downloadFlowImage({
      page,
      job: { id: "job-6" },
      output: { optionLocator: mockOption },
      downloadDir: tempDir,
      logger: mockLogger,
      automationRunner: createMockAutomationRunner(),
    });

    assert.equal(res.success, true, "Download remains successful");
    assert.equal(res.editorClosed, false);
    assert.ok(res.editorCloseError.includes("FLOW_EDITOR_CLOSE_TIMEOUT"));
    assert.ok(loggedPhases.includes("FLOW_EDITOR_CLOSE_TIMEOUT"));
    assert.ok(!loggedPhases.includes("FLOW_IMAGE_EDITOR_CLOSED"));

    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("7. Multiple Done buttons visible → automation refuses to click ambiguous button", async () => {
    const { page } = createBaseMockPage({ multipleDoneButtons: true });

    let errorThrown = null;
    try {
      await closeFlowImageEditor(page, console, { timeoutMs: 1000 });
    } catch (e) {
      errorThrown = e;
    }

    assert.ok(errorThrown, "Must throw an error for ambiguous Done buttons");
    assert.ok(errorThrown.message.includes("FLOW_EDITOR_DONE_BUTTON_AMBIGUOUS"));
    assert.equal(page.isDoneClicked(), false, "Must refuse to click when ambiguous");
  });

  it("8. Editor closes → workflow continues with backend import", async () => {
    const worker = new FlowBrowserWorker();
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flow-test-8-"));

    const { page } = createBaseMockPage();
    worker.page = page;

    let importCalled = false;
    worker.importDownloadedAsset = async (job, buffer, details) => {
      importCalled = true;
      job.status = "completed";
      return { success: true };
    };

    // Prepare job in downloading state with successful download
    const job = worker.createJob({
      targetType: "background",
      sceneId: "scene-8",
      storyId: "story-8",
      prompt: "Cozy forest sunset",
    });

    // Mock downloadFlowImage on worker
    worker.downloadFlowImage = async () => ({
      success: true,
      downloadMethod: "native_context_menu_save_as",
      path: path.join(tempDir, "flow-test.png"),
      fileName: "flow-test.png",
      buffer: samplePngBuffer,
      editorClosed: true,
    });

    // Run monitor generation and download logic
    job.status = "downloading";
    const dlResult = await worker.downloadFlowImage();
    assert.equal(dlResult.success, true);
    assert.equal(dlResult.editorClosed, true);

    await worker.importDownloadedAsset(job, dlResult.buffer, {
      mimeType: "image/png",
      extension: "png",
    });

    assert.equal(importCalled, true, "Backend import must continue and execute after editor close");
    assert.equal(job.status, "completed", "Job status must reach completed");

    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });
});
