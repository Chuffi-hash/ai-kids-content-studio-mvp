import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FlowBrowserWorker } from "../src/flow-browser.mjs";
import {
  downloadFlowImage,
  closeFlowImageEditor,
  extractGoogleFlowEditorReference,
  isGoogleFlowEditorRoute,
} from "../src/flow-download.mjs";

describe("Google Flow Editor URL, Regeneration & Done Editing Suite", () => {
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

  // -------------------------------------------------------------------------
  // Test 1: extractGoogleFlowEditorReference with valid URL
  // -------------------------------------------------------------------------
  it("1. extractGoogleFlowEditorReference extracts projectId and editId from valid Flow editor URL", () => {
    const rawUrl =
      "https://flow.google.com/project/2ea32335-0e57-4d1a-9e1e-98fa3cd491e8/edit/70867243-142c-4cfd-902f-6d3ace8bc324";
    const ref = extractGoogleFlowEditorReference(rawUrl);

    assert.ok(ref);
    assert.equal(ref.projectId, "2ea32335-0e57-4d1a-9e1e-98fa3cd491e8");
    assert.equal(ref.editId, "70867243-142c-4cfd-902f-6d3ace8bc324");
    assert.equal(
      ref.editUrl,
      "https://flow.google.com/project/2ea32335-0e57-4d1a-9e1e-98fa3cd491e8/edit/70867243-142c-4cfd-902f-6d3ace8bc324",
    );
  });

  // -------------------------------------------------------------------------
  // Test 2: extractGoogleFlowEditorReference with trailing slash
  // -------------------------------------------------------------------------
  it("2. extractGoogleFlowEditorReference handles trailing slash gracefully", () => {
    const rawUrl =
      "https://flow.google.com/project/proj-123/edit/asset-456/";
    const ref = extractGoogleFlowEditorReference(rawUrl);

    assert.ok(ref);
    assert.equal(ref.projectId, "proj-123");
    assert.equal(ref.editId, "asset-456");
    assert.equal(ref.editUrl, "https://flow.google.com/project/proj-123/edit/asset-456");
  });

  // -------------------------------------------------------------------------
  // Test 3: extractGoogleFlowEditorReference rejects non-Flow host or invalid route
  // -------------------------------------------------------------------------
  it("3. extractGoogleFlowEditorReference rejects non-Flow hosts and invalid routes", () => {
    // Non-flow hostname
    assert.equal(
      extractGoogleFlowEditorReference("https://malicious.com/project/123/edit/456"),
      null,
    );
    // Chat route without /edit/
    assert.equal(
      extractGoogleFlowEditorReference("https://flow.google.com/project/123"),
      null,
    );
    // Missing asset ID
    assert.equal(
      extractGoogleFlowEditorReference("https://flow.google.com/project/123/edit/"),
      null,
    );
    // Extra segments
    assert.equal(
      extractGoogleFlowEditorReference("https://flow.google.com/project/123/edit/456/extra"),
      null,
    );
    // Malformed/null
    assert.equal(extractGoogleFlowEditorReference(""), null);
    assert.equal(extractGoogleFlowEditorReference(null), null);
    assert.equal(extractGoogleFlowEditorReference("not-a-url"), null);
  });

  // -------------------------------------------------------------------------
  // Test 4: isGoogleFlowEditorRoute returns correct boolean
  // -------------------------------------------------------------------------
  it("4. isGoogleFlowEditorRoute accurately checks whether URL is an editor route", () => {
    assert.equal(
      isGoogleFlowEditorRoute("https://flow.google.com/project/p1/edit/e1"),
      true,
    );
    assert.equal(
      isGoogleFlowEditorRoute("https://flow.google.com/project/p1"),
      false,
    );
    assert.equal(
      isGoogleFlowEditorRoute("https://other.com/project/p1/edit/e1"),
      false,
    );
  });

  // -------------------------------------------------------------------------
  // Test 5: closeFlowImageEditor skips on chat/project route without failing
  // -------------------------------------------------------------------------
  it("5. closeFlowImageEditor skips gracefully on non-editor (chat) route", async () => {
    const mockPage = {
      isClosed: () => false,
      url: () => "https://flow.google.com/project/2ea32335-0e57-4d1a-9e1e-98fa3cd491e8",
      getByRole: () => ({ count: async () => 0 }),
      locator: () => ({ count: async () => 0 }),
    };

    const result = await closeFlowImageEditor(mockPage, console, {
      requireEditorRoute: true,
    });

    assert.deepEqual(result, {
      closed: false,
      skipped: true,
      reason: "NOT_ON_EDITOR_ROUTE",
    });
  });

  // -------------------------------------------------------------------------
  // Test 6: closeFlowImageEditor closes on valid editor route
  // -------------------------------------------------------------------------
  it("6. closeFlowImageEditor verifies and clicks Done editing button on editor route", async () => {
    let clicked = false;
    let hidden = false;
    const events = [];

    const mockDoneBtn = {
      isVisible: async () => !hidden,
      waitFor: async ({ state }) => {
        if (state === "hidden") hidden = true;
      },
      click: async () => {
        clicked = true;
        hidden = true;
      },
    };

    const mockPage = {
      isClosed: () => false,
      url: () => "https://flow.google.com/project/p1/edit/e1",
      getByRole: (role, opts) => {
        if (role === "button" && opts?.name === "Done editing") {
          return {
            count: async () => 1,
            first: () => mockDoneBtn,
            nth: () => mockDoneBtn,
          };
        }
        return { count: async () => 0 };
      },
      locator: () => ({ count: async () => 0 }),
    };

    const closed = await closeFlowImageEditor(mockPage, console, {
      logTransition: (ph, details) => events.push(ph),
    });

    assert.equal(closed, true);
    assert.equal(clicked, true);
    assert.ok(events.includes("FLOW_EDITOR_DONE_CLICK_STARTED"));
    assert.ok(events.includes("FLOW_IMAGE_EDITOR_CLOSED"));
  });

  // -------------------------------------------------------------------------
  // Test 7: closeFlowImageEditor throws FLOW_EDITOR_DONE_BUTTON_NOT_FOUND on editor route if missing
  // -------------------------------------------------------------------------
  it("7. closeFlowImageEditor throws FLOW_EDITOR_DONE_BUTTON_NOT_FOUND on editor route if Done button missing", async () => {
    const events = [];
    const mockPage = {
      isClosed: () => false,
      url: () => "https://flow.google.com/project/p1/edit/e1",
      getByRole: () => ({
        count: async () => 0,
        first: () => ({ waitFor: async () => { throw new Error("Timeout"); } }),
      }),
      locator: () => ({ count: async () => 0 }),
    };

    await assert.rejects(
      async () => {
        await closeFlowImageEditor(mockPage, console, {
          timeoutMs: 100,
          logTransition: (ph, details) => events.push(ph),
        });
      },
      /FLOW_EDITOR_DONE_BUTTON_NOT_FOUND/,
    );

    assert.ok(events.includes("FLOW_EDITOR_DONE_BUTTON_NOT_FOUND"));
  });

  // -------------------------------------------------------------------------
  // Test 8: closeFlowImageEditor throws FLOW_EDITOR_CLOSE_TIMEOUT if button remains visible
  // -------------------------------------------------------------------------
  it("8. closeFlowImageEditor throws FLOW_EDITOR_CLOSE_TIMEOUT if Done button remains visible", async () => {
    const events = [];
    const mockDoneBtn = {
      isVisible: async () => true,
      waitFor: async ({ state }) => {
        if (state === "hidden") throw new Error("Timeout waiting for hidden");
      },
      click: async () => {},
    };

    const mockPage = {
      isClosed: () => false,
      url: () => "https://flow.google.com/project/p1/edit/e1",
      getByRole: (role, opts) => {
        if (role === "button" && opts?.name === "Done editing") {
          return {
            count: async () => 1,
            first: () => mockDoneBtn,
            nth: () => mockDoneBtn,
          };
        }
        return { count: async () => 0 };
      },
      locator: () => ({ count: async () => 0 }),
    };

    await assert.rejects(
      async () => {
        await closeFlowImageEditor(mockPage, console, {
          timeoutMs: 100,
          logTransition: (ph, details) => events.push(ph),
        });
      },
      /FLOW_EDITOR_CLOSE_TIMEOUT/,
    );

    assert.ok(events.includes("FLOW_EDITOR_DONE_CLICK_STARTED"));
    assert.ok(events.includes("FLOW_EDITOR_CLOSE_TIMEOUT"));
  });

  // -------------------------------------------------------------------------
  // Test 9: downloadFlowImage captures editor reference and returns Flow metadata
  // -------------------------------------------------------------------------
  it("9. downloadFlowImage captures editor reference upon opening viewer and returns Flow metadata", async () => {
    const events = [];
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flow-test-dl-"));
    const editUrl = "https://flow.google.com/project/proj-test-123/edit/asset-test-456";

    let doneClicked = false;
    const mockDoneBtn = {
      isVisible: async () => !doneClicked,
      waitFor: async () => {},
      click: async () => { doneClicked = true; },
    };

    const mockOption = {
      count: async () => 1,
      waitFor: async () => {},
      scrollIntoViewIfNeeded: async () => {},
      click: async () => {},
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

    const mockPage = {
      isClosed: () => false,
      url: () => editUrl,
      mouse: { click: async () => {} },
      getByRole: (role, opts) => {
        if (role === "button" && opts?.name === "Done editing") {
          return {
            count: async () => 1,
            first: () => mockDoneBtn,
            nth: () => mockDoneBtn,
            waitFor: async () => {},
          };
        }
        return { count: async () => 0 };
      },
      locator: (sel) => {
        if (sel === "flow-chat-scroller .scroll-viewport") {
          return {
            waitFor: async () => {},
            evaluate: async (fn) => fn({ scrollTop: 500, scrollHeight: 1000, clientHeight: 500 }),
          };
        }
        if (sel.includes("flow-image-editor img") || sel.includes(".editor-container img")) {
          return {
            count: async () => 1,
            first: () => mockViewerImg,
            nth: () => mockViewerImg,
          };
        }
        return {
          count: async () => 1,
          first: () => ({ count: async () => 1, waitFor: async () => {}, isVisible: async () => true }),
          last: () => ({ locator: () => ({ locator: () => mockOption }) }),
          nth: () => ({ count: async () => 1, waitFor: async () => {}, isVisible: async () => true }),
        };
      },
    };

    const job = {
      id: "job-dl-test",
      sceneId: "scene-1",
      storyId: "story-1",
    };

    const result = await downloadFlowImage({
      page: mockPage,
      job,
      output: {
        container: mockOption,
        clickTarget: mockOption,
        index: 0,
      },
      downloadDir: tempDir,
      automationRunner: createMockAutomationRunner(),
      logTransition: (ph, details) => events.push(ph),
    });

    assert.equal(result.success, true);
    assert.equal(result.googleFlowProjectId, "proj-test-123");
    assert.equal(result.googleFlowEditId, "asset-test-456");
    assert.equal(result.googleFlowEditUrl, editUrl);
    assert.ok(events.includes("FLOW_EDITOR_REFERENCE_CAPTURED"));
    assert.ok(events.includes("FLOW_BACKGROUND_IMAGE_VALIDATED"));
    assert.ok(events.includes("FLOW_IMAGE_EDITOR_CLOSED"));
    assert.equal(doneClicked, true);

    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  // -------------------------------------------------------------------------
  // Test 10: FlowBrowserWorker.createJob accepts regeneration properties
  // -------------------------------------------------------------------------
  it("10. createJob accepts isRegeneration, editUrl, and lineage properties", () => {
    const worker = new FlowBrowserWorker();
    const editUrl = "https://flow.google.com/project/proj-abc/edit/asset-xyz";

    const job = worker.createJob({
      sceneId: "scene-10",
      storyId: "story-10",
      prompt: "Regenerate with cozy warm afternoon sunlight",
      isRegeneration: true,
      editUrl,
      googleFlowParentAssetId: "parent-asset-99",
      googleFlowVersion: 2,
    });

    assert.equal(job.isRegeneration, true);
    assert.equal(job.googleFlowEditUrl, editUrl);
    assert.equal(job.googleFlowProjectId, "proj-abc");
    assert.equal(job.googleFlowEditId, "asset-xyz");
    assert.equal(job.googleFlowParentAssetId, "parent-asset-99");
    assert.equal(job.googleFlowVersion, 2);
    assert.equal(job.status, "created");
  });

  // -------------------------------------------------------------------------
  // Test 11: prepareJob handles regeneration: reopens editor and enters prompt
  // -------------------------------------------------------------------------
  it("11. prepareJob reopens editor, verifies route, and enters regeneration prompt", async () => {
    const worker = new FlowBrowserWorker();
    const editUrl = "https://flow.google.com/project/proj-reopen/edit/asset-reopen";
    const events = [];

    worker.emitLifecycleLog = (event, job, details) => {
      events.push({ event, details });
    };

    let filledText = "";
    const mockPromptBox = {
      click: async () => {},
      fill: async (t) => { filledText = t; },
      isVisible: async () => true,
    };

    worker.context = {};
    worker.page = {
      isClosed: () => false,
      url: () => editUrl,
      goto: async (targetUrl) => {
        assert.equal(targetUrl, editUrl);
      },
      keyboard: {
        press: async () => {},
      },
      locator: (sel) => {
        if (sel.includes("flow-edit-image-prompt-box")) {
          return {
            count: async () => 1,
            first: () => mockPromptBox,
            isVisible: async () => true,
          };
        }
        return { count: async () => 0 };
      },
    };

    const job = worker.createJob({
      sceneId: "scene-11",
      storyId: "story-11",
      prompt: "Change trees to autumn orange colors",
      isRegeneration: true,
      editUrl,
    });

    const prepared = await worker.prepareJob(job.id);

    assert.equal(prepared.status, "prompt_ready");
    assert.equal(filledText, "Change trees to autumn orange colors");

    const eventNames = events.map((e) => e.event);
    assert.ok(eventNames.includes("FLOW_EDITOR_REOPEN_STARTED"));
    assert.ok(eventNames.includes("FLOW_EDITOR_REOPENED"));
    assert.ok(eventNames.includes("FLOW_PROMPT_ENTERED"));
  });

  // -------------------------------------------------------------------------
  // Test 12: prepareJob fails if navigated URL is not an editor route
  // -------------------------------------------------------------------------
  it("12. prepareJob fails with FLOW_REGENERATION_FAILED if page is not on editor route", async () => {
    const worker = new FlowBrowserWorker();
    const events = [];
    worker.emitLifecycleLog = (event, job, details) => {
      events.push({ event, details });
    };

    worker.context = {};
    worker.page = {
      isClosed: () => false,
      url: () => "https://flow.google.com/project/proj-non-editor", // NOT an /edit/ route
      goto: async () => {},
    };

    const job = worker.createJob({
      sceneId: "scene-12",
      storyId: "story-12",
      prompt: "Update background style",
      isRegeneration: true,
      editUrl: "https://flow.google.com/project/proj-non-editor/edit/asset-12",
    });

    await assert.rejects(
      async () => {
        await worker.prepareJob(job.id);
      },
      /FLOW_REGENERATION_FAILED/,
    );

    const eventNames = events.map((e) => e.event);
    assert.ok(eventNames.includes("FLOW_EDITOR_REOPEN_STARTED"));
    assert.ok(eventNames.includes("FLOW_REGENERATION_FAILED"));
    assert.equal(job.status, "failed");
  });

  // -------------------------------------------------------------------------
  // Test 13: submitRegenerationPrompt clicks Start generation and emits FLOW_REGENERATION_STARTED
  // -------------------------------------------------------------------------
  it("13. submitRegenerationPrompt submits prompt and emits FLOW_REGENERATION_STARTED", async () => {
    const worker = new FlowBrowserWorker();
    const editUrl = "https://flow.google.com/project/proj-gen/edit/asset-gen";
    const events = [];
    worker.emitLifecycleLog = (event, job, details) => {
      events.push({ event, details });
    };

    let startGenClicked = false;
    const mockSubmitBtn = {
      isVisible: async () => true,
      isEnabled: async () => true,
      getAttribute: async (attr) => (attr === "disabled" ? null : null),
      click: async () => { startGenClicked = true; },
    };

    worker.page = {
      isClosed: () => false,
      url: () => editUrl,
      getByRole: (role, opts) => {
        if (role === "button" && opts?.name === "Start generation") {
          return {
            count: async () => 1,
            first: () => mockSubmitBtn,
          };
        }
        return { count: async () => 0 };
      },
      locator: () => ({ count: async () => 0 }),
    };

    worker.getOutputAssetBaseline = async () => ({ count: 1, identifiers: new Set() });
    worker.startImageResponseCapture = async () => {};
    worker.monitorRegenerationAndDownload = async () => {};

    const job = worker.createJob({
      sceneId: "scene-13",
      storyId: "story-13",
      prompt: "Regenerate sky with starry night",
      isRegeneration: true,
      editUrl,
    });

    await worker.requestGeneration(job.id, {
      confirmGenerate: true,
      referenceConfirmed: true,
    });

    assert.equal(startGenClicked, true);
    assert.equal(job.status, "generation_submitted");
    const eventNames = events.map((e) => e.event);
    assert.ok(eventNames.includes("FLOW_REGENERATION_STARTED"));
  });

  // -------------------------------------------------------------------------
  // Test 14: monitorRegenerationAndDownload completes flow, downloads, validates, closes editor, and persists reference
  // -------------------------------------------------------------------------
  it("14. monitorRegenerationAndDownload handles full completion, validates image, closes editor, and reports FLOW_EDITOR_REFERENCE_PERSISTED", async () => {
    const worker = new FlowBrowserWorker();
    const initialEditUrl = "https://flow.google.com/project/proj-full/edit/asset-v1";
    const updatedEditUrl = "https://flow.google.com/project/proj-full/edit/asset-v2";
    const events = [];

    worker.emitLifecycleLog = (event, job, details) => {
      events.push({ event, details });
    };

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flow-test-regen-"));
    worker.downloadDir = tempDir;

    let currentUrl = updatedEditUrl;
    let doneClicked = false;
    let doneHidden = false;

    const mockDoneBtn = {
      isVisible: async () => !doneHidden,
      waitFor: async ({ state }) => {
        if (state === "hidden") doneHidden = true;
      },
      click: async () => {
        doneClicked = true;
        doneHidden = true;
      },
    };

    const mockViewerImg = {
      count: async () => 1,
      waitFor: async () => {},
      scrollIntoViewIfNeeded: async () => {},
      evaluate: async (fn) =>
        fn({
          currentSrc: "https://flow.google.com/asb/regen=s1600-rw",
          src: "https://flow.google.com/asb/regen=s1600-rw",
          complete: true,
          naturalWidth: 1024,
          naturalHeight: 576,
          tagName: "IMG",
        }),
      boundingBox: async () => ({ x: 100, y: 100, width: 600, height: 400 }),
      click: async () => {},
    };

    worker.page = {
      isClosed: () => false,
      url: () => currentUrl,
      mouse: { click: async () => {} },
      getByRole: (role, opts) => {
        if (role === "button" && opts?.name === "Done editing") {
          return {
            count: async () => 1,
            first: () => mockDoneBtn,
            nth: () => mockDoneBtn,
            waitFor: async () => {},
          };
        }
        return { count: async () => 0 };
      },
      locator: (sel) => {
        if (sel.includes("flow-edit-image-prompt-box button") || sel.includes("button[aria-label=\"Start generation\"]")) {
          return {
            count: async () => 1,
            first: () => ({
              isEnabled: async () => true,
              getAttribute: async () => null,
            }),
          };
        }
        if (sel.includes("flow-image-editor img") || sel.includes(".editor-container img")) {
          return {
            count: async () => 1,
            first: () => mockViewerImg,
            nth: () => mockViewerImg,
          };
        }
        return {
          count: async () => 1,
          first: () => ({ count: async () => 1, waitFor: async () => {}, isVisible: async () => true }),
          last: () => ({ locator: () => ({ locator: () => mockOption }) }),
          nth: () => ({ count: async () => 1, waitFor: async () => {}, isVisible: async () => true }),
        };
      },
    };

    worker.collectNewAgentOutputs = async () => [];
    worker.saveDiagnosticScreenshot = async () => null;

    const job = worker.createJob({
      sceneId: "scene-14",
      storyId: "story-14",
      prompt: "Regenerate with snow on trees",
      isRegeneration: true,
      editUrl: initialEditUrl,
      googleFlowParentAssetId: "asset-v1-id",
      googleFlowVersion: 2,
    });

    let backendImportCalled = false;
    let persistedPayload = null;
    worker.backendUrl = "http://127.0.0.1:9999";
    global.fetch = async (url, opts) => {
      if (url.includes("/api/background-studio/import-flow")) {
        backendImportCalled = true;
        persistedPayload = JSON.parse(opts.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            asset: {
              id: "new-v2-asset-id",
              url: "/storage/flow-bg-scene-14.png",
              googleFlowVersion: 2,
            },
          }),
        };
      }
      return { ok: false, status: 404 };
    };

    // Fast-path monitor execution
    worker.automationRunner = createMockAutomationRunner();

    await worker.monitorRegenerationAndDownload(job.id, { count: 0, identifiers: new Set() });

    assert.equal(job.status, "completed");
    assert.equal(doneClicked, true);
    assert.equal(backendImportCalled, true);
    assert.equal(persistedPayload.googleFlowParentAssetId, "asset-v1-id");
    assert.equal(persistedPayload.googleFlowVersion, 2);
    assert.equal(persistedPayload.googleFlowEditId, "asset-v2");

    const eventNames = events.map((e) => e.event);
    assert.ok(eventNames.includes("FLOW_REGENERATION_COMPLETED"));
    assert.ok(eventNames.includes("FLOW_NEW_ASSET_REFERENCE_CAPTURED"));
    assert.ok(eventNames.includes("FLOW_BACKGROUND_IMAGE_VALIDATED"));
    assert.ok(eventNames.includes("FLOW_EDITOR_DONE_CLICK_STARTED"));
    assert.ok(eventNames.includes("FLOW_IMAGE_EDITOR_CLOSED"));
    assert.ok(eventNames.includes("FLOW_EDITOR_REFERENCE_PERSISTED"));

    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });
});
