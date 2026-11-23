import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FlowBrowserWorker } from "../src/flow-browser.mjs";

function createMockLocator(elements = []) {
  return {
    count: async () => elements.length,
    nth: (index) => (elements[index] ? createMockLocator([elements[index]]) : createMockLocator([])),
    first: () => (elements[0] ? createMockLocator([elements[0]]) : createMockLocator([])),
    last: () => (elements.length > 0 ? createMockLocator([elements[elements.length - 1]]) : createMockLocator([])),
    locator: (subSelector) => {
      if (elements[0] && typeof elements[0].locator === "function") {
        return elements[0].locator(subSelector);
      }
      const filtered = elements.filter((el) => {
        if (subSelector.includes("img")) return el.tagName === "img" || el.className?.includes("image-thumbnail");
        if (subSelector.includes("button")) return el.tagName === "button" || el.role === "button";
        return true;
      });
      return createMockLocator(filtered);
    },
    isVisible: async () => elements.length > 0 && elements[0].visible !== false,
    isEnabled: async () => elements.length > 0 && elements[0].disabled !== true,
    getAttribute: async (attr) => (elements[0] ? elements[0][attr] || null : null),
    innerText: async () => (elements[0] ? elements[0].text || "" : ""),
    textContent: async () => (elements[0] ? elements[0].text || "" : ""),
    evaluate: async (fn) => (elements[0] ? fn({ naturalWidth: elements[0].naturalWidth || 1024, naturalHeight: elements[0].naturalHeight || 576, alt: elements[0].alt || "" }) : null),
    click: async () => {
      if (elements[0] && typeof elements[0].onClick === "function") await elements[0].onClick();
    },
    fill: async (val) => {
      if (elements[0]) elements[0].text = val;
    },
  };
}

describe("Flow Worker Verified Fixes Test Suite", () => {
  it("1. startImageResponseCapture: Captures Flow /asb/ WebP response and preserves exact URL with =s1600-rw", async () => {
    const worker = new FlowBrowserWorker();
    let responseHandler = null;
    worker.page = {
      isClosed: () => false,
      on: (evt, handler) => {
        if (evt === "response") responseHandler = handler;
      },
      off: (evt, handler) => {
        if (evt === "response") responseHandler = null;
      },
    };

    const job = worker.createJob({
      targetType: "background",
      prompt: "A beautiful meadow",
      sceneId: "scene-1",
      storyId: "story-1",
    });

    await worker.startImageResponseCapture(job);
    assert.ok(typeof responseHandler === "function", "Response listener must be registered");

    const sampleWebp = Buffer.alloc(1000, 0xaa);
    const validUrl = "https://flow.google.com/asb/test-image-uuid-123=s1600-rw";

    responseHandler({
      url: () => validUrl,
      status: () => 200,
      headers: () => ({ "content-type": "image/webp" }),
      request: () => ({ resourceType: () => "image" }),
      body: async () => sampleWebp,
    });

    await Promise.all(job.pendingImageCaptures);

    assert.equal(job.capturedImageResponses.size, 1);
    assert.ok(job.capturedImageResponses.has(validUrl), "Must preserve exact URL with transformation suffix");
    const captured = job.capturedImageResponses.get(validUrl);
    assert.equal(captured.mimeType, "image/webp");
    assert.equal(captured.buffer.length, 1000);
  });

  it("2. startImageResponseCapture: Strictly rejects unrelated third-party origins, non-asb paths, and non-image types", async () => {
    const worker = new FlowBrowserWorker();
    let responseHandler = null;
    worker.page = {
      isClosed: () => false,
      on: (evt, handler) => {
        if (evt === "response") responseHandler = handler;
      },
      off: () => {},
    };

    const job = worker.createJob({
      targetType: "background",
      prompt: "A castle",
      sceneId: "scene-2",
      storyId: "story-1",
    });

    await worker.startImageResponseCapture(job);

    // Third party origin
    responseHandler({
      url: () => "https://thirdparty.com/asb/image.png",
      status: () => 200,
      headers: () => ({ "content-type": "image/png" }),
      request: () => ({ resourceType: () => "image" }),
      body: async () => Buffer.alloc(1000),
    });

    // Non /asb/ path
    responseHandler({
      url: () => "https://flow.google.com/static/logo.svg",
      status: () => 200,
      headers: () => ({ "content-type": "image/svg+xml" }),
      request: () => ({ resourceType: () => "image" }),
      body: async () => Buffer.alloc(1000),
    });

    // Non 200 status
    responseHandler({
      url: () => "https://flow.google.com/asb/error.png",
      status: () => 404,
      headers: () => ({ "content-type": "image/png" }),
      request: () => ({ resourceType: () => "image" }),
      body: async () => Buffer.alloc(1000),
    });

    await Promise.all(job.pendingImageCaptures);
    assert.equal(job.capturedImageResponses.size, 0, "No invalid responses must be stored");
  });

  it("3. findCapturedOutput: Exactly correlates matching sourceUrl and rejects arbitrary latest-image fallback", () => {
    const worker = new FlowBrowserWorker();
    const map = new Map();
    const urlA = "https://flow.google.com/asb/image-A=s1600-rw";
    const urlB = "https://flow.google.com/asb/image-B=s1600-rw";

    map.set(urlA, { buffer: Buffer.alloc(1000), mimeType: "image/webp", url: urlA });
    map.set(urlB, { buffer: Buffer.alloc(1200), mimeType: "image/webp", url: urlB });

    // Requesting output for image A
    const outputA = { sourceUrl: urlA, rawSrc: urlA };
    const matchA = worker.findCapturedOutput(outputA, map);
    assert.ok(matchA);
    assert.equal(matchA.url, urlA);
    assert.equal(matchA.buffer.length, 1000);

    // Requesting output for unknown image C
    const outputC = { sourceUrl: "https://flow.google.com/asb/image-C=s1600-rw", rawSrc: "image-C" };
    const matchC = worker.findCapturedOutput(outputC, map);
    assert.equal(matchC, null, "Must return null on unmatched URL; never fall back to latest image B");
  });

  it("4. configureOutputCount: Enforces exactly 1 output", async () => {
    const worker = new FlowBrowserWorker();
    worker.page = { isClosed: () => false, locator: () => createMockLocator([]) };

    await assert.rejects(
      async () => worker.configureOutputCount(2),
      /This workflow currently supports one output only/
    );

    await assert.doesNotReject(async () => worker.configureOutputCount(1));
  });

  it("5. monitorGenerationAndDownload: Throws OUTPUT_COUNT_MISMATCH when multiple outputs are generated", async () => {
    const worker = new FlowBrowserWorker();
    const testDir = await fs.mkdtemp(path.join(os.tmpdir(), "flow-test-count-"));
    worker.profileDir = testDir;

    const job = worker.createJob({
      targetType: "background",
      prompt: "Dual output test",
      sceneId: "scene-3",
      storyId: "story-1",
    });

    const opt1 = {
      tagName: "flow-a2ui-image-option",
      visible: true,
      locator: () => createMockLocator([{ tagName: "img", className: "image-thumbnail", src: "https://flow.google.com/asb/img-1=s1600-rw" }]),
    };
    const opt2 = {
      tagName: "flow-a2ui-image-option",
      visible: true,
      locator: () => createMockLocator([{ tagName: "img", className: "image-thumbnail", src: "https://flow.google.com/asb/img-2=s1600-rw" }]),
    };

    worker.page = {
      isClosed: () => false,
      url: () => "https://flow.google.com/project/test-project",
      locator: (sel) => {
        if (sel.includes("flow-a2ui-image-option")) return createMockLocator([opt1, opt2]);
        return createMockLocator([]);
      },
    };

    await assert.rejects(
      async () => worker.monitorGenerationAndDownload(job.id, { count: 0, identifiers: new Set() }),
      (err) => {
        assert.match(err.message, /OUTPUT_COUNT_MISMATCH/);
        return true;
      }
    );

    assert.equal(job.status, "failed");
    assert.match(job.error, /OUTPUT_COUNT_MISMATCH/);
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("6. inspectAgentConfirmation: Correctly detects confirmation buttons inside Agent message", async () => {
    const worker = new FlowBrowserWorker();

    const generateBtn = {
      tagName: "button",
      text: "Generate",
      visible: true,
      disabled: false,
    };

    const agentMsg = {
      tagName: "flow-creative-agent-message",
      locator: (sel) => {
        if (sel.includes("Generate")) return createMockLocator([generateBtn]);
        return createMockLocator([]);
      },
    };

    worker.page = {
      isClosed: () => false,
      locator: (sel) => {
        if (sel.includes("agent-message") || sel.includes("flow-creative-agent-message")) {
          return createMockLocator([agentMsg]);
        }
        return createMockLocator([]);
      },
    };

    const info = await worker.inspectAgentConfirmation({ id: "job-conf" });
    assert.equal(info.required, true);
    assert.equal(info.actionAvailable, true);
  });
});


  it("19. Background and Character tabs download/import independently at the same time", async () => {
    const worker = new FlowBrowserWorker();
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flow-dual-tab-download-"));
    worker.downloadDir = tempDir;

    const backgroundPage = {
      url: () => "https://flow.google.com/project/project-1",
      isClosed: () => false,
    };
    const characterPage = {
      url: () => "https://flow.google.com/project/project-1/character/character-1",
      isClosed: () => false,
    };

    worker.context = { pages: () => [backgroundPage, characterPage] };
    worker.registerFlowPage(backgroundPage, { role: "background", projectId: "project-1" });
    worker.registerFlowPage(characterPage, { role: "character", projectId: "project-1" });

    const backgroundJob = worker.createJob({
      targetType: "background",
      sceneId: "scene-dual-tab",
      storyId: "story-dual-tab",
      prompt: "A bright forest clearing",
    });
    const characterJob = worker.createJob({
      targetType: "character",
      characterId: "character-1",
      characterName: "Pip",
      view: "front",
      prompt: "Pip, front view",
    });
    backgroundJob.status = "generation_submitted";
    characterJob.status = "generation_submitted";
    worker.setActiveJob(backgroundJob, "background");
    worker.setActiveJob(characterJob, "character");

    const importedJobIds = [];
    worker.importDownloadedAsset = async (job) => {
      importedJobIds.push(job.id);
      job.status = "completed";
    };

    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAALUlEQVRYR+3QQREAAAzCQPr39g4fXgYk0L2Sqm8cAAAAAAAAAAAAAAAAAAB+1gO4/AH4rE2gOAAAAABJRU5ErkJggg==",
      "base64",
    );
    const makeDownload = (name) => ({
      suggestedFilename: () => name,
      saveAs: async (targetPath) => fs.writeFile(targetPath, png),
    });

    try {
      await Promise.all([
        worker.handleDownload(makeDownload("background.png"), backgroundPage),
        worker.handleDownload(makeDownload("character.png"), characterPage),
      ]);

      assert.deepEqual(new Set(importedJobIds), new Set([backgroundJob.id, characterJob.id]));
      assert.equal(backgroundJob.status, "completed");
      assert.equal(characterJob.status, "completed");
      assert.equal(worker.getActiveJob("background"), null);
      assert.equal(worker.getActiveJob("character"), null);
      assert.equal(worker.downloadInProgress, false);
      assert.equal(worker.getFlowPage("background"), backgroundPage);
      assert.equal(worker.getFlowPage("character"), characterPage);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
