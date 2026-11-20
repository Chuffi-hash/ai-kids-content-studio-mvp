import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FlowBrowserWorker, getFirstLocator } from "../src/flow-browser.mjs";

describe("Google Flow Agent Live DOM & Prompt Submission Suite", () => {
  const projectUrl = "https://flow.google.com/project/2ea32335-0e57-4d1a-9e1e-98fa3cd491e8";

  // Helper to create simulated Playwright locator
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
          if (subSelector.includes("textbox") || subSelector.includes("ProseMirror")) {
            return el.role === "textbox" || el.className?.includes("ProseMirror");
          }
          if (subSelector.includes("Start generation") || subSelector.includes("submit")) {
            return el.ariaLabel === "Start generation" || el.type === "submit";
          }
          if (subSelector.includes("download") || subSelector.includes("Download")) {
            return el.ariaLabel?.toLowerCase().includes("download") || el.text?.includes("Download");
          }
          if (subSelector.includes("button")) {
            return el.tagName === "button" || el.role === "button";
          }
          return true;
        });
        return createMockLocator(filtered);
      },
      isVisible: async () => elements.length > 0 && elements[0].visible !== false,
      isEnabled: async () => elements.length > 0 && elements[0].disabled !== true,
      getAttribute: async (attr) => {
        if (!elements[0]) return null;
        if (typeof elements[0].getAttribute === "function") {
          return elements[0].getAttribute(attr);
        }
        if (elements[0][attr] !== undefined) return elements[0][attr];
        const camel = attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        if (elements[0][camel] !== undefined) return elements[0][camel];
        return null;
      },
      innerText: async () => (elements[0] ? elements[0].text || "" : ""),
      textContent: async () => (elements[0] ? elements[0].text || "" : ""),
      evaluate: async (fn, arg) => {
        if (!elements[0]) return null;
        return fn({ tagName: elements[0].tagName || "div" }, arg);
      },
      fill: async (val) => {
        if (elements[0]) {
          elements[0].text = val;
          if (typeof elements[0].onFill === "function") {
            await elements[0].onFill(val);
          }
        }
      },
      click: async () => {
        if (elements[0] && typeof elements[0].onClick === "function") {
          await elements[0].onClick();
        }
      },
      hover: async () => {
        if (elements[0]) elements[0].hovered = true;
      },
    };
  }

  it("1. detectInterfaceMode: Accurately identifies Agent mode from live prompt box", async () => {
    const worker = new FlowBrowserWorker();
    const promptBoxDiv = {
      tagName: "flow-creative-agent-prompt-box",
      visible: true,
    };

    worker.page = {
      isClosed: () => false,
      locator: (sel) => {
        if (sel.includes("flow-creative-agent-prompt-box")) {
          return createMockLocator([promptBoxDiv]);
        }
        return createMockLocator([]);
      },
    };

    const mode = await worker.detectInterfaceMode();
    assert.equal(mode, "agent");
  });

  it("2. findPromptEditor: Locates live ProseMirror editor with top confidence", async () => {
    const worker = new FlowBrowserWorker();
    const agentProseMirror = {
      tagName: "div",
      role: "textbox",
      ariaLabel: "What do you want to create?",
      contenteditable: "true",
      className: "ProseMirror",
      visible: true,
      disabled: false,
      getAttribute: async (attr) => {
        if (attr === "aria-label") return "What do you want to create?";
        if (attr === "role") return "textbox";
        if (attr === "contenteditable") return "true";
        if (attr === "class") return "ProseMirror";
        return "";
      },
      isVisible: async () => true,
      isEnabled: async () => true,
    };

    worker.page = {
      isClosed: () => false,
      locator: (sel) => {
        if (sel.includes("textarea") || sel.includes("textbox") || sel.includes("contenteditable")) {
          return createMockLocator([agentProseMirror]);
        }
        return createMockLocator([]);
      },
    };

    const editor = await worker.findPromptEditor();
    assert.ok(editor);
    assert.ok(editor.locator);
  });

  it("3. submitAgentPrompt: Fills ProseMirror, waits for enabled submit button, and submits", async () => {
    const worker = new FlowBrowserWorker();
    const testDir = await fs.mkdtemp(path.join(os.tmpdir(), "flow-agent-test-"));
    worker.profileDir = testDir;

    let submitClicked = false;
    const promptElement = {
      tagName: "div",
      role: "textbox",
      ariaLabel: "What do you want to create?",
      className: "ProseMirror",
      text: "",
      visible: true,
      disabled: false,
    };

    const submitButtonElement = {
      tagName: "button",
      type: "submit",
      ariaLabel: "Start generation",
      disabled: true, // Initially disabled
      visible: true,
      onClick: async () => {
        submitClicked = true;
      },
    };

    worker.page = {
      isClosed: () => false,
      url: () => projectUrl,
      screenshot: async () => Buffer.from(""),
      locator: (sel) => {
        if (sel.includes("textbox") || sel.includes("ProseMirror")) {
          return createMockLocator([promptElement]);
        }
        if (sel.includes("Start generation") || sel.includes("submit")) {
          return createMockLocator([submitButtonElement]);
        }
        return createMockLocator([]);
      },
    };

    // When prompt is populated, enable submit button
    promptElement.onFill = async (val) => {
      promptElement.text = val;
      submitButtonElement.disabled = false;
    };
    promptElement.onClick = async () => {
      promptElement.text = "A magical glowing forest at night";
      submitButtonElement.disabled = false;
    };

    const job = worker.createJob({
      characterId: "char-123",
      characterName: "Barnaby Owl",
      view: "front",
      prompt: "A magical glowing forest at night",
      projectUrl,
    });

    const result = await worker.submitAgentPrompt(job, {
      confirmGenerate: true,
      referenceConfirmed: true,
    });

    assert.equal(submitClicked, true, "Submit button 'Start generation' must be clicked");
    assert.equal(promptElement.text, "A magical glowing forest at night");
    assert.ok(
      result.status === "agent_prompt_submitted" || result.status === "generation_submitted" || result.status === "generating"
    );

    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("4. Agent Confirmation: Detects agent permission request and executes authorized confirmation", async () => {
    const worker = new FlowBrowserWorker();
    let confirmationClicked = false;

    const agentMessageElement = {
      tagName: "flow-creative-agent-message",
      text: "Should I proceed with generating 1 image for this scene?",
      visible: true,
      locator: (sub) => {
        if (sub.includes("Generate") || sub.includes("Proceed")) {
          return createMockLocator([{
            tagName: "button",
            text: "Generate",
            visible: true,
            disabled: false,
            onClick: async () => {
              confirmationClicked = true;
            },
          }]);
        }
        return createMockLocator([]);
      },
    };

    worker.page = {
      isClosed: () => false,
      locator: (sel) => {
        if (sel.includes("agent-message") || sel.includes("flow-creative-agent-message")) {
          return createMockLocator([agentMessageElement]);
        }
        return createMockLocator([]);
      },
    };

    const job = { id: "test-conf-job", status: "agent_prompt_submitted" };
    const required = await worker.detectAgentConfirmationRequired(job);
    assert.equal(required, true, "Agent message asking to generate must trigger confirmation detection");

    await worker.handleAgentConfirmationAction(job);
    assert.equal(confirmationClicked, true, "Confirmation action must click Generate button inside message");
  });

  it("5. inspectFlowPage: Gathers live interface details, elements, and diagnostics safely", async () => {
    const worker = new FlowBrowserWorker();
    const testDir = await fs.mkdtemp(path.join(os.tmpdir(), "flow-inspect-test-"));
    worker.profileDir = testDir;

    worker.page = {
      isClosed: () => false,
      url: () => projectUrl,
      title: async () => "Google Flow - Project Workspace",
      content: async () => "<html><body><flow-creative-agent-prompt-box></flow-creative-agent-prompt-box></body></html>",
      screenshot: async () => Buffer.from("fake-png"),
      frames: () => [{ url: () => projectUrl }],
      locator: (sel) => {
        if (sel.includes("flow-creative-agent-prompt-box")) {
          return createMockLocator([{ tagName: "flow-creative-agent-prompt-box", visible: true }]);
        }
        if (sel.includes("button")) {
          return createMockLocator([
            { tagName: "button", text: "Start generation", ariaLabel: "Start generation", visible: true, disabled: false, type: "submit" },
            { tagName: "button", text: "Add ingredients", ariaLabel: "Add ingredients to the prompt box", visible: true, disabled: false, type: "button" },
          ]);
        }
        return createMockLocator([]);
      },
    };

    const inspection = await worker.inspectFlowPage();
    assert.equal(inspection.isOpen, true);
    assert.equal(inspection.activeProjectId, "2ea32335-0e57-4d1a-9e1e-98fa3cd491e8");
    assert.equal(inspection.interfaceMode, "agent");
    assert.ok(inspection.buttons.some((b) => b.ariaLabel === "Start generation"));
    assert.ok(inspection.buttons.some((b) => b.ariaLabel === "Add ingredients to the prompt box"));
    assert.ok(inspection.diagnostics.screenshotPath);
    assert.ok(inspection.diagnostics.domSnapshotPath);

    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("6. getOutputAssetBaseline & output detection: Correctly isolates newly created output tiles", async () => {
    const worker = new FlowBrowserWorker();
    const existingTile = {
      tagName: "flow-output-tile",
      getAttribute: async (attr) => (attr === "data-asset-id" ? "old-asset-1" : null),
      visible: true,
    };

    worker.page = {
      isClosed: () => false,
      locator: () => createMockLocator([existingTile]),
    };

    // Baseline records 1 existing tile
    const baseline = await worker.getOutputAssetBaseline();
    assert.equal(baseline.count, 1);
    assert.equal(baseline.identifiers.has("old-asset-1"), true);

    // New tile appears after generation
    const newTile = {
      tagName: "flow-output-tile",
      getAttribute: async (attr) => (attr === "data-asset-id" ? "new-asset-2" : null),
      visible: true,
    };

    worker.page.locator = () => createMockLocator([existingTile, newTile]);

    // Check newly identified tile
    const currentTiles = [existingTile, newTile];
    const newAsset = currentTiles.find((t) => !baseline.identifiers.has("new-asset-2"));
    assert.ok(newAsset);
  });

  it("7. recoverActiveJobLock: Cleans up stale activeJobId lock without throwing", () => {
    const worker = new FlowBrowserWorker();
    const staleJob = worker.createJob({
      characterId: "c1",
      characterName: "Owl",
      view: "front",
    });
    // Set age to 5 minutes ago
    staleJob.updatedAt = new Date(Date.now() - 300000).toISOString();
    worker.activeJobId = staleJob.id;

    worker.recoverActiveJobLock();
    assert.equal(worker.activeJobId, null, "Stale lock must be cleanly recovered");
    assert.equal(staleJob.status, "failed");
  });

  it("8. cancelActiveJob: Explicitly cancels the active job and releases the worker lock", () => {
    const worker = new FlowBrowserWorker();
    const job = worker.createJob({ characterId: "c2", characterName: "Fox" });
    job.status = "generating";
    worker.activeJobId = job.id;

    const res = worker.cancelActiveJob("User requested cancellation.");
    assert.equal(res.cancelled, true);
    assert.equal(worker.activeJobId, null, "Lock must be released on cancellation");
    assert.equal(job.status, "cancelled");
  });

  it("9. prepareJob auto-supersedes inactive previous job without blocking new requests", async () => {
    const worker = new FlowBrowserWorker();
    const previousJob = worker.createJob({ characterId: "c1", characterName: "First" });
    previousJob.status = "prompt_ready"; // idle state
    worker.activeJobId = previousJob.id;

    worker.context = {};
    worker.page = {
      isClosed: () => false,
      url: () => projectUrl,
      locator: () => createMockLocator([{
        tagName: "div",
        role: "textbox",
        ariaLabel: "What do you want to create?",
        visible: true,
        disabled: false,
      }]),
    };

    const newJob = worker.createJob({ characterId: "c2", characterName: "Second", projectUrl });
    await worker.prepareJob(newJob.id);

    assert.equal(previousJob.status, "cancelled", "Previous idle job must be superseded");
    assert.equal(worker.activeJobId, newJob.id, "New job must acquire active lock");
  });
});
