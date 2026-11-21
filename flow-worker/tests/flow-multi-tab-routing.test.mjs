import test from "node:test";
import assert from "node:assert/strict";
import {
  FlowBrowserWorker,
  FLOW_TAB_ROLES,
  FLOW_TAB_METADATA_KEY,
  detectFlowRouteType,
} from "../src/flow-browser.mjs";

function createMockPage(initialUrl = "https://flow.google.com/project/proj-123") {
  let currentUrl = initialUrl;
  let closed = false;
  const sessionStorageMap = new Map();
  const listeners = new Map();

  const page = {
    url: () => currentUrl,
    setUrl: (newUrl) => {
      currentUrl = newUrl;
      const navListeners = listeners.get("framenavigated") || [];
      for (const cb of navListeners) {
        cb(page.mainFrame());
      }
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
      if (typeof fn === "function") {
        const fakeWindow = {
          sessionStorage: {
            setItem: (k, v) => sessionStorageMap.set(k, String(v)),
            getItem: (k) => sessionStorageMap.get(k) || null,
          },
        };
        return fn.call(null, arg);
      }
      return null;
    },
    bringToFront: async () => {},
    getByRole: () => ({
      count: async () => 0,
      first: () => ({ click: async () => {} }),
    }),
    getByPlaceholder: () => ({
      count: async () => 0,
    }),
    locator: () => ({
      count: async () => 0,
      first: () => ({ click: async () => {} }),
    }),
    waitForURL: async () => {},
  };

  // Bind evaluate with realistic sessionStorage emulation
  page.evaluate = async (fn, arg) => {
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
  };

  return page;
}

test("Flow Multi-Tab Routing Suite", async (t) => {
  await t.test("1. Independent registration of background and character tabs", () => {
    const worker = new FlowBrowserWorker();
    const pageA = createMockPage("https://flow.google.com/project/proj-1");
    const pageB = createMockPage("https://flow.google.com/project/proj-1/character");

    // Register pageB FIRST as character, pageA as background (non-index order)
    worker.registerFlowPage(pageB, {
      role: FLOW_TAB_ROLES.CHARACTER,
      projectId: "proj-1",
      purpose: "character-generation",
    });

    worker.registerFlowPage(pageA, {
      role: FLOW_TAB_ROLES.BACKGROUND,
      projectId: "proj-1",
      purpose: "scene-background",
    });

    assert.equal(worker.getFlowPage(FLOW_TAB_ROLES.BACKGROUND), pageA);
    assert.equal(worker.getFlowPage(FLOW_TAB_ROLES.CHARACTER), pageB);

    const metaA = worker.getFlowPageMetadata(pageA);
    assert.equal(metaA.role, "background");
    assert.equal(metaA.projectId, "proj-1");
    assert.equal(metaA.purpose, "scene-background");
    assert.ok(metaA.tabId);

    const metaB = worker.getFlowPageMetadata(pageB);
    assert.equal(metaB.role, "character");
    assert.equal(metaB.projectId, "proj-1");
    assert.equal(metaB.purpose, "character-generation");
    assert.equal(metaB.currentRouteType, "character-create");
  });

  await t.test("2. this.page backward compatibility getter and setter", () => {
    const worker = new FlowBrowserWorker();
    const pageBg = createMockPage("https://flow.google.com/project/proj-1");
    const pageChar = createMockPage("https://flow.google.com/project/proj-1/character");

    worker.registerFlowPage(pageChar, { role: FLOW_TAB_ROLES.CHARACTER });
    worker.registerFlowPage(pageBg, { role: FLOW_TAB_ROLES.BACKGROUND });

    // this.page should return the background tab
    assert.equal(worker.page, pageBg);

    // If background tab is closed, this.page falls back gracefully
    pageBg.close();
    assert.equal(worker.getFlowPage(FLOW_TAB_ROLES.BACKGROUND), null);
    assert.equal(worker.page, pageChar);
  });

  await t.test("3. Job routing by targetType and explicit pageRole", () => {
    const worker = new FlowBrowserWorker();
    const pageBg = createMockPage("https://flow.google.com/project/proj-1");
    const pageChar = createMockPage("https://flow.google.com/project/proj-1/character");

    worker.registerFlowPage(pageBg, { role: FLOW_TAB_ROLES.BACKGROUND });
    worker.registerFlowPage(pageChar, { role: FLOW_TAB_ROLES.CHARACTER });

    const bgJob = worker.createJob({
      sceneId: "scene-101",
      storyId: "story-101",
      prompt: "A magical forest background",
      targetType: "background",
    });
    assert.equal(bgJob.pageRole, "background");
    assert.equal(worker.getPageForJob(bgJob), pageBg);

    const charJob = worker.createJob({
      characterId: "char-202",
      characterName: "Leo the Brave",
      view: "front",
      targetType: "character",
    });
    assert.equal(charJob.pageRole, "character");
    assert.equal(worker.getPageForJob(charJob), pageChar);

    // Explicit override
    const customJob = { id: "custom-1", pageRole: "character" };
    assert.equal(worker.getPageForJob(customJob), pageChar);
  });

  await t.test("4. SessionStorage metadata marker persistence and recovery", async () => {
    const worker = new FlowBrowserWorker();
    const page = createMockPage("https://flow.google.com/project/proj-99");

    const meta = worker.registerFlowPage(page, {
      role: FLOW_TAB_ROLES.CHARACTER,
      projectId: "proj-99",
      purpose: "character-generation",
    });

    const readMarker = await worker.readTabMarkerFromSessionStorage(page);
    assert.ok(readMarker);
    assert.equal(readMarker.role, "character");
    assert.equal(readMarker.projectId, "proj-99");
    assert.equal(readMarker.tabId, meta.tabId);
  });

  await t.test("5. Closing one role tab does not kill or clear other role tab", async () => {
    const worker = new FlowBrowserWorker();
    const pageBg = createMockPage("https://flow.google.com/project/proj-1");
    const pageChar = createMockPage("https://flow.google.com/project/proj-1/character");

    worker.attachPage(pageBg);
    worker.attachPage(pageChar);
    worker.registerFlowPage(pageBg, { role: FLOW_TAB_ROLES.BACKGROUND });
    worker.registerFlowPage(pageChar, { role: FLOW_TAB_ROLES.CHARACTER });

    assert.equal(worker.getFlowPages().length, 2);

    // Close background tab only
    await pageBg.close();

    assert.equal(worker.getFlowPage(FLOW_TAB_ROLES.BACKGROUND), null);
    assert.equal(worker.getFlowPage(FLOW_TAB_ROLES.CHARACTER), pageChar);
    assert.equal(pageChar.isClosed(), false);

    // Status report should accurately reflect this
    const status = await worker.getSessionStatus();
    assert.equal(status.tabs.background.open, false);
    assert.equal(status.tabs.character.open, true);
  });

  await t.test("6. getSessionStatus() reports tab status and active job routing", async () => {
    const worker = new FlowBrowserWorker();
    const pageBg = createMockPage("https://flow.google.com/project/p1");
    const pageChar = createMockPage("https://flow.google.com/project/p1/character/char-1");

    worker.registerFlowPage(pageBg, { role: FLOW_TAB_ROLES.BACKGROUND });
    worker.registerFlowPage(pageChar, { role: FLOW_TAB_ROLES.CHARACTER });

    worker.setActiveJob({ id: "bg-job-1", pageRole: "background" }, FLOW_TAB_ROLES.BACKGROUND);
    worker.setActiveJob({ id: "char-job-2", pageRole: "character" }, FLOW_TAB_ROLES.CHARACTER);

    const status = await worker.getSessionStatus();
    assert.ok(status.tabs);
    assert.equal(status.tabs.background.open, true);
    assert.equal(status.tabs.background.activeJobId, "bg-job-1");
    assert.equal(status.tabs.character.open, true);
    assert.equal(status.tabs.character.activeJobId, "char-job-2");
    assert.equal(status.tabs.character.routeType, "character-editor");
  });
});
