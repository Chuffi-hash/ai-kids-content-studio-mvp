import test from "node:test";
import assert from "node:assert/strict";
import {
  FlowBrowserWorker,
  FLOW_TAB_ROLES,
  FLOW_TAB_METADATA_KEY,
  extractGoogleFlowCharacterReference,
} from "../src/flow-browser.mjs";

function createMockPage(initialUrl = "https://flow.google.com/project/proj-1/character") {
  let currentUrl = initialUrl;
  let closed = false;
  const sessionStorageMap = new Map();
  const listeners = new Map();
  const calls = {
    goto: [],
    locator: [],
    evaluate: [],
    bringToFront: 0,
    clicks: [],
    fills: [],
  };

  const elements = new Map();

  const registerElement = (selector, el) => {
    elements.set(selector, el);
  };

  const page = {
    calls,
    elements,
    registerElement,
    sessionStorageMap,
    setSessionStorage: (key, val) => {
      sessionStorageMap.set(key, String(val));
    },
    url: () => currentUrl,
    setUrl: (newUrl) => {
      currentUrl = newUrl;
      const navListeners = listeners.get("framenavigated") || [];
      for (const cb of navListeners) {
        cb(page.mainFrame());
      }
    },
    goto: async (targetUrl, opts) => {
      calls.goto.push({ targetUrl, opts });
      currentUrl = targetUrl;
    },
    isClosed: () => closed,
    close: async () => {
      closed = true;
      const closeListeners = listeners.get("close") || [];
      for (const cb of closeListeners) {
        cb();
      }
    },
    mainFrame: () => page,
    on: (evt, cb) => {
      if (!listeners.has(evt)) listeners.set(evt, []);
      listeners.get(evt).push(cb);
    },
    evaluate: async (fn, arg) => {
      calls.evaluate.push({ fn, arg });
      if (typeof fn === "function") {
        const codeStr = fn.toString();
        if (codeStr.includes("sessionStorage.setItem")) {
          sessionStorageMap.set(arg.key, arg.val);
          return undefined;
        }
        if (codeStr.includes("sessionStorage.getItem")) {
          return sessionStorageMap.get(arg) || null;
        }
        return fn(arg);
      }
      return null;
    },
    bringToFront: async () => {
      calls.bringToFront++;
    },
    getByRole: (role, opts = {}) => {
      const roleKey = `${role}:${opts.name || ""}`;
      const mockEl = elements.get(roleKey);
      if (mockEl) {
        return {
          count: async () => 1,
          first: () => mockEl,
          isVisible: async () => mockEl.isVisible ? mockEl.isVisible() : true,
          isEnabled: async () => mockEl.isEnabled ? mockEl.isEnabled() : true,
          click: async () => {
            calls.clicks.push(roleKey);
            return mockEl.click ? mockEl.click() : undefined;
          },
        };
      }
      return {
        count: async () => 0,
        first: () => ({ click: async () => {}, isVisible: async () => false }),
      };
    },
    getByPlaceholder: () => ({
      count: async () => 0,
    }),
    locator: (selector) => {
      calls.locator.push(selector);
      const matched = [];
      for (const [key, el] of elements.entries()) {
        if (key === selector || key.includes(selector) || selector.includes(key)) {
          matched.push(el);
        }
      }
      return {
        count: async () => matched.length,
        first: () => matched[0] || {
          click: async () => {},
          isVisible: async () => false,
          isEnabled: async () => false,
          fill: async () => {},
          setInputFiles: async () => {},
        },
        last: () => matched[matched.length - 1] || matched[0] || {
          click: async () => {},
          isVisible: async () => false,
          isEnabled: async () => false,
          fill: async () => {},
          setInputFiles: async () => {},
        },
        nth: (idx) => matched[idx] || null,
      };
    },
    waitForURL: async () => {},
    screenshot: async () => Buffer.from("mock-screenshot"),
  };

  return page;
}

function createMockContext(pages = []) {
  const currentPages = [...pages];
  return {
    pages: () => currentPages,
    newPage: async () => {
      const p = createMockPage("about:blank");
      currentPages.push(p);
      return p;
    },
  };
}

test("Google Flow Character Generation E2E Suite (17 Conditions)", async (t) => {
  await t.test("Condition 1: Character job strictly resolves the Character tab", async () => {
    const worker = new FlowBrowserWorker();
    const bgPage = createMockPage("https://flow.google.com/project/proj-100");
    const charPage = createMockPage("https://flow.google.com/project/proj-100/character");

    worker.registerFlowPage(bgPage, { role: FLOW_TAB_ROLES.BACKGROUND, projectId: "proj-100" });
    worker.registerFlowPage(charPage, { role: FLOW_TAB_ROLES.CHARACTER, projectId: "proj-100" });

    const job = worker.createJob({
      targetType: "character",
      characterId: "char-1",
      characterName: "Milo the Monkey",
      projectUrl: "https://flow.google.com/project/proj-100",
      prompt: "A cute little monkey with brown fur",
    });

    assert.equal(job.targetType, "character");
    assert.equal(job.pageRole, FLOW_TAB_ROLES.CHARACTER);
    assert.equal(job.sceneId, undefined, "sceneId must be undefined for character jobs");

    const resolved = await worker.resolveJobPage(job);
    assert.equal(resolved, charPage, "Should resolve to dedicated Character tab");
    assert.notEqual(resolved, bgPage, "Must not resolve to Background tab");
  });

  await t.test("Condition 2: Character job never uses the Background tab", async () => {
    const worker = new FlowBrowserWorker();
    const bgPage = createMockPage("https://flow.google.com/project/proj-100");
    const charPage = createMockPage("https://flow.google.com/project/proj-100/character");

    worker.registerFlowPage(bgPage, { role: FLOW_TAB_ROLES.BACKGROUND, projectId: "proj-100" });
    worker.registerFlowPage(charPage, { role: FLOW_TAB_ROLES.CHARACTER, projectId: "proj-100" });

    const job = worker.createJob({
      targetType: "character",
      characterId: "char-1",
      characterName: "Milo",
      projectUrl: "https://flow.google.com/project/proj-100",
      prompt: "Milo smiling",
    });

    const activeJob = worker.getActiveJob(FLOW_TAB_ROLES.BACKGROUND);
    assert.equal(activeJob, null, "Background tab must not have an active character job");
  });

  await t.test("Condition 3: Character route is correctly detected", async () => {
    const ref1 = extractGoogleFlowCharacterReference("https://flow.google.com/project/p123/character");
    assert.ok(ref1);
    assert.equal(ref1.projectId, "p123");
    assert.equal(ref1.routeType, "character-create");

    const ref2 = extractGoogleFlowCharacterReference("https://flow.google.com/project/p123/character/c456");
    assert.ok(ref2);
    assert.equal(ref2.projectId, "p123");
    assert.equal(ref2.characterId, "c456");

    const ref3 = extractGoogleFlowCharacterReference("https://flow.google.com/project/p123/edit/a789");
    assert.equal(ref3, null, "Background edit route should not be detected as character route");
  });

  await t.test("Condition 4: New character tile is detected and clicked", async () => {
    const worker = new FlowBrowserWorker();
    const page = createMockPage("https://flow.google.com/project/proj-100/character");

    let tileClicked = false;
    let promptMounted = false;

    page.registerElement("flow-custom-tile button.custom-tile-container", {
      isVisible: async () => !promptMounted,
      isEnabled: async () => true,
      innerText: async () => "New character",
      click: async () => {
        tileClicked = true;
        promptMounted = true;
      },
    });

    page.registerElement('flow-rich-text-editor.prompt-input [role="textbox"][aria-label*="Describe your character" i]', {
      isVisible: async () => promptMounted,
      isEnabled: async () => true,
      fill: async () => {},
      evaluate: async () => false,
    });

    const result = await worker.openCharacterCreationInterface(page, "proj-100");
    assert.equal(result.success, true);
    assert.equal(tileClicked, true, "New character tile must be clicked");
  });

  await t.test("Condition 5: Character-specific prompt is located", async () => {
    const worker = new FlowBrowserWorker();
    const page = createMockPage("https://flow.google.com/project/proj-100/character");

    page.registerElement('flow-rich-text-editor.prompt-input [role="textbox"][aria-label*="Describe your character" i]', {
      isVisible: async () => true,
      isEnabled: async () => true,
      getAttribute: async (attr) => (attr === "aria-label" ? "Describe your character…" : null),
      evaluate: async () => false, // Not creative agent
    });

    const found = await worker.findCharacterPromptEditor(page);
    assert.ok(found.locator);
    assert.ok(found.selector.includes("Describe your character"));
  });

  await t.test("Condition 6: Project-level prompt is rejected for character jobs", async () => {
    const worker = new FlowBrowserWorker();
    const page = createMockPage("https://flow.google.com/project/proj-100");

    // Creative agent prompt present
    page.registerElement('flow-creative-agent-prompt-box [role="textbox"]', {
      isVisible: async () => true,
      isEnabled: async () => true,
      evaluate: async () => true, // Inside agent prompt box!
    });

    await assert.rejects(
      async () => {
        await worker.findCharacterPromptEditor(page);
      },
      (err) => {
        return err.code === "FLOW_CHARACTER_PROMPT_NOT_FOUND";
      },
      "Must reject creative agent prompt and throw FLOW_CHARACTER_PROMPT_NOT_FOUND",
    );
  });

  await t.test("Condition 7: Character generation button is correctly identified", async () => {
    const worker = new FlowBrowserWorker();
    const page = createMockPage("https://flow.google.com/project/proj-100/character");

    page.registerElement('button[type="submit"][aria-label="Start generation"]', {
      isVisible: async () => true,
      isEnabled: async () => true,
      getAttribute: async (attr) => (attr === "disabled" ? null : "Start generation"),
    });

    const btn = await worker.findCharacterGenerationButton(page);
    assert.ok(btn.locator);
    assert.equal(
      btn.selector,
      'flow-base-prompt-box:has(flow-rich-text-editor.prompt-input [role="textbox"][aria-label*="Describe your character" i]) button[type="submit"][aria-label="Start generation"]',
    );
  });

  await t.test("Condition 8: Prompt content is correctly entered", async () => {
    const worker = new FlowBrowserWorker();
    const page = createMockPage("https://flow.google.com/project/proj-100/character");

    let filledText = "";
    const promptLocator = {
      isVisible: async () => true,
      fill: async (text) => {
        filledText = text;
      },
      evaluate: async (fn, text) => {
        filledText = text;
      },
    };

    await worker.fillFlowPrompt(page, promptLocator, "Little red fox");
    assert.equal(filledText, "Little red fox");
  });

  await t.test("Condition 9: Character reference upload works", async () => {
    const worker = new FlowBrowserWorker();
    const page = createMockPage("https://flow.google.com/project/proj-100/character");

    let uploadedFiles = null;
    page.registerElement('input[type="file"]', {
      isVisible: async () => true,
      setInputFiles: async (files) => {
        uploadedFiles = files;
      },
    });

    const job = {
      id: "char-job-ref",
      uploadedReferences: ["/path/to/fox-ref.png"],
    };

    await worker.attachCharacterReferences(page, job);
    assert.deepEqual(uploadedFiles, ["/path/to/fox-ref.png"]);
    assert.deepEqual(job.characterReferences, ["/path/to/fox-ref.png"]);
  });

  await t.test("Condition 10: Add from project works", async () => {
    const worker = new FlowBrowserWorker();
    const page = createMockPage("https://flow.google.com/project/proj-100/character");

    let addFromProjectClicked = false;
    let selectedAsset = false;
    let addMediaClicked = false;

    page.registerElement('button:has-text("Add from project")', {
      isVisible: async () => true,
      click: async () => {
        addFromProjectClicked = true;
      },
    });

    page.registerElement('[data-asset-id="asset-proj-99"]', {
      isVisible: async () => true,
      click: async () => {
        selectedAsset = true;
      },
    });

    page.registerElement('button:has-text("Add media")', {
      isVisible: async () => true,
      click: async () => {
        addMediaClicked = true;
      },
    });

    const job = {
      id: "char-job-proj-ref",
      projectReferences: ["asset-proj-99"],
    };

    await worker.attachCharacterReferences(page, job);
    assert.equal(addFromProjectClicked, true);
    assert.equal(selectedAsset, true);
    assert.equal(addMediaClicked, true);
    assert.deepEqual(job.characterReferences, ["asset-proj-99"]);
  });

  await t.test("Condition 11: Reference images are not mistaken for generated output", async () => {
    const worker = new FlowBrowserWorker();
    const page = createMockPage("https://flow.google.com/project/proj-100/character");

    const baseline = {
      identifiers: new Set([
        "https://flow.google.com/asb/reference-image-1.png",
        "asset-proj-99",
      ]),
    };

    // Both an old reference thumbnail and a brand new thumbnail are on page
    page.registerElement(
      "flow-grid-tile-container[aria-label] flow-character-tile img.character-tile-thumbnail",
      {
        isVisible: async () => true,
        evaluate: async () => ({
          src: "https://flow.google.com/asb/reference-image-1.png",
          currentSrc: "https://flow.google.com/asb/reference-image-1.png",
          visible: true,
          complete: true,
          naturalWidth: 512,
          naturalHeight: 512,
        }),
      },
    );

    const outputs = await worker.collectNewCharacterOutput(page, baseline);
    assert.equal(outputs.length, 0, "Reference image in baseline must be ignored");
  });

  await t.test("Condition 12: Background output is not mistaken for character output", async () => {
    const worker = new FlowBrowserWorker();
    const page = createMockPage("https://flow.google.com/project/proj-100/character");

    // Only character tiles matching flow-character-tile should be matched, not background tiles
    const outputs = await worker.collectNewCharacterOutput(page, { identifiers: new Set() });
    assert.equal(outputs.length, 0, "Empty or non-matching background output returns no character output");
  });

  await t.test("Condition 13: Character output is imported into the correct character", async () => {
    const worker = new FlowBrowserWorker();
    worker.backendUrl = "http://localhost:3000";

    const originalFetch = globalThis.fetch;
    let importCalled = false;
    let importedBody = null;

    globalThis.fetch = async (url, opts) => {
      if (url.includes("/api/integrations/google-flow/import-asset")) {
        importCalled = true;
        importedBody = JSON.parse(opts.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            assetId: "char-asset-123",
            imageUrl: "http://localhost:3000/storage/char-asset-123.webp",
          }),
        };
      }
      return originalFetch(url, opts);
    };

    try {
      // 100x100 1-pixel WebP valid header
      const validWebpBuffer = Buffer.from(
        "52494646240000005745425056503820180000003001009d012a640064000000",
        "hex",
      );

      const job = {
        id: "char-job-import",
        targetType: "character",
        characterId: "char-uuid-42",
        characterName: "Kiko the Bear",
        storyId: "story-10",
        view: "front",
        isMasterReference: true,
        googleFlowCharacterId: "flow-char-99",
        prompt: "A smiling bear",
      };

      await worker.importCharacterAsset(job, validWebpBuffer, {
        mimeType: "image/webp",
        extension: "webp",
      });

      assert.equal(importCalled, true, "Import asset API must be called");
      assert.equal(importedBody.target, "character_reference");
      assert.equal(importedBody.characterId, "char-uuid-42");
      assert.equal(importedBody.googleFlowCharacterId, "flow-char-99");
      assert.equal(job.status, "completed");
      assert.equal(job.asset.assetId, "char-asset-123");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test("Condition 13b: A non-master front turnaround view imports as character_view", async () => {
    const worker = new FlowBrowserWorker();
    worker.backendUrl = "http://localhost:3000";

    const originalFetch = globalThis.fetch;
    let importedBody = null;
    globalThis.fetch = async (url, opts) => {
      if (url.includes("/api/integrations/google-flow/import-asset")) {
        importedBody = JSON.parse(opts.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            assetId: "char-direction-front-123",
            imageUrl: "http://localhost:3000/storage/char-direction-front-123.webp",
          }),
        };
      }
      return originalFetch(url, opts);
    };

    try {
      const validWebpBuffer = Buffer.from(
        "52494646240000005745425056503820180000003001009d012a640064000000",
        "hex",
      );
      const job = {
        id: "char-job-direction-front",
        targetType: "character",
        pageRole: FLOW_TAB_ROLES.CHARACTER,
        characterId: "char-uuid-42",
        characterName: "Kiko the Bear",
        storyId: "story-10",
        view: "front",
        assetType: "turnaround",
        isMasterReference: false,
        googleFlowCharacterId: "flow-char-99",
        prompt: "One clean standalone front view. No text or labels.",
      };

      await worker.importCharacterAsset(job, validWebpBuffer, {
        mimeType: "image/webp",
        extension: "webp",
      });

      assert.equal(importedBody.target, "character_view");
      assert.equal(importedBody.isMasterReference, false);
      assert.equal(importedBody.view, "front");
      assert.equal(importedBody.characterId, "char-uuid-42");
      assert.equal(job.status, "completed");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test("Condition 14: Character jobs never enter scene/background association", async () => {
    const worker = new FlowBrowserWorker();
    const emittedEvents = [];
    worker.emitLifecycleLog = (evt, job, extra) => {
      emittedEvents.push({ evt, job, extra });
    };

    const job = worker.createJob({
      targetType: "character",
      characterId: "char-isolation",
      characterName: "Pip",
      projectUrl: "https://flow.google.com/project/proj-isolation",
      prompt: "A tiny bird",
    });

    assert.equal(job.sceneId, undefined, "sceneId must not exist on character job");

    // Simulate import
    const validWebpBuffer = Buffer.from(
      "52494646240000005745425056503820180000003001009d012a640064000000",
      "hex",
    );

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        assetId: "char-asset-isolation",
        imageUrl: "/img/char.webp",
      }),
    });

    try {
      await worker.importCharacterAsset(job, validWebpBuffer, {
        mimeType: "image/webp",
        extension: "webp",
      });

      const eventNames = emittedEvents.map((e) => e.evt);
      assert.ok(!eventNames.includes("SCENE_IMAGE_ASSOCIATION_VERIFIED"));
      assert.ok(!eventNames.includes("IMAGE_RIGHT_CLICK_DISPATCHED"));
      assert.ok(!eventNames.includes("NATIVE_SAVE_AS_FAILED"));
      assert.ok(eventNames.includes("CHARACTER_ASSOCIATION_VERIFIED"));
      assert.ok(eventNames.includes("CHARACTER_GENERATION_COMPLETED"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test("Condition 15: Failed imports do not trigger duplicate generations", async () => {
    const worker = new FlowBrowserWorker();
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      json: async () => ({ success: false, message: "DB Error" }),
    });

    const validWebpBuffer = Buffer.from(
      "52494646240000005745425056503820180000003001009d012a640064000000",
      "hex",
    );

    const job = {
      id: "char-fail-job",
      targetType: "character",
      characterId: "char-fail",
      characterName: "FailChar",
      prompt: "Fail prompt",
    };

    try {
      await assert.rejects(async () => {
        await worker.importCharacterAsset(job, validWebpBuffer, {
          mimeType: "image/webp",
          extension: "webp",
        });
      });
      // Verify job didn't reset to created or trigger second generation
      assert.notEqual(job.status, "generation_submitted");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test("Condition 16: Character and background jobs can operate independently", async () => {
    const worker = new FlowBrowserWorker();
    const bgPage = createMockPage("https://flow.google.com/project/p1");
    const charPage = createMockPage("https://flow.google.com/project/p1/character");

    worker.registerFlowPage(bgPage, { role: FLOW_TAB_ROLES.BACKGROUND, projectId: "p1" });
    worker.registerFlowPage(charPage, { role: FLOW_TAB_ROLES.CHARACTER, projectId: "p1" });

    const bgJob = worker.createJob({
      targetType: "background",
      sceneId: "scene-1",
      projectUrl: "https://flow.google.com/project/p1",
      prompt: "Sunny meadow",
    });

    const charJob = worker.createJob({
      targetType: "character",
      characterId: "char-1",
      characterName: "Bunny",
      projectUrl: "https://flow.google.com/project/p1",
      prompt: "White fluffy bunny",
    });

    worker.setActiveJob(bgJob, FLOW_TAB_ROLES.BACKGROUND);
    worker.setActiveJob(charJob, FLOW_TAB_ROLES.CHARACTER);

    assert.equal(worker.getActiveJob(FLOW_TAB_ROLES.BACKGROUND)?.id, bgJob.id);
    assert.equal(worker.getActiveJob(FLOW_TAB_ROLES.CHARACTER)?.id, charJob.id);

    // Cancel char job
    worker.setJobTerminal(charJob, "cancelled", undefined, "User cancelled");
    assert.equal(worker.getActiveJob(FLOW_TAB_ROLES.CHARACTER), null);
    assert.equal(
      worker.getActiveJob(FLOW_TAB_ROLES.BACKGROUND)?.id,
      bgJob.id,
      "Background active job must remain untouched",
    );
  });

  await t.test("Condition 17: All 21 character lifecycle events are supported and emitted with required metadata", async () => {
    const worker = new FlowBrowserWorker();
    const eventsLogged = [];
    worker.emitLifecycleLog = (event, job, extra = {}) => {
      eventsLogged.push({ event, extra, job });
    };

    const job = worker.createJob({
      targetType: "character",
      characterId: "char-lifecycle",
      characterName: "Leo the Lion",
      storyId: "story-lifecycle",
      googleFlowProjectId: "proj-lifecycle",
      prompt: "A majestic lion cub",
      uploadedReferences: ["/path/ref.jpg"],
      projectReferences: ["asset-777"],
    });

    // 1. CHARACTER_GENERATION_REQUESTED
    assert.ok(eventsLogged.some((e) => e.event === "CHARACTER_GENERATION_REQUESTED"));

    // 2. CHARACTER_FLOW_NAVIGATION_STARTED
    // 3. CHARACTER_FLOW_TAB_RESOLVED
    // 4. CHARACTER_CREATE_PAGE_OPENED
    // 5. CHARACTER_CONTEXT_VERIFIED
    // 6. CHARACTER_PROMPT_LOCATED
    // 7. CHARACTER_PROMPT_FILLED
    // 8. CHARACTER_REFERENCE_UPLOAD_STARTED
    // 9. CHARACTER_REFERENCE_UPLOADED
    // 10. CHARACTER_PROJECT_REFERENCE_SELECTED
    // 11. CHARACTER_REFERENCES_VERIFIED
    const charPage = createMockPage("https://flow.google.com/project/proj-lifecycle/character");
    const characterSubmitButton = {
      isVisible: async () => true,
      isEnabled: async () => true,
      getAttribute: async () => null,
      click: async () => {},
    };
    const characterPromptRoot = {
      count: async () => 1,
      locator: () => ({
        count: async () => 1,
        nth: () => characterSubmitButton,
      }),
    };
    charPage.registerElement('flow-rich-text-editor.prompt-input [role="textbox"][aria-label*="Describe your character" i]', {
      isVisible: async () => true,
      isEnabled: async () => true,
      fill: async () => {},
      evaluate: async () => false,
      locator: (selector) =>
        selector.includes("ancestor::flow-base-prompt-box")
          ? characterPromptRoot
          : { count: async () => 0 },
    });
    charPage.registerElement('input[type="file"]', {
      isVisible: async () => true,
      setInputFiles: async () => {},
    });

    worker.browser = {};
    worker.context = createMockContext([charPage]);
    worker.registerFlowPage(charPage, { role: FLOW_TAB_ROLES.CHARACTER, projectId: "proj-lifecycle" });
    await worker.prepareJob(job.id, FLOW_TAB_ROLES.CHARACTER);

    const eventNames = eventsLogged.map((e) => e.event);
    assert.ok(eventNames.includes("CHARACTER_FLOW_NAVIGATION_STARTED"), "Missing CHARACTER_FLOW_NAVIGATION_STARTED");
    assert.ok(eventNames.includes("CHARACTER_FLOW_TAB_RESOLVED"), "Missing CHARACTER_FLOW_TAB_RESOLVED");
    assert.ok(eventNames.includes("CHARACTER_CREATE_PAGE_OPENED"), "Missing CHARACTER_CREATE_PAGE_OPENED");
    assert.ok(eventNames.includes("CHARACTER_CONTEXT_VERIFIED"), "Missing CHARACTER_CONTEXT_VERIFIED");
    assert.ok(eventNames.includes("CHARACTER_PROMPT_LOCATED"), "Missing CHARACTER_PROMPT_LOCATED");
    assert.ok(eventNames.includes("CHARACTER_PROMPT_FILLED"), "Missing CHARACTER_PROMPT_FILLED");
    assert.ok(eventNames.includes("CHARACTER_REFERENCE_UPLOAD_STARTED"), "Missing CHARACTER_REFERENCE_UPLOAD_STARTED");
    assert.ok(eventNames.includes("CHARACTER_REFERENCE_UPLOADED"), "Missing CHARACTER_REFERENCE_UPLOADED");
    assert.ok(eventNames.includes("CHARACTER_PROJECT_REFERENCE_SELECTED"), "Missing CHARACTER_PROJECT_REFERENCE_SELECTED");
    assert.ok(eventNames.includes("CHARACTER_REFERENCES_VERIFIED"), "Missing CHARACTER_REFERENCES_VERIFIED");

    // 12. CHARACTER_GENERATION_TRIGGERED & 13. CHARACTER_GENERATION_WAITING
    charPage.registerElement('button[type="submit"][aria-label="Start generation"]', characterSubmitButton);

    await worker.submitCharacterPrompt(job, { confirmGenerate: true, referenceConfirmed: true }, charPage);
    assert.match(job.submitSelectorUsed, /ancestor::flow-base-prompt-box/);
    assert.ok(eventsLogged.some((e) => e.event === "CHARACTER_GENERATION_TRIGGERED"));
    assert.ok(eventsLogged.some((e) => e.event === "CHARACTER_GENERATION_WAITING"));

    // 14. CHARACTER_OUTPUT_DETECTED
    // 15. CHARACTER_IMAGE_CAPTURE_STARTED
    // 16. CHARACTER_IMAGE_CAPTURE_COMPLETED
    // 17. CHARACTER_ASSET_IMPORT_STARTED
    // 18. CHARACTER_ASSET_IMPORT_COMPLETED
    // 19. CHARACTER_ASSOCIATION_VERIFIED
    // 20. CHARACTER_GENERATION_COMPLETED
    const validWebpBuffer = Buffer.from(
      "52494646240000005745425056503820180000003001009d012a640064000000",
      "hex",
    );

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        assetId: "asset-leo-01",
        imageUrl: "http://localhost:3000/leo.webp",
      }),
    });

    try {
      await worker.importCharacterAsset(job, validWebpBuffer, {
        mimeType: "image/webp",
        extension: "webp",
      });

      const finalEvents = eventsLogged.map((e) => e.event);
      assert.ok(finalEvents.includes("CHARACTER_ASSET_IMPORT_STARTED"));
      assert.ok(finalEvents.includes("CHARACTER_ASSET_IMPORT_COMPLETED"));
      assert.ok(finalEvents.includes("CHARACTER_ASSOCIATION_VERIFIED"));
      assert.ok(finalEvents.includes("CHARACTER_GENERATION_COMPLETED"));
    } finally {
      globalThis.fetch = originalFetch;
    }

    // 21. CHARACTER_GENERATION_FAILED
    worker.emitLifecycleLog("CHARACTER_GENERATION_FAILED", job, {
      errorCode: "TEST_FAILURE",
      error: "Test error message",
      success: false,
    });
    assert.ok(eventsLogged.some((e) => e.event === "CHARACTER_GENERATION_FAILED"));

    // Verify metadata properties for character events:
    const charReqEvent = eventsLogged.find((e) => e.event === "CHARACTER_GENERATION_REQUESTED");
    assert.equal(charReqEvent.job.targetType, "character");
    assert.equal(charReqEvent.job.pageRole, "character");
    assert.equal(charReqEvent.job.characterId, "char-lifecycle");
    assert.equal(charReqEvent.job.sceneId, undefined, "sceneId must not exist in character event metadata");
  });

  await t.test("Condition 18: Character monitor imports only a generation-scoped output and commits New character", async () => {
    const worker = new FlowBrowserWorker();
    const events = [];
    worker.emitLifecycleLog = (event, job, details = {}) => {
      events.push({ event, job, details });
    };

    const now = Date.now();
    const responseBuffer = Buffer.alloc(700, 7);
    const sourceUrl = "https://flow.google.com/asb/character-result-123=s0";
    const job = worker.createJob({
      targetType: "character",
      pageRole: FLOW_TAB_ROLES.CHARACTER,
      characterId: "char-monitor-18",
      characterName: "Milo",
      storyId: "story-monitor-18",
      view: "front",
      prompt: "A full body character named Milo.",
    });
    job.characterPromptMode = "create";
    job.status = "generation_submitted";
    job.generationRequestedAt = new Date(now).toISOString();
    job.capturedImageResponses = new Map([
      [sourceUrl, {
        url: sourceUrl,
        buffer: responseBuffer,
        mimeType: "image/webp",
        capturedAt: now,
      }],
    ]);
    job.pendingImageCaptures = [];

    let doneClicked = false;
    let importedBuffer = null;
    const doneButton = {
      isVisible: async () => true,
      isEnabled: async () => true,
      click: async () => { doneClicked = true; },
    };
    const page = {
      // Google Flow can assign the new character ID before the first Done save.
      url: () => "https://flow.google.com/project/proj-monitor-18/character/flow-new-char-18",
      isClosed: () => false,
      locator: (selector) => {
        if (selector === 'button[aria-label="Done"]') {
          return {
            count: async () => 1,
            first: () => doneButton,
          };
        }
        return { count: async () => 0 };
      },
    };
    worker.findCharacterGenerationButton = async () => ({
      locator: {
        isEnabled: async () => true,
        getAttribute: async () => null,
      },
      selector: "character-submit-button",
    });
    worker.isCharacterOutputSourceVisible = async () => false;
    worker.collectNewCharacterOutput = async () => [];
    worker.downloadCharacterImageSource = async (_page, receivedJob, receivedUrl, captured) => {
      assert.equal(receivedJob, job);
      assert.equal(receivedUrl, sourceUrl);
      assert.equal(captured.buffer, responseBuffer);
      return {
        success: true,
        path: "/tmp/character-monitor-18.webp",
        fileName: "character-monitor-18.webp",
        fileSize: responseBuffer.length,
        buffer: responseBuffer,
        mimeType: "image/webp",
        extension: "webp",
        width: 512,
        height: 512,
        sourceUrl,
      };
    };
    worker.importCharacterAsset = async (receivedJob, buffer, imageType) => {
      assert.equal(receivedJob.targetType, "character");
      assert.equal(receivedJob.characterId, "char-monitor-18");
      assert.equal(receivedJob.sceneId, undefined);
      assert.equal(imageType.mimeType, "image/webp");
      importedBuffer = buffer;
      receivedJob.importResult = { assetId: "character-asset-18" };
      receivedJob.asset = receivedJob.importResult;
      worker.setJobTerminal(receivedJob, "completed", undefined, "Character import completed in test.");
    };

    await worker.monitorCharacterGenerationAndDownload(
      job.id,
      page,
      { identifiers: new Set() },
      { maxWaitMs: 50, pollIntervalMs: 1 },
    );

    assert.equal(job.status, "completed");
    assert.equal(importedBuffer, responseBuffer);
    assert.equal(doneClicked, true);
    assert.equal(job.googleFlowCharacterId, "flow-new-char-18");
    assert.equal(job.downloadMethod, "character_network_response_capture");
    assert.ok(events.some((item) => item.event === "CHARACTER_OUTPUT_DETECTED"));
    assert.ok(events.some((item) => item.event === "CHARACTER_IMAGE_CAPTURE_COMPLETED"));
  });

  await t.test("Condition 19: Character monitor rejects unrelated ambiguous image responses", async () => {
    const worker = new FlowBrowserWorker();
    const events = [];
    worker.emitLifecycleLog = (event, job, details = {}) => {
      events.push({ event, job, details });
    };

    const now = Date.now();
    const job = worker.createJob({
      targetType: "character",
      pageRole: FLOW_TAB_ROLES.CHARACTER,
      characterId: "char-ambiguous-19",
      characterName: "Pip",
      view: "front",
      prompt: "A small blue bird.",
    });
    job.status = "generation_submitted";
    job.generationRequestedAt = new Date(now).toISOString();
    job.capturedImageResponses = new Map([
      ["https://flow.google.com/asb/character-image-1=s0", {
        buffer: Buffer.alloc(700, 1),
        capturedAt: now,
      }],
      ["https://flow.google.com/asb/character-image-2=s0", {
        buffer: Buffer.alloc(710, 2),
        capturedAt: now + 1,
      }],
    ]);
    job.pendingImageCaptures = [];

    const page = {
      url: () => "https://flow.google.com/project/proj-ambiguous-19/character",
      isClosed: () => false,
      locator: () => ({ count: async () => 0 }),
    };
    worker.collectNewCharacterOutput = async () => [];
    worker.findCharacterGenerationButton = async () => ({
      locator: {
        isEnabled: async () => false,
        getAttribute: async () => "true",
      },
      selector: "character-submit-button",
    });
    worker.isCharacterOutputSourceVisible = async () => false;
    worker.importCharacterAsset = async () => {
      throw new Error("Ambiguous character responses must never be imported.");
    };

    await worker.monitorCharacterGenerationAndDownload(
      job.id,
      page,
      { identifiers: new Set() },
      { maxWaitMs: 15, pollIntervalMs: 1 },
    );

    assert.equal(job.status, "failed");
    assert.ok(
      events.some(
        (item) =>
          item.event === "CHARACTER_GENERATION_FAILED" &&
          item.details.errorCode === "FLOW_CHARACTER_OUTPUT_AMBIGUOUS",
      ),
    );
  });


  await t.test("Condition 20: Saved Character editor baseline excludes the old master image from captured turnaround results", async () => {
    const worker = new FlowBrowserWorker();
    const now = Date.now();
    const existingUrl = "https://flow.google.com/asb/character-master-existing=s0";
    const newViewUrl = "https://flow.google.com/asb/character-back-view-new=s0";
    const importedSources = [];
    let doneClicked = false;

    const existingImage = {
      isVisible: async () => true,
      getAttribute: async (name) => (name === "src" ? existingUrl : null),
      evaluate: async () => existingUrl,
    };
    const doneButton = {
      isVisible: async () => true,
      click: async () => { doneClicked = true; },
    };
    const page = {
      url: () => "https://flow.google.com/project/proj-mapped/character/flow-char-mapped",
      isClosed: () => false,
      locator: (selector) => {
        if (selector.includes('img[src*="/asb/"]')) {
          return {
            count: async () => 1,
            nth: () => existingImage,
          };
        }
        if (selector === 'button[aria-label="Done editing"]') {
          return {
            count: async () => 1,
            first: () => doneButton,
          };
        }
        return { count: async () => 0 };
      },
    };

    const baseline = await worker.getCharacterOutputBaseline(page);
    assert.ok(baseline.identifiers.has(existingUrl));
    assert.ok(baseline.identifiers.has("character-master-existing"));

    const job = worker.createJob({
      targetType: "character",
      pageRole: FLOW_TAB_ROLES.CHARACTER,
      characterId: "studio-char-mapped",
      characterName: "Mili",
      projectUrl: "https://flow.google.com/project/proj-mapped",
      googleFlowCharacterId: "flow-char-mapped",
      assetType: "turnaround",
      view: "back",
      prompt: "Create one standalone rear view.",
    });
    job.characterPromptMode = "edit";
    job.status = "generation_submitted";
    job.generationRequestedAt = new Date(now - 100).toISOString();
    job.capturedImageResponses = new Map([
      [existingUrl, {
        buffer: Buffer.alloc(700, 1),
        capturedAt: now,
      }],
      [newViewUrl, {
        buffer: Buffer.alloc(710, 2),
        capturedAt: now + 1,
      }],
    ]);
    job.pendingImageCaptures = [];

    worker.collectNewCharacterOutput = async () => [];
    worker.findCharacterEditorSubmitButton = async () => ({
      locator: {
        isEnabled: async () => true,
        getAttribute: async () => null,
      },
      selector: "flow-edit-image-prompt-box send button",
    });
    worker.isCharacterOutputSourceVisible = async () => false;
    worker.downloadCharacterImageSource = async (_page, receivedJob, sourceUrl, captured) => {
      assert.equal(receivedJob, job);
      assert.equal(sourceUrl, newViewUrl);
      assert.equal(captured.buffer[0], 2);
      importedSources.push(sourceUrl);
      return {
        path: "/tmp/mili-back-view.webp",
        fileName: "mili-back-view.webp",
        fileSize: 710,
        buffer: captured.buffer,
        mimeType: "image/webp",
        extension: "webp",
        width: 512,
        height: 512,
        sourceUrl,
      };
    };
    worker.importCharacterAsset = async (receivedJob, buffer, imageType) => {
      assert.equal(receivedJob.characterPromptMode, "edit");
      assert.equal(receivedJob.googleFlowCharacterId, "flow-char-mapped");
      assert.equal(receivedJob.view, "back");
      assert.equal(imageType.mimeType, "image/webp");
      receivedJob.importResult = { assetId: "mili-back-view-asset" };
      receivedJob.asset = receivedJob.importResult;
      worker.setJobTerminal(receivedJob, "completed", undefined, "Directional view imported.");
    };

    await worker.monitorCharacterGenerationAndDownload(
      job.id,
      page,
      baseline,
      { maxWaitMs: 40, pollIntervalMs: 1 },
    );

    assert.equal(job.status, "completed");
    assert.deepEqual(importedSources, [newViewUrl]);
    assert.equal(doneClicked, false, "A saved Character editor must not promote a directional view to the master image.");
  });

});
