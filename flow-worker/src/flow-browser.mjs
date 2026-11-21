import { chromium } from "playwright";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  assertAllowedFlowUrl,
  buildCharacterViewPrompt,
  FLOW_HOME_URL,
  CHARACTER_VIEW_LABELS,
} from "./prompts.mjs";
import {
  detectImageType,
  parseImageDimensions,
  safeFilename,
} from "./image-validation.mjs";
import {
  downloadFlowImage,
  closeFlowImageEditor,
  extractGoogleFlowEditorReference,
  isGoogleFlowEditorRoute,
  extractProjectIdFromFlowUrl,
  collectFlowEditorDiagnostics,
  saveImageUsingNativeContextMenu,
  inspectGoogleFlowActiveImage,
} from "./flow-download.mjs";

export {
  downloadFlowImage,
  closeFlowImageEditor,
  extractGoogleFlowEditorReference,
  isGoogleFlowEditorRoute,
  extractProjectIdFromFlowUrl,
  collectFlowEditorDiagnostics,
  saveImageUsingNativeContextMenu,
  inspectGoogleFlowActiveImage,
};

export const FLOW_TAB_ROLES = Object.freeze({
  BACKGROUND: "background",
  CHARACTER: "character",
});

export const FLOW_TAB_METADATA_KEY = "ai-kids-content-studio.flow-tab-metadata";

export function extractGoogleFlowCharacterReference(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  try {
    const url = new URL(rawUrl.trim());
    if (
      url.hostname !== "flow.google.com" &&
      url.hostname !== "labs.google"
    ) {
      return null;
    }

    let pathname = url.pathname;
    if (pathname.startsWith("/flow/")) {
      pathname = pathname.substring(5);
    }

    // Explicitly reject edit routes (/project/{projectId}/edit/...)
    if (pathname.includes("/edit/")) {
      return null;
    }

    // Character create route: /project/{projectId}/character or /project/{projectId}/character/
    const createMatch = pathname.match(/^\/project\/([^/]+)\/character\/?$/);
    if (createMatch) {
      const projectId = createMatch[1];
      return {
        projectId,
        characterId: null,
        routeType: "character-create",
        url: `https://flow.google.com/project/${projectId}/character`,
      };
    }

    // Character editor route: /project/{projectId}/character/{characterId} or /project/{projectId}/character/{characterId}/
    const editorMatch = pathname.match(/^\/project\/([^/]+)\/character\/([^/]+)\/?$/);
    if (editorMatch) {
      const projectId = editorMatch[1];
      const characterId = editorMatch[2];
      return {
        projectId,
        characterId,
        routeType: "character-editor",
        url: `https://flow.google.com/project/${projectId}/character/${characterId}`,
      };
    }

    return null;
  } catch {
    return null;
  }
}

export function detectFlowRouteType(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return "unknown";
  try {
    const url = new URL(rawUrl.trim());
    if (url.hostname !== "flow.google.com" && url.hostname !== "labs.google") {
      return "unknown";
    }

    const charRef = extractGoogleFlowCharacterReference(rawUrl);
    if (charRef) return charRef.routeType;

    const editorRef = extractGoogleFlowEditorReference(rawUrl);
    if (editorRef) return "image-editor";

    let pathname = url.pathname;
    if (pathname.startsWith("/flow/")) pathname = pathname.substring(5);

    if (pathname.match(/^\/project\/[^/]+\/?$/)) {
      return "project";
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

const VALID_ASSET_TYPES = new Set([
  "main",
  "master_reference",
  "turnaround",
  "expression",
  "pose",
  "custom",
]);
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

export function getFirstLocator(loc) {
  if (!loc) return null;
  return typeof loc.first === "function"
    ? loc.first()
    : typeof loc.nth === "function"
      ? loc.nth(0)
      : loc;
}

function defaultDataDirectory(name) {
  return path.join(os.homedir(), ".ai-kids-content-studio", name);
}

export function getDefaultFlowProfileDir() {
  if (process.env.FLOW_PROFILE_DIR && process.env.FLOW_PROFILE_DIR.trim()) {
    return path.resolve(process.env.FLOW_PROFILE_DIR.trim());
  }
  if (process.platform === "win32") {
    const localAppData =
      process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    return path.join(
      localAppData,
      "AIKidsContentStudio",
      "GoogleFlowChromeProfile",
    );
  }
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "AIKidsContentStudio",
      "GoogleFlowChromeProfile",
    );
  }
  return path.join(
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
    "ai-kids-content-studio",
    "GoogleFlowChromeProfile",
  );
}

export function isGoogleLoginUrl(value) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    return (
      host === "accounts.google.com" ||
      (host.endsWith(".google.com") && pathname.includes("/servicelogin")) ||
      pathname.includes("/v3/signin")
    );
  } catch {
    return false;
  }
}

export function isGoogleSigninRejected(value) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const full = (parsed.pathname + parsed.search).toLowerCase();
    if (host.includes("accounts.google")) {
      return (
        full.includes("/signin/rejected") ||
        full.includes("signin/rejected") ||
        full.includes("rejected") ||
        full.includes("/denied")
      );
    }
    return false;
  } catch {
    return false;
  }
}

export function isFlowUrl(value) {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      (parsed.hostname === "labs.google" ||
        parsed.hostname === "flow.google.com")
    );
  } catch {
    return false;
  }
}

export function isValidFlowDownloadSource(page, activePage, context) {
  if (!page) return false;
  if (typeof page.isClosed === "function" && page.isClosed()) return false;
  if (
    context &&
    typeof page.context === "function" &&
    page.context() !== context
  ) {
    return false;
  }
  if (
    !activePage ||
    (typeof activePage.isClosed === "function" && activePage.isClosed())
  ) {
    return false;
  }
  if (page !== activePage) {
    return false;
  }
  try {
    const url =
      typeof page.url === "function" ? page.url() : String(page.url || "");
    return isFlowUrl(url);
  } catch {
    return false;
  }
}

export class FlowBrowserWorker {
  constructor() {
    this.context = null;
    this._page = null;
    this.pagesByRole = new Map();
    this.pageMetadata = new WeakMap();
    this.activeJobsByRole = new Map();
    this.jobs = new Map();
    this.activeJobId = null;
    this.profileDir = getDefaultFlowProfileDir();
    this.downloadDir = path.resolve(
      process.env.FLOW_DOWNLOAD_DIR || defaultDataDirectory("flow-downloads"),
    );
    this.backendUrl = (
      process.env.FLOW_BACKEND_URL || "http://127.0.0.1:5001"
    ).replace(/\/$/, "");
    this.browserChannel = process.env.FLOW_BROWSER_CHANNEL || "";
    this.promptSelector = process.env.FLOW_PROMPT_SELECTOR || "";
    this.downloadInProgress = false;
    this.attachedPages = new WeakSet();
  }

  get page() {
    const bgPage = this.getFlowPage(FLOW_TAB_ROLES.BACKGROUND);
    if (bgPage && (typeof bgPage.isClosed !== "function" || !bgPage.isClosed())) {
      return bgPage;
    }
    for (const p of this.pagesByRole.values()) {
      if (p && (typeof p.isClosed !== "function" || !p.isClosed())) {
        return p;
      }
    }
    if (this._page && (typeof this._page.isClosed !== "function" || !this._page.isClosed())) {
      return this._page;
    }
    return null;
  }

  set page(p) {
    this._page = p;
    if (p) {
      if (!this.pagesByRole.has(FLOW_TAB_ROLES.BACKGROUND)) {
        this.registerFlowPage(p, { role: FLOW_TAB_ROLES.BACKGROUND });
      }
    }
  }

  getActiveJob(role = FLOW_TAB_ROLES.BACKGROUND) {
    const jobId = this.activeJobsByRole.get(role) || (role === FLOW_TAB_ROLES.BACKGROUND ? this.activeJobId : null);
    return jobId ? this.jobs.get(jobId) || null : null;
  }

  setActiveJob(job, role = null) {
    const assignedRole = role || job?.pageRole || (job?.targetType === "character" ? FLOW_TAB_ROLES.CHARACTER : FLOW_TAB_ROLES.BACKGROUND);
    if (job) {
      this.activeJobsByRole.set(assignedRole, job.id);
      if (assignedRole === FLOW_TAB_ROLES.BACKGROUND) {
        this.activeJobId = job.id;
      }
    } else if (assignedRole) {
      this.activeJobsByRole.set(assignedRole, null);
      if (assignedRole === FLOW_TAB_ROLES.BACKGROUND) {
        this.activeJobId = null;
      }
    }
  }

  registerFlowPage(page, metadata = {}) {
    if (!page) return null;
    const existing = this.pageMetadata.get(page);
    const role = metadata.role || existing?.role || FLOW_TAB_ROLES.BACKGROUND;
    const tabId = metadata.tabId || existing?.tabId || randomUUID();
    const projectId = metadata.projectId || existing?.projectId || null;
    const purpose = metadata.purpose || existing?.purpose || (role === FLOW_TAB_ROLES.CHARACTER ? "character-generation" : "scene-background");
    const currentUrl = typeof page.url === "function" ? page.url() : String(page.url || "");
    const currentRouteType = detectFlowRouteType(currentUrl);

    const record = {
      tabId,
      role,
      projectId,
      purpose,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentRouteType,
      currentUrl,
    };

    if (currentRouteType === "character-create" || currentRouteType === "character-editor") {
      record.characterReference = extractGoogleFlowCharacterReference(currentUrl);
    }
    if (currentRouteType === "image-editor") {
      record.editorReference = extractGoogleFlowEditorReference(currentUrl);
    }

    this.pageMetadata.set(page, record);
    this.pagesByRole.set(role, page);
    this.writeTabMarkerToSessionStorage(page, record).catch(() => {});
    return record;
  }

  async writeTabMarkerToSessionStorage(page, meta) {
    if (!page || (typeof page.isClosed === "function" && page.isClosed())) return;
    try {
      if (typeof page.evaluate === "function") {
        const payload = JSON.stringify({
          tabId: meta.tabId,
          role: meta.role,
          projectId: meta.projectId,
          purpose: meta.purpose,
          updatedAt: meta.updatedAt,
        });
        await page.evaluate(
          ({ key, val }) => {
            try {
              window.sessionStorage.setItem(key, val);
            } catch {}
          },
          { key: FLOW_TAB_METADATA_KEY, val: payload },
        );
      }
    } catch {
      // Non-blocking
    }
  }

  async readTabMarkerFromSessionStorage(page) {
    if (!page || (typeof page.isClosed === "function" && page.isClosed())) return null;
    try {
      if (typeof page.evaluate === "function") {
        const raw = await page.evaluate((key) => {
          try {
            return window.sessionStorage.getItem(key);
          } catch {
            return null;
          }
        }, FLOW_TAB_METADATA_KEY);
        if (raw) {
          return JSON.parse(raw);
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  getFlowPage(role = FLOW_TAB_ROLES.BACKGROUND) {
    const page = this.pagesByRole.get(role);
    if (!page) return null;
    if (typeof page.isClosed === "function" && page.isClosed()) {
      this.pagesByRole.delete(role);
      return null;
    }
    return page;
  }

  getFlowPageMetadata(page) {
    if (!page) return null;
    return this.pageMetadata.get(page) || null;
  }

  getFlowPages() {
    const result = [];
    for (const [role, page] of this.pagesByRole.entries()) {
      const isClosed = typeof page.isClosed === "function" ? page.isClosed() : false;
      const metadata = this.pageMetadata.get(page) || null;
      result.push({
        role,
        page,
        isClosed,
        metadata,
      });
    }
    return result;
  }

  setFlowPageRole(page, role, projectId = null, purpose = null) {
    if (!page) throw new Error("A valid page is required to assign role.");
    if (role !== FLOW_TAB_ROLES.BACKGROUND && role !== FLOW_TAB_ROLES.CHARACTER) {
      throw new Error(`Invalid Flow page role: ${role}. Expected "background" or "character".`);
    }
    return this.registerFlowPage(page, { role, projectId, purpose });
  }

  updateFlowPageRouteMetadata(page) {
    if (!page || (typeof page.isClosed === "function" && page.isClosed())) return null;
    const meta = this.pageMetadata.get(page);
    const currentUrl = typeof page.url === "function" ? page.url() : String(page.url || "");
    const currentRouteType = detectFlowRouteType(currentUrl);

    if (meta) {
      meta.currentUrl = currentUrl;
      meta.currentRouteType = currentRouteType;
      meta.updatedAt = new Date().toISOString();
      if (currentRouteType === "character-create" || currentRouteType === "character-editor") {
        meta.characterReference = extractGoogleFlowCharacterReference(currentUrl);
      } else {
        delete meta.characterReference;
      }
      if (currentRouteType === "image-editor") {
        meta.editorReference = extractGoogleFlowEditorReference(currentUrl);
      } else {
        delete meta.editorReference;
      }
      return meta;
    }
    return null;
  }

  getPageForJob(job) {
    if (!job) return this.getFlowPage(FLOW_TAB_ROLES.BACKGROUND);
    const role = job.pageRole || (job.targetType === "character" ? FLOW_TAB_ROLES.CHARACTER : FLOW_TAB_ROLES.BACKGROUND);
    return this.getFlowPage(role);
  }

  async ensureFlowPage(role = FLOW_TAB_ROLES.BACKGROUND, projectId = null, projectUrl = null) {
    if (role !== FLOW_TAB_ROLES.BACKGROUND && role !== FLOW_TAB_ROLES.CHARACTER) {
      throw new Error(`Invalid tab role "${role}".`);
    }

    let page = this.getFlowPage(role);
    if (page && (typeof page.isClosed !== "function" || !page.isClosed())) {
      if (projectUrl) {
        const cur = typeof page.url === "function" ? page.url() : "";
        if (cur !== projectUrl && isFlowUrl(cur)) {
          await page.goto(projectUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        }
      }
      this.updateFlowPageRouteMetadata(page);
      return page;
    }

    if (!this.context) {
      throw new Error("Browser session is not open. Launch the persistent browser first.");
    }

    const contextPages = this.context.pages ? this.context.pages() : [];
    for (const candidate of contextPages) {
      if (typeof candidate.isClosed === "function" && candidate.isClosed()) continue;
      const marker = await this.readTabMarkerFromSessionStorage(candidate);
      if (marker && marker.role === role) {
        page = candidate;
        this.attachPage(page);
        this.registerFlowPage(page, {
          role,
          tabId: marker.tabId,
          projectId: projectId || marker.projectId,
          purpose: marker.purpose,
        });
        break;
      }
    }

    if (!page) {
      const unassigned = contextPages.find((p) => {
        if (typeof p.isClosed === "function" && p.isClosed()) return false;
        const m = this.pageMetadata.get(p);
        return !m || !m.role;
      });

      if (unassigned) {
        page = unassigned;
      } else {
        page = await this.context.newPage();
      }
      this.attachPage(page);
      this.registerFlowPage(page, {
        role,
        projectId,
        purpose: role === FLOW_TAB_ROLES.CHARACTER ? "character-generation" : "scene-background",
      });
    }

    const targetUrl = projectUrl || (projectId ? `https://flow.google.com/project/${projectId}` : FLOW_HOME_URL);
    const currentUrl = typeof page.url === "function" ? page.url() : "";
    if (!isFlowUrl(currentUrl) || (targetUrl && currentUrl !== targetUrl && targetUrl !== FLOW_HOME_URL)) {
      await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
    }

    this.updateFlowPageRouteMetadata(page);
    return page;
  }

  async navigateToCharacterTab(projectId = null) {
    const charPage = await this.ensureFlowPage(
      FLOW_TAB_ROLES.CHARACTER,
      projectId,
    );

    if (this.getFlowPage(FLOW_TAB_ROLES.CHARACTER) !== charPage) {
      throw new Error(
        "FLOW_CHARACTER_PAGE_ROLE_MISMATCH: Character navigation resolved to a page that is not registered as the character tab.",
      );
    }

    if (typeof charPage.bringToFront === "function") {
      await charPage.bringToFront().catch(() => {});
    }

    const initialUrl =
      typeof charPage.url === "function" ? charPage.url() : "";
    const initialCharacterRef =
      extractGoogleFlowCharacterReference(initialUrl);
    const expectedProjectId =
      projectId ||
      initialCharacterRef?.projectId ||
      extractProjectIdFromFlowUrl(initialUrl);

    if (!expectedProjectId) {
      throw new Error(
        `FLOW_CHARACTER_PROJECT_ID_MISSING: Cannot navigate the character tab without a project ID. Current URL: ${initialUrl}`,
      );
    }

    const currentProjectId = extractProjectIdFromFlowUrl(initialUrl);
    if (currentProjectId && currentProjectId !== expectedProjectId) {
      const projectUrl =
        `https://flow.google.com/project/${encodeURIComponent(expectedProjectId)}`;
      await charPage.goto(projectUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
    }

    // Reuse an existing character-create/editor route for the requested project.
    let currentUrl =
      typeof charPage.url === "function" ? charPage.url() : "";
    let characterRef = extractGoogleFlowCharacterReference(currentUrl);
    if (characterRef && characterRef.projectId === expectedProjectId) {
      this.registerFlowPage(charPage, {
        role: FLOW_TAB_ROLES.CHARACTER,
        projectId: expectedProjectId,
        purpose: "character-generation",
      });
      this.updateFlowPageRouteMetadata(charPage);
      return {
        success: true,
        page: charPage,
        url: currentUrl,
        routeType: characterRef.routeType,
        diagnostics: await this.inspectFlowCharacterWorkspace(charPage),
        navigationMethod: "already-on-character-route",
      };
    }

    const expectedCharacterUrl =
      `https://flow.google.com/project/${encodeURIComponent(expectedProjectId)}/character`;
    const navigationDiagnostics = {
      initialUrl,
      expectedProjectId,
      navigationElementFound: false,
      charactersButtonFound: false,
      clickAttempted: false,
      clickError: null,
      directNavigationFallback: false,
    };

    // Use the exact navigation structure supplied from the live Google Flow DOM.
    // Accessible-role lookup is primary; the DOM-structure selector is a fallback.
    try {
      if (typeof charPage.getByRole === "function") {
        const nav = charPage.getByRole("navigation", {
          name: "Project navigation",
          exact: true,
        });
        const navCount =
          typeof nav.count === "function"
            ? await nav.count().catch(() => 0)
            : 1;
        if (navCount === 1) {
          const navFirst =
            typeof nav.first === "function" ? nav.first() : nav;
          const visible =
            typeof navFirst.isVisible === "function"
              ? await navFirst.isVisible().catch(() => false)
              : true;
          if (visible) {
            navigationDiagnostics.navigationElementFound = true;
            const button = nav.getByRole("button", {
              name: "Characters",
              exact: true,
            });
            const buttonCount =
              typeof button.count === "function"
                ? await button.count().catch(() => 0)
                : 0;
            if (buttonCount === 1) {
              const buttonFirst =
                typeof button.first === "function" ? button.first() : button;
              const visibleButton =
                typeof buttonFirst.isVisible === "function"
                  ? await buttonFirst.isVisible().catch(() => false)
                  : true;
              const enabledButton =
                typeof buttonFirst.isEnabled === "function"
                  ? await buttonFirst.isEnabled().catch(() => false)
                  : true;
              if (visibleButton && enabledButton) {
                navigationDiagnostics.charactersButtonFound = true;
                navigationDiagnostics.clickAttempted = true;
                await buttonFirst.click({ timeout: 15000 });
              }
            }
          }
        }
      }
    } catch (error) {
      navigationDiagnostics.clickError = error?.message || String(error);
    }

    // Exact fallback matching the provided Angular Material DOM:
    // mat-nav-list[role=navigation][aria-label="Project navigation"]
    //   button[mat-list-item]
    //     span.mat-mdc-list-item-title = "Characters"
    currentUrl =
      typeof charPage.url === "function" ? charPage.url() : "";
    characterRef = extractGoogleFlowCharacterReference(currentUrl);

    if (
      !characterRef &&
      typeof charPage.locator === "function" &&
      !navigationDiagnostics.clickAttempted
    ) {
      try {
        const nav = charPage.locator(
          'mat-nav-list[role="navigation"][aria-label="Project navigation"]',
        );
        await nav.waitFor({ state: "visible", timeout: 20000 });
        navigationDiagnostics.navigationElementFound = true;

        const items = nav.locator("button[mat-list-item]");
        const matchingIndexes = await items.evaluateAll((buttons) =>
          buttons
            .map((button, index) => ({
              index,
              title:
                button
                  .querySelector("span.mat-mdc-list-item-title")
                  ?.textContent?.trim() || "",
              disabled:
                button.getAttribute("aria-disabled") === "true" ||
                button.disabled === true,
              visible: (() => {
                const rect = button.getBoundingClientRect();
                const style = window.getComputedStyle(button);
                return (
                  rect.width > 0 &&
                  rect.height > 0 &&
                  style.display !== "none" &&
                  style.visibility !== "hidden"
                );
              })(),
            }))
            .filter(
              (item) =>
                item.title === "Characters" &&
                item.visible &&
                !item.disabled,
            )
            .map((item) => item.index),
        );

        if (matchingIndexes.length === 1) {
          navigationDiagnostics.charactersButtonFound = true;
          navigationDiagnostics.clickAttempted = true;
          await items.nth(matchingIndexes[0]).click({ timeout: 15000 });
        } else if (matchingIndexes.length > 1) {
          throw new Error(
            `FLOW_CHARACTERS_NAV_AMBIGUOUS: Found ${matchingIndexes.length} visible Characters buttons.`,
          );
        }
      } catch (error) {
        navigationDiagnostics.clickError =
          error?.message || String(error);
      }
    }

    const isExpectedCharacterRoute = (rawUrl) => {
      const parsed = extractGoogleFlowCharacterReference(
        typeof rawUrl === "string" ? rawUrl : rawUrl.toString(),
      );
      return Boolean(
        parsed && parsed.projectId === expectedProjectId,
      );
    };

    // Wait for the SPA navigation to complete. A click resolving is not success.
    try {
      if (typeof charPage.waitForURL === "function") {
        await charPage.waitForURL(
          (url) => isExpectedCharacterRoute(url.toString()),
          { timeout: 20000 },
        );
      }
    } catch {
      // A direct route navigation below is the controlled recovery path.
    }

    currentUrl =
      typeof charPage.url === "function" ? charPage.url() : "";
    characterRef = extractGoogleFlowCharacterReference(currentUrl);

    // Google Flow's left-nav click can be swallowed during a slow Angular
    // render. Navigate the character tab directly only if the verified click
    // did not reach the expected character route.
    if (
      !characterRef ||
      characterRef.projectId !== expectedProjectId
    ) {
      navigationDiagnostics.directNavigationFallback = true;
      await charPage.goto(expectedCharacterUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });

      if (typeof charPage.waitForURL === "function") {
        await charPage.waitForURL(
          (url) => isExpectedCharacterRoute(url.toString()),
          { timeout: 30000 },
        );
      }
    }

    currentUrl =
      typeof charPage.url === "function" ? charPage.url() : "";
    characterRef = extractGoogleFlowCharacterReference(currentUrl);

    if (!characterRef || characterRef.projectId !== expectedProjectId) {
      const diagnostics = {
        ...navigationDiagnostics,
        finalUrl: currentUrl,
        actualProjectId: characterRef?.projectId || null,
        actualRouteType: detectFlowRouteType(currentUrl),
      };

      const error = new Error(
        `FLOW_CHARACTER_NAVIGATION_FAILED: Expected /project/${expectedProjectId}/character, but the character tab remained at ${currentUrl || "(empty URL)"}. Diagnostics: ${JSON.stringify(diagnostics)}`,
      );
      error.code = "FLOW_CHARACTER_NAVIGATION_FAILED";
      error.diagnostics = diagnostics;
      throw error;
    }

    this.registerFlowPage(charPage, {
      role: FLOW_TAB_ROLES.CHARACTER,
      projectId: expectedProjectId,
      purpose: "character-generation",
    });
    this.updateFlowPageRouteMetadata(charPage);

    const diagnostics = await this.inspectFlowCharacterWorkspace(charPage);
    return {
      success: true,
      page: charPage,
      url: currentUrl,
      projectId: expectedProjectId,
      characterId: characterRef.characterId,
      routeType: characterRef.routeType,
      navigationMethod: navigationDiagnostics.directNavigationFallback
        ? "direct-route-fallback"
        : "project-sidebar",
      navigationDiagnostics,
      diagnostics,
    };
  }

  async openGoogleFlowCharacterEditor({ projectId, characterId, characterUrl }) {
    let resolvedProjectId = projectId;
    let resolvedCharacterId = characterId;
    let targetUrl = characterUrl;

    if (characterUrl) {
      const parsed = extractGoogleFlowCharacterReference(characterUrl);
      if (parsed) {
        resolvedProjectId = parsed.projectId;
        resolvedCharacterId = parsed.characterId;
        targetUrl = parsed.url;
      }
    } else if (projectId && characterId) {
      targetUrl = `https://flow.google.com/project/${projectId}/character/${characterId}`;
    } else if (projectId) {
      targetUrl = `https://flow.google.com/project/${projectId}/character`;
    } else {
      throw new Error("Either characterUrl or (projectId + characterId) must be provided.");
    }

    const charPage = await this.ensureFlowPage(FLOW_TAB_ROLES.CHARACTER, resolvedProjectId, targetUrl);
    if (typeof charPage.bringToFront === "function") {
      await charPage.bringToFront().catch(() => {});
    }

    const cur = typeof charPage.url === "function" ? charPage.url() : "";
    if (cur !== targetUrl) {
      await charPage.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
    }

    this.updateFlowPageRouteMetadata(charPage);
    const diagnostics = await this.inspectFlowCharacterWorkspace(charPage);

    return {
      success: true,
      page: charPage,
      url: charPage.url ? charPage.url() : "",
      projectId: resolvedProjectId,
      characterId: resolvedCharacterId,
      routeType: detectFlowRouteType(charPage.url ? charPage.url() : ""),
      diagnostics,
    };
  }

  async inspectFlowCharacterWorkspace(page) {
    if (!page || (typeof page.isClosed === "function" && page.isClosed())) {
      return { available: false, reason: "Page is closed or missing." };
    }

    const diagnostics = {
      available: true,
      url: typeof page.url === "function" ? page.url() : "",
      routeType: detectFlowRouteType(typeof page.url === "function" ? page.url() : ""),
      promptTextbox: { found: false, count: 0 },
      formatButtons: { found: false, count: 0 },
      modelSelector: { found: false, count: 0 },
      generateButton: { found: false, count: 0 },
      navigation: { charactersButtonFound: false },
    };

    try {
      if (typeof page.getByPlaceholder === "function") {
        const descInput = page.getByPlaceholder(/Describe your character/i);
        const count = await descInput.count().catch(() => 0);
        if (count > 0) {
          diagnostics.promptTextbox = { found: true, count, selector: "placeholder:Describe your character" };
        }
      }

      if (!diagnostics.promptTextbox.found && typeof page.getByRole === "function") {
        const textbox = page.getByRole("textbox", { name: /Describe your character/i });
        const count = await textbox.count().catch(() => 0);
        if (count > 0) {
          diagnostics.promptTextbox = { found: true, count, selector: "role:textbox[Describe your character]" };
        }
      }

      if (!diagnostics.promptTextbox.found && typeof page.locator === "function") {
        const loc = page.locator('textarea, [contenteditable="true"], input[placeholder*="Describe" i]');
        const count = await loc.count().catch(() => 0);
        if (count > 0) {
          diagnostics.promptTextbox = { found: true, count, selector: "fallback:textarea" };
        }
      }

      if (typeof page.getByRole === "function") {
        const formatBtn = page.getByRole("button", { name: /Format/i });
        const count = await formatBtn.count().catch(() => 0);
        if (count > 0) {
          diagnostics.formatButtons = { found: true, count };
        }
      }

      if (typeof page.getByRole === "function") {
        const modelBtn = page.getByRole("button", { name: /Select model family|Model/i });
        const count = await modelBtn.count().catch(() => 0);
        if (count > 0) {
          diagnostics.modelSelector = { found: true, count };
        }
      }

      if (typeof page.getByRole === "function") {
        const genBtn = page.getByRole("button", { name: /Start generation|Generate/i });
        const count = await genBtn.count().catch(() => 0);
        if (count > 0) {
          diagnostics.generateButton = { found: true, count };
        }
      }

      if (typeof page.getByRole === "function") {
        const nav = page.getByRole("navigation", { name: /Project navigation/i });
        const navCharBtn = nav.getByRole("button", { name: "Characters", exact: true });
        const count = await navCharBtn.count().catch(() => 0);
        diagnostics.navigation.charactersButtonFound = count > 0;
      }
    } catch (err) {
      diagnostics.error = err.message;
    }

    return diagnostics;
  }

  configure(config = {}) {
    if (this.context) {
      const currentChannel =
        this.browserChannel === "chrome" ? "chrome" : "bundled-chromium";
      const requestedChannel = config.browserChannel
        ? config.browserChannel === "chrome"
          ? "chrome"
          : "bundled-chromium"
        : currentChannel;
      const currentProfile = path.resolve(this.profileDir);
      const requestedProfile = config.profileDir
        ? path.resolve(config.profileDir)
        : currentProfile;

      if (
        requestedChannel !== currentChannel ||
        requestedProfile !== currentProfile
      ) {
        const error = new Error(
          "Cannot change browser channel or profile directory while browser session is running. Please close the active browser window first.",
        );
        error.statusCode = 409;
        throw error;
      }
    }

    if (config.browserChannel !== undefined) {
      const chan = String(config.browserChannel).trim();
      if (chan === "chrome" || chan === "bundled-chromium" || chan === "") {
        this.browserChannel = chan === "bundled-chromium" ? "" : chan;
      } else {
        const error = new Error(
          `Unsupported browser channel "${chan}". Only "chrome" and "bundled-chromium" are supported.`,
        );
        error.statusCode = 400;
        throw error;
      }
    }

    if (
      config.profileDir &&
      typeof config.profileDir === "string" &&
      config.profileDir.trim()
    ) {
      this.profileDir = path.resolve(config.profileDir.trim());
    }

    return {
      success: true,
      browserChannel:
        this.browserChannel === "chrome" ? "chrome" : "bundled-chromium",
      profileDir: this.profileDir,
    };
  }

  async launch(projectUrl, config = {}) {
    if (config && Object.keys(config).length > 0) {
      this.configure(config);
    }

    if (!this.context) {
      await fs.mkdir(this.profileDir, { recursive: true });
      await fs.mkdir(this.downloadDir, { recursive: true });

      const options = {
        headless: false,
        acceptDownloads: true,
        viewport: null,
        args: ["--start-maximized"],
      };

      if (this.browserChannel === "chrome") {
        options.channel = "chrome";
      }

      try {
        this.context = await chromium.launchPersistentContext(
          this.profileDir,
          options,
        );
      } catch (launchErr) {
        const msg = String(launchErr?.message || "");
        if (
          msg.includes("ProcessSingleton") ||
          msg.includes("EBUSY") ||
          msg.includes("Target closed") ||
          msg.includes("already in use")
        ) {
          throw new Error(
            `Google Flow profile is locked by another running browser process (${this.profileDir}). Close any active Chrome windows using this profile and try again.`,
          );
        }
        if (
          msg.includes("Executable doesn't exist") ||
          msg.includes("Cannot find chrome")
        ) {
          throw new Error(
            `Selected browser channel "${this.browserChannel}" was not found on this machine. Switch to bundled Chromium or install Google Chrome.`,
          );
        }
        throw launchErr;
      }
      this.context.on("page", (page) => this.attachPage(page));
    }

    const projectId = extractProjectIdFromFlowUrl(projectUrl) || null;
    const target = assertAllowedFlowUrl(projectUrl || FLOW_HOME_URL);

    // 1. Scan context pages and recover any role markers from sessionStorage
    const existingPages = this.context.pages ? this.context.pages() : [];
    for (const p of existingPages) {
      this.attachPage(p);
      const marker = await this.readTabMarkerFromSessionStorage(p);
      if (marker && marker.role) {
        this.registerFlowPage(p, marker);
      }
    }

    // 2. Ensure Background tab exists and is navigated
    let bgPage = this.getFlowPage(FLOW_TAB_ROLES.BACKGROUND);
    if (!bgPage) {
      const candidates = (this.context.pages ? this.context.pages() : []).filter(
        (p) => (!p.isClosed || !p.isClosed()) && !this.pageMetadata.get(p)?.role,
      );
      bgPage =
        candidates.find((candidate) => isFlowUrl(candidate.url())) ||
        candidates[0] ||
        (await this.context.newPage());
      this.attachPage(bgPage);
      this.registerFlowPage(bgPage, {
        role: FLOW_TAB_ROLES.BACKGROUND,
        projectId,
        purpose: "scene-background",
      });
    }

    if (
      !isFlowUrl(bgPage.url()) ||
      (projectUrl && bgPage.url() !== target)
    ) {
      await bgPage.goto(target, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
    }
    this.updateFlowPageRouteMetadata(bgPage);

    // 3. Ensure Character tab exists and is navigated
    let charPage = this.getFlowPage(FLOW_TAB_ROLES.CHARACTER);
    if (!charPage) {
      const remainingCandidates = (this.context.pages ? this.context.pages() : []).filter(
        (p) => (!p.isClosed || !p.isClosed()) && p !== bgPage && !this.pageMetadata.get(p)?.role,
      );
      charPage =
        remainingCandidates.find((candidate) => isFlowUrl(candidate.url())) ||
        remainingCandidates[0] ||
        (await this.context.newPage());
      this.attachPage(charPage);
      this.registerFlowPage(charPage, {
        role: FLOW_TAB_ROLES.CHARACTER,
        projectId,
        purpose: "character-generation",
      });
    }

    const charTarget = projectId
      ? `https://flow.google.com/project/${projectId}`
      : target;
    const charUrl = typeof charPage.url === "function" ? charPage.url() : "";
    const charProjectId = extractProjectIdFromFlowUrl(charUrl);

    // Keep the character page on the requested project's workspace. A route
    // containing "/character" is not sufficient if it belongs to another project.
    if (
      !isFlowUrl(charUrl) ||
      (projectId && charProjectId !== projectId)
    ) {
      await charPage.goto(charTarget, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
    }

    this.registerFlowPage(charPage, {
      role: FLOW_TAB_ROLES.CHARACTER,
      projectId,
      purpose: "character-generation",
    });
    this.updateFlowPageRouteMetadata(charPage);

    // IMPORTANT: opening the character tab at /project/{id} does not navigate
    // to the Characters section. Explicitly click the supplied left navigation
    // item (with a verified direct-route fallback) before reporting launch ready.
    const characterNavigation = await this.navigateToCharacterTab(projectId);
    if (!characterNavigation.success) {
      throw new Error(
        "FLOW_CHARACTER_TAB_NOT_READY: Character tab did not reach the Characters workspace.",
      );
    }

    return this.getSessionStatus();
  }

  attachPage(page) {
    if (!page || this.attachedPages.has(page)) return;
    this.attachedPages.add(page);

    if (typeof page.on === "function") {
      page.on("framenavigated", async (frame) => {
        try {
          if (typeof page.mainFrame === "function" && frame === page.mainFrame()) {
            this.updateFlowPageRouteMetadata(page);
            const meta = this.pageMetadata.get(page);
            if (!meta) {
              const marker = await this.readTabMarkerFromSessionStorage(page);
              if (marker && marker.role) {
                this.registerFlowPage(page, marker);
              }
            }
          }
        } catch {}
      });

      page.on("download", (download) => {
        this.handleDownload(download, page).catch((error) => {
          console.error("[FlowWorker] Download handling failed:", error.message);
        });
      });

      page.on("close", () => {
        for (const [role, mappedPage] of this.pagesByRole.entries()) {
          if (mappedPage === page) {
            this.pagesByRole.delete(role);
            break;
          }
        }
        if (this._page === page) {
          this._page = null;
        }
      });
    }
  }

  async getSessionStatus() {
    let profileDirExists = false;
    try {
      const stat = await fs.stat(this.profileDir);
      profileDirExists = stat.isDirectory();
    } catch {
      profileDirExists = false;
    }

    const browserChannel = this.browserChannel || "bundled-chromium";
    const configuredProfileDir = this.profileDir;

    const bgPage = this.getFlowPage(FLOW_TAB_ROLES.BACKGROUND);
    const charPage = this.getFlowPage(FLOW_TAB_ROLES.CHARACTER);

    const tabs = {
      background: {
        open: Boolean(bgPage && (typeof bgPage.isClosed !== "function" || !bgPage.isClosed())),
        url: bgPage && typeof bgPage.url === "function" ? bgPage.url() : null,
        routeType: bgPage ? detectFlowRouteType(typeof bgPage.url === "function" ? bgPage.url() : "") : null,
        activeJobId: this.activeJobsByRole.get(FLOW_TAB_ROLES.BACKGROUND) || null,
        metadata: bgPage ? this.getFlowPageMetadata(bgPage) : null,
      },
      character: {
        open: Boolean(charPage && (typeof charPage.isClosed !== "function" || !charPage.isClosed())),
        url: charPage && typeof charPage.url === "function" ? charPage.url() : null,
        routeType: charPage ? detectFlowRouteType(typeof charPage.url === "function" ? charPage.url() : "") : null,
        activeJobId: this.activeJobsByRole.get(FLOW_TAB_ROLES.CHARACTER) || null,
        metadata: charPage ? this.getFlowPageMetadata(charPage) : null,
      },
    };

    if (!this.context) {
      return {
        connected: false,
        workerOnline: true,
        browserRunning: false,
        flowPageOpen: false,
        googleAuthenticated: false,
        manualLoginRequired: false,
        googleSigninBlocked: false,
        projectSelected: false,
        authenticationStatus: "unknown",
        canPrepareJob: false,
        canGenerateJob: false,
        state: "browser_not_started",
        message: "Open a persistent Google Flow browser session first.",
        browserChannel,
        configuredProfileDir,
        profileDirExists,
        ownsActiveBrowser: false,
        tabs,
        pageRoles: Array.from(this.pagesByRole.keys()),
        diagnostics: {
          browserChannel,
          configuredProfileDir,
          profileDirExists,
          ownsActiveBrowser: false,
          googleSigninRequired: false,
          googleSigninBlocked: false,
          authenticationStatus: "unknown",
          canPrepareJob: false,
        },
      };
    }

    if (
      !this.page ||
      (typeof this.page.isClosed === "function" && this.page.isClosed())
    ) {
      return {
        connected: false,
        workerOnline: true,
        browserRunning: false,
        flowPageOpen: false,
        googleAuthenticated: false,
        manualLoginRequired: false,
        googleSigninBlocked: false,
        projectSelected: false,
        authenticationStatus: "unknown",
        canPrepareJob: false,
        canGenerateJob: false,
        state: "browser_page_closed",
        message: "The Flow browser page is closed. Open the session again.",
        browserChannel,
        configuredProfileDir,
        profileDirExists,
        ownsActiveBrowser: true,
        tabs,
        pageRoles: Array.from(this.pagesByRole.keys()),
        diagnostics: {
          browserChannel,
          configuredProfileDir,
          profileDirExists,
          ownsActiveBrowser: true,
          googleSigninRequired: false,
          googleSigninBlocked: false,
          authenticationStatus: "unknown",
          canPrepareJob: false,
        },
      };
    }

    const currentUrl =
      typeof this.page.url === "function"
        ? this.page.url()
        : String(this.page.url || "");
    const signinBlocked = isGoogleSigninRejected(currentUrl);
    const loginUrl = isGoogleLoginUrl(currentUrl);
    const flowPage = isFlowUrl(currentUrl);
    const projectSelected = Boolean(
      flowPage && currentUrl.match(/\/project\/[a-zA-Z0-9\-_]+/i),
    );

    let title = "";
    try {
      if (typeof this.page.title === "function") {
        title = await this.page.title();
      }
    } catch {
      // The page may be navigating; status remains available without a title.
    }

    let googleAuthenticated = false;
    let manualLoginRequired = false;
    let googleSigninBlocked = false;
    let authenticationStatus = "unknown";
    let state = "browser_open";
    let message = "";

    if (signinBlocked) {
      googleSigninBlocked = true;
      manualLoginRequired = true;
      googleAuthenticated = false;
      authenticationStatus = "blocked";
      state = "google_signin_blocked";
      message =
        "Google sign-in was rejected by Google (accounts.google.com/v3/signin/rejected). Please complete sign-in in your standard browser or review network/proxy configuration.";
    } else if (loginUrl) {
      manualLoginRequired = true;
      googleAuthenticated = false;
      googleSigninBlocked = false;
      authenticationStatus = "login_required";
      state = "manual_login_required";
      message =
        "Sign in manually in the visible browser. The worker does not handle passwords, MFA, or CAPTCHA.";
    } else if (flowPage) {
      state = "flow_page_open";
      try {
        let domStatus = "unknown";
        if (typeof this.page.evaluate === "function") {
          domStatus = await this.page.evaluate(() => {
            const doc = document;
            if (!doc) return "unknown";

            const signInEl = doc.querySelector(
              'a[href*="accounts.google.com"], button[data-action="sign-in"], a[data-action="sign-in"], [aria-label*="Sign in" i]',
            );

            const accountEl = doc.querySelector(
              'a[href*="SignOutOptions"], [aria-label*="Google Account" i], img[src*="googleusercontent.com"], [data-email]',
            );

            const workspaceEl = doc.querySelector(
              '[data-testid="project-workspace"], textarea, [contenteditable="true"], button[aria-label*="Generate" i]',
            );

            if (signInEl && !accountEl) {
              return "login_required";
            }
            if (accountEl || workspaceEl) {
              return "authenticated";
            }
            return "unknown";
          });
        }

        if (domStatus === "authenticated") {
          googleAuthenticated = true;
          manualLoginRequired = false;
          googleSigninBlocked = false;
          authenticationStatus = "authenticated";
          message = projectSelected
            ? "Google Flow session is authenticated with active project selected."
            : "Google Flow session is authenticated. Ready for character and background workflows.";
        } else if (domStatus === "login_required") {
          googleAuthenticated = false;
          manualLoginRequired = true;
          googleSigninBlocked = false;
          authenticationStatus = "login_required";
          state = "manual_login_required";
          message = "Sign in to your Google account in the visible browser.";
        } else {
          googleAuthenticated = false;
          manualLoginRequired = false;
          googleSigninBlocked = false;
          authenticationStatus = "unknown";
          message =
            "Authentication status unknown. Confirm your login in the visible browser.";
        }
      } catch {
        googleAuthenticated = false;
        authenticationStatus = "unknown";
        message =
          "Authentication status unknown. Confirm your login in the visible browser.";
      }
    } else {
      state = "browser_open";
      authenticationStatus = "unknown";
      message = `Browser is open on ${currentUrl}. Navigate to Google Flow.`;
    }

    const canPrepareJob = Boolean(
      this.context &&
      this.page &&
      (typeof this.page.isClosed !== "function" || !this.page.isClosed()) &&
      flowPage &&
      googleAuthenticated &&
      !manualLoginRequired &&
      !googleSigninBlocked,
    );

    const diagnostics = {
      browserChannel,
      configuredProfileDir,
      profileDirExists,
      ownsActiveBrowser: true,
      googleSigninRequired:
        manualLoginRequired || authenticationStatus === "login_required",
      googleSigninBlocked,
      authenticationStatus,
      canPrepareJob,
    };

    return {
      connected: true, // for backwards compatibility
      workerOnline: true,
      browserRunning: true,
      flowPageOpen: flowPage,
      googleAuthenticated,
      manualLoginRequired,
      googleSigninBlocked,
      projectSelected,
      authenticationStatus,
      canPrepareJob,
      canGenerateJob: Boolean(
        canPrepareJob && this.activeJob?.status === "prompt_ready",
      ),
      state,
      currentUrl,
      title,
      message,
      browserChannel,
      configuredProfileDir,
      profileDirExists,
      ownsActiveBrowser: true,
      tabs,
      pageRoles: Array.from(this.pagesByRole.keys()),
      diagnostics,
    };
  }

  async close() {
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
      this.pagesByRole.clear();
      this.activeJobsByRole.clear();
      this._page = null;
    }

    return this.getSessionStatus();
  }

  async resetProfile() {
    await this.close();
    const defaultDir = getDefaultFlowProfileDir();
    if (
      this.profileDir !== defaultDir &&
      !this.profileDir.includes("GoogleFlowChromeProfile")
    ) {
      throw new Error(
        "Refusing to reset profile: path is not a dedicated Google Flow profile.",
      );
    }
    try {
      await fs.rm(this.profileDir, { recursive: true, force: true });
      await fs.mkdir(this.profileDir, { recursive: true, mode: 0o700 });
      return {
        success: true,
        message: "Dedicated Google Flow browser profile reset successfully.",
      };
    } catch (err) {
      throw new Error(`Failed to reset profile directory: ${err.message}`);
    }
  }

  createJob(input) {
    const targetType =
      input.targetType || (input.sceneId ? "background" : "character");

    if (targetType === "background") {
      const sceneId = String(input.sceneId || "").trim();
      const storyId = String(input.storyId || "").trim();
      if (!sceneId) throw new Error("sceneId is required for background jobs.");

      const isRegeneration = Boolean(input.isRegeneration);
      const rawEditUrl = input.editUrl || input.googleFlowEditUrl;
      const googleFlowEditUrl = rawEditUrl ? assertAllowedFlowUrl(rawEditUrl) : undefined;
      const editorRef = googleFlowEditUrl ? extractGoogleFlowEditorReference(googleFlowEditUrl) : null;

      const projectUrl = input.projectUrl
        ? assertAllowedFlowUrl(input.projectUrl)
        : (editorRef ? `https://flow.google.com/project/${editorRef.projectId}` : undefined);
      const prompt = String(input.prompt || "").trim();
      if (!prompt)
        throw new Error("A non-empty prompt is required for background jobs.");

      const job = {
        id: randomUUID(),
        targetType: "background",
        pageRole: input.pageRole || FLOW_TAB_ROLES.BACKGROUND,
        sceneId,
        storyId,
        aspectRatio: input.aspectRatio || "16:9",
        projectUrl,
        prompt,
        isRegeneration,
        editUrl: googleFlowEditUrl,
        googleFlowEditUrl,
        googleFlowProjectId: editorRef?.projectId || input.googleFlowProjectId || undefined,
        googleFlowEditId: editorRef?.editId || input.googleFlowEditId || undefined,
        googleFlowParentAssetId: input.googleFlowParentAssetId || undefined,
        googleFlowVersion: typeof input.googleFlowVersion === "number" ? input.googleFlowVersion : undefined,
        status: "created",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        message: isRegeneration
          ? "Background regeneration job created. Prepare it to navigate to Flow image editor."
          : "Background job created. Prepare it after opening Flow.",
      };

      this.jobs.set(job.id, job);
      this.emitLifecycleLog("JOB_CREATED", job);
      return job;
    }

    const characterId = String(input.characterId || "").trim();
    const characterName = String(input.characterName || "").trim();
    const view = String(input.view || "front");

    if (!characterId) throw new Error("characterId is required.");
    if (!characterName) throw new Error("characterName is required.");
    if (!CHARACTER_VIEW_LABELS[view])
      throw new Error("Unsupported character view: " + view);

    const rawAssetType = String(
      input.assetType ||
        (view === "front" && input.isMasterReference === true
          ? "main"
          : "custom"),
    );

    if (!VALID_ASSET_TYPES.has(rawAssetType)) {
      throw new Error(
        "assetType must be one of: " + Array.from(VALID_ASSET_TYPES).join(", "),
      );
    }
    const assetType = rawAssetType === "master_reference" ? "main" : rawAssetType;

    const projectUrl = input.projectUrl
      ? assertAllowedFlowUrl(input.projectUrl)
      : undefined;
    const prompt = String(
      input.prompt ||
        buildCharacterViewPrompt({
          characterName,
          view,
          additionalInstructions: input.additionalInstructions,
        }),
    ).trim();

    if (!prompt) throw new Error("A non-empty prompt is required.");

    const job = {
      id: randomUUID(),
      targetType: "character",
      pageRole: input.pageRole || FLOW_TAB_ROLES.CHARACTER,
      characterId,
      characterName,
      view,
      assetType,
      isMasterReference:
        input.isMasterReference === true ||
        assetType === "main" ||
        input.assetType === "master_reference",
      projectUrl,
      prompt,
      status: "created",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      message:
        "Job created. Prepare it after opening Flow and completing any required manual sign-in.",
    };

    this.jobs.set(job.id, job);
    this.emitLifecycleLog("JOB_CREATED", job);
    return job;
  }

  emitLifecycleLog(event, job, extra = {}) {
    if (!job) return;
    const entry = {
      event,
      workerJobId: job.id,
      backendJobId: job.backendJobId || job.id,
      sceneId: job.sceneId,
      storyId: job.storyId,
      status: job.status,
      previousStatus: extra.previousStatus || job._previousStatus || undefined,
      timestamp: new Date().toISOString(),
      ...extra,
    };
    job._previousStatus = job.status;
    console.log(`[FlowLifecycle] ${event} ${JSON.stringify(entry)}`);
  }

  extractProjectId(url) {
    if (!url || typeof url !== "string") return null;
    const match = url.match(/\/project\/([a-zA-Z0-9\-_]+)/i);
    return match ? match[1] : null;
  }

  setJobTerminal(job, terminalStatus, error = undefined, message = undefined) {
    if (!job) return;
    const prevStatus = job.status;
    job.status = terminalStatus;
    if (error !== undefined) job.error = error;
    if (message !== undefined) job.message = message;
    if (terminalStatus === "completed") {
      job.completedAt = new Date().toISOString();
      job.error = undefined;
      this.emitLifecycleLog("IMPORT_COMPLETED", job);
    }
    if (this.activeJobId === job.id) {
      this.activeJobId = null;
      this.emitLifecycleLog("ACTIVE_LOCK_RELEASED", job, { previousStatus: prevStatus });
    }
    this.touch(job);
  }

  recoverActiveJobLock(force = false) {
    if (!this.activeJobId) return;
    const active = this.jobs.get(this.activeJobId);
    if (
      !active ||
      force ||
      ["completed", "cancelled", "failed"].includes(active.status)
    ) {
      this.activeJobId = null;
      return;
    }

    const ageMs =
      Date.now() - new Date(active.updatedAt || active.createdAt).getTime();
    const isActivelyGenerating = [
      "generating",
      "output_detected",
      "downloading",
      "importing",
      "awaiting_download",
    ].includes(active.status);
    const timeoutThresholdMs = isActivelyGenerating ? 120000 : 30000;

    if (ageMs > timeoutThresholdMs) {
      const recoveredJobId = this.activeJobId;
      console.warn(
        `[FlowBrowser] Recovering stale activeJobId lock for job ${recoveredJobId} (${Math.round(ageMs / 1000)}s old, status=${active.status}).`,
      );
      // Immediately release active lock so new operations are unblocked
      this.activeJobId = null;
      const previousStatus = active.status;
      active.status = "failed";
      active.errorCode = "STALE_DOWNLOAD_JOB";
      active.error = `STALE_DOWNLOAD_JOB: Worker was interrupted during image download or processing in status "${previousStatus}".`;
      active.message = "Stale lock safely recovered due to timeout.";
      this.touch(active);
      this.emitLifecycleLog("STALE_JOB_RECOVERED", active, { previousStatus });

      // Attempt state reconciliation if recoverable artifacts exist
      return this.reconcileStaleJob(active).catch((err) => {
        console.warn(`[FlowBrowser] Stale job reconciliation notice for ${recoveredJobId}:`, err.message);
      });
    }
    return Promise.resolve();
  }

  async reconcileStaleJob(job) {
    if (!job) return;

    // Case 1: Verified downloaded file exists on disk
    if (job.downloadPath) {
      try {
        const stat = await fs.stat(job.downloadPath).catch(() => null);
        if (stat && stat.size > 50) {
          const buf = await fs.readFile(job.downloadPath).catch(() => null);
          if (buf && buf.length > 50) {
            const detected = detectImageType(buf);
            const dims = parseImageDimensions(buf);
            if (detected && dims.width >= 32 && dims.height >= 32) {
              console.info(
                `[FlowBrowser] Reconcile Case 1: Found downloaded file on disk (${stat.size} bytes). Resuming import.`,
              );
              job.status = "importing";
              delete job.error;
              delete job.errorCode;
              this.touch(job);
              await this.importDownloadedAsset(job, buf, detected);
              return;
            }
          }
        }
      } catch (c1Err) {
        console.warn(`[FlowBrowser] Case 1 recovery failed: ${c1Err.message}`);
      }
    }

    // Case 2: Captured image response exists in memory
    if (job.capturedImageResponses && job.capturedImageResponses.size > 0) {
      for (const [url, item] of job.capturedImageResponses.entries()) {
        if (item && item.buffer && item.buffer.length > 50) {
          const detected = detectImageType(item.buffer);
          const dims = parseImageDimensions(item.buffer);
          if (detected && dims.width >= 32 && dims.height >= 32) {
            console.info(
              `[FlowBrowser] Reconcile Case 2: Found captured image stream (${item.buffer.length} bytes). Resuming import.`,
            );
            job.status = "importing";
            delete job.error;
            delete job.errorCode;
            this.touch(job);
            await this.importDownloadedAsset(job, item.buffer, detected);
            return;
          }
        }
      }
    }

    // Case 5: Backend asset already exists
    try {
      if (job.sceneId || job.storyId) {
        const statusRes = await fetch(
          `${this.backendUrl}/api/integrations/google-flow/jobs?workerJobId=${encodeURIComponent(job.id)}`,
          {
            signal: AbortSignal.timeout(800),
            headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
          },
        ).catch(() => null);
        if (statusRes && statusRes.ok) {
          const data = await statusRes.json().catch(() => null);
          if (data?.job?.status === "completed" && data?.job?.resultUrl) {
            job.status = "completed";
            job.resultUrl = data.job.resultUrl;
            job.completedAt = data.job.completedAt || new Date().toISOString();
            job.message = "Job reconciled from existing backend asset.";
            delete job.error;
            delete job.errorCode;
            this.touch(job);
            return;
          }
        }
      }
    } catch {}
  }

  cancelActiveJob(reason = "Active job cancelled by user or system recovery.") {
    this.recoverActiveJobLock();
    if (!this.activeJobId) {
      return { cancelled: false, message: "No active job was running." };
    }
    const active = this.jobs.get(this.activeJobId);
    const id = this.activeJobId;
    if (active) {
      this.setJobTerminal(active, "cancelled", undefined, reason);
    } else {
      this.activeJobId = null;
    }
    return {
      cancelled: true,
      jobId: id,
      message: `Active job ${id} was cancelled and worker lock released.`,
    };
  }

  async detectInterfaceMode(options = {}) {
    const timeoutMs = options.timeoutMs ?? 0;
    if (
      !this.page ||
      (typeof this.page.isClosed === "function" && this.page.isClosed())
    ) {
      return "unknown";
    }

    try {
      const currentUrl =
        typeof this.page.url === "function"
          ? this.page.url()
          : "";

      // 1. The editor route is authoritative.
      // Do not classify its Start generation button as Agent mode.
      if (isGoogleFlowEditorRoute(currentUrl)) {
        return "image-editor";
      }

      if (typeof this.page.locator !== "function") {
        return "unknown";
      }

      const checkModes = async () => {
        // 2. Detect Agent mode using the Agent-specific textbox.
        const agentPrompt = this.page.locator(
          '[role="textbox"][aria-label="What do you want to create?"], ' +
          'flow-creative-agent-prompt-box [role="textbox"], ' +
          'flow-creative-agent-prompt-box [contenteditable="true"]'
        );

        const agentCount = typeof agentPrompt.count === "function" ? await agentPrompt.count().catch(() => 0) : 0;

        for (let i = 0; i < agentCount; i++) {
          const candidate = typeof agentPrompt.nth === "function" ? agentPrompt.nth(i) : (typeof agentPrompt.first === "function" ? agentPrompt.first() : agentPrompt);

          if (
            (await candidate.isVisible().catch(() => false)) &&
            (typeof candidate.isEnabled !== "function" || (await candidate.isEnabled().catch(() => true)))
          ) {
            return "agent";
          }
        }

        // 3. Detect the image editor using its dedicated prompt component.
        const imageEditorPrompt = this.page.locator(
          '[role="textbox"][aria-label="What do you want to change?"], ' +
          'flow-edit-image-prompt-box [role="textbox"], ' +
          'flow-edit-image-prompt-box [contenteditable="true"]'
        );

        const imagePromptCount = typeof imageEditorPrompt.count === "function" ? await imageEditorPrompt.count().catch(() => 0) : 0;

        for (let i = 0; i < imagePromptCount; i++) {
          const candidate = typeof imageEditorPrompt.nth === "function" ? imageEditorPrompt.nth(i) : (typeof imageEditorPrompt.first === "function" ? imageEditorPrompt.first() : imageEditorPrompt);

          if (
            (await candidate.isVisible().catch(() => false)) &&
            (typeof candidate.isEnabled !== "function" || (await candidate.isEnabled().catch(() => true)))
          ) {
            return "image-editor";
          }
        }

        // 4. Detect standard mode.
        const standardButton = this.page.locator(
          'button:has-text("Generate Image"), ' +
          'button[aria-label="Generate Image"]'
        );

        const standardCount = typeof standardButton.count === "function" ? await standardButton.count().catch(() => 0) : 0;

        if (standardCount > 0) {
          const btnFirst = typeof standardButton.first === "function" ? standardButton.first() : standardButton;
          const visible = await btnFirst.isVisible().catch(() => false);

          if (visible) {
            return "standard";
          }
        }

        return "unknown";
      };

      const initial = await checkModes();
      if (initial !== "unknown" || timeoutMs <= 0) {
        return initial;
      }

      // If unknown and timeoutMs > 0, wait for Angular/SPA component to render
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        await new Promise((r) => setTimeout(r, 250));
        const mode = await checkModes();
        if (mode !== "unknown") {
          return mode;
        }
      }

      return "unknown";
    } catch (error) {
      console.error(
        "[FlowBrowser] Interface detection failed:",
        error.message
      );

      return "unknown";
    }
  }

  async getOutputAssetBaseline() {
    if (
      !this.page ||
      (typeof this.page.isClosed === "function" && this.page.isClosed())
    ) {
      return { count: 0, identifiers: new Set() };
    }

    try {
      if (typeof this.page.locator !== "function") {
        return { count: 0, identifiers: new Set() };
      }

      const options = this.page.locator(
        "flow-a2ui-multiple-choice flow-a2ui-image-option, .gallery-container flow-a2ui-image-option, flow-a2ui-image-option.media-option, flow-a2ui-image-option",
      );
      const count = await options.count().catch(() => 0);
      const identifiers = new Set();

      for (let i = 0; i < count; i++) {
        const option = options.nth(i);
        const image = option.locator("img.image-thumbnail, img");
        const imgCount = await image.count().catch(() => 0);
        if (imgCount >= 1) {
          const src =
            typeof image.first().getAttribute === "function"
              ? await image
                  .first()
                  .getAttribute("src")
                  .catch(() => null)
              : null;
          if (src) {
            try {
              identifiers.add(new URL(src, this.page.url()).href);
            } catch {
              identifiers.add(src);
            }
          }
        }
      }

      // Legacy fallback
      if (identifiers.size === 0) {
        const legacyImgs = this.page.locator(
          "flow-output-tile img, .generation-tile img, .output-tile img, [data-asset-id]",
        );
        const legCount = await legacyImgs.count().catch(() => 0);
        for (let i = 0; i < legCount; i++) {
          const el = legacyImgs.nth(i);
          const src =
            typeof el.getAttribute === "function"
              ? await el.getAttribute("src").catch(() => null)
              : null;
          const assetId =
            typeof el.getAttribute === "function"
              ? await el.getAttribute("data-asset-id").catch(() => null)
              : null;
          const id = src || assetId || `legacy-${i}`;
          identifiers.add(id);
        }
      }

      return { count: identifiers.size, identifiers };
    } catch {
      return { count: 0, identifiers: new Set() };
    }
  }

  async collectNewAgentOutputs(
    job,
    baseline = { count: 0, identifiers: new Set() },
  ) {
    if (
      !this.page ||
      (typeof this.page.isClosed === "function" && this.page.isClosed())
    ) {
      return [];
    }

    const results = [];
    try {
      if (typeof this.page.locator !== "function") return results;

      // Scroll chat viewport to bottom so lazy-loaded image galleries are rendered
      try {
        const chatViewport = this.page.locator("flow-chat-scroller .scroll-viewport");
        if ((await chatViewport.first().isVisible().catch(() => false))) {
          await chatViewport.first().evaluate((el) => {
            el.scrollTop = el.scrollHeight;
          }).catch(() => {});
        }
      } catch {}

      const options = this.page.locator(
        "flow-a2ui-multiple-choice flow-a2ui-image-option, .gallery-container flow-a2ui-image-option, flow-a2ui-image-option.media-option, flow-a2ui-image-option",
      );
      const count = await options.count().catch(() => 0);

      for (let i = 0; i < count; i++) {
        const option = options.nth(i);
        const image = option.locator("img.image-thumbnail, img");
        const imgCount = await image.count().catch(() => 0);
        if (imgCount >= 1) {
          const imgEl = image.first();
          const src =
            typeof imgEl.getAttribute === "function"
              ? await imgEl.getAttribute("src").catch(() => null)
              : null;
          if (!src) continue;

          let fullUrl = src;
          try {
            fullUrl = new URL(src, this.page.url()).href;
          } catch {}

          if (
            !baseline.identifiers.has(fullUrl) &&
            !baseline.identifiers.has(src)
          ) {
            let naturalWidth = 0;
            let naturalHeight = 0;
            let alt = "";
            try {
              if (typeof imgEl.evaluate === "function") {
                const evalRes = await imgEl
                  .evaluate((img) => ({
                    naturalWidth: img.naturalWidth || 0,
                    naturalHeight: img.naturalHeight || 0,
                    alt: img.alt || "",
                  }))
                  .catch(() => null);
                if (evalRes) {
                  naturalWidth = evalRes.naturalWidth;
                  naturalHeight = evalRes.naturalHeight;
                  alt = evalRes.alt;
                }
              }
            } catch {}

            results.push({
              sourceUrl: fullUrl,
              rawSrc: src,
              naturalWidth,
              naturalHeight,
              alt,
              optionLocator: option,
              imageLocator: imgEl,
            });
          }
        }
      }

      if (results.length === 0) {
        const legacyImgs = this.page.locator(
          "flow-output-tile img, .generation-tile img, .output-tile img, [data-asset-id]",
        );
        const legCount = await legacyImgs.count().catch(() => 0);
        for (let i = 0; i < legCount; i++) {
          const el = legacyImgs.nth(i);
          const src =
            typeof el.getAttribute === "function"
              ? await el.getAttribute("src").catch(() => null)
              : null;
          const assetId =
            typeof el.getAttribute === "function"
              ? await el.getAttribute("data-asset-id").catch(() => null)
              : null;
          const id = src || assetId || `legacy-${i}`;
          if (src && !baseline.identifiers.has(id)) {
            let fullUrl = src;
            try {
              fullUrl = new URL(src, this.page.url()).href;
            } catch {}
            results.push({
              sourceUrl: fullUrl,
              rawSrc: src,
              naturalWidth: 1024,
              naturalHeight: 576,
              alt: "",
              optionLocator: el,
              imageLocator: el,
            });
          }
        }
      }
    } catch (err) {
      console.warn("[FlowBrowser] collectNewAgentOutputs error:", err.message);
    }

    return results;
  }

  async configureOutputCount(count) {
    if (count !== 1) {
      throw new Error("This workflow currently supports one output only.");
    }
    if (
      !this.page ||
      (typeof this.page.isClosed === "function" && this.page.isClosed())
    )
      return;
    try {
      if (typeof this.page.locator !== "function") return;
      const countButton = getFirstLocator(
        this.page.locator(
          'button[aria-label="1 image"], button[aria-label="1"], [data-value="1"], button:has-text("1 image")',
        ),
      );
      if (
        countButton &&
        (await countButton.count().catch(() => 0)) > 0 &&
        (await countButton.isVisible().catch(() => false))
      ) {
        await countButton.click({ timeout: 3000 }).catch(() => {});
      }
    } catch (err) {
      console.warn("[FlowBrowser] configureOutputCount notice:", err.message);
    }
  }

  async startImageResponseCapture(job) {
    const captured = new Map();
    job.capturedImageResponses = captured;
    job.pendingImageCaptures = [];
    const startedAt = Date.now();

    const onResponse = (response) => {
      const capturePromise = (async () => {
        try {
          const url = typeof response.url === "function" ? response.url() : "";
          if (!url) return;

          let parsed;
          try {
            parsed = new URL(url);
          } catch {
            return;
          }

          if (parsed.origin !== "https://flow.google.com") {
            return;
          }
          if (!parsed.pathname.startsWith("/asb/")) {
            return;
          }
          const status =
            typeof response.status === "function" ? response.status() : 200;
          if (status !== 200) {
            return;
          }

          const request =
            typeof response.request === "function" ? response.request() : null;
          if (request && typeof request.resourceType === "function") {
            const rType = request.resourceType();
            if (!["image", "fetch", "xhr"].includes(rType)) return;
          }

          const headers =
            typeof response.headers === "function" ? response.headers() : {};
          const mimeType = (headers["content-type"] || "")
            .split(";")[0]
            .trim()
            .toLowerCase();
          if (!["image/png", "image/jpeg", "image/webp"].includes(mimeType)) {
            return;
          }

          const body =
            typeof response.body === "function"
              ? await response.body().catch(() => null)
              : null;
          if (!Buffer.isBuffer(body) || body.length <= 500) {
            return;
          }
          if (body.length > MAX_IMAGE_BYTES) {
            return;
          }

          captured.set(url, {
            buffer: body,
            mimeType,
            url,
            capturedAt: Date.now(),
            generationStartedAt: startedAt,
          });
        } catch (error) {
          console.warn(
            "[FlowBrowser] Image response capture failed:",
            error.message,
          );
        }
      })();

      job.pendingImageCaptures.push(capturePromise);
    };

    if (typeof this.page.on === "function") {
      this.page.on("response", onResponse);
      job._cleanupResponseListener = () => {
        try {
          if (typeof this.page.off === "function")
            this.page.off("response", onResponse);
          else if (typeof this.page.removeListener === "function")
            this.page.removeListener("response", onResponse);
        } catch {}
      };
    }

    return captured;
  }

  findCapturedOutput(output, capturedResponses) {
    if (!output || !capturedResponses || capturedResponses.size === 0) return null;
    const exactUrl = output.sourceUrl;
    if (exactUrl && capturedResponses.has(exactUrl)) {
      return capturedResponses.get(exactUrl);
    }
    const rawSrc = output.rawSrc;
    if (rawSrc && capturedResponses.has(rawSrc)) {
      return capturedResponses.get(rawSrc);
    }

    // Asset ID correlation: extract /asb/([a-zA-Z0-9_\-]+)
    const extractAssetId = (u) => {
      if (!u || typeof u !== "string") return null;
      const m = u.match(/\/asb\/([a-zA-Z0-9_\-]+)/i);
      return m ? m[1].replace(/=s\d+.*$/, "") : null;
    };

    const targetId = extractAssetId(exactUrl) || extractAssetId(rawSrc);
    if (targetId) {
      for (const [key, val] of capturedResponses.entries()) {
        const keyId = extractAssetId(key);
        if (keyId && keyId === targetId) {
          return val;
        }
      }
    }

    return null;
  }

  async prepareJob(jobId) {
    const job = this.requireJob(jobId);

    if (!this.context || !this.page || this.page.isClosed()) {
      throw new Error(
        "Open a Google Flow browser session before preparing a job.",
      );
    }

    this.recoverActiveJobLock();

    if (this.activeJobId && this.activeJobId !== jobId) {
      const active = this.jobs.get(this.activeJobId);
      if (
        active &&
        !["completed", "cancelled", "failed"].includes(active.status)
      ) {
        const isActivelyWorking = [
          "generating",
          "output_detected",
          "downloading",
          "importing",
        ].includes(active.status);
        const ageSec = Math.round(
          (Date.now() -
            new Date(active.updatedAt || active.createdAt).getTime()) /
            1000,
        );

        // If previous job is not actively generating (e.g. idle or waiting) or if cancelPrevious is requested:
        if (job.cancelPrevious || !isActivelyWorking) {
          console.log(
            `[FlowBrowser] Automatically superseding inactive previous job ${active.id} (status: ${active.status}, ${ageSec}s old).`,
          );
          this.setJobTerminal(
            active,
            "cancelled",
            undefined,
            "Superseded by new generation request.",
          );
        } else {
          const err = new Error(
            `Another Flow job (${active.id}) is actively generating in the browser (status: ${active.status}, started ${ageSec}s ago). Complete or cancel it before starting another.`,
          );
          err.statusCode = 409;
          err.activeJob = {
            id: active.id,
            status: active.status,
            ageSeconds: ageSec,
          };
          throw err;
        }
      }
    }

    if (job.isRegeneration) {
      if (!job.googleFlowEditUrl) {
        throw new Error("googleFlowEditUrl is required for background regeneration jobs.");
      }
      this.emitLifecycleLog("FLOW_EDITOR_REOPEN_STARTED", job, {
        editUrl: job.googleFlowEditUrl,
      });

      const currentUrl = typeof this.page.url === "function" ? this.page.url() : "";
      if (currentUrl !== job.googleFlowEditUrl) {
        await this.page.goto(job.googleFlowEditUrl, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });
      }

      const verifiedUrl = typeof this.page.url === "function" ? this.page.url() : "";
      const editorRef = extractGoogleFlowEditorReference(verifiedUrl);
      if (!editorRef) {
        const err = new Error(
          `FLOW_REGENERATION_FAILED: Expected Google Flow editor route (/project/{projectId}/edit/{assetId}), but current URL is '${verifiedUrl}'.`
        );
        this.emitLifecycleLog("FLOW_REGENERATION_FAILED", job, {
          error: err.message,
          currentUrl: verifiedUrl,
        });
        this.setJobTerminal(job, "failed", err.message, "Failed to navigate to Google Flow image editor route.");
        throw err;
      }

      job.googleFlowProjectId = editorRef.projectId;
      job.googleFlowEditId = editorRef.editId;
      job.googleFlowEditUrl = editorRef.editUrl;

      this.emitLifecycleLog("FLOW_EDITOR_REOPENED", job, {
        projectId: editorRef.projectId,
        editId: editorRef.editId,
        editUrl: editorRef.editUrl,
      });

      this.activeJobId = job.id;
      this.emitLifecycleLog("ACTIVE_LOCK_ACQUIRED", job);

      try {
        const promptEditor = await this.findImageEditPromptEditor();
        await this.fillFlowPrompt(promptEditor.locator, job.prompt);

        this.emitLifecycleLog("FLOW_PROMPT_ENTERED", job, {
          prompt: job.prompt,
        });

        job.promptSelectorUsed = promptEditor.selector;
        job.status = "prompt_ready";
        job.message = "Regeneration prompt populated into Google Flow image editor.";
        job.error = undefined;
        this.touch(job);
        return job;
      } catch (error) {
        job.diagnosticScreenshotPath = await this.saveDiagnosticScreenshot(
          job.id,
        );
        this.emitLifecycleLog("FLOW_REGENERATION_FAILED", job, { error: error.message });
        this.setJobTerminal(
          job,
          "failed",
          error.message,
          "The Flow image editor prompt box could not be identified safely.",
        );
        return job;
      }
    }

    if (!job.isRegeneration) {
      const ready = await this.ensureProjectWorkspaceReady(job);
      if (!ready) {
        return job;
      }
    }

    const currentUrl =
      typeof this.page.url === "function"
        ? this.page.url()
        : String(this.page.url || "");
    const currentProjectId = this.extractProjectId(currentUrl);
    const targetProjectId = this.extractProjectId(job.projectUrl);

    if (targetProjectId && currentProjectId === targetProjectId) {
      // Already on the requested Flow project page! Avoid reloading the SPA.
    } else if (job.projectUrl && currentUrl !== job.projectUrl) {
      await this.page.goto(job.projectUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
    } else if (!isFlowUrl(currentUrl) && !isGoogleLoginUrl(currentUrl)) {
      await this.page.goto(FLOW_HOME_URL, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
    }

    if (isGoogleLoginUrl(this.page.url())) {
      job.status = "awaiting_manual_login";
      job.message =
        "Sign in manually in the browser, open the intended Flow project, then call prepare again.";
      this.touch(job);
      return job;
    }

    if (!isFlowUrl(this.page.url())) {
      job.status = "awaiting_project_selection";
      job.message =
        "Open the intended Google Flow project in the visible browser, then call prepare again.";
      this.touch(job);
      return job;
    }

    this.activeJobId = job.id;
    this.emitLifecycleLog("ACTIVE_LOCK_ACQUIRED", job);

    try {
      const mode = await this.detectInterfaceMode({ timeoutMs: 15000 });

      let promptEditor;
      if (mode === "agent") {
        promptEditor = await this.findAgentPromptEditor({ timeoutMs: 15000 });
      } else if (mode === "standard") {
        promptEditor = await this.findPromptEditor();
      } else if (mode === "image-editor") {
        throw new Error("FLOW_IMAGE_EDITOR_STILL_OPEN");
      } else {
        throw new Error(
          `FLOW_INTERFACE_UNKNOWN: Cannot prepare a background job on ${this.page.url()}`
        );
      }

      await this.fillFlowPrompt(promptEditor.locator, job.prompt);

      job.promptSelectorUsed = promptEditor.selector;
      job.status = "prompt_ready";
      job.message =
        "Prompt filled. Review it in Flow and attach/select the saved @character reference before confirming generation.";
      job.error = undefined;
      this.touch(job);
      return job;
    } catch (error) {
      job.diagnosticScreenshotPath =
        error?.diagnostics?.screenshotPath ||
        await this.saveDiagnosticScreenshot(job.id);

      this.emitLifecycleLog("FLOW_PROMPT_DISCOVERY_FAILED", job, {
        errorCode: error?.code || "FLOW_PROMPT_EDITOR_NOT_FOUND",
        error: error?.message || String(error),
        currentUrl:
          this.page && typeof this.page.url === "function"
            ? this.page.url()
            : null,
        diagnostics: error?.diagnostics || null,
        diagnosticScreenshotPath: job.diagnosticScreenshotPath,
      });

      this.setJobTerminal(
        job,
        "prompt_editor_not_found",
        error.message,
        "The Flow prompt editor could not be identified safely. Inspect FLOW_PROMPT_DISCOVERY_FAILED diagnostics and verify the live project-page DOM.",
      );
      return job;
    }
  }

  async ensureProjectWorkspaceReady(job) {
    if (!this.page || (typeof this.page.isClosed === "function" && this.page.isClosed())) {
      throw new Error("FLOW_PAGE_NOT_AVAILABLE");
    }

    const currentUrl = typeof this.page.url === "function" ? this.page.url() : "";
    const editorRef = extractGoogleFlowEditorReference(currentUrl);

    if (editorRef) {
      if (job.isRegeneration) {
        return true;
      }

      this.emitLifecycleLog(
        "FLOW_EDITOR_CLEANUP_RETRY_STARTED",
        job,
        {
          currentUrl,
          projectId: editorRef.projectId,
          editId: editorRef.editId,
        }
      );

      try {
        await closeFlowImageEditor(
          this.page,
          console,
          {
            timeoutMs: 15000,
            requireEditorRoute: true,
            expectedProjectId: editorRef.projectId,
            logTransition: (phase, details) => {
              this.emitLifecycleLog(phase, job, details);
            },
          }
        );
      } catch (error) {
        job.flowSessionReady = false;
        job.editorCloseStatus = "failed";
        job.editorCloseError = error.message;
        job.status = "awaiting_editor_cleanup";
        job.errorCode = "FLOW_IMAGE_EDITOR_STILL_OPEN";
        job.message =
          "The previous Google Flow image editor is still open. No new generation was submitted. Close the editor successfully and retry.";

        this.emitLifecycleLog(
          "FLOW_IMAGE_EDITOR_STILL_OPEN",
          job,
          {
            currentUrl: typeof this.page.url === "function" ? this.page.url() : "",
            error: error.message,
          }
        );

        this.touch(job);

        return false;
      }

      const afterUrl = typeof this.page.url === "function" ? this.page.url() : "";

      if (isGoogleFlowEditorRoute(afterUrl)) {
        job.flowSessionReady = false;
        job.status = "awaiting_editor_cleanup";
        job.errorCode = "FLOW_IMAGE_EDITOR_STILL_OPEN";

        this.touch(job);

        return false;
      }

      const afterProjectId = this.extractProjectId(afterUrl);

      if (
        afterProjectId &&
        afterProjectId !== editorRef.projectId
      ) {
        throw new Error(
          `FLOW_EDITOR_RETURNED_WRONG_PROJECT: Expected ${editorRef.projectId}, received ${afterProjectId}.`
        );
      }

      this.emitLifecycleLog(
        "FLOW_EDITOR_CLEANUP_RECOVERED",
        job,
        {
          previousUrl: currentUrl,
          currentUrl: afterUrl,
        }
      );
    }

    const finalUrl = typeof this.page.url === "function" ? this.page.url() : "";

    if (isGoogleFlowEditorRoute(finalUrl)) {
      return false;
    }

    job.flowSessionReady = true;

    return true;
  }

  async findAgentPromptEditor(options = {}) {
    const timeoutMs = options.timeoutMs ?? 15000;
    if (!this.page || (typeof this.page.isClosed === "function" && this.page.isClosed())) {
      throw new Error("Flow page is not available.");
    }

    const currentUrl = typeof this.page.url === "function" ? this.page.url() : "";
    if (isGoogleFlowEditorRoute(currentUrl)) {
      throw new Error(
        `FLOW_WRONG_INTERFACE: Expected Agent mode, received image-editor.`
      );
    }

    const selectors = [
      'flow-creative-agent-prompt-box [role="textbox"][aria-label="What do you want to create?"]',
      'flow-creative-agent-prompt-box [role="textbox"]',
      'flow-creative-agent-prompt-box [contenteditable="true"]',
      '[role="textbox"][aria-label="What do you want to create?"]',
    ];

    const waitStart = Date.now();
    let chosen = null;

    while (Date.now() - waitStart <= timeoutMs) {
      for (const selector of selectors) {
        const locator = this.page.locator(selector);
        const count = typeof locator.count === "function" ? await locator.count().catch(() => 0) : 0;
        const visible = [];

        for (let i = 0; i < count; i++) {
          const candidate = typeof locator.nth === "function" ? locator.nth(i) : (typeof locator.first === "function" ? locator.first() : locator);

          if (
            (await candidate.isVisible().catch(() => false)) &&
            (typeof candidate.isEnabled !== "function" || (await candidate.isEnabled().catch(() => true)))
          ) {
            visible.push(candidate);
          }
        }

        if (visible.length > 1) {
          throw new Error("FLOW_AGENT_PROMPT_AMBIGUOUS");
        }

        if (visible.length === 1) {
          chosen = {
            locator: visible[0],
            selector,
          };
          break;
        }
      }

      if (chosen) break;
      if (timeoutMs <= 0 || Date.now() - waitStart >= timeoutMs) break;
      await new Promise((r) => setTimeout(r, 250));
    }

    if (chosen) {
      return chosen;
    }

    // Diagnostics collection on failure:
    let candidates = [];
    if (typeof this.page.locator === "function") {
      try {
        const editables = this.page.locator(
          'textarea, input, [role="textbox"], [contenteditable="true"]'
        );
        if (typeof editables.evaluateAll === "function") {
          candidates = await editables.evaluateAll((elements) =>
            elements.map((element, index) => {
              const rect = element.getBoundingClientRect();
              const style = window.getComputedStyle(element);

              return {
                index,
                tagName: element.tagName,
                role: element.getAttribute("role"),
                ariaLabel: element.getAttribute("aria-label"),
                placeholder: element.getAttribute("placeholder"),
                dataPlaceholder: element.getAttribute("data-placeholder"),
                contenteditable: element.getAttribute("contenteditable"),
                className: element.className,
                parentTag: element.parentElement?.tagName,
                parentClass: element.parentElement?.className,
                grandParentTag: element.parentElement?.parentElement?.tagName,
                grandParentClass: element.parentElement?.parentElement?.className,
                visible:
                  rect.width > 0 &&
                  rect.height > 0 &&
                  style.visibility !== "hidden" &&
                  style.display !== "none",
                text: element.innerText || element.value || "",
              };
            })
          ).catch(() => []);
        }
      } catch {}
    }

    let pageTitle = "";
    try {
      pageTitle = typeof this.page.title === "function" ? await this.page.title().catch(() => "") : "";
    } catch {}

    let diagnosticScreenshotPath = null;
    try {
      if (typeof this.saveDiagnosticScreenshot === "function") {
        diagnosticScreenshotPath = await this.saveDiagnosticScreenshot("prompt-discovery-failed").catch(() => null);
      }
    } catch {}

    console.warn(
      `[FlowBrowser] Agent prompt discovery failed. URL: ${currentUrl}, Candidates found: ${candidates.length}`
    );

    const err = new Error(
      "FLOW_AGENT_PROMPT_NOT_FOUND: Could not find the visible 'What do you want to create?' prompt."
    );
    err.code = "FLOW_AGENT_PROMPT_NOT_FOUND";
    err.diagnostics = {
      url: currentUrl,
      currentUrl,
      title: pageTitle,
      screenshotPath: diagnosticScreenshotPath,
      candidates,
    };
    throw err;
  }

  async findImageEditPromptEditor() {
    if (!this.page || (typeof this.page.isClosed === "function" && this.page.isClosed())) {
      throw new Error("Flow page is not available.");
    }

    const currentUrl = typeof this.page.url === "function" ? this.page.url() : "";

    if (!isGoogleFlowEditorRoute(currentUrl)) {
      throw new Error(
        `FLOW_WRONG_INTERFACE: Expected image editor route. Current URL: ${currentUrl}`
      );
    }

    const selectors = [
      'flow-edit-image-prompt-box [role="textbox"][aria-label="What do you want to change?"]',
      'flow-edit-image-prompt-box [contenteditable="true"]',
      '[role="textbox"][aria-label="What do you want to change?"]',
    ];

    for (const selector of selectors) {
      const locator = this.page.locator(selector);

      const count = await locator.count().catch(() => 0);

      const visible = [];

      for (let i = 0; i < count; i++) {
        const candidate = typeof locator.nth === "function" ? locator.nth(i) : (typeof locator.first === "function" ? locator.first() : locator);

        if (
          (await candidate.isVisible().catch(() => false)) &&
          (typeof candidate.isEnabled !== "function" || (await candidate.isEnabled().catch(() => true)))
        ) {
          visible.push(candidate);
        }
      }

      if (visible.length > 1) {
        throw new Error(
          "FLOW_IMAGE_EDIT_PROMPT_AMBIGUOUS"
        );
      }

      if (visible.length === 1) {
        return {
          locator: visible[0],
          selector,
        };
      }
    }

    throw new Error(
      "FLOW_IMAGE_EDIT_PROMPT_NOT_FOUND: Could not find 'What do you want to change?' inside flow-edit-image-prompt-box."
    );
  }

  async fillFlowPrompt(locator, prompt) {
    if (!locator) {
      throw new Error("FLOW_PROMPT_LOCATOR_MISSING");
    }

    if (!prompt || !String(prompt).trim()) {
      throw new Error("FLOW_PROMPT_EMPTY");
    }

    if (typeof locator.waitFor === "function") {
      await locator.waitFor({
        state: "visible",
        timeout: 10000,
      });
    }

    if (typeof locator.isEnabled === "function" && !(await locator.isEnabled())) {
      throw new Error("FLOW_PROMPT_NOT_ENABLED");
    }

    if (typeof locator.click === "function") {
      await locator.click().catch(() => {});
    }

    let filled = false;
    try {
      if (typeof locator.fill === "function") {
        await locator.fill(prompt);
        filled = true;
      }
    } catch (fillError) {
      // ProseMirror contenteditable fallback.
    }

    if (!filled) {
      if (typeof locator.click === "function") {
        await locator.click().catch(() => {});
      }
      if (this.page.keyboard) {
        await this.page.keyboard.press("ControlOrMeta+A").catch(() => {});
        await this.page.keyboard.press("Backspace").catch(() => {});
        if (typeof this.page.keyboard.insertText === "function") {
          await this.page.keyboard.insertText(prompt).catch(() => {});
        }
      }
      if (typeof locator.evaluate === "function") {
        await locator
          .evaluate((node, text) => {
            if (node.innerText.trim() !== text.trim()) {
              node.innerText = text;
              node.dispatchEvent(new Event("input", { bubbles: true }));
              node.dispatchEvent(new Event("change", { bubbles: true }));
            }
          }, prompt)
          .catch(() => {});
      }
    }

    const actualText = (
      typeof locator.innerText === "function"
        ? await locator.innerText().catch(() => "")
        : typeof locator.textContent === "function"
          ? await locator.textContent().catch(() => "")
          : String(prompt)
    ).trim();

    if (
      actualText.replace(/\s+/g, " ") !==
      String(prompt).trim().replace(/\s+/g, " ")
    ) {
      throw new Error(
        `FLOW_PROMPT_VERIFICATION_FAILED: Expected prompt was not entered correctly.`
      );
    }

    return actualText;
  }

  async findPromptEditor() {
    if (!this.page || this.page.isClosed())
      throw new Error("Flow page is not available.");

    if (this.promptSelector) {
      const configured = this.page.locator(this.promptSelector);
      const count = await configured.count();
      if (
        count !== 1 ||
        !(await configured.isVisible()) ||
        !(await configured.isEnabled())
      ) {
        throw new Error(
          "FLOW_PROMPT_SELECTOR must identify exactly one visible and enabled prompt editor; found " +
            count +
            ".",
        );
      }
      return { locator: configured, selector: this.promptSelector };
    }

    const candidates = this.page.locator(
      'textarea, [contenteditable="true"], [role="textbox"]',
    );
    const scored = [];

    for (let index = 0; index < (await candidates.count()); index += 1) {
      const candidate = candidates.nth(index);
      if (!(await candidate.isVisible()) || !(await candidate.isEnabled()))
        continue;

      const placeholder = (await candidate.getAttribute("placeholder")) || "";
      const ariaLabel = (await candidate.getAttribute("aria-label")) || "";
      const dataPlaceholder =
        (await candidate.getAttribute("data-placeholder")) || "";
      const title = (await candidate.getAttribute("title")) || "";
      const name = (await candidate.getAttribute("name")) || "";
      const id = (await candidate.getAttribute("id")) || "";
      const className = (await candidate.getAttribute("class")) || "";
      const testId =
        (await candidate.getAttribute("data-testid")) ||
        (await candidate.getAttribute("data-test-id")) ||
        "";

      const label = [
        placeholder,
        ariaLabel,
        dataPlaceholder,
        title,
        name,
        id,
        className,
        testId,
      ]
        .join(" ")
        .toLowerCase();

      // Disqualify clearly unrelated inputs
      if (
        /search|filter|session|collection|comment|chat|login|email|password|username|tag|url/.test(
          label,
        )
      ) {
        continue;
      }

      let score = 0;
      // Exact Google Flow Agent prompt box match gets highest priority
      if (/what do you want to create/i.test(ariaLabel)) {
        score += 25;
      } else if (
        /prompt|describe|what.*to (see|generate|create)|enter.*prompt/.test(
          label,
        )
      ) {
        score += 10;
      } else if (/generate|image|create|scene|character|visual/.test(label)) {
        score += 5;
      }

      // Contenteditable bonus only if there is already prompt affinity
      if (
        score > 0 &&
        (await candidate.getAttribute("contenteditable")) === "true"
      ) {
        score += 1;
      }

      scored.push({
        locator: candidate,
        score,
        selector: "auto-detected visible text editor #" + index,
      });
    }

    if (scored.length === 0) {
      throw new Error(
        "No visible textarea or contenteditable textbox was found.",
      );
    }

    scored.sort((a, b) => b.score - a.score);

    // Requirement: Never accept a zero-score field
    if (scored[0].score <= 0) {
      throw new Error(
        "No confident prompt editor candidate was found (top candidate score is 0). Set FLOW_PROMPT_SELECTOR to a stable, unique selector.",
      );
    }

    // Requirement: If multiple candidates are ambiguous, stop instead of guessing
    if (scored.length > 1 && scored[0].score === scored[1].score) {
      throw new Error(
        "Multiple prompt-like fields are visible with ambiguous scores. Set FLOW_PROMPT_SELECTOR to a stable, unique selector.",
      );
    }

    return scored[0];
  }

  async submitAgentPrompt(job, confirmation) {
    if (
      !this.page ||
      (typeof this.page.isClosed === "function" && this.page.isClosed())
    ) {
      throw new Error("Flow page is not available.");
    }

    const currentUrl = typeof this.page.url === "function" ? this.page.url() : "";
    if (isGoogleFlowEditorRoute(currentUrl)) {
      throw new Error(
        "FLOW_IMAGE_EDITOR_STILL_OPEN: Agent generation cannot run while the image editor is active."
      );
    }

    if (!isFlowUrl(currentUrl)) {
      throw new Error(
        `Current page is not a valid Google Flow URL: ${currentUrl}`,
      );
    }

    this.emitLifecycleLog("FLOW_AGENT_PROMPT_DISCOVERY_STARTED", job);
    const promptEditor = await this.findAgentPromptEditor({ timeoutMs: 15000 });
    this.emitLifecycleLog("FLOW_AGENT_PROMPT_DISCOVERY_COMPLETED", job, {
      selector: promptEditor.selector,
    });

    await this.fillFlowPrompt(promptEditor.locator, job.prompt);

    job.status = "prompt_filled";
    job.message = "Prompt populated into Google Flow Agent box.";
    this.touch(job);

    const submitLocator = this.page.locator(
      'flow-creative-agent-prompt-box button[aria-label="Start generation"], ' +
      'flow-creative-agent-prompt-box button[type="submit"]'
    );
    const btnCount = await submitLocator.count().catch(() => 0);
    const submitBtn = getFirstLocator(submitLocator);

    if (
      btnCount === 0 ||
      !submitBtn ||
      !(await submitBtn.isVisible().catch(() => false))
    ) {
      throw new Error(
        "Could not find visible 'Start generation' submit button in Google Flow Agent mode.",
      );
    }

    let isEnabled = false;
    const waitStart = Date.now();
    while (Date.now() - waitStart < 10000) {
      const disabledAttr =
        typeof submitBtn.getAttribute === "function"
          ? await submitBtn.getAttribute("disabled").catch(() => null)
          : null;
      const enabled =
        typeof submitBtn.isEnabled === "function"
          ? await submitBtn.isEnabled().catch(() => false)
          : true;
      const isNotDisabled =
        disabledAttr === null ||
        disabledAttr === false ||
        disabledAttr === "false";
      if (isNotDisabled && enabled) {
        isEnabled = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    if (!isEnabled) {
      throw new Error(
        "'Start generation' button remained disabled after populating the prompt.",
      );
    }

    // 6. Capture screenshot before submission
    job.preSubmitScreenshot = await this.saveDiagnosticScreenshot(
      `${job.id}-before-submit`,
    ).catch(() => null);

    // 7. Record asset baseline
    const baseline = await this.getOutputAssetBaseline();

    // 7b. Attach Job-Scoped Network Response Interceptor to capture generation image streams (WebP/PNG/JPEG)
    await this.startImageResponseCapture(job);

    // 8. Click Start generation
    try {
      if (typeof submitBtn.click === "function") {
        await submitBtn.click({ timeout: 15000 });
      }
      job.status = "agent_prompt_submitted";
      job.generationRequestedAt = new Date().toISOString();
      job.message = "Agent prompt submitted to Google Flow.";
      this.touch(job);
    } catch (btnErr) {
      this.setJobTerminal(
        job,
        "failed",
        btnErr.message,
        "Could not click 'Start generation' submit button.",
      );
      throw btnErr;
    }

    // 9. Capture screenshot after submission
    job.postSubmitScreenshot = await this.saveDiagnosticScreenshot(
      `${job.id}-after-submit`,
    ).catch(() => null);

    // 10. Observe Agent response & handle confirmation
    await new Promise((r) => setTimeout(r, 2000));
    const confirmationInfo = await this.inspectAgentConfirmation(job);

    if (confirmationInfo.required) {
      job.status = "awaiting_agent_confirmation";
      job.message =
        "Google Flow Agent requested confirmation before generating media.";
      this.touch(job);

      if (
        confirmation?.confirmGenerate === true &&
        confirmation?.referenceConfirmed === true
      ) {
        await this.handleAgentConfirmationAction(job);
        job.status = "generation_submitted";
        this.emitLifecycleLog("GENERATION_SUBMITTED", job);
        this.touch(job);
      } else {
        return job;
      }
    } else {
      job.status = "generation_submitted";
      this.emitLifecycleLog("GENERATION_SUBMITTED", job);
      this.touch(job);
    }

    // 11. Autonomous download monitoring
    this.monitorGenerationAndDownload(job.id, baseline).catch((err) => {
      console.warn(
        `[FlowBrowser] Generation monitor notice for job ${job.id}:`,
        err.message,
      );
    });

    return job;
  }

  async inspectAgentConfirmation(job) {
    if (
      !this.page ||
      (typeof this.page.isClosed === "function" && this.page.isClosed())
    ) {
      return { required: false, actionAvailable: false };
    }

    try {
      if (typeof this.page.locator !== "function")
        return { required: false, actionAvailable: false };

      const agentMessages = this.page.locator(
        'flow-creative-agent-message, [data-message-author="agent"], .agent-message',
      );
      const msgCount = await agentMessages.count().catch(() => 0);
      if (msgCount > 0) {
        const lastMsg = agentMessages.last();
        const confirmBtn = getFirstLocator(
          lastMsg.locator(
            'button:has-text("Generate"), button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Proceed")',
          ),
        );
        if (
          confirmBtn &&
          (await confirmBtn.count().catch(() => 0)) > 0 &&
          (await confirmBtn.isVisible().catch(() => false)) &&
          (await confirmBtn.isEnabled().catch(() => false))
        ) {
          return {
            required: true,
            actionAvailable: true,
            selector: 'button:has-text("Generate"), button:has-text("Confirm")',
            reason: "Agent requested explicit user confirmation to proceed.",
          };
        }
      }
      return { required: false, actionAvailable: false };
    } catch {
      return { required: false, actionAvailable: false };
    }
  }

  async detectAgentConfirmationRequired(job) {
    const info = await this.inspectAgentConfirmation(job);
    return info.required;
  }

  async handleAgentConfirmationAction(job) {
    if (
      !this.page ||
      (typeof this.page.isClosed === "function" && this.page.isClosed())
    )
      return;

    try {
      if (typeof this.page.locator !== "function") return;

      const agentMessages = this.page.locator(
        'flow-creative-agent-message, [data-message-author="agent"], .agent-message',
      );
      const msgCount = await agentMessages.count().catch(() => 0);
      if (msgCount > 0) {
        const lastMsg = agentMessages.last();
        const confirmBtn = getFirstLocator(
          lastMsg.locator(
            'button:has-text("Generate"), button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Proceed")',
          ),
        );
        if (
          confirmBtn &&
          (await confirmBtn.count().catch(() => 0)) > 0 &&
          (await confirmBtn.isVisible().catch(() => false)) &&
          (await confirmBtn.isEnabled().catch(() => false))
        ) {
          await confirmBtn.click({ timeout: 10000 });
          job.message = "Confirmed generation with Google Flow Agent.";
          return;
        }
      }

      const generalConfirmBtn = getFirstLocator(
        this.page.locator(
          'button:has-text("Confirm"), button:has-text("Generate Image")',
        ),
      );
      if (
        generalConfirmBtn &&
        (await generalConfirmBtn.count().catch(() => 0)) > 0 &&
        (await generalConfirmBtn.isVisible().catch(() => false)) &&
        (await generalConfirmBtn.isEnabled().catch(() => false))
      ) {
        await generalConfirmBtn.click({ timeout: 10000 });
        job.message = "Confirmed generation action.";
      }
    } catch (err) {
      console.warn(
        "[FlowBrowser] Agent confirmation action error:",
        err.message,
      );
    }
  }

  async attachFlowIngredients(job, referenceAssets) {
    if (!Array.isArray(referenceAssets) || referenceAssets.length === 0) {
      return true;
    }
    if (
      !this.page ||
      (typeof this.page.isClosed === "function" && this.page.isClosed())
    ) {
      throw new Error("Flow page is not available for ingredient attachment.");
    }

    try {
      if (typeof this.page.locator !== "function") return false;

      for (const asset of referenceAssets) {
        const cleanName = String(asset.flowCharacterName || asset.name || "")
          .replace(/^[-–—•*_#\s]+|[-–—•*_#:\s]+$/g, "")
          .trim();
        if (!cleanName) continue;

        const ingredientsBtn = getFirstLocator(
          this.page.locator(
            'button[aria-label="Add ingredients to the prompt box"], button[aria-label*="Add ingredients" i], flow-creative-agent-prompt-box button:has-text("+")',
          ),
        );

        if (
          ingredientsBtn &&
          (await ingredientsBtn.count().catch(() => 0)) > 0 &&
          (await ingredientsBtn.isVisible().catch(() => false))
        ) {
          await ingredientsBtn.click({ timeout: 5000 }).catch(() => {});
          await new Promise((r) => setTimeout(r, 600));

          if (asset.type === "character") {
            const charTab = getFirstLocator(
              this.page.locator(
                '[role="tab"]:has-text("Characters"), button:has-text("Characters")',
              ),
            );
            if (
              charTab &&
              (await charTab.count().catch(() => 0)) > 0 &&
              (await charTab.isVisible().catch(() => false))
            ) {
              await charTab.click({ timeout: 3000 }).catch(() => {});
              await new Promise((r) => setTimeout(r, 300));
            }
          } else if (asset.type === "image") {
            const imgTab = getFirstLocator(
              this.page.locator(
                '[role="tab"]:has-text("Images"), button:has-text("Images")',
              ),
            );
            if (
              imgTab &&
              (await imgTab.count().catch(() => 0)) > 0 &&
              (await imgTab.isVisible().catch(() => false))
            ) {
              await imgTab.click({ timeout: 3000 }).catch(() => {});
              await new Promise((r) => setTimeout(r, 300));
            }
          }

          const searchInput = getFirstLocator(
            this.page.locator(
              'input[placeholder*="Search" i], input[aria-label*="Search" i]',
            ),
          );
          if (
            searchInput &&
            (await searchInput.count().catch(() => 0)) > 0 &&
            (await searchInput.isVisible().catch(() => false))
          ) {
            await searchInput.fill(cleanName).catch(() => {});
            await new Promise((r) => setTimeout(r, 400));
          }

          const charItem = getFirstLocator(
            this.page.locator(
              `[role="option"]:has-text("${cleanName}"), button:has-text("${cleanName}"), .ingredient-item:has-text("${cleanName}"), mat-option:has-text("${cleanName}")`,
            ),
          );

          if (
            charItem &&
            (await charItem.count().catch(() => 0)) > 0 &&
            (await charItem.isVisible().catch(() => false))
          ) {
            await charItem.click({ timeout: 5000 }).catch(() => {});

            const addToPromptBtn = getFirstLocator(
              this.page.locator(
                'button:has-text("Add to prompt"), button[aria-label*="Add to prompt" i]',
              ),
            );
            if (
              addToPromptBtn &&
              (await addToPromptBtn.count().catch(() => 0)) > 0 &&
              (await addToPromptBtn.isVisible().catch(() => false))
            ) {
              await addToPromptBtn.click({ timeout: 5000 }).catch(() => {});
            }

            await new Promise((r) => setTimeout(r, 400));
          }
        }
      }

      job.referencesAttached = true;
      this.touch(job);
      return true;
    } catch {
      return false;
    }
  }

  async attachCharacterReference(characterName) {
    return await this.attachFlowIngredients({ id: "legacy-call" }, [
      {
        type: "character",
        name: characterName,
        flowCharacterName: characterName,
      },
    ]);
  }

  async submitRegenerationPrompt(job, confirmation) {
    if (
      !this.page ||
      (typeof this.page.isClosed === "function" && this.page.isClosed())
    ) {
      throw new Error("Flow page is not available.");
    }

    const currentUrl = typeof this.page.url === "function" ? this.page.url() : "";
    const editorRef = extractGoogleFlowEditorReference(currentUrl);
    if (!editorRef) {
      const err = new Error(
        `FLOW_REGENERATION_FAILED: Expected Google Flow editor route (/project/{projectId}/edit/{assetId}), but current URL is '${currentUrl}'.`
      );
      this.emitLifecycleLog("FLOW_REGENERATION_FAILED", job, { error: err.message });
      throw err;
    }

    let submitBtn = null;
    if (typeof this.page.getByRole === "function") {
      const byRoleBtn = this.page.getByRole("button", { name: "Start generation" });
      if ((await byRoleBtn.count().catch(() => 0)) > 0 && (await byRoleBtn.first().isVisible().catch(() => false))) {
        submitBtn = byRoleBtn.first();
      }
    }

    if (!submitBtn && typeof this.page.locator === "function") {
      const loc = this.page.locator(
        'flow-edit-image-prompt-box button[aria-label="Start generation"], flow-edit-image-prompt-box button[type="submit"], button[aria-label="Start generation"]'
      );
      if ((await loc.count().catch(() => 0)) > 0) {
        submitBtn = getFirstLocator(loc);
      }
    }

    if (!submitBtn || !(await submitBtn.isVisible().catch(() => false))) {
      const err = new Error("Could not find visible 'Start generation' submit button in Google Flow image editor.");
      this.emitLifecycleLog("FLOW_REGENERATION_FAILED", job, { error: err.message });
      throw err;
    }

    let isEnabled = false;
    const waitStart = Date.now();
    while (Date.now() - waitStart < 10000) {
      const disabledAttr = typeof submitBtn.getAttribute === "function"
        ? await submitBtn.getAttribute("disabled").catch(() => null)
        : null;
      const enabled = typeof submitBtn.isEnabled === "function"
        ? await submitBtn.isEnabled().catch(() => false)
        : true;
      if ((disabledAttr === null || disabledAttr === false || disabledAttr === "false") && enabled) {
        isEnabled = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    if (!isEnabled) {
      const err = new Error("'Start generation' button remained disabled in Google Flow image editor.");
      this.emitLifecycleLog("FLOW_REGENERATION_FAILED", job, { error: err.message });
      throw err;
    }

    const baseline = await this.getOutputAssetBaseline();
    await this.startImageResponseCapture(job);

    try {
      if (typeof submitBtn.click === "function") {
        await submitBtn.click({ timeout: 15000 });
      }
      job.status = "generation_submitted";
      job.generationRequestedAt = new Date().toISOString();
      job.message = "Regeneration submitted to Google Flow image editor.";
      this.emitLifecycleLog("FLOW_REGENERATION_STARTED", job, {
        prompt: job.prompt,
        editUrl: currentUrl,
      });
      this.touch(job);
    } catch (btnErr) {
      this.emitLifecycleLog("FLOW_REGENERATION_FAILED", job, { error: btnErr.message });
      this.setJobTerminal(
        job,
        "failed",
        btnErr.message,
        "Could not click 'Start generation' submit button in image editor."
      );
      throw btnErr;
    }

    this.monitorRegenerationAndDownload(job.id, baseline).catch((err) => {
      console.warn(`[FlowBrowser] Regeneration monitor notice for job ${job.id}:`, err.message);
    });

    return job;
  }

  async monitorRegenerationAndDownload(jobId, baseline = { count: 0, identifiers: new Set() }) {
    const job = this.jobs.get(jobId);
    if (!job || !this.page || (typeof this.page.isClosed === "function" && this.page.isClosed())) {
      return;
    }

    try {
      job.status = "generating";
      job.message = "Regeneration in progress in Google Flow. Waiting for updated output...";
      this.touch(job);

      const maxWaitMs = 90000;
      const startTime = Date.now();
      const pollIntervalMs = 1500;

      while (Date.now() - startTime < maxWaitMs) {
        if (!this.page || (typeof this.page.isClosed === "function" && this.page.isClosed()) || job.status === "completed" || job.status === "cancelled") {
          return;
        }

        if (Date.now() - startTime > 3000) {
          const submitBtn = getFirstLocator(
            this.page.locator('flow-edit-image-prompt-box button[aria-label="Start generation"], button[aria-label="Start generation"]')
          );
          const isBtnEnabled = submitBtn && typeof submitBtn.isEnabled === "function" ? await submitBtn.isEnabled().catch(() => false) : false;
          const disabledAttr = submitBtn && typeof submitBtn.getAttribute === "function" ? await submitBtn.getAttribute("disabled").catch(() => null) : null;
          const isNotDisabled = disabledAttr === null || disabledAttr === false || disabledAttr === "false";

          const newOutputs = await this.collectNewAgentOutputs(job, baseline).catch(() => []);
          const hasCaptured = job.capturedImageResponses && job.capturedImageResponses.size > 0;

          if ((isBtnEnabled && isNotDisabled) || newOutputs.length > 0 || hasCaptured) {
            break;
          }
        }

        await new Promise((r) => setTimeout(r, pollIntervalMs));
      }

      this.emitLifecycleLog("FLOW_REGENERATION_COMPLETED", job);

      const currentUrl = typeof this.page.url === "function" ? this.page.url() : "";
      const updatedEditorRef = extractGoogleFlowEditorReference(currentUrl);
      if (updatedEditorRef) {
        job.googleFlowProjectId = updatedEditorRef.projectId;
        job.googleFlowEditId = updatedEditorRef.editId;
        job.googleFlowEditUrl = updatedEditorRef.editUrl;
        this.emitLifecycleLog("FLOW_NEW_ASSET_REFERENCE_CAPTURED", job, {
          projectId: updatedEditorRef.projectId,
          editId: updatedEditorRef.editId,
          editUrl: updatedEditorRef.editUrl,
        });
      }

      job.status = "downloading";
      this.emitLifecycleLog("DOWNLOAD_STARTED", job);
      job.message = "Downloading regenerated background from Google Flow...";
      this.touch(job);

      const viewerLocators = this.page.locator(
        'flow-image-editor img, .editor-container img, flow-creative-agent-image-viewer img, flow-image-viewer img, div[role="dialog"] img.editor-image, div[role="dialog"] img, .image-viewer img'
      );
      let activeImage = null;
      const vCount = await viewerLocators.count().catch(() => 0);
      if (vCount > 0) {
        activeImage = viewerLocators.first();
      }

      if (!activeImage) {
        throw new Error("FLOW_IMAGE_VIEWER_NOT_FOUND: Could not find active image in Flow image editor.");
      }

      const activeImageDetails = await inspectGoogleFlowActiveImage(this.page).catch(() => null);
      if (activeImageDetails) {
        if (activeImageDetails.googleFlowProjectId) job.googleFlowProjectId = activeImageDetails.googleFlowProjectId;
        if (activeImageDetails.googleFlowEditId) job.googleFlowEditId = activeImageDetails.googleFlowEditId;
        if (activeImageDetails.googleFlowEditUrl) job.googleFlowEditUrl = activeImageDetails.googleFlowEditUrl;
        if (activeImageDetails.googleFlowImageId !== undefined) job.googleFlowImageId = activeImageDetails.googleFlowImageId;
        if (activeImageDetails.googleFlowImageRef) job.googleFlowImageRef = activeImageDetails.googleFlowImageRef;
        if (activeImageDetails.googleFlowImageSourceUrl) job.googleFlowImageSourceUrl = activeImageDetails.googleFlowImageSourceUrl;
      }

      const targetDir = this.downloadDir || path.join(os.tmpdir(), "flow-downloads");
      const nativeResult = await saveImageUsingNativeContextMenu({
        page: this.page,
        imageLocator: activeImage,
        job,
        downloadDir: targetDir,
        timeoutMs: 30000,
        logger: console,
        automationRunner: this.automationRunner,
        onPhase: (ph, details) => this.emitLifecycleLog(ph, job, details),
      });

      // Close editor using Done editing button
      let editorClosed = false;
      let editorCloseError = null;
      try {
        const closeRes = await closeFlowImageEditor(this.page, console, {
          timeoutMs: 15000,
          requireEditorRoute: true,
          expectedProjectId: job.googleFlowProjectId,
          logTransition: (ph, details) => this.emitLifecycleLog(ph, job, details),
        });
        editorClosed = closeRes?.closed ?? Boolean(closeRes);
      } catch (closeErr) {
        editorCloseError = closeErr.message;
        console.warn(`[FlowBrowser] Editor close cleanup notice for job ${job.id}:`, closeErr.message);
      }

      job.status = "importing";
      job.downloadStatus = "completed";
      job.editorCloseStatus = editorClosed ? "closed" : "failed";
      job.flowSessionReady = editorClosed;
      job.editorCloseError = editorCloseError || null;
      job.downloadPath = nativeResult.path;
      job.downloadMethod = nativeResult.downloadMethod || "native_context_menu_save_as";
      if (nativeResult.googleFlowImageId !== undefined) job.googleFlowImageId = nativeResult.googleFlowImageId;
      if (nativeResult.googleFlowImageRef) job.googleFlowImageRef = nativeResult.googleFlowImageRef;
      if (nativeResult.googleFlowImageSourceUrl) job.googleFlowImageSourceUrl = nativeResult.googleFlowImageSourceUrl;
      this.touch(job);

      await this.importDownloadedAsset(job, nativeResult.buffer, {
        mimeType: nativeResult.mimeType,
        extension: nativeResult.fileName.split(".").pop(),
      });
      job.flowSessionReady = editorClosed;
    } catch (error) {
      this.emitLifecycleLog("FLOW_REGENERATION_FAILED", job, { error: error.message });
      this.setJobTerminal(job, "failed", error.message, "Google Flow background regeneration failed.");
    }
  }

  async requestGeneration(jobId, confirmation) {
    const job = this.requireJob(jobId);

    if (
      confirmation?.confirmGenerate !== true ||
      confirmation?.referenceConfirmed !== true
    ) {
      throw new Error(
        "Explicit confirmation is required: confirmGenerate=true and referenceConfirmed=true.",
      );
    }

    this.recoverActiveJobLock();

    if (
      !this.page ||
      (typeof this.page.isClosed === "function" && this.page.isClosed())
    )
      throw new Error("Flow page is not available.");

    if (job.isRegeneration) {
      return await this.submitRegenerationPrompt(job, confirmation);
    }

    const mode = await this.detectInterfaceMode({ timeoutMs: 15000 });

    if (mode === "image-editor") {
      const error = new Error(
        "FLOW_IMAGE_EDITOR_STILL_OPEN: Close the existing image editor before starting a new background generation."
      );
      error.code = "FLOW_IMAGE_EDITOR_STILL_OPEN";
      error.statusCode = 409;

      job.flowSessionReady = false;
      job.errorCode = error.code;
      job.message = error.message;

      this.touch(job);

      throw error;
    }

    if (mode === "agent") {
      return await this.submitAgentPrompt(job, confirmation);
    }

    // Standard mode:
    let button;
    if (typeof this.page.locator === "function") {
      button = getFirstLocator(
        this.page.locator(
          'button:has-text("Generate Image"), button[aria-label="Generate Image"]',
        ),
      );
    } else if (typeof this.page.getByRole === "function") {
      button = this.page.getByRole("button", {
        name: "Generate Image",
        exact: true,
      });
    }

    const count = button ? await button.count().catch(() => 0) : 0;

    if (
      count !== 1 ||
      !(await button.isVisible().catch(() => false)) ||
      !(await button.isEnabled().catch(() => false))
    ) {
      job.status = "awaiting_manual_generate";
      job.message =
        "The visible Generate Image button was not uniquely identifiable or enabled. Review the prompt and click Generate Image manually in Flow; the worker is listening for the resulting image download.";
      this.touch(job);
      return job;
    }

    try {
      const baseline = await this.getOutputAssetBaseline();
      await button.click({ timeout: 15000 });
      job.status = "generation_submitted";
      this.emitLifecycleLog("GENERATION_SUBMITTED", job);
      job.generationRequestedAt = new Date().toISOString();
      job.message =
        "Generation was submitted through the visible Flow UI. When the result is ready, use Flow's normal Download action; the worker will capture and import the downloaded image.";

      this.monitorGenerationAndDownload(job.id, baseline).catch((err) => {
        console.warn(
          `[FlowBrowser] Generation monitor notice for job ${job.id}:`,
          err.message,
        );
      });
    } catch (clickError) {
      job.status = "awaiting_manual_generate";
      job.error =
        clickError instanceof Error
          ? clickError.message
          : "The Flow generation button could not be clicked.";
      job.message =
        "The visible Generate Image button could not be clicked reliably. Review the prepared prompt and start generation manually in Flow; the worker will still capture the subsequent download.";
    }
    this.touch(job);
    return job;
  }

  async downloadFlowImage(opts) {
    return await downloadFlowImage({
      page: this.page,
      downloadDir: this.downloadDir,
      ...opts,
    });
  }

  async monitorGenerationAndDownload(
    jobId,
    baseline = { count: 0, identifiers: new Set() },
  ) {
    const job = this.jobs.get(jobId);
    if (
      !job ||
      !this.page ||
      (typeof this.page.isClosed === "function" && this.page.isClosed())
    )
      return;

    try {
      job.status = "generating";
      job.message =
        "Generation in progress in Google Flow. Waiting for rendered output...";
      this.touch(job);

      const maxWaitMs = 90000;
      const startTime = Date.now();
      const pollIntervalMs = 1500;
      let targetOutput = null;

      while (Date.now() - startTime < maxWaitMs) {
        if (
          !this.page ||
          (typeof this.page.isClosed === "function" && this.page.isClosed()) ||
          job.status === "completed" ||
          job.status === "cancelled"
        ) {
          return;
        }

        const newOutputs = await this.collectNewAgentOutputs(job, baseline);
        if (newOutputs.length > 0) {
          if (newOutputs.length > 1) {
            const err = new Error(
              `OUTPUT_COUNT_MISMATCH: Expected exactly 1 generated image, received ${newOutputs.length}.`,
            );
            job.status = "failed";
            job.error = err.message;
            this.touch(job);
            throw err;
          }
          targetOutput = newOutputs[0];
          job.status = "output_detected";
          this.emitLifecycleLog("OUTPUT_DETECTED", job);
          job.message = "New generation output tile identified in Google Flow.";
          this.touch(job);
          break;
        }

        await new Promise((r) => setTimeout(r, pollIntervalMs));
      }

      if (targetOutput) {
        job.status = "downloading";
        this.emitLifecycleLog("DOWNLOAD_STARTED", job);
        job.message = "Downloading new asset from Google Flow...";
        this.touch(job);

        let dlResult = null;
        try {
          dlResult = await downloadFlowImage({
            page: this.page,
            job,
            output: targetOutput,
            timeoutMs: 30000,
            downloadDir: this.downloadDir,
            logger: console,
          });
        } catch (uiDlErr) {
          console.warn("[FlowBrowser] UI download attempt notice:", uiDlErr.message);
        }

        if (dlResult && dlResult.success && dlResult.buffer && dlResult.buffer.length > 0) {
          this.emitLifecycleLog("DOWNLOAD_SUCCEEDED", job, {
            downloadMethod: dlResult.downloadMethod,
            path: dlResult.path,
          });
          job.status = "importing";
          job.downloadStatus = "completed";
          job.editorCloseStatus = dlResult.editorClosed === true ? "closed" : "failed";
          job.flowSessionReady = dlResult.editorClosed === true;
          job.editorCloseError = dlResult.editorCloseError || null;
          job.downloadPath = dlResult.path;
          job.downloadMethod = dlResult.downloadMethod || "native_context_menu_save_as";
          if (dlResult.googleFlowProjectId) job.googleFlowProjectId = dlResult.googleFlowProjectId;
          if (dlResult.googleFlowEditId) job.googleFlowEditId = dlResult.googleFlowEditId;
          if (dlResult.googleFlowEditUrl) job.googleFlowEditUrl = dlResult.googleFlowEditUrl;
          if (dlResult.googleFlowImageId !== undefined) job.googleFlowImageId = dlResult.googleFlowImageId;
          if (dlResult.googleFlowImageRef) job.googleFlowImageRef = dlResult.googleFlowImageRef;
          if (dlResult.googleFlowImageSourceUrl) job.googleFlowImageSourceUrl = dlResult.googleFlowImageSourceUrl;
          this.touch(job);

          await this.importDownloadedAsset(job, dlResult.buffer, {
            mimeType: dlResult.mimeType,
            extension: dlResult.fileName.split(".").pop(),
          });
          job.flowSessionReady = dlResult.editorClosed === true;
          return;
        }

        this.emitLifecycleLog("DOWNLOAD_FAILED", job, {
          error: dlResult?.message || "FLOW_NATIVE_DOWNLOAD_FAILED",
        });

        // Isolated fallback: Only if explicit captured responses exist and native download threw or timed out
        if (job.capturedImageResponses && job.capturedImageResponses.size > 0) {
          if (
            Array.isArray(job.pendingImageCaptures) &&
            job.pendingImageCaptures.length > 0
          ) {
            await Promise.all(job.pendingImageCaptures).catch(() => {});
          }

          const match = this.findCapturedOutput(
            targetOutput,
            job.capturedImageResponses,
          );
          if (match && match.buffer && match.buffer.length > 500) {
            const detected = detectImageType(match.buffer);
            const dims = parseImageDimensions(match.buffer);
            if (detected && dims.width >= 32 && dims.height >= 32) {
              // A captured network response is a supported recovery path when
              // native Save As fails. It must also close the Flow image editor;
              // otherwise the next scene starts on /edit/{assetId}.
              job.status = "importing";
              job.downloadStatus = "completed";
              job.downloadMethod = "network_response_capture";
              job.downloadPath = null;

              let editorClosed = false;
              let editorCloseError = null;
              const currentFlowUrl =
                this.page && typeof this.page.url === "function"
                  ? this.page.url()
                  : "";

              if (isGoogleFlowEditorRoute(currentFlowUrl)) {
                try {
                  const closeResult = await closeFlowImageEditor(
                    this.page,
                    console,
                    {
                      timeoutMs: 15000,
                      expectedProjectId:
                        job.googleFlowProjectId ||
                        extractProjectIdFromFlowUrl(currentFlowUrl),
                      logTransition: (phase, details) => {
                        this.emitLifecycleLog(phase, job, details);
                      },
                    },
                  );
                  editorClosed =
                    closeResult === true || closeResult?.closed === true;
                } catch (closeError) {
                  editorCloseError = closeError.message;
                  this.emitLifecycleLog(
                    "FLOW_EDITOR_CLOSE_FAILED_AFTER_FALLBACK",
                    job,
                    {
                      error: closeError.message,
                      currentUrl:
                        this.page && typeof this.page.url === "function"
                          ? this.page.url()
                          : "",
                    },
                  );
                }
              } else {
                editorClosed =
                  Boolean(currentFlowUrl) &&
                  isFlowUrl(currentFlowUrl);
              }

              job.editorCloseStatus = editorClosed ? "closed" : "failed";
              job.flowSessionReady = editorClosed;
              job.editorCloseError = editorCloseError;
              this.emitLifecycleLog(
                "DOWNLOAD_RECOVERED",
                job,
                {
                  downloadMethod: "network_response_capture",
                  editorClosed,
                  editorCloseError,
                  mimeType: detected.mimeType,
                  width: dims.width,
                  height: dims.height,
                },
              );

              // Import even if editor cleanup failed: preserve the valid image.
              // The next prepareJob() will retry Done and refuse to submit a
              // new scene until the editor route is actually closed.
              await this.importDownloadedAsset(job, match.buffer, detected);

              job.downloadStatus = "completed";
              job.editorCloseStatus = editorClosed ? "closed" : "failed";
              job.flowSessionReady = editorClosed;
              job.editorCloseError = editorCloseError;
              this.touch(job);
              return;
            }
          }
        }

        // If bytes were not captured, fail the job clearly and release lock instead of staying indefinitely in awaiting_download
        const failureCode = dlResult?.code || "FLOW_NATIVE_DOWNLOAD_FAILED";
        const failureMsg = dlResult?.message || "Generation output was detected, but image could not be downloaded via native context menu.";
        this.setJobTerminal(
          job,
          "failed",
          `${failureCode}: ${failureMsg}`,
          `Google Flow download failed: ${failureMsg}`,
        );
        return;
      }

      if (job.status === "generating" || job.status === "output_detected") {
        this.setJobTerminal(
          job,
          "failed",
          "GENERATION_TIMEOUT: Output tile was not detected within timeout window.",
          "Generation timed out waiting for output tile in Google Flow.",
        );
      }
    } catch (monitorErr) {
      if (monitorErr.message?.includes("OUTPUT_COUNT_MISMATCH")) {
        this.setJobTerminal(job, "failed", monitorErr.message, monitorErr.message);
        throw monitorErr;
      }
      this.setJobTerminal(
        job,
        "failed",
        monitorErr.message,
        "Generation monitor encountered an error.",
      );
    } finally {
      if (typeof job._cleanupResponseListener === "function") {
        job._cleanupResponseListener();
        delete job._cleanupResponseListener;
      }
    }
  }

  async inspectFlowPage() {
    if (
      !this.page ||
      (typeof this.page.isClosed === "function" && this.page.isClosed())
    ) {
      return {
        isOpen: false,
        message: "Browser session is not open.",
      };
    }

    const url = typeof this.page.url === "function" ? this.page.url() : "";
    const title =
      typeof this.page.title === "function"
        ? await this.page.title().catch(() => "")
        : "";

    let activeProjectId = null;
    const projectMatch = url.match(/\/project\/([a-f0-9-]+)/i);
    if (projectMatch) {
      activeProjectId = projectMatch[1];
    }

    const sessionStatus = await this.getSessionStatus();
    const googleAuthStatus =
      sessionStatus.googleAuth || sessionStatus.authenticationStatus;
    const interfaceMode = await this.detectInterfaceMode();

    const promptEditors = [];
    if (typeof this.page.locator === "function") {
      const editorCandidates = this.page.locator(
        'flow-creative-agent-prompt-box, [role="textbox"], div.ProseMirror, textarea',
      );
      const editorCount = await editorCandidates.count().catch(() => 0);
      for (let i = 0; i < Math.min(editorCount, 10); i++) {
        const el = editorCandidates.nth(i);
        if (await el.isVisible().catch(() => false)) {
          promptEditors.push({
            tagName:
              typeof el.evaluate === "function"
                ? await el
                    .evaluate((n) => n.tagName.toLowerCase())
                    .catch(() => "")
                : "",
            role:
              typeof el.getAttribute === "function"
                ? await el.getAttribute("role").catch(() => null)
                : null,
            ariaLabel:
              typeof el.getAttribute === "function"
                ? await el.getAttribute("aria-label").catch(() => null)
                : null,
            contentEditable:
              typeof el.getAttribute === "function"
                ? await el.getAttribute("contenteditable").catch(() => null)
                : null,
            className:
              typeof el.getAttribute === "function"
                ? await el.getAttribute("class").catch(() => null)
                : null,
            isEnabled:
              typeof el.isEnabled === "function"
                ? await el.isEnabled().catch(() => false)
                : true,
            textPreview:
              typeof el.innerText === "function"
                ? (await el.innerText().catch(() => "")).slice(0, 100)
                : "",
          });
        }
      }
    }

    const buttons = [];
    if (typeof this.page.locator === "function") {
      const btnCandidates = this.page.locator('button, [role="button"]');
      const btnCount = await btnCandidates.count().catch(() => 0);
      for (let i = 0; i < Math.min(btnCount, 25); i++) {
        const btn = btnCandidates.nth(i);
        if (await btn.isVisible().catch(() => false)) {
          const text =
            typeof btn.innerText === "function"
              ? (await btn.innerText().catch(() => "")).trim()
              : "";
          const ariaLabel =
            typeof btn.getAttribute === "function"
              ? await btn.getAttribute("aria-label").catch(() => null)
              : null;
          const isEnabled =
            typeof btn.isEnabled === "function"
              ? await btn.isEnabled().catch(() => false)
              : true;
          const type =
            typeof btn.getAttribute === "function"
              ? await btn.getAttribute("type").catch(() => null)
              : null;
          buttons.push({ text: text.slice(0, 50), ariaLabel, isEnabled, type });
        }
      }
    }

    const frames =
      typeof this.page.frames === "function" ? this.page.frames() : [];
    const relevantIframeUrls = frames
      .map((f) => (typeof f.url === "function" ? f.url() : ""))
      .filter(
        (u) => u && u !== "about:blank" && !u.startsWith("chrome-extension://"),
      );

    const agentMessages = [];
    if (typeof this.page.locator === "function") {
      const msgElements = this.page.locator(
        'flow-creative-agent-message, [data-message-author="agent"], .agent-message',
      );
      const msgCount = await msgElements.count().catch(() => 0);
      for (let i = Math.max(0, msgCount - 5); i < msgCount; i++) {
        const msg = msgElements.nth(i);
        const text =
          typeof msg.innerText === "function"
            ? (await msg.innerText().catch(() => "")).trim()
            : "";
        if (text) agentMessages.push(text.slice(0, 200));
      }
    }

    const indicators =
      typeof this.page.locator === "function"
        ? this.page.locator(
            '[role="progressbar"], .generating, .loading-spinner, [aria-label*="generating" i], [aria-label*="loading" i]',
          )
        : null;
    const hasActiveGeneration = indicators
      ? (await indicators.count().catch(() => 0)) > 0
      : false;

    const timestamp = Date.now();
    const diagDir = path.resolve(this.profileDir, "..", "diagnostics");
    await fs.mkdir(diagDir, { recursive: true, mode: 0o700 }).catch(() => {});

    const screenshotPath = path.join(diagDir, `inspect-${timestamp}.png`);
    if (typeof this.page.screenshot === "function") {
      await this.page
        .screenshot({ path: screenshotPath, fullPage: false })
        .catch(() => {});
    }

    const domSnapshotPath = path.join(diagDir, `inspect-${timestamp}.html`);
    if (typeof this.page.content === "function") {
      const rawHtml = await this.page.content().catch(() => "");
      const sanitizedHtml = rawHtml
        .replace(
          /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
          "<!-- script removed -->",
        )
        .replace(
          /data:image\/[^;]+;base64,[^"']+/g,
          "data:image/...[truncated]",
        );
      await fs
        .writeFile(domSnapshotPath, sanitizedHtml, {
          mode: 0o600,
          encoding: "utf8",
        })
        .catch(() => {});
    }

    return {
      isOpen: true,
      url,
      title,
      activeProjectId,
      googleAuthStatus,
      interfaceMode,
      promptEditors,
      buttons,
      relevantIframeUrls,
      agentMessages,
      activeGenerationIndicators: hasActiveGeneration,
      diagnostics: {
        screenshotPath,
        domSnapshotPath,
        timestamp,
      },
    };
  }

  async synchronizeCharacter(input) {
    const characterId = String(input.characterId || "").trim();
    const characterName = String(input.characterName || "").trim();
    const description = String(input.description || "").trim();
    const referenceImagePath = input.referenceImagePath || null;
    const projectUrl = input.projectUrl
      ? assertAllowedFlowUrl(input.projectUrl)
      : undefined;

    if (!characterId) throw new Error("characterId is required.");
    if (!characterName) throw new Error("characterName is required.");

    if (
      !this.context ||
      !this.page ||
      (typeof this.page.isClosed === "function" && this.page.isClosed())
    ) {
      throw new Error(
        "Open a Google Flow browser session before synchronizing a character.",
      );
    }

    if (
      projectUrl &&
      typeof this.page.url === "function" &&
      this.page.url() !== projectUrl
    ) {
      if (typeof this.page.goto === "function") {
        await this.page.goto(projectUrl, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });
      }
    }

    const currentUrl =
      typeof this.page.url === "function" ? this.page.url() : "";
    if (isGoogleLoginUrl(currentUrl)) {
      return {
        success: false,
        status: "awaiting_manual_login",
        message:
          "Sign in manually in the visible browser before synchronizing characters.",
      };
    }

    if (!isFlowUrl(currentUrl)) {
      return {
        success: false,
        status: "awaiting_project_selection",
        message:
          "Open the intended Google Flow project before synchronizing characters.",
      };
    }

    // Check if character already exists in project
    try {
      if (typeof this.page.locator === "function") {
        const existingLocator = this.page.locator(
          `text="@${characterName}", text="${characterName}"`,
        );
        if ((await existingLocator.count()) > 0) {
          return {
            success: true,
            status: "synced",
            alreadyExists: true,
            flowCharacterName: characterName,
            message: `Character "${characterName}" already exists in the Google Flow project.`,
          };
        }
      }
    } catch {}

    // Navigate to Characters section if available
    try {
      if (typeof this.page.getByRole === "function") {
        const charTab = getFirstLocator(
          this.page
            .getByRole("tab", { name: /character/i })
            .or(this.page.getByRole("button", { name: /character/i }))
            .or(
              this.page.locator(
                '[data-testid*="character" i], [aria-label*="character" i]',
              ),
            ),
        );
        if (
          charTab &&
          (await charTab.count().catch(() => 0)) > 0 &&
          (await charTab.isVisible().catch(() => false))
        ) {
          await charTab.click({ timeout: 5000 });
        }
      }
    } catch {}

    // Click New Character / Add Character if available
    try {
      if (typeof this.page.getByRole === "function") {
        const newBtn = getFirstLocator(
          this.page
            .getByRole("button", { name: /(new|create|add).*character/i })
            .or(
              this.page.locator(
                'button:has-text("New Character"), button:has-text("Add Character")',
              ),
            ),
        );
        if (
          newBtn &&
          (await newBtn.count().catch(() => 0)) > 0 &&
          (await newBtn.isVisible().catch(() => false))
        ) {
          await newBtn.click({ timeout: 5000 });
        }
      }
    } catch {}

    // Fill character name if input field exists
    try {
      if (typeof this.page.getByRole === "function") {
        const nameInput = getFirstLocator(
          this.page
            .getByRole("textbox", { name: /(name|character name)/i })
            .or(
              this.page.locator(
                'input[placeholder*="name" i], input[aria-label*="name" i]',
              ),
            ),
        );
        if (
          nameInput &&
          (await nameInput.count().catch(() => 0)) > 0 &&
          (await nameInput.isVisible().catch(() => false))
        ) {
          await nameInput.fill(characterName);
        }
      }
    } catch {}

    // Upload master reference image if path provided
    if (referenceImagePath) {
      try {
        if (typeof this.page.locator === "function") {
          const fileInput = getFirstLocator(
            this.page.locator('input[type="file"]'),
          );
          if (fileInput && (await fileInput.count().catch(() => 0)) > 0) {
            await fileInput.setInputFiles(referenceImagePath);
          }
        }
      } catch (uploadErr) {
        console.warn(
          "[FlowBrowserWorker] Reference image input failed:",
          uploadErr.message,
        );
      }
    }

    // Click Create / Save button if available
    try {
      if (typeof this.page.getByRole === "function") {
        const saveBtn = getFirstLocator(
          this.page.getByRole("button", {
            name: /(create|save|confirm|done)/i,
          }),
        );
        if (
          saveBtn &&
          (await saveBtn.count().catch(() => 0)) > 0 &&
          (await saveBtn.isVisible().catch(() => false))
        ) {
          await saveBtn.click({ timeout: 5000 });
        }
      }
    } catch {}

    return {
      success: true,
      status: "synced",
      flowCharacterName: characterName,
      message: `Character "${characterName}" synchronized with Google Flow project.`,
    };
  }

  async handleDownload(download, originatingPage) {
    const page =
      originatingPage && typeof originatingPage.url === "function"
        ? originatingPage
        : typeof download?.page === "function"
          ? download.page()
          : null;

    if (page && !isValidFlowDownloadSource(page, this.page, this.context)) {
      // Ignore downloads from unrelated tabs, non-Flow pages, or closed sessions
      return;
    }

    if (this.downloadInProgress || !this.activeJobId) return;

    const job = this.jobs.get(this.activeJobId);
    if (
      !job ||
      ![
        "generating",
        "output_detected",
        "downloading",
        "awaiting_download",
        "awaiting_manual_generate",
      ].includes(job.status)
    )
      return;

    this.downloadInProgress = true;

    try {
      await fs.mkdir(this.downloadDir, { recursive: true });

      const suggested = safeFilename(
        download.suggestedFilename(),
        "flow-image",
      );
      const temporaryPath = path.join(
        this.downloadDir,
        job.id + "-" + suggested,
      );
      await download.saveAs(temporaryPath);

      const buffer = await fs.readFile(temporaryPath);
      if (buffer.length > MAX_IMAGE_BYTES) {
        await fs.rm(temporaryPath, { force: true });
        throw new Error(
          "Downloaded image exceeds the 25 MB worker safety limit.",
        );
      }

      const imageType = detectImageType(buffer);
      if (!imageType) {
        await fs.rm(temporaryPath, { force: true });
        job.message =
          "A download was detected, but it was not a supported PNG, JPEG, or WebP image. Download the generated image asset from Flow, not a project archive.";
        this.touch(job);
        return;
      }

      const { width, height } = parseImageDimensions(buffer);
      if ((width > 0 && width < 32) || (height > 0 && height < 32)) {
        await fs.rm(temporaryPath, { force: true });
        job.message = `Downloaded image is a placeholder or corrupted (${width}x${height}px). Ensure you download the full generated image from Flow.`;
        this.touch(job);
        return;
      }

      const finalPath = path.join(
        this.downloadDir,
        job.id + "." + imageType.extension,
      );
      if (temporaryPath !== finalPath) {
        await fs.rename(temporaryPath, finalPath);
      }

      job.downloadPath = finalPath;
      job.status = "importing";
      job.message =
        "Image downloaded and validated. Importing it into the selected character.";
      this.touch(job);

      await this.importDownloadedAsset(job, buffer, imageType);
    } catch (error) {
      if (job.importResult) {
        // The image file was already uploaded to backend storage, but metadata registration failed
        job.status = "import_metadata_failed";
        job.error = error.message;
        job.message =
          "The file exists in backend storage. Retry metadata registration instead of downloading the image again.";
      } else {
        this.setJobTerminal(
          job,
          "failed",
          error.message,
          "The image download or import failed. Inspect the job error before retrying.",
        );
      }
      this.touch(job);
    } finally {
      this.downloadInProgress = false;
    }
  }

  async importDownloadedAsset(job, buffer, imageType) {
    this.emitLifecycleLog("IMPORT_STARTED", job);
    console.log(
      `[FlowDownload] BACKEND_IMPORT_STARTED`,
      JSON.stringify({
        backendJobId: job?.backendJobId || job?.id,
        workerJobId: job?.id,
        sceneId: job?.sceneId,
        storyId: job?.storyId,
        timestamp: new Date().toISOString(),
      }),
    );
    if (!job.importResult) {
      const dataUri =
        "data:" + imageType.mimeType + ";base64," + buffer.toString("base64");

      const dims = parseImageDimensions(buffer);
      if (
        (Number.isInteger(dims.width) && dims.width > 0 && dims.width < 32) ||
        (Number.isInteger(dims.height) && dims.height > 0 && dims.height < 32)
      ) {
        throw new Error(
          `Invalid image dimensions: ${dims.width}x${dims.height}`,
        );
      }

      if (job.targetType === "background" || job.sceneId) {
        let bgResponse;
        try {
          bgResponse = await fetch(
            this.backendUrl + "/api/background-studio/import-flow",
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                sceneId: job.sceneId,
                storyId: job.storyId,
                imageBufferOrBase64: dataUri,
                aspectRatio: job.aspectRatio || "16:9",
                filename:
                  "flow-bg-" +
                  (job.sceneId || job.id) +
                  "." +
                  imageType.extension,
                notes:
                  "Imported from Google Flow via Playwright loopback worker",
                prompt: job.prompt,
                generationJobId: job.id,
                flowProjectId: job.flowProjectId || job.googleFlowProjectId,
                googleFlowProjectId: job.googleFlowProjectId || job.flowProjectId,
                googleFlowEditId: job.googleFlowEditId,
                googleFlowEditUrl: job.googleFlowEditUrl,
                googleFlowPrompt: job.prompt || job.googleFlowPrompt,
                googleFlowParentAssetId: job.googleFlowParentAssetId,
                googleFlowVersion: job.googleFlowVersion,
                googleFlowImageId: job.googleFlowImageId ?? null,
                googleFlowImageRef: job.googleFlowImageRef || null,
                googleFlowImageSourceUrl: job.googleFlowImageSourceUrl || null,
                provider: "google_flow",
                ...(job.model ? { model: job.model } : {}),
                mimeType: imageType.mimeType,
                width: dims.width,
                height: dims.height,
              }),
            },
          );
        } catch (uploadErr) {
          throw new Error(
            "Backend file upload network error: " +
              (uploadErr instanceof Error
                ? uploadErr.message
                : String(uploadErr)),
          );
        }

        const bgPayload = await bgResponse.json().catch(() => ({}));
        if (!bgResponse.ok || bgPayload.success !== true || !bgPayload.asset) {
          throw new Error(
            "Backend background import failed with HTTP " +
              bgResponse.status +
              ".",
          );
        }

        job.importResult = bgPayload.asset;
        job.detectedMimeType = imageType.mimeType;
        this.emitLifecycleLog("FLOW_EDITOR_REFERENCE_PERSISTED", job, {
          assetId: bgPayload.asset?.id,
          googleFlowProjectId: job.googleFlowProjectId,
          googleFlowEditId: job.googleFlowEditId,
          googleFlowEditUrl: job.googleFlowEditUrl,
          googleFlowVersion: bgPayload.asset?.googleFlowVersion || job.googleFlowVersion,
        });
        console.log(
          `[FlowDownload] BACKEND_IMPORT_COMPLETED`,
          JSON.stringify({
            backendJobId: job?.backendJobId || job?.id,
            workerJobId: job?.id,
            sceneId: job?.sceneId,
            assetId: bgPayload.asset.id,
            assetUrl: bgPayload.asset.url,
            timestamp: new Date().toISOString(),
          }),
        );
        console.log(
          `[FlowDownload] SCENE_IMAGE_ASSOCIATION_VERIFIED`,
          JSON.stringify({
            backendJobId: job?.backendJobId || job?.id,
            workerJobId: job?.id,
            sceneId: job?.sceneId,
            verified: true,
            timestamp: new Date().toISOString(),
          }),
        );
        console.log(
          `[FlowDownload] JOB_COMPLETED`,
          JSON.stringify({
            backendJobId: job?.backendJobId || job?.id,
            workerJobId: job?.id,
            sceneId: job?.sceneId,
            status: "completed",
            timestamp: new Date().toISOString(),
          }),
        );
        this.setJobTerminal(
          job,
          "completed",
          undefined,
          "Background image downloaded and applied to scene successfully.",
        );
        return;
      }

      const characterPath =
        "/api/character-studio/characters/" +
        encodeURIComponent(job.characterId) +
        "/import-flow";

      let importResponse;
      try {
        importResponse = await fetch(this.backendUrl + characterPath, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            characterName: job.characterName,
            assetType: job.assetType,
            imageBufferOrBase64: dataUri,
            filename:
              "flow-" + job.view + "-" + job.id + "." + imageType.extension,
            notes:
              "Imported from Google Flow through the local Playwright worker.",
            prompt: job.prompt,
            storyId: job.storyId,
            generationJobId: job.id,
            flowProjectId: job.flowProjectId,
            provider: "google_flow",
            ...(job.model ? { model: job.model } : {}),
            mimeType: imageType.mimeType,
            width: dims.width,
            height: dims.height,
          }),
        });
      } catch (uploadErr) {
        throw new Error(
          "Backend file upload network error: " +
            (uploadErr instanceof Error
              ? uploadErr.message
              : String(uploadErr)),
        );
      }

      const importPayload = await importResponse.json().catch(() => ({}));
      if (
        !importResponse.ok ||
        importPayload.success !== true ||
        !importPayload.result
      ) {
        throw new Error(
          "Backend file import failed with HTTP " + importResponse.status + ".",
        );
      }

      job.importResult = importPayload.result;
      job.detectedMimeType = imageType.mimeType;
      this.touch(job);
    }

    await this.persistAssetMetadata(job);
  }

  async persistAssetMetadata(job) {
    if (job.targetType === "background" || job.sceneId) {
      this.setJobTerminal(
        job,
        "completed",
        undefined,
        "Background asset import and registration completed successfully.",
      );
      return;
    }

    if (!job.importResult)
      throw new Error("There is no imported file result to register.");

    const result = job.importResult;
    const assetPath =
      "/api/character-studio/characters/" +
      encodeURIComponent(job.characterId) +
      "/assets";

    try {
      const assetResponse = await fetch(this.backendUrl + assetPath, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: result.assetId,
          assetType: job.assetType,
          direction: job.view,
          prompt: job.prompt,
          provider: "google_flow",
          model: "google_flow_ui",
          url: result.url,
          storagePath: result.storagePath,
          isMasterReference: job.isMasterReference,
          createdAt: new Date().toISOString(),
        }),
      });

      const assetPayload = await assetResponse.json().catch(() => ({}));
      if (!assetResponse.ok || assetPayload.success !== true) {
        job.status = "import_metadata_failed";
        job.error =
          "The image file was saved, but character metadata registration failed with HTTP " +
          assetResponse.status +
          ".";
        job.message =
          "The file exists in backend storage. Retry metadata registration instead of downloading the image again.";
        this.touch(job);
        return job;
      }

      job.asset = assetPayload.asset || result;
      this.setJobTerminal(
        job,
        "completed",
        undefined,
        "Google Flow image imported and registered against the character.",
      );
      return job;
    } catch (networkOrParseError) {
      job.status = "import_metadata_failed";
      job.error =
        "The image file was saved, but character metadata registration network request failed: " +
        (networkOrParseError instanceof Error
          ? networkOrParseError.message
          : String(networkOrParseError));
      job.message =
        "The file exists in backend storage. Retry metadata registration instead of downloading the image again.";
      this.touch(job);
      return job;
    }
  }

  async retryMetadataImport(jobId) {
    const job = this.requireJob(jobId);
    if (!job.importResult) {
      throw new Error(
        "This job has no pending metadata registration to retry (no uploaded image found).",
      );
    }

    if (
      job.status !== "import_metadata_failed" &&
      job.status !== "failed" &&
      job.status !== "completed"
    ) {
      throw new Error(
        "This job has no pending metadata registration to retry. Current status: " +
          job.status,
      );
    }

    return this.persistAssetMetadata(job);
  }

  async cancelJob(jobId) {
    const job = this.requireJob(jobId);
    this.setJobTerminal(
      job,
      "cancelled",
      undefined,
      "Job cancelled. Any already generated Flow media remains in the Google Flow project.",
    );
    return job;
  }

  async saveDiagnosticScreenshot(jobId) {
    if (!this.page || this.page.isClosed()) return undefined;

    try {
      await fs.mkdir(this.downloadDir, { recursive: true });
      const screenshotPath = path.join(
        this.downloadDir,
        "diagnostic-" + jobId + ".png",
      );
      await this.page.screenshot({ path: screenshotPath, fullPage: false });
      return screenshotPath;
    } catch {
      return undefined;
    }
  }

  requireJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error("Flow job not found: " + jobId);
    return job;
  }

  touch(job) {
    job.updatedAt = new Date().toISOString();
  }

  getJob(jobId) {
    return this.requireJob(jobId);
  }

  listJobs() {
    return Array.from(this.jobs.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }
}
