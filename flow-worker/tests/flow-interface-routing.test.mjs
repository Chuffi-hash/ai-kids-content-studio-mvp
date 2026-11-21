import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FlowBrowserWorker } from "../src/flow-browser.mjs";
import {
  closeFlowImageEditor,
  extractProjectIdFromFlowUrl,
  collectFlowEditorDiagnostics,
  isGoogleFlowEditorRoute,
  extractGoogleFlowEditorReference,
} from "../src/flow-download.mjs";

describe("Google Flow Interface Routing, Route Detection, Done Workflow & Session Recovery", () => {
  // Helper to construct mock locators
  function createMockLocator({
    count = 1,
    visible = true,
    enabled = true,
    text = "",
    attrs = {},
    onClick = null,
  } = {}) {
    let internalText = text;
    const loc = {
      _text: internalText,
      count: async () => count,
      first: () => loc,
      last: () => loc,
      nth: () => loc,
      isVisible: async () => visible,
      isEnabled: async () => enabled,
      waitFor: async () => {
        if (!visible) throw new Error("Timeout waiting for visible");
      },
      click: async () => {
        if (onClick) await onClick();
      },
      fill: async (val) => {
        loc._text = String(val);
      },
      innerText: async () => loc._text,
      textContent: async () => loc._text,
      getAttribute: async (attr) => attrs[attr] || null,
      locator: (subSelector) => createMockLocator({ count, visible, enabled, text }),
    };
    return loc;
  }

  // ==========================================
  // SECTION A: INTERFACE DETECTION TESTS
  // ==========================================
  describe("A. Interface Detection Tests", () => {
    it("1. Main project route + Agent prompt → agent", async () => {
      const worker = new FlowBrowserWorker();
      worker.page = {
        url: () => "https://flow.google.com/project/proj-123",
        isClosed: () => false,
        locator: (sel) => {
          if (sel.includes("flow-creative-agent-prompt-box") || sel.includes("What do you want to create?")) {
            return createMockLocator({ count: 1, visible: true, enabled: true });
          }
          return createMockLocator({ count: 0, visible: false });
        },
      };

      const mode = await worker.detectInterfaceMode();
      assert.equal(mode, "agent");
    });

    it("2. Image editor URL + generic Start generation button → image-editor", async () => {
      const worker = new FlowBrowserWorker();
      worker.page = {
        url: () => "https://flow.google.com/project/proj-123/edit/asset-456",
        isClosed: () => false,
        locator: (sel) => {
          if (sel.includes("Start generation")) {
            return createMockLocator({ count: 1, visible: true, enabled: true });
          }
          return createMockLocator({ count: 0, visible: false });
        },
      };

      const mode = await worker.detectInterfaceMode();
      assert.equal(mode, "image-editor", "Editor route must take precedence over Start generation button");
    });

    it("3. Image editor URL must NEVER be detected as agent", async () => {
      const worker = new FlowBrowserWorker();
      worker.page = {
        url: () => "https://flow.google.com/project/proj-123/edit/asset-456",
        isClosed: () => false,
        locator: () => createMockLocator({ count: 1, visible: true, enabled: true }),
      };

      const mode = await worker.detectInterfaceMode();
      assert.notEqual(mode, "agent");
      assert.equal(mode, "image-editor");
    });

    it("4. Image editor prompt locator finds 'What do you want to change?'", async () => {
      const worker = new FlowBrowserWorker();
      worker.page = {
        url: () => "https://flow.google.com/project/proj-123/edit/asset-456",
        isClosed: () => false,
        locator: (sel) => {
          if (sel.includes("What do you want to change?")) {
            return createMockLocator({ count: 1, visible: true, enabled: true });
          }
          return createMockLocator({ count: 0, visible: false });
        },
      };

      const editor = await worker.findImageEditPromptEditor();
      assert.ok(editor);
      assert.ok(editor.selector.includes("What do you want to change?"));
    });

    it("5. Agent locator finds 'What do you want to create?'", async () => {
      const worker = new FlowBrowserWorker();
      worker.page = {
        url: () => "https://flow.google.com/project/proj-123",
        isClosed: () => false,
        locator: (sel) => {
          if (sel.includes("flow-creative-agent-prompt-box") || sel.includes("What do you want to create?")) {
            return createMockLocator({ count: 1, visible: true, enabled: true });
          }
          return createMockLocator({ count: 0, visible: false });
        },
      };

      const editor = await worker.findAgentPromptEditor();
      assert.ok(editor);
      assert.ok(editor.selector.includes("What do you want to create?"));
    });

    it("6. Hidden Agent components do not cause false Agent mode", async () => {
      const worker = new FlowBrowserWorker();
      worker.page = {
        url: () => "https://flow.google.com/project/proj-123",
        isClosed: () => false,
        locator: (sel) => {
          // Exists in DOM but is hidden (e.g. display: none or offscreen)
          if (sel.includes("flow-creative-agent-prompt-box")) {
            return createMockLocator({ count: 1, visible: false, enabled: false });
          }
          return createMockLocator({ count: 0, visible: false });
        },
      };

      const mode = await worker.detectInterfaceMode();
      assert.equal(mode, "unknown", "Hidden agent prompt box must not cause agent mode");
    });

    it("7. Unknown interface returns unknown", async () => {
      const worker = new FlowBrowserWorker();
      worker.page = {
        url: () => "https://flow.google.com/home",
        isClosed: () => false,
        locator: () => createMockLocator({ count: 0, visible: false }),
      };

      const mode = await worker.detectInterfaceMode();
      assert.equal(mode, "unknown");
    });
  });

  // ==========================================
  // SECTION B: PROMPT PREPARATION TESTS
  // ==========================================
  describe("B. Prompt Preparation Tests", () => {
    it("1. New background generation from project page fills the Agent prompt", async () => {
      const worker = new FlowBrowserWorker();
      let filledValue = "";
      const promptLoc = createMockLocator({
        count: 1,
        visible: true,
        enabled: true,
        text: "Enchanted castle in the clouds",
      });
      promptLoc.fill = async (val) => {
        filledValue = val;
        promptLoc._text = val;
      };

      worker.page = {
        url: () => "https://flow.google.com/project/proj-ready",
        isClosed: () => false,
        locator: (sel) => {
          if (sel.includes("What do you want to create?")) {
            return promptLoc;
          }
          return createMockLocator({ count: 0, visible: false });
        },
      };
      worker.context = { pages: () => [worker.page] };

      const job = worker.createJob({
        targetType: "background",
        sceneId: "scene-1",
        storyId: "story-1",
        prompt: "Enchanted castle in the clouds",
      });

      const resJob = await worker.prepareJob(job.id);
      assert.equal(resJob.status, "prompt_ready");
      assert.equal(filledValue, "Enchanted castle in the clouds");
      assert.equal(worker.activeJobId, job.id);
    });

    it("2. New background generation while editor is open first attempts Done cleanup", async () => {
      const worker = new FlowBrowserWorker();
      let currentUrl = "https://flow.google.com/project/proj-prev/edit/asset-1";
      let doneClicked = false;

      const headerLoc = {
        count: async () => 1,
        waitFor: async () => {},
        locator: (sel) => {
          if (sel === 'button[aria-label="Done editing"]') {
            return {
              count: async () => 1,
              first: () => ({
                isVisible: async () => true,
                isEnabled: async () => true,
                waitFor: async () => {},
                click: async () => {
                  doneClicked = true;
                  currentUrl = "https://flow.google.com/project/proj-prev";
                },
              }),
            };
          }
          return { count: async () => 0 };
        },
      };

      const promptLoc = createMockLocator({ count: 1, visible: true, enabled: true });
      promptLoc.fill = async (v) => { promptLoc._text = v; };

      worker.page = {
        url: () => currentUrl,
        isClosed: () => false,
        waitForURL: async (predicate) => {
          if (!predicate(currentUrl)) throw new Error("Timeout");
        },
        locator: (sel) => {
          if (sel === "header.header-base" || sel === "flow-editor-header") return headerLoc;
          if (sel.includes("What do you want to create?")) return promptLoc;
          return createMockLocator({ count: 0, visible: false });
        },
      };
      worker.context = { pages: () => [worker.page] };

      const job = worker.createJob({
        targetType: "background",
        sceneId: "scene-2",
        storyId: "story-2",
        prompt: "Magical treehouse at dawn",
      });

      const resJob = await worker.prepareJob(job.id);
      assert.equal(doneClicked, true, "Done button must be clicked to clean up previous editor");
      assert.equal(resJob.status, "prompt_ready");
      assert.equal(worker.activeJobId, job.id);
    });

    it("3. Failed cleanup returns awaiting_editor_cleanup and does not acquire active generation lock", async () => {
      const worker = new FlowBrowserWorker();
      const currentUrl = "https://flow.google.com/project/proj-prev/edit/asset-stuck";

      const headerLoc = {
        count: async () => 1,
        waitFor: async () => {
          throw new Error("Header not visible");
        },
      };

      worker.page = {
        url: () => currentUrl,
        isClosed: () => false,
        evaluate: async () => ({
          href: currentUrl,
          headerExists: false,
          doneButtons: [],
        }),
        context: () => ({ pages: () => [worker.page] }),
        locator: (sel) => {
          if (sel === "header.header-base" || sel === "flow-editor-header") return headerLoc;
          return createMockLocator({ count: 0, visible: false });
        },
      };
      worker.context = { pages: () => [worker.page] };

      const job = worker.createJob({
        targetType: "background",
        sceneId: "scene-fail-cleanup",
        storyId: "story-fail-cleanup",
        prompt: "Underwater kingdom",
      });

      const resJob = await worker.prepareJob(job.id);
      assert.equal(resJob.status, "awaiting_editor_cleanup");
      assert.equal(resJob.flowSessionReady, false);
      assert.equal(resJob.errorCode, "FLOW_IMAGE_EDITOR_STILL_OPEN");
      assert.equal(worker.activeJobId, null, "Lock must NOT be acquired when cleanup fails");
    });

    it("4. Failed cleanup prevents prompt submission in requestGeneration", async () => {
      const worker = new FlowBrowserWorker();
      worker.page = {
        url: () => "https://flow.google.com/project/p1/edit/a1",
        isClosed: () => false,
        locator: () => createMockLocator({ count: 0 }),
      };
      worker.context = { pages: () => [worker.page] };

      const job = worker.createJob({
        targetType: "background",
        sceneId: "scene-4-test",
        prompt: "Secret garden path",
      });
      job.status = "prompt_ready";

      await assert.rejects(
        async () => {
          await worker.requestGeneration(job.id, {
            confirmGenerate: true,
            referenceConfirmed: true,
          });
        },
        (err) => {
          return err.code === "FLOW_IMAGE_EDITOR_STILL_OPEN" && err.statusCode === 409;
        }
      );
    });

    it("5. Image-editor regeneration continues using the image-edit prompt", async () => {
      const worker = new FlowBrowserWorker();
      let filledText = "";
      const editPromptLoc = createMockLocator({
        count: 1,
        visible: true,
        enabled: true,
        text: "Make it rainy and darker",
      });
      editPromptLoc.fill = async (val) => {
        filledText = val;
        editPromptLoc._text = val;
      };

      worker.page = {
        url: () => "https://flow.google.com/project/p-regen/edit/a-regen",
        isClosed: () => false,
        goto: async () => {},
        locator: (sel) => {
          if (sel.includes("What do you want to change?")) {
            return editPromptLoc;
          }
          return createMockLocator({ count: 0, visible: false });
        },
      };
      worker.context = { pages: () => [worker.page] };

      const regenJob = worker.createJob({
        targetType: "background",
        sceneId: "scene-regen",
        prompt: "Make it rainy and darker",
        isRegeneration: true,
        googleFlowEditUrl: "https://flow.google.com/project/p-regen/edit/a-regen",
      });

      const resJob = await worker.prepareJob(regenJob.id);
      assert.equal(resJob.status, "prompt_ready");
      assert.equal(filledText, "Make it rainy and darker");
      assert.equal(worker.activeJobId, regenJob.id);
    });
  });

  // ==========================================
  // SECTION C: DONE BUTTON WORKFLOW TESTS
  // ==========================================
  describe("C. Done Button Workflow Tests", () => {
    it("1. Scoped header.header-base button[aria-label='Done editing'] is found and clicked", async () => {
      let clicked = false;
      let navigated = false;
      let currentUrl = "https://flow.google.com/project/p-done/edit/a-done";

      const headerLoc = {
        count: async () => 1,
        waitFor: async () => {},
        locator: (sel) => {
          if (sel === 'button[aria-label="Done editing"]') {
            return {
              count: async () => 1,
              first: () => ({
                isVisible: async () => true,
                isEnabled: async () => true,
                waitFor: async () => {},
                click: async () => {
                  clicked = true;
                  currentUrl = "https://flow.google.com/project/p-done";
                  navigated = true;
                },
              }),
            };
          }
          return { count: async () => 0 };
        },
      };

      const mockPage = {
        url: () => currentUrl,
        isClosed: () => false,
        waitForURL: async (predicate) => {
          if (!predicate(currentUrl)) throw new Error("Timeout");
        },
        locator: (sel) => {
          if (sel === "header.header-base" || sel === "flow-editor-header") return headerLoc;
          return { count: async () => 0 };
        },
      };

      const res = await closeFlowImageEditor(mockPage, console, {
        expectedProjectId: "p-done",
      });

      assert.equal(clicked, true);
      assert.equal(navigated, true);
      assert.equal(res, true);
    });

    it("2. Disabled button is rejected with FLOW_EDITOR_DONE_BUTTON_DISABLED", async () => {
      const headerLoc = {
        count: async () => 1,
        waitFor: async () => {},
        locator: (sel) => {
          if (sel === 'button[aria-label="Done editing"]') {
            return {
              count: async () => 1,
              first: () => ({
                isVisible: async () => true,
                isEnabled: async () => false, // DISABLED
                waitFor: async () => {},
                click: async () => {},
              }),
            };
          }
          return { count: async () => 0 };
        },
      };

      const mockPage = {
        url: () => "https://flow.google.com/project/p-dis/edit/a-dis",
        isClosed: () => false,
        locator: (sel) => {
          if (sel === "header.header-base" || sel === "flow-editor-header") return headerLoc;
          return { count: async () => 0 };
        },
      };

      await assert.rejects(
        async () => {
          await closeFlowImageEditor(mockPage, console, {});
        },
        (err) => err.code === "FLOW_EDITOR_DONE_BUTTON_DISABLED"
      );
    });

    it("3. Wrong project navigation is rejected with FLOW_EDITOR_RETURNED_WRONG_PROJECT", async () => {
      let currentUrl = "https://flow.google.com/project/p-expected/edit/a-1";

      const headerLoc = {
        count: async () => 1,
        waitFor: async () => {},
        locator: () => ({
          count: async () => 1,
          first: () => ({
            isVisible: async () => true,
            isEnabled: async () => true,
            waitFor: async () => {},
            click: async () => {
              currentUrl = "https://flow.google.com/project/p-OTHER-PROJECT";
            },
          }),
        }),
      };

      const mockPage = {
        url: () => currentUrl,
        isClosed: () => false,
        waitForURL: async () => {},
        locator: (sel) => {
          if (sel === "header.header-base" || sel === "flow-editor-header") return headerLoc;
          return { count: async () => 0 };
        },
      };

      await assert.rejects(
        async () => {
          await closeFlowImageEditor(mockPage, console, {
            expectedProjectId: "p-expected",
          });
        },
        (err) => err.code === "FLOW_EDITOR_RETURNED_WRONG_PROJECT"
      );
    });

    it("4. Missing header produces diagnostics and fails with FLOW_EDITOR_HEADER_NOT_FOUND", async () => {
      let evalCalled = false;
      const mockPage = {
        url: () => "https://flow.google.com/project/p-diag/edit/a-diag",
        isClosed: () => false,
        evaluate: async () => {
          evalCalled = true;
          return { href: "https://flow.google.com/project/p-diag/edit/a-diag", headerExists: false };
        },
        context: () => ({ pages: () => [mockPage] }),
        locator: (sel) => {
          if (sel === "header.header-base" || sel === "flow-editor-header") {
            return {
              count: async () => 0,
              waitFor: async () => { throw new Error("Header not found"); },
              locator: () => ({ count: async () => 0 }),
            };
          }
          return { count: async () => 0, waitFor: async () => { throw new Error("Not found"); } };
        },
      };

      await assert.rejects(
        async () => {
          await closeFlowImageEditor(mockPage, console, {});
        },
        (err) => {
          assert.equal(err.code, "FLOW_EDITOR_HEADER_NOT_FOUND");
          return true;
        }
      );
      assert.equal(evalCalled, true, "Diagnostics must be collected upon header failure");
    });

    it("5. Existing download success remains intact if editor cleanup fails", async () => {
      const worker = new FlowBrowserWorker();
      const job = worker.createJob({
        targetType: "background",
        sceneId: "scene-persist-asset",
        prompt: "Moonlit forest lake",
      });

      // Simulate dlResult with successful download but failed editor close
      const dlResult = {
        success: true,
        downloadStatus: "completed",
        editorClosed: false,
        editorCloseStatus: "failed",
        flowSessionReady: false,
        editorCloseError: "FLOW_EDITOR_CLOSE_TIMEOUT: Done editing button remained visible",
        path: "C:\\tmp\\moonlit-lake.png",
        fileName: "moonlit-lake.png",
        fileSize: 2048,
        mimeType: "image/png",
        buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAALUlEQVRYR+3QQREAAAzCQPr39g4fXgYk0L2Sqm8cAAAAAAAAAAAAAAAAAAB+1gO4/AH4rE2gOAAAAABJRU5ErkJggg==", "base64"),
      };

      let assetImported = false;
      worker.importDownloadedAsset = async (j, buf, details) => {
        assetImported = true;
        j.status = "completed";
      };

      // Simulate monitorGenerationAndDownload handling of dlResult
      job.status = "importing";
      job.downloadStatus = "completed";
      job.editorCloseStatus = dlResult.editorClosed === true ? "closed" : "failed";
      job.flowSessionReady = dlResult.editorClosed === true;
      job.editorCloseError = dlResult.editorCloseError;
      await worker.importDownloadedAsset(job, dlResult.buffer, { mimeType: dlResult.mimeType, extension: "png" });
      job.flowSessionReady = dlResult.editorClosed === true;

      assert.equal(assetImported, true, "Asset MUST be imported despite editor close failure");
      assert.equal(job.status, "completed", "Job reached completed status");
      assert.equal(job.flowSessionReady, false, "Session is NOT ready for next scene without cleanup");
      assert.equal(job.editorCloseStatus, "failed");
    });
  });

  // ==========================================
  // SECTION D: SESSION RECOVERY (SCENE 4 -> 5)
  // ==========================================
  describe("D. Session Recovery Tests (Scene 4 -> Scene 5 Transition)", () => {
    it("1. Scene 4 succeeds + Done succeeds → Scene 5 can prepare and acquire lock", async () => {
      const worker = new FlowBrowserWorker();
      let currentUrl = "https://flow.google.com/project/story-proj";

      const promptLoc = createMockLocator({ count: 1, visible: true, enabled: true });
      promptLoc.fill = async (v) => { promptLoc._text = v; };

      worker.page = {
        url: () => currentUrl,
        isClosed: () => false,
        locator: (sel) => {
          if (sel.includes("What do you want to create?")) return promptLoc;
          return createMockLocator({ count: 0, visible: false });
        },
      };
      worker.context = { pages: () => [worker.page] };

      // Scene 4 completed and session is ready
      const scene4Job = worker.createJob({
        targetType: "background",
        sceneId: "scene-4",
        prompt: "Scene 4 playground",
      });
      scene4Job.status = "completed";
      scene4Job.flowSessionReady = true;

      // Scene 5 begins
      const scene5Job = worker.createJob({
        targetType: "background",
        sceneId: "scene-5",
        prompt: "Scene 5 classroom",
      });

      const resJob5 = await worker.prepareJob(scene5Job.id);
      assert.equal(resJob5.status, "prompt_ready");
      assert.equal(resJob5.flowSessionReady, true);
      assert.equal(worker.activeJobId, scene5Job.id);
    });

    it("2. Scene 4 succeeds + Done fails → Scene 5 prepare attempts cleanup retry", async () => {
      const worker = new FlowBrowserWorker();
      // Browser is still displaying Scene 4's image editor!
      let currentUrl = "https://flow.google.com/project/story-proj/edit/scene-4-asset";
      let cleanupAttempted = false;

      const headerLoc = {
        count: async () => 1,
        waitFor: async () => {},
        locator: (sel) => {
          if (sel === 'button[aria-label="Done editing"]') {
            return {
              count: async () => 1,
              first: () => ({
                isVisible: async () => true,
                isEnabled: async () => true,
                waitFor: async () => {},
                click: async () => {
                  cleanupAttempted = true;
                  // Cleanup succeeds on retry!
                  currentUrl = "https://flow.google.com/project/story-proj";
                },
              }),
            };
          }
          return { count: async () => 0 };
        },
      };

      const promptLoc = createMockLocator({ count: 1, visible: true, enabled: true });
      promptLoc.fill = async (v) => { promptLoc._text = v; };

      worker.page = {
        url: () => currentUrl,
        isClosed: () => false,
        waitForURL: async (predicate) => {
          if (!predicate(currentUrl)) throw new Error("Timeout");
        },
        locator: (sel) => {
          if (sel === "header.header-base" || sel === "flow-editor-header") return headerLoc;
          if (sel.includes("What do you want to create?")) return promptLoc;
          return createMockLocator({ count: 0, visible: false });
        },
      };
      worker.context = { pages: () => [worker.page] };

      const scene5Job = worker.createJob({
        targetType: "background",
        sceneId: "scene-5",
        prompt: "Scene 5 classroom",
      });

      const resJob5 = await worker.prepareJob(scene5Job.id);
      assert.equal(cleanupAttempted, true, "Scene 5 must attempt to close Scene 4 editor");
      assert.equal(resJob5.status, "prompt_ready");
      assert.equal(resJob5.flowSessionReady, true);
      assert.equal(worker.activeJobId, scene5Job.id);
    });

    it("3. Scene 4 Done fails + Scene 5 cleanup retry fails → Scene 5 remains unsubmitted", async () => {
      const worker = new FlowBrowserWorker();
      const currentUrl = "https://flow.google.com/project/story-proj/edit/scene-4-stuck";

      const headerLoc = {
        count: async () => 1,
        waitFor: async () => {},
        locator: () => ({
          count: async () => 1,
          first: () => ({
            isVisible: async () => true,
            isEnabled: async () => true,
            waitFor: async () => {},
            click: async () => {
              throw new Error("Simulated browser deadlock clicking Done");
            },
          }),
        }),
      };

      worker.page = {
        url: () => currentUrl,
        isClosed: () => false,
        evaluate: async () => ({ href: currentUrl, headerExists: true, doneButtons: [] }),
        context: () => ({ pages: () => [worker.page] }),
        locator: (sel) => {
          if (sel === "header.header-base" || sel === "flow-editor-header") return headerLoc;
          return createMockLocator({ count: 0 });
        },
      };
      worker.context = { pages: () => [worker.page] };

      const scene5Job = worker.createJob({
        targetType: "background",
        sceneId: "scene-5",
        prompt: "Scene 5 classroom",
      });

      const resJob5 = await worker.prepareJob(scene5Job.id);
      assert.equal(resJob5.status, "awaiting_editor_cleanup");
      assert.equal(resJob5.flowSessionReady, false);
      assert.equal(resJob5.errorCode, "FLOW_IMAGE_EDITOR_STILL_OPEN");
      assert.equal(worker.activeJobId, null, "Lock must NOT be acquired for Scene 5");

      // Verify no generation can be submitted
      await assert.rejects(
        async () => {
          await worker.requestGeneration(scene5Job.id, {
            confirmGenerate: true,
            referenceConfirmed: true,
          });
        },
        (err) => err.code === "FLOW_IMAGE_EDITOR_STILL_OPEN"
      );
    });
  });

  // ==========================================
  // SECTION E: REAL HTML FIXTURE & DIAGNOSTICS TESTS
  // ==========================================
  describe("E. Real HTML Fixture & Diagnostics Tests", () => {
    it("1. Real Google Flow DOM fixture with <header class='header-base'> and NO <flow-editor-header> closes cleanly", async () => {
      let clicked = false;
      let navigated = false;
      let currentUrl = "https://flow.google.com/project/p-real-dom/edit/asset-real-dom";

      const realHeaderLoc = {
        count: async () => 1,
        waitFor: async () => {},
        locator: (sel) => {
          if (sel === 'button[aria-label="Done editing"]') {
            return {
              count: async () => 1,
              first: () => ({
                isVisible: async () => true,
                isEnabled: async () => true,
                waitFor: async () => {},
                click: async () => {
                  clicked = true;
                  currentUrl = "https://flow.google.com/project/p-real-dom";
                  navigated = true;
                },
              }),
            };
          }
          return { count: async () => 0 };
        },
      };

      const mockPage = {
        url: () => currentUrl,
        isClosed: () => false,
        waitForURL: async (predicate) => {
          if (!predicate(currentUrl)) throw new Error("Timeout");
        },
        locator: (sel) => {
          // Explicitly assert that flow-editor-header DOES NOT EXIST in the real DOM
          if (sel === "flow-editor-header") {
            return { count: async () => 0 };
          }
          if (sel === "header.header-base") {
            return realHeaderLoc;
          }
          return { count: async () => 0 };
        },
      };

      const res = await closeFlowImageEditor(mockPage, console, {
        expectedProjectId: "p-real-dom",
      });

      assert.equal(clicked, true, "Done editing button inside header.header-base must be clicked");
      assert.equal(navigated, true, "Must navigate back to project route");
      assert.equal(res, true);
    });

    it("2. collectFlowEditorDiagnostics inspects header.header-base", async () => {
      const mockPage = {
        url: () => "https://flow.google.com/project/p-diag/edit/asset-diag",
        isClosed: () => false,
        evaluate: async () => ({
          href: "https://flow.google.com/project/p-diag/edit/asset-diag",
          title: "Flow Project",
          headerExists: true,
          headerVisible: true,
          doneButtons: [
            {
              ariaLabel: "Done editing",
              text: "Done",
              visible: true,
              disabled: false,
            },
          ],
          headerButtons: [
            {
              ariaLabel: "Favorite",
              text: "Favorite",
              visible: true,
              disabled: false,
            },
            {
              ariaLabel: "Done editing",
              text: "Done",
              visible: true,
              disabled: false,
            },
          ],
        }),
        context: () => ({ pages: () => [mockPage] }),
      };

      const diags = await collectFlowEditorDiagnostics(mockPage);
      assert.equal(diags.headerExists, true);
      assert.equal(diags.headerVisible, true);
      assert.equal(diags.doneButtons.length, 1);
      assert.equal(diags.doneButtons[0].ariaLabel, "Done editing");
      assert.equal(diags.headerButtons.length, 2);
    });

    it("3. Ambiguous multiple Done buttons inside header.header-base is rejected", async () => {
      const realHeaderLoc = {
        count: async () => 1,
        waitFor: async () => {},
        locator: (sel) => {
          if (sel === 'button[aria-label="Done editing"]') {
            return {
              count: async () => 2,
              first: () => ({ isVisible: async () => true, isEnabled: async () => true }),
            };
          }
          return { count: async () => 0 };
        },
      };

      const mockPage = {
        url: () => "https://flow.google.com/project/p-ambig/edit/asset-ambig",
        isClosed: () => false,
        locator: (sel) => {
          if (sel === "header.header-base") return realHeaderLoc;
          return { count: async () => 0 };
        },
      };

      await assert.rejects(
        async () => {
          await closeFlowImageEditor(mockPage, console, {});
        },
        (err) => err.code === "FLOW_EDITOR_DONE_BUTTON_AMBIGUOUS"
      );
    });
  });

  // ==========================================
  // SECTION F: ANGULAR SPA PROMPT RENDER LATENCY & LIVE DOM DIAGNOSTICS
  // ==========================================
  describe("F. Angular SPA Prompt Render Latency & Live DOM Diagnostics", () => {
    it("1. findAgentPromptEditor waits within timeoutMs for delayed Angular component mount", async () => {
      const worker = new FlowBrowserWorker();
      const mountTime = Date.now() + 300; // Mounts after 300ms

      worker.page = {
        url: () => "https://flow.google.com/project/proj-mount",
        isClosed: () => false,
        locator: (sel) => {
          if (sel.includes("flow-creative-agent-prompt-box") || sel.includes("What do you want to create?")) {
            const isMounted = Date.now() >= mountTime;
            return {
              count: async () => (isMounted ? 1 : 0),
              first: () => ({
                isVisible: async () => isMounted,
                isEnabled: async () => isMounted,
              }),
              nth: () => ({
                isVisible: async () => isMounted,
                isEnabled: async () => isMounted,
              }),
            };
          }
          return { count: async () => 0 };
        },
      };

      const promptEditor = await worker.findAgentPromptEditor({ timeoutMs: 2000 });
      assert.ok(promptEditor, "Prompt editor must be discovered after delayed mount");
      assert.ok(promptEditor.selector, "Must have selector property");
    });

    it("2. detectInterfaceMode waits within timeoutMs and returns agent when mounted", async () => {
      const worker = new FlowBrowserWorker();
      const mountTime = Date.now() + 300;

      worker.page = {
        url: () => "https://flow.google.com/project/proj-mount",
        isClosed: () => false,
        locator: (sel) => {
          if (sel.includes("flow-creative-agent-prompt-box") || sel.includes("What do you want to create?")) {
            const isMounted = Date.now() >= mountTime;
            return {
              count: async () => (isMounted ? 1 : 0),
              first: () => ({
                isVisible: async () => isMounted,
                isEnabled: async () => isMounted,
              }),
              nth: () => ({
                isVisible: async () => isMounted,
                isEnabled: async () => isMounted,
              }),
            };
          }
          return { count: async () => 0 };
        },
      };

      const mode = await worker.detectInterfaceMode({ timeoutMs: 2000 });
      assert.equal(mode, "agent", "Mode must resolve to agent once component is rendered");
    });

    it("3. Prompt discovery failure captures live DOM candidates and attaches diagnostics", async () => {
      const worker = new FlowBrowserWorker();
      const currentUrl = "https://flow.google.com/project/proj-no-prompt";

      worker.page = {
        url: () => currentUrl,
        isClosed: () => false,
        title: async () => "Google Flow Project",
        locator: (sel) => {
          if (sel.includes("textarea, input, [role=\"textbox\"], [contenteditable=\"true\"]")) {
            return {
              evaluateAll: async () => [
                {
                  index: 0,
                  tagName: "INPUT",
                  role: "searchbox",
                  ariaLabel: "Search flow",
                  placeholder: "Search...",
                  dataPlaceholder: null,
                  contenteditable: null,
                  className: "search-input",
                  parentTag: "DIV",
                  parentClass: "search-bar",
                  grandParentTag: "HEADER",
                  grandParentClass: "header-base",
                  visible: true,
                  text: "",
                },
              ],
            };
          }
          return { count: async () => 0 };
        },
      };

      await assert.rejects(
        async () => {
          await worker.findAgentPromptEditor({ timeoutMs: 100 });
        },
        (err) => {
          assert.equal(err.code, "FLOW_AGENT_PROMPT_NOT_FOUND");
          assert.ok(err.diagnostics, "Error must have diagnostics attached");
          assert.equal(err.diagnostics.currentUrl, currentUrl);
          assert.equal(err.diagnostics.candidates.length, 1);
          assert.equal(err.diagnostics.candidates[0].tagName, "INPUT");
          assert.equal(err.diagnostics.candidates[0].ariaLabel, "Search flow");
          return true;
        }
      );
    });
  });
});
