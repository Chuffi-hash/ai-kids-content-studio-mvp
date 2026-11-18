import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  FlowBrowserWorker,
  isFlowUrl,
  isValidFlowDownloadSource,
} from "../src/flow-browser.mjs";
import { detectImageType } from "../src/image-validation.mjs";

function createMockPage({
  url = "https://labs.google/fx/tools/flow",
  isClosed = false,
  context = null,
} = {}) {
  return {
    url: () => url,
    isClosed: () => isClosed,
    context: () => context,
    on: () => {},
    mainFrame: () => ({}),
  };
}

function createMockDownload({
  filename = "character-left.png",
  page = null,
  content = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
} = {}) {
  return {
    suggestedFilename: () => filename,
    page: () => page,
    saveAs: async (destPath) => {
      await fs.writeFile(destPath, content);
    },
  };
}

test("isValidFlowDownloadSource rejects invalid, unrelated or closed pages", () => {
  const activePage = createMockPage({ url: "https://labs.google/fx/tools/flow" });
  const mockContext = {};
  activePage.context = () => mockContext;

  // 1. Null page
  assert.equal(isValidFlowDownloadSource(null, activePage, mockContext), false);

  // 2. Closed page
  const closedPage = createMockPage({ url: "https://labs.google/fx/tools/flow", isClosed: true });
  assert.equal(isValidFlowDownloadSource(closedPage, activePage, mockContext), false);

  // 3. Unrelated URL page
  const unrelatedUrlPage = createMockPage({ url: "https://example.com/image.png" });
  assert.equal(isValidFlowDownloadSource(unrelatedUrlPage, activePage, mockContext), false);

  // 4. Unrelated Google tab (e.g. Google Search / Gmail)
  const googleSearchPage = createMockPage({ url: "https://google.com/search" });
  assert.equal(isValidFlowDownloadSource(googleSearchPage, activePage, mockContext), false);

  // 5. Different tab from active Flow page
  const anotherFlowTab = createMockPage({ url: "https://flow.google.com/project/1" });
  assert.equal(isValidFlowDownloadSource(anotherFlowTab, activePage, mockContext), false);

  // 6. Valid active Flow page on labs.google
  assert.equal(isValidFlowDownloadSource(activePage, activePage, mockContext), true);

  // 7. Valid active Flow page on flow.google.com
  const activeFlow2 = createMockPage({ url: "https://flow.google.com/project/2" });
  activeFlow2.context = () => mockContext;
  assert.equal(isValidFlowDownloadSource(activeFlow2, activeFlow2, mockContext), true);
});

test("handleDownload ignores downloads from unrelated tabs without affecting active job", async () => {
  const worker = new FlowBrowserWorker();
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), "flow-test-"));
  worker.downloadDir = testDir;

  const activePage = createMockPage({ url: "https://labs.google/fx/tools/flow" });
  worker.page = activePage;

  const job = worker.createJob({
    characterId: "char-123",
    characterName: "Sammy",
    view: "left",
  });
  job.status = "awaiting_download";
  worker.activeJobId = job.id;

  const unrelatedPage = createMockPage({ url: "https://example.com/gallery" });
  let saveAsCalled = false;
  const mockDownload = {
    suggestedFilename: () => "unrelated.png",
    page: () => unrelatedPage,
    saveAs: async () => {
      saveAsCalled = true;
    },
  };

  await worker.handleDownload(mockDownload, unrelatedPage);

  // Download was ignored
  assert.equal(saveAsCalled, false, "Download from unrelated tab must not be saved");
  assert.equal(job.status, "awaiting_download", "Job status must remain awaiting_download");
  assert.equal(job.importResult, undefined);

  // Cleanup
  await fs.rm(testDir, { recursive: true, force: true });
});

test("Download validation recognizes PNG, JPEG, WebP and rejects invalid types", async () => {
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const webpHeader = Buffer.from("RIFF1234WEBPVP8 ");
  const textFile = Buffer.from("<!DOCTYPE html><html><body>Not an image</body></html>");

  assert.equal(detectImageType(pngHeader)?.mimeType, "image/png");
  assert.equal(detectImageType(jpegHeader)?.mimeType, "image/jpeg");
  assert.equal(detectImageType(webpHeader)?.mimeType, "image/webp");
  assert.equal(detectImageType(textFile), null);
});

test("handleDownload rejects oversized downloads exceeding 25MB and cleans up temporary file", async () => {
  const worker = new FlowBrowserWorker();
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), "flow-test-oversized-"));
  worker.downloadDir = testDir;

  const activePage = createMockPage({ url: "https://labs.google/fx/tools/flow" });
  worker.page = activePage;

  const job = worker.createJob({
    characterId: "char-oversized",
    characterName: "Pip",
    view: "front",
  });
  job.status = "awaiting_download";
  worker.activeJobId = job.id;

  // Mock download that writes 26 MB
  const mockDownload = {
    suggestedFilename: () => "giant.png",
    page: () => activePage,
    saveAs: async (targetPath) => {
      // Create a sparse buffer or write 25MB + 1KB
      const chunk = Buffer.alloc(1024 * 1024, 0x00);
      const handle = await fs.open(targetPath, "w");
      for (let i = 0; i < 26; i++) {
        await handle.write(chunk);
      }
      await handle.close();
    },
  };

  await worker.handleDownload(mockDownload, activePage);

  assert.equal(job.status, "failed");
  assert.match(job.error, /exceeds the 25 MB worker safety limit/);

  // Verify temporary file was deleted
  const files = await fs.readdir(testDir);
  assert.equal(files.length, 0, "Temporary oversized file must be removed");

  await fs.rm(testDir, { recursive: true, force: true });
});

test("Metadata registration network failure preserves importResult and sets import_metadata_failed", async () => {
  const worker = new FlowBrowserWorker();
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), "flow-test-meta-fail-"));
  worker.downloadDir = testDir;

  const activePage = createMockPage({ url: "https://labs.google/fx/tools/flow" });
  worker.page = activePage;

  const job = worker.createJob({
    characterId: "char-meta-fail",
    characterName: "Sammy",
    view: "right",
  });
  job.status = "awaiting_download";
  worker.activeJobId = job.id;

  const pngData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x11, 0x22]);
  const mockDownload = createMockDownload({
    filename: "sammy-right.png",
    page: activePage,
    content: pngData,
  });

  // Mock fetch: /import-flow succeeds, but /assets throws network error
  const originalFetch = globalThis.fetch;
  let importFlowCalled = false;
  let assetsEndpointCalled = false;

  globalThis.fetch = async (url, options) => {
    const urlStr = String(url);
    if (urlStr.includes("/import-flow")) {
      importFlowCalled = true;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          result: {
            assetId: "asset-flow-test-123",
            url: "/storage/characters/char-meta-fail/flow-right.png",
            storagePath: "characters/char-meta-fail/flow-right.png",
          },
        }),
      };
    }
    if (urlStr.includes("/assets")) {
      assetsEndpointCalled = true;
      throw new TypeError("fetch failed: ECONNREFUSED 127.0.0.1:5001");
    }
    return { ok: false, status: 500 };
  };

  try {
    await worker.handleDownload(mockDownload, activePage);

    assert.equal(importFlowCalled, true, "File upload must succeed");
    assert.equal(assetsEndpointCalled, true, "Metadata registration must be attempted");
    assert.ok(job.importResult, "job.importResult must be retained");
    assert.equal(job.importResult.assetId, "asset-flow-test-123");
    assert.equal(job.status, "import_metadata_failed", "Job status must be import_metadata_failed");
    assert.match(job.error, /metadata registration network request failed/);
    assert.match(job.message, /Retry metadata registration instead of downloading the image again/);
  } finally {
    globalThis.fetch = originalFetch;
    await fs.rm(testDir, { recursive: true, force: true });
  }
});

test("Metadata retry succeeds without re-uploading file and is idempotent", async () => {
  const worker = new FlowBrowserWorker();
  const job = worker.createJob({
    characterId: "char-retry",
    characterName: "Sammy",
    view: "left",
  });
  job.status = "import_metadata_failed";
  job.importResult = {
    assetId: "asset-fixed-id-456",
    url: "/storage/characters/char-retry/flow-left.png",
    storagePath: "characters/char-retry/flow-left.png",
  };

  const originalFetch = globalThis.fetch;
  let importFlowCallCount = 0;
  let assetsCallCount = 0;
  let registeredAssetId = null;

  globalThis.fetch = async (url, options) => {
    const urlStr = String(url);
    if (urlStr.includes("/import-flow")) {
      importFlowCallCount++;
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    }
    if (urlStr.includes("/assets")) {
      assetsCallCount++;
      const body = JSON.parse(options.body);
      registeredAssetId = body.id;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          asset: {
            id: body.id,
            url: body.url,
            direction: body.direction,
          },
        }),
      };
    }
    return { ok: false, status: 404 };
  };

  try {
    // 1. Retry metadata import
    const resultJob = await worker.retryMetadataImport(job.id);

    assert.equal(importFlowCallCount, 0, "Retry must NOT re-upload the image");
    assert.equal(assetsCallCount, 1, "Metadata registration must be called once");
    assert.equal(registeredAssetId, "asset-fixed-id-456", "Must register using the original assetId");
    assert.equal(resultJob.status, "completed");
    assert.equal(resultJob.asset.id, "asset-fixed-id-456");

    // 2. Duplicate retry on completed job (idempotent)
    const duplicateJob = await worker.retryMetadataImport(job.id);
    assert.equal(importFlowCallCount, 0, "Duplicate retry must NOT re-upload");
    assert.equal(assetsCallCount, 2, "Second call re-registers metadata idempotently");
    assert.equal(duplicateJob.status, "completed");
    assert.equal(duplicateJob.asset.id, "asset-fixed-id-456");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("findPromptEditor safety: never accepts zero-score field, rejects ambiguous fields, respects FLOW_PROMPT_SELECTOR", async () => {
  const worker = new FlowBrowserWorker();

  // Case 1a: Filtered unrelated inputs (e.g. search / filter)
  const searchCandidate = {
    isVisible: async () => true,
    isEnabled: async () => true,
    getAttribute: async (attr) => (attr === "placeholder" ? "Search existing characters" : ""),
  };
  worker.page = {
    isClosed: () => false,
    locator: (selector) => {
      if (selector.includes("textarea")) {
        return {
          count: async () => 1,
          nth: () => searchCandidate,
        };
      }
      return { count: async () => 0 };
    },
  };

  await assert.rejects(
    async () => worker.findPromptEditor(),
    /No visible textarea or contenteditable textbox was found/
  );

  // Case 1b: Candidate with zero score (generic text box with no prompt keywords)
  const zeroScoreCandidate = {
    isVisible: async () => true,
    isEnabled: async () => true,
    getAttribute: async (attr) => (attr === "placeholder" ? "Random text notes" : ""),
  };
  worker.page = {
    isClosed: () => false,
    locator: (selector) => {
      if (selector.includes("textarea")) {
        return {
          count: async () => 1,
          nth: () => zeroScoreCandidate,
        };
      }
      return { count: async () => 0 };
    },
  };

  await assert.rejects(
    async () => worker.findPromptEditor(),
    /No confident prompt editor candidate was found/
  );

  // Case 2: Ambiguous candidates with identical positive scores
  const candidateA = {
    isVisible: async () => true,
    isEnabled: async () => true,
    getAttribute: async (attr) => (attr === "placeholder" ? "Enter your prompt here" : ""),
  };
  const candidateB = {
    isVisible: async () => true,
    isEnabled: async () => true,
    getAttribute: async (attr) => (attr === "aria-label" ? "Describe prompt scene" : ""),
  };
  worker.page = {
    isClosed: () => false,
    locator: () => ({
      count: async () => 2,
      nth: (i) => (i === 0 ? candidateA : candidateB),
    }),
  };

  await assert.rejects(
    async () => worker.findPromptEditor(),
    /Multiple prompt-like fields are visible with ambiguous scores/
  );

  // Case 3: Confident single candidate with prompt label
  const promptCandidate = {
    isVisible: async () => true,
    isEnabled: async () => true,
    getAttribute: async (attr) => (attr === "placeholder" ? "Describe the image you want to generate" : ""),
  };
  worker.page = {
    isClosed: () => false,
    locator: () => ({
      count: async () => 1,
      nth: () => promptCandidate,
    }),
  };

  const detected = await worker.findPromptEditor();
  assert.ok(detected.score > 0, "Detected prompt editor must have score > 0");

  // Case 4: FLOW_PROMPT_SELECTOR configured but not matching exactly 1 visible and enabled field
  worker.promptSelector = "#custom-prompt-input";

  // Case 4a: Count is 2
  worker.page = {
    isClosed: () => false,
    locator: () => ({
      count: async () => 2,
      isVisible: async () => true,
      isEnabled: async () => true,
    }),
  };
  await assert.rejects(
    async () => worker.findPromptEditor(),
    /FLOW_PROMPT_SELECTOR must identify exactly one visible and enabled prompt editor; found 2/
  );

  // Case 4b: Element is disabled
  worker.page = {
    isClosed: () => false,
    locator: () => ({
      count: async () => 1,
      isVisible: async () => true,
      isEnabled: async () => false,
    }),
  };
  await assert.rejects(
    async () => worker.findPromptEditor(),
    /FLOW_PROMPT_SELECTOR must identify exactly one visible and enabled prompt editor/
  );

  // Case 4c: Element is visible and enabled
  worker.page = {
    isClosed: () => false,
    locator: () => ({
      count: async () => 1,
      isVisible: async () => true,
      isEnabled: async () => true,
    }),
  };
  const configuredResult = await worker.findPromptEditor();
  assert.equal(configuredResult.selector, "#custom-prompt-input");
});

test("Cancellation and cleanup transitions", async () => {
  const worker = new FlowBrowserWorker();
  const job = worker.createJob({
    characterId: "char-cancel",
    characterName: "Sammy",
    view: "front",
  });
  worker.activeJobId = job.id;

  assert.equal(worker.activeJobId, job.id);
  const cancelled = await worker.cancelJob(job.id);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(worker.activeJobId, null, "Cancelling active job must clear activeJobId");
});
