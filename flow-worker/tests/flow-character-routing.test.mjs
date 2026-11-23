import test from "node:test";
import assert from "node:assert/strict";
import {
  FlowBrowserWorker,
  FLOW_TAB_ROLES,
  extractGoogleFlowCharacterReference,
  detectFlowRouteType,
} from "../src/flow-browser.mjs";

test("Google Flow Character Routing & Route Extraction Suite", async (t) => {
  await t.test("1. extractGoogleFlowCharacterReference extracts character create route", () => {
    const parsed = extractGoogleFlowCharacterReference(
      "https://flow.google.com/project/2ea32335-0e57-4d1a-9e1e-98fa3cd491e8/character",
    );
    assert.ok(parsed);
    assert.equal(parsed.projectId, "2ea32335-0e57-4d1a-9e1e-98fa3cd491e8");
    assert.equal(parsed.characterId, null);
    assert.equal(parsed.routeType, "character-create");
    assert.equal(
      parsed.url,
      "https://flow.google.com/project/2ea32335-0e57-4d1a-9e1e-98fa3cd491e8/character",
    );
  });

  await t.test("2. extractGoogleFlowCharacterReference extracts character editor route with characterId", () => {
    const parsed = extractGoogleFlowCharacterReference(
      "https://flow.google.com/project/2ea32335-0e57-4d1a-9e1e-98fa3cd491e8/character/char-987654321",
    );
    assert.ok(parsed);
    assert.equal(parsed.projectId, "2ea32335-0e57-4d1a-9e1e-98fa3cd491e8");
    assert.equal(parsed.characterId, "char-987654321");
    assert.equal(parsed.routeType, "character-editor");
    assert.equal(
      parsed.url,
      "https://flow.google.com/project/2ea32335-0e57-4d1a-9e1e-98fa3cd491e8/character/char-987654321",
    );
  });

  await t.test("3. extractGoogleFlowCharacterReference parses labs.google host and trailing slashes", () => {
    const parsed = extractGoogleFlowCharacterReference(
      "https://labs.google/flow/project/proj-xyz/character/char-abc/",
    );
    assert.ok(parsed);
    assert.equal(parsed.projectId, "proj-xyz");
    assert.equal(parsed.characterId, "char-abc");
    assert.equal(parsed.routeType, "character-editor");
  });

  await t.test("4. extractGoogleFlowCharacterReference rejects image-editor edit routes and non-flow hosts", () => {
    // Image editor route must NOT be recognized as character route
    assert.equal(
      extractGoogleFlowCharacterReference(
        "https://flow.google.com/project/proj-123/edit/70867243-142c-4cfd-902f-6d3ace8bc324",
      ),
      null,
    );

    // Root project route is not character route
    assert.equal(
      extractGoogleFlowCharacterReference(
        "https://flow.google.com/project/proj-123",
      ),
      null,
    );

    // Non-flow hostname
    assert.equal(
      extractGoogleFlowCharacterReference(
        "https://example.com/project/proj-123/character",
      ),
      null,
    );
  });

  await t.test("5. detectFlowRouteType correctly classifies all Flow route types", () => {
    assert.equal(
      detectFlowRouteType("https://flow.google.com/project/p1/character"),
      "character-create",
    );
    assert.equal(
      detectFlowRouteType("https://flow.google.com/project/p1/character/c1"),
      "character-editor",
    );
    assert.equal(
      detectFlowRouteType("https://flow.google.com/project/p1/edit/e1"),
      "image-editor",
    );
    assert.equal(
      detectFlowRouteType("https://flow.google.com/project/p1"),
      "project",
    );
    assert.equal(
      detectFlowRouteType("https://google.com/search"),
      "unknown",
    );
  });

  await t.test("6. Left-nav Characters navigation clicks button and resolves workspace", async () => {
    const worker = new FlowBrowserWorker();
    let clickedNavButton = false;
    let navigatedUrl = "https://flow.google.com/project/proj-100";

    const mockPage = {
      url: () => navigatedUrl,
      isClosed: () => false,
      bringToFront: async () => {},
      getByRole: (role, opts) => {
        if (role === "navigation") {
          return {
            getByRole: (childRole, childOpts) => ({
              count: async () => (childOpts?.name === "Characters" ? 1 : 0),
              first: () => ({
                click: async () => {
                  clickedNavButton = true;
                  navigatedUrl = "https://flow.google.com/project/proj-100/character";
                },
              }),
            }),
          };
        }
        if (role === "button" && opts?.name === "Characters") {
          return {
            count: async () => 1,
            first: () => ({
              click: async () => {
                clickedNavButton = true;
                navigatedUrl = "https://flow.google.com/project/proj-100/character";
              },
            }),
          };
        }
        if (role === "button" && /Format/i.test(opts?.name || "")) {
          return { count: async () => 1 };
        }
        if (role === "button" && /Select model family/i.test(opts?.name || "")) {
          return { count: async () => 1 };
        }
        if (role === "button" && /Start generation/i.test(opts?.name || "")) {
          return { count: async () => 1 };
        }
        return { count: async () => 0 };
      },
      getByPlaceholder: (regex) => ({
        count: async () => (regex.test("Describe your character") ? 1 : 0),
      }),
      locator: () => ({
        count: async () => 0,
        first: () => ({ click: async () => {} }),
      }),
      waitForURL: async () => {},
      evaluate: async () => null,
      on: () => {},
    };

    worker.registerFlowPage(mockPage, {
      role: FLOW_TAB_ROLES.CHARACTER,
      projectId: "proj-100",
    });

    const result = await worker.navigateToCharacterTab("proj-100");
    assert.equal(clickedNavButton, true);
    assert.equal(result.success, true);
    assert.equal(result.url, "https://flow.google.com/project/proj-100/character");
    assert.equal(result.diagnostics.promptTextbox.found, true);
    assert.equal(result.diagnostics.formatButtons.found, true);
    assert.equal(result.diagnostics.modelSelector.found, true);
    assert.equal(result.diagnostics.generateButton.found, true);
  });

  await t.test("6b. Browser launch moves the character-role tab into the Characters workspace", async () => {
    const worker = new FlowBrowserWorker();
    let bgUrl = "https://flow.google.com/project/proj-launch";
    let charUrl = "https://flow.google.com/project/proj-launch";
    let characterNavClicked = false;

    const makePage = (role) => ({
      url: () => role === "background" ? bgUrl : charUrl,
      isClosed: () => false,
      bringToFront: async () => {},
      on: () => {},
      evaluate: async () => null,
      getByRole: (name, options) => {
        if (name === "navigation") {
          return {
            count: async () => 1,
            first() { return this; },
            isVisible: async () => true,
            getByRole: (childRole, childOptions) => ({
              count: async () =>
                childRole === "button" && childOptions?.name === "Characters" ? 1 : 0,
              first: () => ({
                isVisible: async () => true,
                isEnabled: async () => true,
                click: async () => {
                  characterNavClicked = true;
                  charUrl = "https://flow.google.com/project/proj-launch/character";
                },
              }),
            }),
          };
        }
        if (name === "button" && /Format/i.test(options?.name || "")) {
          return { count: async () => 1 };
        }
        if (name === "button" && /Select model family/i.test(options?.name || "")) {
          return { count: async () => 1 };
        }
        if (name === "button" && /Start generation/i.test(options?.name || "")) {
          return { count: async () => 1 };
        }
        if (name === "textbox") return { count: async () => 1 };
        return { count: async () => 0 };
      },
      getByPlaceholder: () => ({ count: async () => 1 }),
      locator: () => ({
        count: async () => 0,
        first: () => ({ click: async () => {} }),
      }),
      waitForURL: async () => {},
    });

    const backgroundPage = makePage("background");
    const characterPage = makePage("character");

    worker.context = {
      pages: () => [backgroundPage, characterPage],
      on: () => {},
      newPage: async () => {
        throw new Error("Unexpected duplicate tab creation");
      },
    };
    worker.getSessionStatus = async () => ({
      connected: true,
      tabs: {
        background: { open: true, url: bgUrl },
        character: { open: true, url: charUrl },
      },
    });

    const session = await worker.launch(
      "https://flow.google.com/project/proj-launch",
    );

    assert.equal(characterNavClicked, true);
    assert.equal(bgUrl, "https://flow.google.com/project/proj-launch");
    assert.equal(charUrl, "https://flow.google.com/project/proj-launch/character");
    assert.equal(session.tabs.character.url, charUrl);
    assert.equal(worker.getFlowPage(FLOW_TAB_ROLES.BACKGROUND), backgroundPage);
    assert.equal(worker.getFlowPage(FLOW_TAB_ROLES.CHARACTER), characterPage);
  });

  await t.test("6c. Failed sidebar navigation falls back to the verified character route", async () => {
    const worker = new FlowBrowserWorker();
    let currentUrl = "https://flow.google.com/project/proj-fallback";
    let gotoUrl = null;

    const page = {
      url: () => currentUrl,
      isClosed: () => false,
      bringToFront: async () => {},
      goto: async (url) => {
        gotoUrl = url;
        currentUrl = url;
      },
      getByRole: (role, options) => {
        if (role === "navigation") {
          return {
            count: async () => 1,
            first() { return this; },
            isVisible: async () => true,
            getByRole: () => ({
              count: async () => 1,
              first: () => ({
                isVisible: async () => true,
                isEnabled: async () => true,
                click: async () => {
                  // Simulate Angular accepting the click without routing.
                },
              }),
            }),
          };
        }
        return { count: async () => 0 };
      },
      waitForURL: async () => {},
      getByPlaceholder: () => ({ count: async () => 0 }),
      locator: () => ({ count: async () => 0 }),
      evaluate: async () => null,
      on: () => {},
    };

    worker.registerFlowPage(page, {
      role: FLOW_TAB_ROLES.CHARACTER,
      projectId: "proj-fallback",
    });

    const result = await worker.navigateToCharacterTab("proj-fallback");

    assert.equal(
      gotoUrl,
      "https://flow.google.com/project/proj-fallback/character",
    );
    assert.equal(result.success, true);
    assert.equal(result.routeType, "character-create");
    assert.equal(result.url, currentUrl);
    assert.equal(result.navigationMethod, "direct-route-fallback");
  });

  await t.test("7. openGoogleFlowCharacterEditor navigates directly to existing character URL", async () => {
    const worker = new FlowBrowserWorker();
    let navigatedTo = "";

    const mockPage = {
      url: () => navigatedTo || "https://flow.google.com/project/proj-200",
      isClosed: () => false,
      bringToFront: async () => {},
      goto: async (url) => {
        navigatedTo = url;
      },
      getByRole: () => ({ count: async () => 0 }),
      getByPlaceholder: () => ({ count: async () => 0 }),
      locator: () => ({ count: async () => 0 }),
      evaluate: async () => null,
      on: () => {},
    };

    worker.registerFlowPage(mockPage, {
      role: FLOW_TAB_ROLES.CHARACTER,
      projectId: "proj-200",
    });

    const result = await worker.openGoogleFlowCharacterEditor({
      projectId: "proj-200",
      characterId: "char-special-1",
    });

    assert.equal(result.success, true);
    assert.equal(result.projectId, "proj-200");
    assert.equal(result.characterId, "char-special-1");
    assert.equal(
      result.url,
      "https://flow.google.com/project/proj-200/character/char-special-1",
    );
  });
});


  await t.test("8. createJob keeps Character role when scene context is also present", () => {
    const worker = new FlowBrowserWorker();
    const job = worker.createJob({
      characterId: "studio-character-1",
      characterName: "Milo",
      sceneId: "scene-associated-with-character",
      storyId: "story-1",
      projectUrl: "https://flow.google.com/project/proj-character",
      view: "front",
      prompt: "Create Milo as a reusable character.",
      pageRole: FLOW_TAB_ROLES.CHARACTER,
    });

    assert.equal(job.targetType, "character");
    assert.equal(job.pageRole, FLOW_TAB_ROLES.CHARACTER);
    assert.equal(job.characterId, "studio-character-1");
    assert.equal(job.googleFlowProjectId, "proj-character");
    assert.equal(job.sceneId, undefined);
  });

  await t.test("9. requestGeneration dispatches Character jobs to the Character submit handler", async () => {
    const worker = new FlowBrowserWorker();
    const page = {
      isClosed: () => false,
      url: () => "https://flow.google.com/project/proj-character/character",
    };
    worker.registerFlowPage(page, {
      role: FLOW_TAB_ROLES.CHARACTER,
      projectId: "proj-character",
    });

    const job = worker.createJob({
      targetType: "character",
      pageRole: FLOW_TAB_ROLES.CHARACTER,
      characterId: "studio-character-2",
      characterName: "Milo",
      projectUrl: "https://flow.google.com/project/proj-character",
      view: "front",
      prompt: "Create Milo.",
    });
    job.status = "prompt_ready";
    worker.recoverActiveJobLock = () => {};
    worker.resolveJobPage = async () => page;

    let calledWithPage = null;
    worker.submitCharacterPrompt = async (receivedJob, confirmation, targetPage) => {
      calledWithPage = targetPage;
      receivedJob.status = "generation_submitted";
      return receivedJob;
    };
    worker.detectInterfaceMode = async () => {
      throw new Error("Character jobs must not use the generic Agent/Background detector.");
    };

    const result = await worker.requestGeneration(job.id, {
      confirmGenerate: true,
      referenceConfirmed: true,
    });

    assert.equal(result, job);
    assert.equal(calledWithPage, page);
    assert.equal(job.status, "generation_submitted");
  });

  await t.test("10. submitCharacterPrompt uses the Character prompt and Character Start generation button", async () => {
    const worker = new FlowBrowserWorker();
    const pageUrl = "https://flow.google.com/project/proj-character/character";
    let enteredPrompt = "";
    let clickedGenerate = false;
    const prompt = {
      isVisible: async () => true,
      isEnabled: async () => true,
      click: async () => {},
      fill: async (value) => { enteredPrompt = value; },
      innerText: async () => enteredPrompt,
    };
    const button = {
      isVisible: async () => true,
      isEnabled: async () => true,
      getAttribute: async () => null,
      click: async () => { clickedGenerate = true; },
    };
    const page = {
      isClosed: () => false,
      url: () => pageUrl,
      locator: (selector) => {
        if (selector.includes("flow-character-prompt-box") && selector.includes("contenteditable")) {
          return { count: async () => 1, nth: () => prompt };
        }
        if (selector.includes("flow-character-prompt-box") && selector.includes("button[aria-label")) {
          return { count: async () => 1, nth: () => button };
        }
        if (selector.includes("img.character-tile-thumbnail")) {
          return { count: async () => 0 };
        }
        return { count: async () => 0 };
      },
      on: () => {},
    };
    worker.registerFlowPage(page, {
      role: FLOW_TAB_ROLES.CHARACTER,
      projectId: "proj-character",
    });
    worker.getCharacterOutputBaseline = async () => ({ identifiers: new Set() });
    worker.startImageResponseCapture = async () => new Map();
    worker.monitorCharacterGenerationAndDownload = async () => {};

    const job = worker.createJob({
      targetType: "character",
      pageRole: FLOW_TAB_ROLES.CHARACTER,
      characterId: "studio-character-3",
      characterName: "Milo",
      projectUrl: "https://flow.google.com/project/proj-character",
      view: "front",
      prompt: "Create a full-body reusable character named Milo.",
    });

    await worker.submitCharacterPrompt(
      job,
      { confirmGenerate: true, referenceConfirmed: true },
      page,
    );

    assert.equal(enteredPrompt, job.prompt);
    assert.equal(clickedGenerate, true);
    assert.equal(job.status, "generation_submitted");
    assert.match(job.submitSelectorUsed, /flow-character-prompt-box/);
  });

  await t.test("11. Character targetType wins over an incidental sceneId during image import", async () => {
    const worker = new FlowBrowserWorker();
    worker.backendUrl = "http://127.0.0.1:9999";
    const originalFetch = global.fetch;
    const requests = [];
    global.fetch = async (url, options) => {
      requests.push(String(url));
      if (String(url).includes("/import-flow")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            result: {
              assetId: "flow-character-asset-1",
              url: "/storage/characters/milo.png",
              storagePath: "storage/characters/milo.png",
            },
          }),
        };
      }
      if (String(url).includes("/assets")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            asset: { id: "flow-character-asset-1", url: "/storage/characters/milo.png" },
          }),
        };
      }
      throw new Error("Unexpected backend route: " + url);
    };

    try {
      const job = worker.createJob({
        targetType: "character",
        pageRole: FLOW_TAB_ROLES.CHARACTER,
        characterId: "studio-character-4",
        characterName: "Milo",
        view: "front",
        prompt: "Milo character reference",
      });
      job.sceneId = "scene-context-only";
      await worker.importDownloadedAsset(
        job,
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAALUlEQVRYR+3QQREAAAzCQPr39g4fXgYk0L2Sqm8cAAAAAAAAAAAAAAAAAAB+1gO4/AH4rE2gOAAAAABJRU5ErkJggg==",
          "base64",
        ),
        { mimeType: "image/png", extension: "png" },
      );

      assert.ok(requests.some((url) => url.includes("/api/character-studio/characters/studio-character-4/import-flow")));
      assert.ok(requests.some((url) => url.includes("/api/character-studio/characters/studio-character-4/assets")));
      assert.ok(requests.every((url) => !url.includes("/api/background-studio/import-flow")));
      assert.equal(job.status, "completed");
    } finally {
      global.fetch = originalFetch;
    }
  });
