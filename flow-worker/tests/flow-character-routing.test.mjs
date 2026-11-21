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
