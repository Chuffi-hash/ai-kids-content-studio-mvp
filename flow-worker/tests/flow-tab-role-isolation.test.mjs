import test from "node:test";
import assert from "node:assert/strict";
import {
  FlowBrowserWorker,
  FLOW_TAB_ROLES,
  FLOW_TAB_METADATA_KEY,
  getJobPageRole,
} from "../src/flow-browser.mjs";

function createMockPage(initialUrl = "https://flow.google.com/project/proj-1") {
  let currentUrl = initialUrl;
  let closed = false;
  const sessionStorageMap = new Map();
  const listeners = new Map();
  const calls = {
    goto: [],
    locator: [],
    evaluate: [],
    bringToFront: 0,
  };

  const page = {
    calls,
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
    getByRole: () => ({
      count: async () => 0,
      first: () => ({ click: async () => {} }),
    }),
    getByPlaceholder: () => ({
      count: async () => 0,
    }),
    locator: (selector) => {
      calls.locator.push(selector);
      return {
        count: async () => 0,
        first: () => ({
          click: async () => {},
          isVisible: async () => false,
          isEnabled: async () => false,
          fill: async () => {},
        }),
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

test("Google Flow Tab Role Isolation Suite", async (t) => {
  await t.test("1. Character job strictly resolves Character tab", async () => {
    const worker = new FlowBrowserWorker();
    const pageBg = createMockPage("https://flow.google.com/project/proj-1");
    const pageChar = createMockPage("https://flow.google.com/project/proj-1/character");

    worker.registerFlowPage(pageBg, { role: FLOW_TAB_ROLES.BACKGROUND, projectId: "proj-1" });
    worker.registerFlowPage(pageChar, { role: FLOW_TAB_ROLES.CHARACTER, projectId: "proj-1" });

    const job = {
      id: "char-job-1",
      targetType: "character",
      characterId: "c1",
      googleFlowProjectId: "proj-1",
    };

    const resolvedRole = getJobPageRole(job);
    assert.equal(resolvedRole, FLOW_TAB_ROLES.CHARACTER);

    const resolvedPage = await worker.resolveJobPage(job);
    assert.equal(resolvedPage, pageChar);
    assert.equal(worker.getPageForJob(job), pageChar);

    const resolvedMeta = worker.getFlowPageMetadata(resolvedPage);
    assert.equal(resolvedMeta.role, FLOW_TAB_ROLES.CHARACTER);
  });

  await t.test("2. Background job strictly resolves Background tab", async () => {
    const worker = new FlowBrowserWorker();
    const pageBg = createMockPage("https://flow.google.com/project/proj-1");
    const pageChar = createMockPage("https://flow.google.com/project/proj-1/character");

    worker.registerFlowPage(pageBg, { role: FLOW_TAB_ROLES.BACKGROUND, projectId: "proj-1" });
    worker.registerFlowPage(pageChar, { role: FLOW_TAB_ROLES.CHARACTER, projectId: "proj-1" });

    const job = {
      id: "bg-job-1",
      targetType: "background",
      sceneId: "s1",
      googleFlowProjectId: "proj-1",
    };

    const resolvedRole = getJobPageRole(job);
    assert.equal(resolvedRole, FLOW_TAB_ROLES.BACKGROUND);

    const resolvedPage = await worker.resolveJobPage(job);
    assert.equal(resolvedPage, pageBg);
    assert.equal(worker.getPageForJob(job), pageBg);

    const resolvedMeta = worker.getFlowPageMetadata(resolvedPage);
    assert.equal(resolvedMeta.role, FLOW_TAB_ROLES.BACKGROUND);
  });

  await t.test("3. Background tab focused does NOT divert Character job from Character tab", async () => {
    const worker = new FlowBrowserWorker();
    const pageBg = createMockPage("https://flow.google.com/project/proj-1");
    const pageChar = createMockPage("https://flow.google.com/project/proj-1/character");

    worker.registerFlowPage(pageBg, { role: FLOW_TAB_ROLES.BACKGROUND, projectId: "proj-1" });
    worker.registerFlowPage(pageChar, { role: FLOW_TAB_ROLES.CHARACTER, projectId: "proj-1" });

    // Simulate user or Chrome focusing the background tab
    await pageBg.bringToFront();
    assert.equal(pageBg.calls.bringToFront, 1);

    // Character job must STILL resolve to pageChar
    const charJob = {
      id: "char-job-focus-test",
      targetType: "character",
      characterName: "Aria",
      googleFlowProjectId: "proj-1",
    };

    const targetPage = await worker.resolveJobPage(charJob);
    assert.equal(targetPage, pageChar);
    assert.notEqual(targetPage, pageBg);
    assert.equal(charJob.pageRole, FLOW_TAB_ROLES.CHARACTER);
  });

  await t.test("4. Character job never navigates or queries Background tab", async () => {
    const worker = new FlowBrowserWorker();
    const pageBg = createMockPage("https://flow.google.com/project/proj-1");
    const pageChar = createMockPage("https://flow.google.com/project/proj-1/character");

    worker.registerFlowPage(pageBg, { role: FLOW_TAB_ROLES.BACKGROUND, projectId: "proj-1" });
    worker.registerFlowPage(pageChar, { role: FLOW_TAB_ROLES.CHARACTER, projectId: "proj-1" });

    const charJob = {
      id: "char-job-isolation-test",
      targetType: "character",
      characterName: "Milo",
      googleFlowProjectId: "proj-1",
    };

    // Reset calls on background page
    pageBg.calls.goto = [];
    pageBg.calls.locator = [];
    pageBg.calls.evaluate = [];

    await worker.resolveJobPage(charJob);

    // Background tab must have received zero commands from this job
    assert.equal(pageBg.calls.goto.length, 0, "Background page goto was unexpectedly called");
    assert.equal(pageBg.calls.locator.length, 0, "Background page locator was unexpectedly queried");
    assert.equal(pageBg.calls.evaluate.length, 0, "Background page evaluate was unexpectedly executed");
  });

  await t.test("5. Role mismatch contradiction throws FLOW_JOB_ROLE_MISMATCH", async () => {
    const worker = new FlowBrowserWorker();
    const pageBg = createMockPage("https://flow.google.com/project/proj-1");
    worker.registerFlowPage(pageBg, { role: FLOW_TAB_ROLES.BACKGROUND });

    // Case A: getJobPageRole with contradictory targetType and pageRole
    assert.throws(
      () => {
        getJobPageRole({ targetType: "character", pageRole: "background" });
      },
      (err) => {
        assert.equal(err.code, "FLOW_JOB_ROLE_MISMATCH");
        return true;
      }
    );

    assert.throws(
      () => {
        getJobPageRole({ targetType: "background", pageRole: "character" });
      },
      (err) => {
        assert.equal(err.code, "FLOW_JOB_ROLE_MISMATCH");
        return true;
      }
    );

    // Case B: createJob rejects mismatch
    assert.throws(
      () => {
        worker.createJob({
          targetType: "character",
          pageRole: "background",
        });
      },
      (err) => {
        assert.equal(err.code, "FLOW_JOB_ROLE_MISMATCH");
        return true;
      }
    );

    // Case C: resolveJobPage with mismatched page metadata throws FLOW_JOB_ROLE_MISMATCH
    const mismatchJob = { id: "mismatch-job", targetType: "character", pageRole: "character" };
    // Force pagesByRole mapping error to verify safety check
    worker.pagesByRole.set(FLOW_TAB_ROLES.CHARACTER, pageBg); // pageBg has metadata role: "background"
    await assert.rejects(
      async () => {
        await worker.resolveJobPage(mismatchJob);
      },
      (err) => {
        assert.equal(err.code, "FLOW_JOB_ROLE_MISMATCH");
        assert.equal(err.details.expectedRole, "character");
        assert.equal(err.details.actualRole, "background");
        return true;
      }
    );
  });

  await t.test("6. Closed Character tab is safely recreated without falling back to Background", async () => {
    const worker = new FlowBrowserWorker();
    const pageBg = createMockPage("https://flow.google.com/project/proj-1");
    const pageChar = createMockPage("https://flow.google.com/project/proj-1/character");

    worker.context = createMockContext([pageBg, pageChar]);
    worker.registerFlowPage(pageBg, { role: FLOW_TAB_ROLES.BACKGROUND, projectId: "proj-1" });
    worker.registerFlowPage(pageChar, { role: FLOW_TAB_ROLES.CHARACTER, projectId: "proj-1" });

    // Close the character page
    await pageChar.close();
    assert.equal(pageChar.isClosed(), true);
    assert.equal(worker.getFlowPage(FLOW_TAB_ROLES.CHARACTER), null);

    const charJob = {
      id: "char-job-recreate",
      targetType: "character",
      characterId: "c99",
      googleFlowProjectId: "proj-1",
    };

    // Resolving should create a new tab in context, register it as character, and NOT use background tab
    const restoredPage = await worker.resolveJobPage(charJob);
    assert.ok(restoredPage);
    assert.notEqual(restoredPage, pageBg, "Must not fall back to background page");
    assert.notEqual(restoredPage, pageChar, "Must not return closed page");
    assert.equal(restoredPage.isClosed(), false);

    const meta = worker.getFlowPageMetadata(restoredPage);
    assert.equal(meta.role, FLOW_TAB_ROLES.CHARACTER);
    assert.equal(worker.getFlowPage(FLOW_TAB_ROLES.CHARACTER), restoredPage);
    assert.equal(worker.getFlowPage(FLOW_TAB_ROLES.BACKGROUND), pageBg);
  });

  await t.test("7. Project mismatch navigates Character tab while Background remains unchanged", async () => {
    const worker = new FlowBrowserWorker();
    const pageBg = createMockPage("https://flow.google.com/project/proj-A");
    const pageChar = createMockPage("https://flow.google.com/project/proj-A/character");

    worker.registerFlowPage(pageBg, { role: FLOW_TAB_ROLES.BACKGROUND, projectId: "proj-A" });
    worker.registerFlowPage(pageChar, { role: FLOW_TAB_ROLES.CHARACTER, projectId: "proj-A" });

    const charJob = {
      id: "char-job-proj-b",
      targetType: "character",
      characterId: "c-proj-b",
      googleFlowProjectId: "proj-B",
    };

    await worker.resolveJobPage(charJob);

    // Character page must have navigated to proj-B character route
    assert.equal(pageChar.url(), "https://flow.google.com/project/proj-B/character");
    assert.equal(pageChar.calls.goto.length, 1);
    assert.equal(
      pageChar.calls.goto[0].targetUrl,
      "https://flow.google.com/project/proj-B/character"
    );

    // Background page must NOT have navigated and remains on proj-A
    assert.equal(pageBg.url(), "https://flow.google.com/project/proj-A");
    assert.equal(pageBg.calls.goto.length, 0);
  });

  await t.test("8. Tab metadata restoration from sessionStorage keeps both roles distinct", async () => {
    const worker = new FlowBrowserWorker();
    const pageBg = createMockPage("https://flow.google.com/project/proj-1");
    const pageChar = createMockPage("https://flow.google.com/project/proj-1/character");

    // Pre-populate sessionStorage markers as if loaded from previous browser run
    pageBg.setSessionStorage(
      FLOW_TAB_METADATA_KEY,
      JSON.stringify({ tabId: "bg-tab-uuid", role: "background", projectId: "proj-1" })
    );

    pageChar.setSessionStorage(
      FLOW_TAB_METADATA_KEY,
      JSON.stringify({ tabId: "char-tab-uuid", role: "character", projectId: "proj-1" })
    );

    worker.context = createMockContext([pageBg, pageChar]);

    // Ensure both pages
    const recoveredBg = await worker.ensureFlowPage(FLOW_TAB_ROLES.BACKGROUND, "proj-1");
    const recoveredChar = await worker.ensureFlowPage(FLOW_TAB_ROLES.CHARACTER, "proj-1");

    assert.equal(recoveredBg, pageBg);
    assert.equal(recoveredChar, pageChar);

    const metaBg = worker.getFlowPageMetadata(recoveredBg);
    const metaChar = worker.getFlowPageMetadata(recoveredChar);

    assert.equal(metaBg.role, "background");
    assert.equal(metaBg.tabId, "bg-tab-uuid");
    assert.equal(metaChar.role, "character");
    assert.equal(metaChar.tabId, "char-tab-uuid");
  });

  await t.test("9. Per-role job lifecycle: Character cancellation does not cancel Background job", async () => {
    const worker = new FlowBrowserWorker();
    const pageBg = createMockPage("https://flow.google.com/project/proj-1");
    const pageChar = createMockPage("https://flow.google.com/project/proj-1/character");

    worker.registerFlowPage(pageBg, { role: FLOW_TAB_ROLES.BACKGROUND, projectId: "proj-1" });
    worker.registerFlowPage(pageChar, { role: FLOW_TAB_ROLES.CHARACTER, projectId: "proj-1" });

    // Create a background job and a character job
    const bgJob = worker.createJob({
      sceneId: "scene-101",
      targetType: "background",
      prompt: "A magical forest background",
      googleFlowProjectId: "proj-1",
    });
    bgJob.status = "generating";
    worker.setActiveJob(bgJob, FLOW_TAB_ROLES.BACKGROUND);

    const charJob = worker.createJob({
      characterId: "char-202",
      characterName: "Leo the Brave",
      targetType: "character",
      googleFlowProjectId: "proj-1",
    });
    charJob.status = "generating";
    worker.setActiveJob(charJob, FLOW_TAB_ROLES.CHARACTER);

    assert.equal(worker.getActiveJob(FLOW_TAB_ROLES.BACKGROUND).id, bgJob.id);
    assert.equal(worker.getActiveJob(FLOW_TAB_ROLES.CHARACTER).id, charJob.id);
    assert.equal(worker.activeJobId, bgJob.id);

    // Cancel ONLY the character job
    const cancelResult = worker.cancelActiveJob("Character redesign requested", FLOW_TAB_ROLES.CHARACTER);
    assert.equal(cancelResult.cancelled, true);
    assert.equal(cancelResult.role, "character");
    assert.equal(cancelResult.jobId, charJob.id);

    // Verify character job is cancelled and its role lock released
    assert.equal(charJob.status, "cancelled");
    assert.equal(worker.getActiveJob(FLOW_TAB_ROLES.CHARACTER), null);

    // Verify background job is STILL ACTIVE and unchanged
    assert.equal(bgJob.status, "generating");
    assert.equal(worker.getActiveJob(FLOW_TAB_ROLES.BACKGROUND).id, bgJob.id);
    assert.equal(worker.activeJobId, bgJob.id);

    // Cancel background job separately
    const cancelBgResult = worker.cancelActiveJob("Scene updated", FLOW_TAB_ROLES.BACKGROUND);
    assert.equal(cancelBgResult.cancelled, true);
    assert.equal(cancelBgResult.role, "background");
    assert.equal(cancelBgResult.jobId, bgJob.id);
    assert.equal(bgJob.status, "cancelled");
    assert.equal(worker.getActiveJob(FLOW_TAB_ROLES.BACKGROUND), null);
    assert.equal(worker.activeJobId, null);
  });
});
