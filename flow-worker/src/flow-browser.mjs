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
  inspectGoogleFlowEditedImage,
  downloadGoogleFlowEditedImage,
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
  inspectGoogleFlowEditedImage,
  downloadGoogleFlowEditedImage,
};

export const FLOW_TAB_ROLES = Object.freeze({
  BACKGROUND: "background",
  CHARACTER: "character",
});

export const FLOW_TAB_METADATA_KEY = "ai-kids-content-studio.flow-tab-metadata";

export function getJobPageRole(job) {
  if (!job) throw new Error("A job is required to determine tab role.");

  const targetType = job.targetType ? String(job.targetType).toLowerCase() : null;
  const pageRole = job.pageRole ? String(job.pageRole).toLowerCase() : null;

  // Strict check against contradiction
  if (targetType === "character" && pageRole && pageRole !== FLOW_TAB_ROLES.CHARACTER) {
    const err = new Error(
      `FLOW_JOB_ROLE_MISMATCH: Job specifies targetType "${job.targetType}" but conflicting pageRole "${job.pageRole}".`
    );
    err.code = "FLOW_JOB_ROLE_MISMATCH";
    throw err;
  }

  if (targetType === "background" && pageRole && pageRole !== FLOW_TAB_ROLES.BACKGROUND) {
    const err = new Error(
      `FLOW_JOB_ROLE_MISMATCH: Job specifies targetType "${job.targetType}" but conflicting pageRole "${job.pageRole}".`
    );
    err.code = "FLOW_JOB_ROLE_MISMATCH";
    throw err;
  }

  if (pageRole === FLOW_TAB_ROLES.CHARACTER || targetType === "character") {
    return FLOW_TAB_ROLES.CHARACTER;
  }

  if (pageRole === FLOW_TAB_ROLES.BACKGROUND || targetType === "background") {
    return FLOW_TAB_ROLES.BACKGROUND;
  }

  if (!pageRole && !targetType) {
    return FLOW_TAB_ROLES.BACKGROUND;
  }

  const err = new Error(`FLOW_JOB_ROLE_MISMATCH: Unsupported Flow job target: ${job.targetType}`);
  err.code = "FLOW_JOB_ROLE_MISMATCH";
  throw err;
}

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

export function isValidFlowDownloadSource(page, activePageOrWorker, context) {
  if (!page) return false;
  if (typeof page.isClosed === "function" && page.isClosed()) return false;
  if (
    context &&
    typeof page.context === "function" &&
    page.context() !== context
  ) {
    return false;
  }
  if (activePageOrWorker && activePageOrWorker.pagesByRole instanceof Map) {
    const isKnown = Array.from(activePageOrWorker.pagesByRole.values()).includes(page);
    if (!isKnown && activePageOrWorker.page !== page) return false;
  } else if (activePageOrWorker) {
    if (typeof activePageOrWorker.isClosed === "function" && activePageOrWorker.isClosed()) {
      return false;
    }
    if (page !== activePageOrWorker) {
      return false;
    }
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
    // Serialize sessionStorage marker writes per page so older async writes can never
    // overwrite a newer role/project assignment.
    this.tabMetadataWriteChains = new WeakMap();
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
    this.downloadInProgressByRole = new Set();
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
    if (!p) return;

    // Backwards-compatible active-page assignment must replace the old default
    // page instead of leaving get page() pinned to a stale Background mapping.
    // Preserve an existing explicit role or infer one from a special Flow route.
    const existing = this.pageMetadata.get(p);
    const role = this.getFlowRouteRole(p) || existing?.role || FLOW_TAB_ROLES.BACKGROUND;
    this.registerFlowPage(p, { role });
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
    if (!page || (typeof page.isClosed === "function" && page.isClosed())) return null;

    const existing = this.pageMetadata.get(page);
    const requestedRole = metadata.role || existing?.role || FLOW_TAB_ROLES.BACKGROUND;
    if (requestedRole !== FLOW_TAB_ROLES.BACKGROUND && requestedRole !== FLOW_TAB_ROLES.CHARACTER) {
      throw new Error(`Invalid Flow page role: ${requestedRole}. Expected "background" or "character".`);
    }

    const currentUrl = typeof page.url === "function" ? page.url() : String(page.url || "");
    const currentRouteType = detectFlowRouteType(currentUrl);
    const routeProjectId = extractProjectIdFromFlowUrl(currentUrl);
    // The live Flow route is authoritative over stale role markers:
    // Characters routes belong to the character tab; image-editor routes belong
    // to the background tab. Generic project routes retain the requested role.
    const routeRole = this.getFlowRouteRole(page);
    const role = routeRole || requestedRole;
    const requestedTabId = metadata.tabId || existing?.tabId || randomUUID();
    const duplicateTabId = Array.from(this.pagesByRole.values()).some((mappedPage) => {
      if (mappedPage === page) return false;
      return this.pageMetadata.get(mappedPage)?.tabId === requestedTabId;
    });
    const tabId = duplicateTabId ? randomUUID() : requestedTabId;
    // The page's live route is authoritative; a stale sessionStorage marker must not
    // keep a previous project's id attached to a tab after navigation.
    const projectId = routeProjectId || metadata.projectId || existing?.projectId || null;
    const purpose =
      metadata.purpose ||
      existing?.purpose ||
      (role === FLOW_TAB_ROLES.CHARACTER ? "character-generation" : "scene-background");

    // A page can own one role only, and a role can point to one page only.
    // Clear all previous mappings before publishing the new assignment.
    for (const [mappedRole, mappedPage] of Array.from(this.pagesByRole.entries())) {
      if (mappedPage === page && mappedRole !== role) {
        this.pagesByRole.delete(mappedRole);
      }
      if (mappedRole === role && mappedPage !== page) {
        this.pagesByRole.delete(mappedRole);
        const displacedMetadata = this.pageMetadata.get(mappedPage);
        if (displacedMetadata && displacedMetadata.role === role) {
          displacedMetadata.role = null;
          displacedMetadata.purpose = null;
          displacedMetadata.updatedAt = new Date().toISOString();
          this.writeTabMarkerToSessionStorage(mappedPage, displacedMetadata).catch(() => {});
        }
      }
    }

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
    if (typeof page.evaluate !== "function") return;

    const previousWrite = this.tabMetadataWriteChains.get(page) || Promise.resolve();
    const roleIsValid =
      meta?.role === FLOW_TAB_ROLES.BACKGROUND ||
      meta?.role === FLOW_TAB_ROLES.CHARACTER;
    const payload = roleIsValid
      ? JSON.stringify({
          tabId: meta.tabId,
          role: meta.role,
          projectId: meta.projectId || null,
          purpose: meta.purpose || null,
          updatedAt: meta.updatedAt || new Date().toISOString(),
        })
      : null;

    // Chain writes in call order. A slower earlier write cannot win over newer
    // metadata, and a failed write does not poison later updates.
    const nextWrite = previousWrite.catch(() => {}).then(async () => {
      if (typeof page.isClosed === "function" && page.isClosed()) return;
      await page.evaluate(
        ({ key, val, remove }) => {
          try {
            if (remove) {
              window.sessionStorage.removeItem(key);
            } else {
              window.sessionStorage.setItem(key, val);
            }
          } catch {}
        },
        { key: FLOW_TAB_METADATA_KEY, val: payload, remove: !roleIsValid },
      );
    });

    this.tabMetadataWriteChains.set(page, nextWrite);
    try {
      await nextWrite;
    } finally {
      if (this.tabMetadataWriteChains.get(page) === nextWrite) {
        this.tabMetadataWriteChains.delete(page);
      }
    }
  }

  async readTabMarkerFromSessionStorage(page) {
    if (!page || (typeof page.isClosed === "function" && page.isClosed())) return null;
    try {
      // registerFlowPage() is intentionally synchronous. Wait for its queued
      // marker write before reading, otherwise a fast recovery can observe an
      // older role or an empty marker even though the write was already queued.
      const pendingWrite = this.tabMetadataWriteChains.get(page);
      if (pendingWrite) await pendingWrite.catch(() => {});
      if (typeof page.evaluate !== "function") return null;
      const raw = await page.evaluate((key) => {
        try {
          return window.sessionStorage.getItem(key);
        } catch {
          return null;
        }
      }, FLOW_TAB_METADATA_KEY);
      if (!raw) return null;

      const marker = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (
        !marker ||
        (marker.role !== FLOW_TAB_ROLES.BACKGROUND &&
          marker.role !== FLOW_TAB_ROLES.CHARACTER)
      ) {
        return null;
      }

      return {
        tabId: typeof marker.tabId === "string" && marker.tabId ? marker.tabId : randomUUID(),
        role: marker.role,
        projectId: typeof marker.projectId === "string" ? marker.projectId : null,
        purpose: typeof marker.purpose === "string" ? marker.purpose : null,
        updatedAt: typeof marker.updatedAt === "string" ? marker.updatedAt : null,
      };
    } catch {
      return null;
    }
  }

  getFlowRouteRole(pageOrUrl) {
    let currentUrl = "";
    try {
      currentUrl =
        typeof pageOrUrl === "string"
          ? pageOrUrl
          : typeof pageOrUrl?.url === "function"
            ? pageOrUrl.url()
            : String(pageOrUrl?.url || "");
    } catch {
      return null;
    }

    const routeType = detectFlowRouteType(currentUrl);
    if (routeType === "character-create" || routeType === "character-editor") {
      return FLOW_TAB_ROLES.CHARACTER;
    }
    if (routeType === "image-editor") {
      return FLOW_TAB_ROLES.BACKGROUND;
    }
    return null;
  }

  isFlowPageCompatibleWithRole(page, role) {
    if (!page || (typeof page.isClosed === "function" && page.isClosed())) {
      return false;
    }
    if (role !== FLOW_TAB_ROLES.BACKGROUND && role !== FLOW_TAB_ROLES.CHARACTER) {
      return false;
    }
    const routeRole = this.getFlowRouteRole(page);
    return !routeRole || routeRole === role;
  }

  disownFlowPage(page, expectedRole = null) {
    if (!page) return false;
    const metadata = this.pageMetadata.get(page) || {
      tabId: randomUUID(),
      role: null,
      projectId: null,
      purpose: null,
      createdAt: new Date().toISOString(),
    };

    if (expectedRole && metadata.role && metadata.role !== expectedRole) {
      return false;
    }

    for (const [role, mappedPage] of Array.from(this.pagesByRole.entries())) {
      if (mappedPage === page) this.pagesByRole.delete(role);
    }

    metadata.role = null;
    metadata.purpose = null;
    metadata.updatedAt = new Date().toISOString();
    metadata.currentUrl = typeof page.url === "function" ? page.url() : "";
    metadata.currentRouteType = detectFlowRouteType(metadata.currentUrl);
    this.pageMetadata.set(page, metadata);
    this.writeTabMarkerToSessionStorage(page, metadata).catch(() => {});
    return true;
  }

  getFlowPage(role = FLOW_TAB_ROLES.BACKGROUND) {
    const page = this.pagesByRole.get(role);
    if (!page) return null;

    const isClosed = typeof page.isClosed === "function" && page.isClosed();
    const metadata = this.pageMetadata.get(page);
    const metadataMismatch = Boolean(metadata && metadata.role !== role);
    const routeMismatch = !isClosed && !this.isFlowPageCompatibleWithRole(page, role);

    if (isClosed || metadataMismatch || routeMismatch) {
      this.pagesByRole.delete(role);
      if (routeMismatch) {
        this.disownFlowPage(page, role);
      } else if (metadata && metadata.role === role) {
        metadata.role = null;
        metadata.purpose = null;
        metadata.updatedAt = new Date().toISOString();
        this.writeTabMarkerToSessionStorage(page, metadata).catch(() => {});
      }
      if (isClosed) this.pageMetadata.delete(page);
      return null;
    }

    return page;
  }

  getFlowPageMetadata(page) {
    if (!page || (typeof page.isClosed === "function" && page.isClosed())) return null;
    return this.pageMetadata.get(page) || null;
  }

  getFlowPages() {
    const result = [];
    const seenPages = new Set();
    for (const [role, page] of Array.from(this.pagesByRole.entries())) {
      const isClosed = typeof page.isClosed === "function" && page.isClosed();
      const metadata = this.pageMetadata.get(page) || null;
      if (isClosed || seenPages.has(page) || (metadata && metadata.role !== role)) {
        this.pagesByRole.delete(role);
        if (isClosed) this.pageMetadata.delete(page);
        continue;
      }
      seenPages.add(page);
      result.push({
        role,
        page,
        isClosed: false,
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
    if (!meta) return null;

    const currentUrl = typeof page.url === "function" ? page.url() : String(page.url || "");
    const currentRouteType = detectFlowRouteType(currentUrl);
    const routeProjectId = extractProjectIdFromFlowUrl(currentUrl);

    meta.currentUrl = currentUrl;
    meta.currentRouteType = currentRouteType;
    meta.updatedAt = new Date().toISOString();
    if (routeProjectId) {
      meta.projectId = routeProjectId;
    } else if (isFlowUrl(currentUrl)) {
      meta.projectId = null;
    }

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

    this.writeTabMarkerToSessionStorage(page, meta).catch(() => {});
    return meta;
  }

  getPageForJob(job) {
    if (!job) return this.getFlowPage(FLOW_TAB_ROLES.BACKGROUND);
    const role = job.pageRole || (job.targetType === "character" ? FLOW_TAB_ROLES.CHARACTER : FLOW_TAB_ROLES.BACKGROUND);
    return this.getFlowPage(role);
  }

  getJobPageRole(job) {
    return getJobPageRole(job);
  }

  async resolveJobPage(job) {
    if (!job) throw new Error("Job is required for resolveJobPage");
    const targetRole = getJobPageRole(job);
    job.pageRole = targetRole;

    this.emitLifecycleLog("FLOW_JOB_ROLE_VALIDATED", job, {
      workerJobId: job.id,
      targetType: job.targetType || (targetRole === FLOW_TAB_ROLES.CHARACTER ? "character" : "background"),
      pageRole: targetRole,
      timestamp: new Date().toISOString(),
    });

    const mappedPage = this.pagesByRole.get(targetRole);
    if (mappedPage && !(typeof mappedPage.isClosed === "function" && mappedPage.isClosed())) {
      const mappedMetadata = this.getFlowPageMetadata(mappedPage);
      if (mappedMetadata?.role && mappedMetadata.role !== targetRole) {
        const details = {
          errorCode: "FLOW_JOB_ROLE_MISMATCH",
          expectedRole: targetRole,
          actualRole: mappedMetadata.role,
          tabId: mappedMetadata.tabId || null,
          currentUrl: typeof mappedPage.url === "function" ? mappedPage.url() : "",
        };
        const error = new Error(
          `FLOW_JOB_ROLE_MISMATCH: The ${targetRole} mapping points to a tab registered as ${mappedMetadata.role}.`,
        );
        error.code = "FLOW_JOB_ROLE_MISMATCH";
        error.details = details;
        this.emitLifecycleLog("FLOW_JOB_ROLE_MISMATCH", job, details);
        throw error;
      }
    }

    let page = this.getFlowPage(targetRole);

    if (!page || (typeof page.isClosed === "function" && page.isClosed())) {
      this.emitLifecycleLog("FLOW_TAB_NAVIGATION_STARTED", job, {
        role: targetRole,
        action: "ensure_flow_page",
        projectId: job.googleFlowProjectId || null,
      });
      const editUrl =
        targetRole === FLOW_TAB_ROLES.BACKGROUND && (job.isRegeneration || job.googleFlowEditUrl)
          ? job.googleFlowEditUrl || job.editUrl || null
          : null;
      page = await this.ensureFlowPage(
        targetRole,
        job.googleFlowProjectId || this.extractProjectId(editUrl) || null,
        editUrl || job.projectUrl || null,
      );
      this.emitLifecycleLog("FLOW_TAB_NAVIGATION_COMPLETED", job, {
        role: targetRole,
        action: "ensure_flow_page",
        url: typeof page.url === "function" ? page.url() : null,
      });
    }

    if (this.context && typeof this.context.pages === "function") {
      const contextPages = this.context.pages();
      if (contextPages.length > 0 && !contextPages.includes(page)) {
        const err = new Error("FLOW_JOB_PAGE_NOT_IN_CONTEXT: Resolved page is not part of the active browser context.");
        err.code = "FLOW_JOB_PAGE_NOT_IN_CONTEXT";
        throw err;
      }
    }

    let metadata = this.getFlowPageMetadata(page);
    if (!metadata || metadata.role !== targetRole) {
      const err = new Error(
        `FLOW_JOB_ROLE_MISMATCH: Expected tab role "${targetRole}", but page metadata role is "${metadata?.role || "unknown"}".`
      );
      err.code = "FLOW_JOB_ROLE_MISMATCH";
      err.details = {
        errorCode: "FLOW_JOB_ROLE_MISMATCH",
        expectedRole: targetRole,
        actualRole: metadata?.role || "unknown",
        tabId: metadata?.tabId || null,
        currentUrl: typeof page.url === "function" ? page.url() : null,
      };
      this.emitLifecycleLog("FLOW_JOB_ROLE_MISMATCH", job, err.details);
      throw err;
    }

    const targetProjectId = job.googleFlowProjectId || this.extractProjectId(job.projectUrl);
    const currentUrl = typeof page.url === "function" ? page.url() : "";
    const currentProjectId = this.extractProjectId(currentUrl);

    if (targetProjectId && currentProjectId && currentProjectId !== targetProjectId) {
      this.emitLifecycleLog("FLOW_TAB_NAVIGATION_STARTED", job, {
        role: targetRole,
        fromProject: currentProjectId,
        toProject: targetProjectId,
      });
      const targetUrl = targetRole === FLOW_TAB_ROLES.CHARACTER
        ? `https://flow.google.com/project/${encodeURIComponent(targetProjectId)}/character`
        : (job.isRegeneration && job.googleFlowEditUrl
          ? job.googleFlowEditUrl
          : `https://flow.google.com/project/${encodeURIComponent(targetProjectId)}`);
      if (typeof page.goto === "function") {
        await page.goto(targetUrl, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });
      }
      this.updateFlowPageRouteMetadata(page);
      this.emitLifecycleLog("FLOW_TAB_NAVIGATION_COMPLETED", job, {
        role: targetRole,
        targetUrl,
        currentUrl: typeof page.url === "function" ? page.url() : "",
      });
    }

    metadata = this.updateFlowPageRouteMetadata(page) || metadata;

    this.emitLifecycleLog("FLOW_JOB_PAGE_RESOLVED", job, {
      workerJobId: job.id,
      targetType: job.targetType || (targetRole === FLOW_TAB_ROLES.CHARACTER ? "character" : "background"),
      pageRole: targetRole,
      tabId: metadata?.tabId || null,
      projectId: targetProjectId || metadata?.projectId || null,
      currentUrl: typeof page.url === "function" ? page.url() : "",
      timestamp: new Date().toISOString(),
    });

    return page;
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
        if (!this.isFlowPageCompatibleWithRole(candidate, role)) {
          this.disownFlowPage(candidate, role);
          continue;
        }
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
        return (!m || !m.role) && this.isFlowPageCompatibleWithRole(p, role);
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

    const targetUrl = projectUrl || (projectId ? (role === FLOW_TAB_ROLES.CHARACTER ? `https://flow.google.com/project/${projectId}/character` : `https://flow.google.com/project/${projectId}`) : FLOW_HOME_URL);
    const currentUrl = typeof page.url === "function" ? page.url() : "";
    if (!isFlowUrl(currentUrl) || (targetUrl && currentUrl !== targetUrl && targetUrl !== FLOW_HOME_URL)) {
      await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
    }

    this.updateFlowPageRouteMetadata(page);
    await this.writeTabMarkerToSessionStorage(page, this.getFlowPageMetadata(page));
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

    // 1. Recover valid role markers before repairing stale ones. A tab's live
    // route is authoritative, but stale markers must never displace a correctly
    // marked Background or Character tab just because Chrome enumerates tabs in
    // a different order after restart.
    const existingPages = this.context.pages ? this.context.pages() : [];
    const pendingRoleRepairs = [];
    for (const p of existingPages) {
      this.attachPage(p);
      const marker = await this.readTabMarkerFromSessionStorage(p);
      if (!marker || !marker.role) continue;

      const routeRole = this.getFlowRouteRole(p);
      if (routeRole && routeRole !== marker.role) {
        pendingRoleRepairs.push({ page: p, marker, routeRole });
        continue;
      }
      this.registerFlowPage(p, marker);
    }

    for (const repair of pendingRoleRepairs) {
      const currentOwner = this.getFlowPage(repair.routeRole);
      if (currentOwner && currentOwner !== repair.page) {
        this.disownFlowPage(repair.page, repair.marker.role);
        continue;
      }
      this.registerFlowPage(repair.page, {
        ...repair.marker,
        role: repair.routeRole,
        projectId:
          extractProjectIdFromFlowUrl(repair.page.url()) ||
          repair.marker.projectId ||
          projectId,
      });
    }

    // 2. Ensure Background tab exists and is navigated
    let bgPage = this.getFlowPage(FLOW_TAB_ROLES.BACKGROUND);
    if (!bgPage) {
      const candidates = (this.context.pages ? this.context.pages() : []).filter(
        (p) =>
          (!p.isClosed || !p.isClosed()) &&
          !this.pageMetadata.get(p)?.role &&
          this.isFlowPageCompatibleWithRole(p, FLOW_TAB_ROLES.BACKGROUND),
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
        (p) =>
          (!p.isClosed || !p.isClosed()) &&
          p !== bgPage &&
          !this.pageMetadata.get(p)?.role &&
          this.isFlowPageCompatibleWithRole(p, FLOW_TAB_ROLES.CHARACTER),
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
            const metadata = this.pageMetadata.get(page);
            if (metadata) {
              // A null role means this worker deliberately disowned the page.
              // Do not resurrect an older sessionStorage marker while its removal
              // is still queued or if the browser write failed.
              if (metadata.role) {
                const routeRole = this.getFlowRouteRole(page);
                if (routeRole && routeRole !== metadata.role) {
                  const currentOwner = this.getFlowPage(routeRole);
                  if (!currentOwner || currentOwner === page) {
                    this.registerFlowPage(page, {
                      role: routeRole,
                      projectId: extractProjectIdFromFlowUrl(page.url()),
                      purpose:
                        routeRole === FLOW_TAB_ROLES.CHARACTER
                          ? "character-generation"
                          : "scene-background",
                    });
                  } else {
                    this.disownFlowPage(page, metadata.role);
                  }
                } else {
                  this.updateFlowPageRouteMetadata(page);
                }
              }
            } else {
              const marker = await this.readTabMarkerFromSessionStorage(page);
              if (marker?.role && this.isFlowPageCompatibleWithRole(page, marker.role)) {
                this.registerFlowPage(page, marker);
              } else if (marker?.role) {
                this.disownFlowPage(page, marker.role);
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
        for (const [role, mappedPage] of Array.from(this.pagesByRole.entries())) {
          if (mappedPage === page) this.pagesByRole.delete(role);
        }
        this.pageMetadata.delete(page);
        this.attachedPages.delete(page);
        if (this._page === page) this._page = null;
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

    const bgMeta = bgPage ? this.getFlowPageMetadata(bgPage) : null;
    const charMeta = charPage ? this.getFlowPageMetadata(charPage) : null;
    const bgUrl = bgPage && typeof bgPage.url === "function" ? bgPage.url() : null;
    const charUrl = charPage && typeof charPage.url === "function" ? charPage.url() : null;

    const tabs = {
      background: {
        open: Boolean(bgPage && (typeof bgPage.isClosed !== "function" || !bgPage.isClosed())),
        tabId: bgMeta?.tabId || null,
        role: FLOW_TAB_ROLES.BACKGROUND,
        purpose: bgMeta?.purpose || "scene-background",
        projectId: bgMeta?.projectId || (bgUrl ? extractProjectIdFromFlowUrl(bgUrl) : null),
        url: bgUrl,
        routeType: bgUrl ? detectFlowRouteType(bgUrl) : null,
        activeJobId: this.activeJobsByRole.get(FLOW_TAB_ROLES.BACKGROUND) || this.activeJobId || null,
        metadata: bgMeta,
      },
      character: {
        open: Boolean(charPage && (typeof charPage.isClosed !== "function" || !charPage.isClosed())),
        tabId: charMeta?.tabId || null,
        role: FLOW_TAB_ROLES.CHARACTER,
        purpose: charMeta?.purpose || "character-generation",
        projectId: charMeta?.projectId || (charUrl ? extractProjectIdFromFlowUrl(charUrl) : null),
        url: charUrl,
        routeType: charUrl ? detectFlowRouteType(charUrl) : null,
        activeJobId: this.activeJobsByRole.get(FLOW_TAB_ROLES.CHARACTER) || null,
        metadata: charMeta,
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
    // Character identity is a stronger discriminator than scene context.
    // Some callers associate a character asset with a scene, so sceneId must
    // never silently convert an explicitly identified character job to Background.
    const targetType =
      input.targetType ||
      (input.pageRole === FLOW_TAB_ROLES.CHARACTER || input.characterId
        ? "character"
        : input.pageRole === FLOW_TAB_ROLES.BACKGROUND || input.sceneId
          ? "background"
          : "character");

    const expectedRole =
      targetType === "character"
        ? FLOW_TAB_ROLES.CHARACTER
        : targetType === "background"
          ? FLOW_TAB_ROLES.BACKGROUND
          : null;
    if (!expectedRole) {
      const error = new Error(`FLOW_JOB_TARGET_UNSUPPORTED: Unsupported targetType "${targetType}".`);
      error.code = "FLOW_JOB_TARGET_UNSUPPORTED";
      throw error;
    }
    if (input.pageRole && input.pageRole !== expectedRole) {
      const err = new Error(
        `FLOW_JOB_ROLE_MISMATCH: targetType "${targetType}" cannot use pageRole "${input.pageRole}".`,
      );
      err.code = "FLOW_JOB_ROLE_MISMATCH";
      throw err;
    }

    if (targetType === "background") {
      const sceneId = String(input.sceneId || "").trim();
      const storyId = String(input.storyId || "").trim();
      if (!sceneId) throw new Error("sceneId is required for background jobs.");

      const rawEditUrl = input.editUrl || input.googleFlowEditUrl;
      const googleFlowEditUrl = rawEditUrl ? assertAllowedFlowUrl(rawEditUrl) : undefined;
      const editorRef = googleFlowEditUrl ? extractGoogleFlowEditorReference(googleFlowEditUrl) : null;
      if (googleFlowEditUrl && !editorRef) {
        throw new Error("editUrl must be a Google Flow image editor URL (/project/{projectId}/edit/{assetId}).");
      }
      const isRegeneration = Boolean(input.isRegeneration || editorRef);

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

    const googleFlowProjectId =
      input.googleFlowProjectId ||
      extractProjectIdFromFlowUrl(projectUrl) ||
      undefined;
    const rawGoogleFlowCharacterUrl = input.googleFlowCharacterUrl
      ? assertAllowedFlowUrl(input.googleFlowCharacterUrl)
      : input.googleFlowCharacterId && googleFlowProjectId
        ? `https://flow.google.com/project/${encodeURIComponent(googleFlowProjectId)}/character/${encodeURIComponent(String(input.googleFlowCharacterId))}`
        : undefined;
    const parsedGoogleFlowCharacter = rawGoogleFlowCharacterUrl
      ? extractGoogleFlowCharacterReference(rawGoogleFlowCharacterUrl)
      : null;
    if (
      rawGoogleFlowCharacterUrl &&
      (!parsedGoogleFlowCharacter ||
        (googleFlowProjectId && parsedGoogleFlowCharacter.projectId !== googleFlowProjectId) ||
        (input.googleFlowCharacterId &&
          parsedGoogleFlowCharacter.characterId !== String(input.googleFlowCharacterId)))
    ) {
      const error = new Error(
        "FLOW_CHARACTER_REFERENCE_MISMATCH: The saved Google Flow character URL does not match the requested project or character ID.",
      );
      error.code = "FLOW_CHARACTER_REFERENCE_MISMATCH";
      throw error;
    }
    const googleFlowCharacterId =
      parsedGoogleFlowCharacter?.characterId ||
      (input.googleFlowCharacterId ? String(input.googleFlowCharacterId) : undefined);
    const uploadedReferences = Array.isArray(input.uploadedReferences)
      ? input.uploadedReferences
      : input.referenceImagePath
        ? [input.referenceImagePath]
        : [];
    const projectReferences = Array.isArray(input.projectReferences)
      ? input.projectReferences
      : input.projectReferenceAssetId
        ? [input.projectReferenceAssetId]
        : [];

    const job = {
      id: randomUUID(),
      targetType: "character",
      pageRole: FLOW_TAB_ROLES.CHARACTER,
      characterId,
      characterName,
      sceneId: undefined,
      storyId: String(input.storyId || "").trim() || undefined,
      view,
      assetType,
      isMasterReference:
        input.isMasterReference === true ||
        assetType === "main" ||
        input.assetType === "master_reference",
      projectUrl,
      googleFlowProjectId,
      flowProjectId: googleFlowProjectId,
      googleFlowCharacterId,
      googleFlowCharacterUrl: rawGoogleFlowCharacterUrl,
      prompt,
      uploadedReferences,
      projectReferences,
      characterReferences: [...uploadedReferences, ...projectReferences],
      status: "created",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      message:
        "Job created. Prepare it after opening Flow and completing any required manual sign-in.",
    };

    this.jobs.set(job.id, job);
    this.emitLifecycleLog("JOB_CREATED", job);
    this.emitLifecycleLog("CHARACTER_GENERATION_REQUESTED", job, {
      characterGenerationJobId: job.id,
      workerJobId: job.id,
      backendJobId: job.backendJobId || job.id,
      storyId: job.storyId,
      characterId: job.characterId,
      projectId: job.googleFlowProjectId || job.flowProjectId,
      targetType: "character",
      pageRole: "character",
      success: true,
    });
    return job;
  }

  emitLifecycleLog(event, job, extra = {}) {
    if (!job) return;
    const isCharacter =
      job.targetType === "character" ||
      job.pageRole === FLOW_TAB_ROLES.CHARACTER ||
      Boolean(job.characterId);
    const entry = {
      event,
      workerJobId: job.id,
      backendJobId: job.backendJobId || job.id,
      ...(isCharacter
        ? {
            characterGenerationJobId: job.id,
            characterId: job.characterId,
            projectId: job.googleFlowProjectId || job.flowProjectId || extra.projectId,
            browserTabId: extra.browserTabId || extra.tabId || job.browserTabId,
            targetType: "character",
            pageRole: "character",
          }
        : {
            sceneId: job.sceneId,
          }),
      storyId: job.storyId,
      status: job.status,
      previousStatus: extra.previousStatus || job._previousStatus || undefined,
      timestamp: new Date().toISOString(),
      ...extra,
    };
    if (isCharacter) {
      delete entry.sceneId;
    }
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
    if (
      prevStatus === terminalStatus &&
      ["completed", "cancelled", "failed"].includes(terminalStatus)
    ) {
      return;
    }
    job.status = terminalStatus;
    if (error !== undefined) job.error = error;
    if (message !== undefined) job.message = message;
    if (terminalStatus === "completed") {
      job.completedAt = new Date().toISOString();
      job.error = undefined;
      this.emitLifecycleLog("IMPORT_COMPLETED", job);
    }
    const role = job.pageRole || (job.targetType === "character" ? FLOW_TAB_ROLES.CHARACTER : FLOW_TAB_ROLES.BACKGROUND);
    if (this.activeJobsByRole.get(role) === job.id) {
      this.activeJobsByRole.set(role, null);
    }
    if (this.activeJobId === job.id) {
      this.activeJobId = null;
    }
    this.emitLifecycleLog("ACTIVE_LOCK_RELEASED", job, { previousStatus: prevStatus, role });
    this.touch(job);
  }

  recoverActiveJobLock(role = null, force = false) {
    const rolesToCheck = role ? [role] : [FLOW_TAB_ROLES.BACKGROUND, FLOW_TAB_ROLES.CHARACTER];
    const promises = [];
    for (const r of rolesToCheck) {
      const activeJobId = this.activeJobsByRole.get(r) || (r === FLOW_TAB_ROLES.BACKGROUND ? this.activeJobId : null);
      if (!activeJobId) continue;
      const active = this.jobs.get(activeJobId);
      if (!active || force || ["completed", "cancelled", "failed"].includes(active.status)) {
        this.activeJobsByRole.set(r, null);
        if (r === FLOW_TAB_ROLES.BACKGROUND) this.activeJobId = null;
        continue;
      }

      const ageMs = Date.now() - new Date(active.updatedAt || active.createdAt).getTime();
      const isActivelyGenerating = [
        "generating",
        "output_detected",
        "downloading",
        "importing",
        "awaiting_download",
      ].includes(active.status);
      const timeoutThresholdMs = isActivelyGenerating ? 120000 : 30000;

      if (ageMs > timeoutThresholdMs) {
        console.warn(
          `[FlowBrowser] Recovering stale activeJobId lock for role ${r} and job ${activeJobId} (${Math.round(ageMs / 1000)}s old, status=${active.status}).`,
        );
        this.activeJobsByRole.set(r, null);
        if (r === FLOW_TAB_ROLES.BACKGROUND) this.activeJobId = null;
        const previousStatus = active.status;
        active.status = "failed";
        active.errorCode = "STALE_DOWNLOAD_JOB";
        active.error = `STALE_DOWNLOAD_JOB: Worker was interrupted during image download or processing in status "${previousStatus}".`;
        active.message = "Stale lock safely recovered due to timeout.";
        this.touch(active);
        this.emitLifecycleLog("STALE_JOB_RECOVERED", active, { previousStatus, role: r });

        promises.push(
          this.reconcileStaleJob(active).catch((err) => {
            console.warn(`[FlowBrowser] Stale job reconciliation notice for ${activeJobId}:`, err.message);
          })
        );
      }
    }
    return Promise.all(promises);
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

  cancelActiveJob(reason = "Active job cancelled by user or system recovery.", role = null) {
    this.recoverActiveJobLock(role);
    let targetJobId = null;
    if (role) {
      targetJobId = this.activeJobsByRole.get(role) || (role === FLOW_TAB_ROLES.BACKGROUND ? this.activeJobId : null);
    } else {
      targetJobId = this.activeJobId || this.activeJobsByRole.get(FLOW_TAB_ROLES.BACKGROUND) || this.activeJobsByRole.get(FLOW_TAB_ROLES.CHARACTER);
    }

    if (!targetJobId) {
      return { cancelled: false, role: role || null, message: "No active job was running." };
    }
    const active = this.jobs.get(targetJobId);
    const id = targetJobId;
    const effectiveRole = role || active?.pageRole || (active?.targetType === "character" ? FLOW_TAB_ROLES.CHARACTER : FLOW_TAB_ROLES.BACKGROUND);
    if (active) {
      this.setJobTerminal(active, "cancelled", undefined, reason);
    } else {
      if (effectiveRole) this.activeJobsByRole.set(effectiveRole, null);
      if (!effectiveRole || effectiveRole === FLOW_TAB_ROLES.BACKGROUND) this.activeJobId = null;
    }
    return {
      cancelled: true,
      jobId: id,
      role: effectiveRole,
      message: `Active job ${id} was cancelled and worker lock released.`,
    };
  }

  async detectInterfaceMode(pageOrOptions = {}, maybeOptions = {}) {
    let page;
    let options;
    if (pageOrOptions && (typeof pageOrOptions.locator === "function" || typeof pageOrOptions.url === "function")) {
      page = pageOrOptions;
      options = maybeOptions || {};
    } else {
      page = this.page;
      options = pageOrOptions || {};
    }

    const timeoutMs = options.timeoutMs ?? 0;
    if (
      !page ||
      (typeof page.isClosed === "function" && page.isClosed())
    ) {
      return "unknown";
    }

    try {
      const currentUrl =
        typeof page.url === "function"
          ? page.url()
          : "";

      // 1. The editor route is authoritative.
      // Do not classify its Start generation button as Agent mode.
      if (isGoogleFlowEditorRoute(currentUrl)) {
        return "image-editor";
      }

      if (typeof page.locator !== "function") {
        return "unknown";
      }

      const checkModes = async () => {
        // 2. Detect Agent mode using the Agent-specific textbox.
        const agentPrompt = page.locator(
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
        const imageEditorPrompt = page.locator(
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
        const standardButton = page.locator(
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

  async getOutputAssetBaseline(targetPage = null) {
    const page = targetPage || this.page;
    if (
      !page ||
      (typeof page.isClosed === "function" && page.isClosed())
    ) {
      return { count: 0, identifiers: new Set() };
    }

    try {
      if (typeof page.locator !== "function") {
        return { count: 0, identifiers: new Set() };
      }

      const options = page.locator(
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
              identifiers.add(new URL(src, page.url()).href);
            } catch {
              identifiers.add(src);
            }
          }
        }
      }

      // Legacy fallback
      if (identifiers.size === 0) {
        const legacyImgs = page.locator(
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
    pageOrBaseline = null,
    maybeBaseline = null,
  ) {
    let targetPage = null;
    let baseline = { count: 0, identifiers: new Set() };
    if (pageOrBaseline && (typeof pageOrBaseline.locator === "function" || typeof pageOrBaseline.url === "function")) {
      targetPage = pageOrBaseline;
      baseline = maybeBaseline || { count: 0, identifiers: new Set() };
    } else {
      baseline = pageOrBaseline || { count: 0, identifiers: new Set() };
    }

    const page = targetPage || this.getPageForJob(job) || this.page;
    if (
      !page ||
      (typeof page.isClosed === "function" && page.isClosed())
    ) {
      return [];
    }

    const results = [];
    try {
      if (typeof page.locator !== "function") return results;

      // Scroll chat viewport to bottom so lazy-loaded image galleries are rendered
      try {
        const chatViewport = page.locator("flow-chat-scroller .scroll-viewport");
        if ((await chatViewport.first().isVisible().catch(() => false))) {
          await chatViewport.first().evaluate((el) => {
            el.scrollTop = el.scrollHeight;
          }).catch(() => {});
        }
      } catch {}

      const options = page.locator(
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
            fullUrl = new URL(src, page.url()).href;
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
        const legacyImgs = page.locator(
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
          if (
            !baseline.identifiers.has(id) &&
            (!src || !baseline.identifiers.has(src))
          ) {
            results.push({
              sourceUrl: src ? new URL(src, page.url()).href : "",
              rawSrc: src || "",
              naturalWidth: 0,
              naturalHeight: 0,
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

  async startImageResponseCapture(job, targetPage = null) {
    const page = targetPage || this.getPageForJob(job) || this.page;
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

    if (page && typeof page.on === "function") {
      page.on("response", onResponse);
      job._cleanupResponseListener = () => {
        try {
          if (typeof page.off === "function")
            page.off("response", onResponse);
          else if (typeof page.removeListener === "function")
            page.removeListener("response", onResponse);
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

    if (!this.context) {
      throw new Error(
        "Open a Google Flow browser session before preparing a job.",
      );
    }

    let page = await this.resolveJobPage(job);
    if (!page || (typeof page.isClosed === "function" && page.isClosed())) {
      throw new Error(
        "Open a Google Flow browser session before preparing a job.",
      );
    }

    const targetRole = getJobPageRole(job);
    this.recoverActiveJobLock(targetRole);

    const activeJobIdForRole = this.activeJobsByRole.get(targetRole) || (targetRole === FLOW_TAB_ROLES.BACKGROUND ? this.activeJobId : null);
    if (activeJobIdForRole && activeJobIdForRole !== jobId) {
      const active = this.jobs.get(activeJobIdForRole);
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
            `[FlowBrowser] Automatically superseding inactive previous job ${active.id} (role: ${targetRole}, status: ${active.status}, ${ageSec}s old).`,
          );
          this.setJobTerminal(
            active,
            "cancelled",
            undefined,
            "Superseded by new generation request.",
          );
        } else {
          const err = new Error(
            `Another Flow job (${active.id}) is actively generating in the ${targetRole} tab (status: ${active.status}, started ${ageSec}s ago). Complete or cancel it before starting another.`,
          );
          err.statusCode = 409;
          err.activeJob = {
            id: active.id,
            status: active.status,
            ageSeconds: ageSec,
            role: targetRole,
          };
          throw err;
        }
      }
    }

    // Role-specific preparation
    if (targetRole === FLOW_TAB_ROLES.CHARACTER) {
      try {
      this.emitLifecycleLog("FLOW_PROMPT_DETECTION_STARTED", job, {
        role: targetRole,
        tabId: this.getFlowPageMetadata(page)?.tabId,
      });

      const requestedProjectId =
        job.googleFlowProjectId ||
        this.extractProjectId(job.projectUrl) ||
        this.getFlowPageMetadata(page)?.projectId ||
        null;

      this.emitLifecycleLog("CHARACTER_FLOW_NAVIGATION_STARTED", job, {
        projectId: requestedProjectId,
        success: true,
      });

      let characterNavigation;
      try {
        characterNavigation = await this.navigateToCharacterTab(requestedProjectId);
      } catch (navErr) {
        this.emitLifecycleLog("CHARACTER_GENERATION_FAILED", job, {
          errorCode: navErr.code || "FLOW_CHARACTER_TAB_NOT_READY",
          error: navErr.message,
          success: false,
        });
        throw navErr;
      }

      if (!characterNavigation?.success || !characterNavigation.page) {
        const error = new Error(
          "FLOW_CHARACTER_TAB_NOT_READY: Could not resolve the dedicated Google Flow Character tab.",
        );
        error.code = "FLOW_CHARACTER_TAB_NOT_READY";
        this.emitLifecycleLog("CHARACTER_GENERATION_FAILED", job, {
          errorCode: error.code,
          error: error.message,
          success: false,
        });
        throw error;
      }

      page = characterNavigation.page;
      let characterRoute = extractGoogleFlowCharacterReference(
        typeof page.url === "function" ? page.url() : "",
      );
      if (
        !characterRoute ||
        (requestedProjectId && characterRoute.projectId !== requestedProjectId) ||
        this.getFlowPage(FLOW_TAB_ROLES.CHARACTER) !== page
      ) {
        const error = new Error(
          "FLOW_CHARACTER_TAB_MISMATCH: Character generation must run on the dedicated /project/{projectId}/character tab.",
        );
        error.code = "FLOW_CHARACTER_TAB_MISMATCH";
        error.details = {
          expectedProjectId: requestedProjectId,
          currentUrl: typeof page.url === "function" ? page.url() : "",
          tabId: this.getFlowPageMetadata(page)?.tabId || null,
        };
        this.emitLifecycleLog("CHARACTER_GENERATION_FAILED", job, {
          errorCode: error.code,
          error: error.message,
          success: false,
        });
        throw error;
      }

      // A mapped character must reuse its saved Flow editor. Creating another
      // Flow Character for every turnaround angle would break identity and
      // produce duplicate characters in the user's Flow project.
      if (job.googleFlowCharacterId) {
        const editorNavigation = await this.openGoogleFlowCharacterEditor({
          projectId: characterRoute.projectId,
          characterId: job.googleFlowCharacterId,
          characterUrl: job.googleFlowCharacterUrl,
        });
        page = editorNavigation.page;
        characterRoute = extractGoogleFlowCharacterReference(
          typeof page.url === "function" ? page.url() : "",
        );
        if (
          !characterRoute ||
          characterRoute.routeType !== "character-editor" ||
          characterRoute.projectId !== requestedProjectId &&
            requestedProjectId !== null ||
          characterRoute.characterId !== job.googleFlowCharacterId ||
          this.getFlowPage(FLOW_TAB_ROLES.CHARACTER) !== page
        ) {
          const error = new Error(
            "FLOW_CHARACTER_EDITOR_MISMATCH: The saved Google Flow Character editor route did not match the mapped character.",
          );
          error.code = "FLOW_CHARACTER_EDITOR_MISMATCH";
          throw error;
        }
        job.characterPromptMode = "edit";
      } else {
        await this.openCharacterCreationInterface(page, characterRoute.projectId, job);
        job.characterPromptMode = "create";
      }

      job.googleFlowProjectId = characterRoute.projectId;
      job.flowProjectId = characterRoute.projectId;
      if (characterRoute.characterId) {
        job.googleFlowCharacterId = characterRoute.characterId;
      }

      const tabId = this.getFlowPageMetadata(page)?.tabId || null;
      job.browserTabId = tabId;
      this.emitLifecycleLog("CHARACTER_FLOW_TAB_RESOLVED", job, {
        projectId: characterRoute.projectId,
        googleFlowCharacterId: job.googleFlowCharacterId || null,
        promptMode: job.characterPromptMode,
        browserTabId: tabId,
        currentUrl: typeof page.url === "function" ? page.url() : "",
        success: true,
      });

      // Locate the prompt belonging to this exact Character workflow. New
      // characters use "Describe your character"; saved characters use the
      // existing editor's "What do you want to change?" prompt.
      let characterPromptLocator = null;
      let promptSelectorUsed = null;
      try {
        const promptRes =
          job.characterPromptMode === "edit"
            ? await this.findCharacterEditorPromptEditor(page)
            : await this.findCharacterPromptEditor(page);
        characterPromptLocator = promptRes.locator;
        promptSelectorUsed = promptRes.selector;
      } catch (promptErr) {
        this.emitLifecycleLog("CHARACTER_GENERATION_FAILED", job, {
          errorCode: promptErr.code || "FLOW_CHARACTER_PROMPT_NOT_FOUND",
          error: promptErr.message,
          promptMode: job.characterPromptMode,
          success: false,
        });
        throw promptErr;
      }

      this.emitLifecycleLog("CHARACTER_CONTEXT_VERIFIED", job, {
        projectId: characterRoute.projectId,
        browserTabId: tabId,
        currentUrl: typeof page.url === "function" ? page.url() : "",
        success: true,
      });

      this.emitLifecycleLog("CHARACTER_PROMPT_LOCATED", job, {
        selector: promptSelectorUsed,
        browserTabId: tabId,
        currentUrl: typeof page.url === "function" ? page.url() : "",
        success: true,
      });

      await this.fillFlowPrompt(page, characterPromptLocator, job.prompt);

      this.emitLifecycleLog("CHARACTER_PROMPT_FILLED", job, {
        promptLength: job.prompt.length,
        browserTabId: tabId,
        currentUrl: typeof page.url === "function" ? page.url() : "",
        success: true,
      });

      // Attach reference images if present
      await this.attachCharacterReferences(page, job);

      this.emitLifecycleLog("FLOW_PROMPT_DETECTION_COMPLETED", job, {
        role: targetRole,
        tabId,
        currentUrl: typeof page.url === "function" ? page.url() : "",
        selector: promptSelectorUsed,
      });

      this.setActiveJob(job, targetRole);
      this.emitLifecycleLog("ACTIVE_LOCK_ACQUIRED", job, { role: targetRole });

      job.promptSelectorUsed = promptSelectorUsed;
      job.status = "prompt_ready";
      job.message = "Character prompt populated into Google Flow's dedicated Character tab.";
      job.error = undefined;
      this.touch(job);
      return job;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.emitLifecycleLog("FLOW_CHARACTER_PREPARATION_FAILED", job, {
          error: message,
          errorCode: error?.code || "FLOW_CHARACTER_PREPARATION_FAILED",
          pageRole: targetRole,
          currentUrl: typeof page.url === "function" ? page.url() : "",
          tabId: this.getFlowPageMetadata(page)?.tabId || null,
        });
        this.setJobTerminal(
          job,
          "failed",
          message,
          "Google Flow Character prompt preparation failed. Check that the dedicated Characters tab is open and the 'Describe your character' prompt is available.",
        );
        throw error;
      }
    }

    // Otherwise BACKGROUND role:
    if (job.isRegeneration || job.googleFlowEditUrl || job.editUrl) {
      job.googleFlowEditUrl = job.googleFlowEditUrl || job.editUrl;
      job.isRegeneration = true;
      if (!job.googleFlowEditUrl) {
        throw new Error("googleFlowEditUrl is required for background regeneration jobs.");
      }
      this.emitLifecycleLog("FLOW_EDITOR_REOPEN_STARTED", job, {
        editUrl: job.googleFlowEditUrl,
      });

      const currentUrl = typeof page.url === "function" ? page.url() : "";
      if (currentUrl !== job.googleFlowEditUrl) {
        await page.goto(job.googleFlowEditUrl, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });
      }

      const verifiedUrl = typeof page.url === "function" ? page.url() : "";
      const editorRef = extractGoogleFlowEditorReference(verifiedUrl);
      if (!editorRef ||
        (job.googleFlowProjectId && editorRef.projectId !== job.googleFlowProjectId) ||
        (job.googleFlowEditId && editorRef.editId !== job.googleFlowEditId)) {
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
      this.updateFlowPageRouteMetadata(page);
      await this.writeTabMarkerToSessionStorage(page, this.getFlowPageMetadata(page));

      this.emitLifecycleLog("FLOW_EDITOR_REOPENED", job, {
        projectId: editorRef.projectId,
        editId: editorRef.editId,
        editUrl: editorRef.editUrl,
      });

      this.setActiveJob(job, targetRole);
      this.emitLifecycleLog("ACTIVE_LOCK_ACQUIRED", job, { role: targetRole });

      try {
        const promptEditor = await this.findImageEditPromptEditor(page);
        await this.fillFlowPrompt(page, promptEditor.locator, job.prompt);

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
          page,
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
      const ready = await this.ensureProjectWorkspaceReady(job, page);
      if (!ready) {
        return job;
      }
    }

    const currentUrl =
      typeof page.url === "function"
        ? page.url()
        : String(page.url || "");
    const currentProjectId = this.extractProjectId(currentUrl);
    const targetProjectId = this.extractProjectId(job.projectUrl);

    if (targetProjectId && currentProjectId === targetProjectId) {
      // Already on the requested Flow project page! Avoid reloading the SPA.
    } else if (job.projectUrl && currentUrl !== job.projectUrl) {
      await page.goto(job.projectUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
    } else if (!isFlowUrl(currentUrl) && !isGoogleLoginUrl(currentUrl)) {
      await page.goto(FLOW_HOME_URL, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
    }

    if (isGoogleLoginUrl(page.url())) {
      job.status = "awaiting_manual_login";
      job.message =
        "Sign in manually in the browser, open the intended Flow project, then call prepare again.";
      this.touch(job);
      return job;
    }

    if (!isFlowUrl(page.url())) {
      job.status = "awaiting_project_selection";
      job.message =
        "Open the intended Google Flow project in the visible browser, then call prepare again.";
      this.touch(job);
      return job;
    }

    this.setActiveJob(job, targetRole);
    this.emitLifecycleLog("ACTIVE_LOCK_ACQUIRED", job, { role: targetRole });

    try {
      const mode = await this.detectInterfaceMode(page, { timeoutMs: 15000 });

      let promptEditor;
      if (mode === "agent") {
        promptEditor = await this.findAgentPromptEditor(page, { timeoutMs: 15000 });
      } else if (mode === "standard") {
        promptEditor = await this.findPromptEditor(page);
      } else if (mode === "image-editor") {
        throw new Error("FLOW_IMAGE_EDITOR_STILL_OPEN");
      } else {
        throw new Error(
          `FLOW_INTERFACE_UNKNOWN: Cannot prepare a background job on ${page.url()}`
        );
      }

      await this.fillFlowPrompt(page, promptEditor.locator, job.prompt);

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
        await this.saveDiagnosticScreenshot(job.id, page);

      this.emitLifecycleLog("FLOW_PROMPT_DISCOVERY_FAILED", job, {
        errorCode: error?.code || "FLOW_PROMPT_EDITOR_NOT_FOUND",
        error: error?.message || String(error),
        currentUrl:
          page && typeof page.url === "function"
            ? page.url()
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

  async ensureProjectWorkspaceReady(job, targetPage = null) {
    const page = targetPage || this.getPageForJob(job) || this.page;
    if (!page || (typeof page.isClosed === "function" && page.isClosed())) {
      throw new Error("FLOW_PAGE_NOT_AVAILABLE");
    }

    const currentUrl = typeof page.url === "function" ? page.url() : "";
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
          page,
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
            currentUrl: typeof page.url === "function" ? page.url() : "",
            error: error.message,
          }
        );

        this.touch(job);

        return false;
      }

      const afterUrl = typeof page.url === "function" ? page.url() : "";

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

    const finalUrl = typeof page.url === "function" ? page.url() : "";

    if (isGoogleFlowEditorRoute(finalUrl)) {
      return false;
    }

    job.flowSessionReady = true;

    return true;
  }

  async findAgentPromptEditor(pageOrOptions = {}, maybeOptions = {}) {
    let page;
    let options;
    if (pageOrOptions && (typeof pageOrOptions.locator === "function" || typeof pageOrOptions.url === "function")) {
      page = pageOrOptions;
      options = maybeOptions || {};
    } else {
      page = this.page;
      options = pageOrOptions || {};
    }

    const timeoutMs = options.timeoutMs ?? 15000;
    if (!page || (typeof page.isClosed === "function" && page.isClosed())) {
      throw new Error("Flow page is not available.");
    }

    const currentUrl = typeof page.url === "function" ? page.url() : "";
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
        const locator = page.locator(selector);
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
    if (typeof page.locator === "function") {
      try {
        const editables = page.locator(
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
      pageTitle = typeof page.title === "function" ? await page.title().catch(() => "") : "";
    } catch {}

    let diagnosticScreenshotPath = null;
    try {
      if (typeof this.saveDiagnosticScreenshot === "function") {
        diagnosticScreenshotPath = await this.saveDiagnosticScreenshot("prompt-discovery-failed", page).catch(() => null);
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

  async findImageEditPromptEditor(targetPage = null, options = {}) {
    const page = targetPage || this.page;
    if (!page || (typeof page.isClosed === "function" && page.isClosed())) {
      throw new Error("Flow page is not available.");
    }

    const currentUrl = typeof page.url === "function" ? page.url() : "";
    if (!isGoogleFlowEditorRoute(currentUrl)) {
      const error = new Error(
        `FLOW_WRONG_INTERFACE: Expected image editor route. Current URL: ${currentUrl}`,
      );
      error.code = "FLOW_WRONG_INTERFACE";
      throw error;
    }

    const timeoutMs = Number.isFinite(options.timeoutMs)
      ? Math.max(0, options.timeoutMs)
      : 8000;
    const scopedSelector = [
      "flow-edit-image-prompt-box [role='textbox']",
      "flow-edit-image-prompt-box textarea",
      "flow-edit-image-prompt-box [contenteditable='true']",
      "flow-edit-image-prompt-box input:not([type='button']):not([type='submit']):not([type='hidden'])",
    ].join(", ");
    const semanticSelector = [
      '[role="textbox"][aria-label="What do you want to change?"]',
      '[role="textbox"][aria-label*="change" i]',
      '[role="textbox"][aria-label*="edit" i]',
      '[role="textbox"][aria-label*="prompt" i]',
      '[contenteditable="true"][aria-label*="change" i]',
      '[contenteditable="true"][aria-label*="prompt" i]',
      'textarea[placeholder*="change" i]',
      'textarea[placeholder*="edit" i]',
      'textarea[placeholder*="prompt" i]',
      'textarea[aria-label*="change" i]',
      'textarea[aria-label*="prompt" i]',
      'input[placeholder*="change" i]',
      'input[placeholder*="edit" i]',
      'input[placeholder*="prompt" i]',
    ].join(", ");

    const selectors = [
      {
        selector: 'flow-edit-image-prompt-box [role="textbox"][aria-label="What do you want to change?"]',
        scoped: true,
      },
      { selector: scopedSelector, scoped: true },
      { selector: semanticSelector, scoped: false },
    ];
    const startedAt = Date.now();

    while (Date.now() - startedAt <= timeoutMs) {
      for (const entry of selectors) {
        let locator;
        try {
          locator = page.locator(entry.selector);
        } catch {
          continue;
        }

        const count = await locator.count().catch(() => 0);
        const scored = [];

        for (let index = 0; index < count; index += 1) {
          const candidate =
            typeof locator.nth === "function"
              ? locator.nth(index)
              : typeof locator.first === "function"
                ? locator.first()
                : locator;
          const visible = await candidate.isVisible().catch(() => false);
          const enabled =
            typeof candidate.isEnabled !== "function" ||
            (await candidate.isEnabled().catch(() => false));
          if (!visible || !enabled) continue;

          const readAttribute = async (name) =>
            typeof candidate.getAttribute === "function"
              ? await candidate.getAttribute(name).catch(() => null)
              : null;
          const [ariaLabel, placeholder, dataPlaceholder, title, role, editable] =
            await Promise.all([
              readAttribute("aria-label"),
              readAttribute("placeholder"),
              readAttribute("data-placeholder"),
              readAttribute("title"),
              readAttribute("role"),
              readAttribute("contenteditable"),
            ]);
          const description = [
            ariaLabel,
            placeholder,
            dataPlaceholder,
            title,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          let score = entry.scoped ? 5 : 0;
          if (/what do you want to change/.test(description)) score += 10;
          else if (/change|modify|edit|prompt|describe|instruction/.test(description)) {
            score += 6;
          }
          if (role === "textbox") score += 2;
          if (editable === "true") score += 2;

          if (score > 0) scored.push({ locator: candidate, selector: entry.selector, score });
        }

        if (scored.length > 0) {
          const highestScore = Math.max(...scored.map((item) => item.score));
          const best = scored.filter((item) => item.score === highestScore);
          if (best.length > 1) {
            const error = new Error(
              "FLOW_IMAGE_EDIT_PROMPT_AMBIGUOUS: Multiple visible image-edit prompt fields matched.",
            );
            error.code = "FLOW_IMAGE_EDIT_PROMPT_AMBIGUOUS";
            throw error;
          }
          return {
            locator: best[0].locator,
            selector: best[0].selector,
          };
        }
      }

      if (Date.now() - startedAt >= timeoutMs) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const error = new Error(
      "FLOW_IMAGE_EDIT_PROMPT_NOT_FOUND: Could not find a visible, enabled prompt textbox inside the Google Flow image editor (checked role, contenteditable, textarea, input, aria-label and placeholder).",
    );
    error.code = "FLOW_IMAGE_EDIT_PROMPT_NOT_FOUND";
    error.diagnostics = await collectFlowEditorDiagnostics(page).catch(() => null);
    throw error;
  }

  async findImageEditSubmitButton(targetPage = null, options = {}) {
    const page = targetPage || this.page;
    if (!page || (typeof page.isClosed === "function" && page.isClosed())) {
      throw new Error("Flow page is not available.");
    }
    const timeoutMs = Number.isFinite(options.timeoutMs)
      ? Math.max(0, options.timeoutMs)
      : 8000;
    const startedAt = Date.now();

    const visibleEnabled = async (locator) =>
      Boolean(
        locator &&
          (await locator.isVisible().catch(() => false)) &&
          (typeof locator.isEnabled !== "function" ||
            (await locator.isEnabled().catch(() => false))),
      );

    while (Date.now() - startedAt <= timeoutMs) {
      // Prefer the known accessible name, then inspect the editor's own controls.
      if (typeof page.getByRole === "function") {
        const exact = page.getByRole("button", { name: "Start generation" });
        const exactCount = await exact.count().catch(() => 0);
        if (exactCount === 1 && (await visibleEnabled(getFirstLocator(exact)))) {
          return {
            locator: getFirstLocator(exact),
            selector: 'getByRole("button", { name: "Start generation" })',
          };
        }
      }

      if (typeof page.locator === "function") {
        const scopedSelector =
          "flow-edit-image-prompt-box button, flow-edit-image-prompt-box [role='button']";
        const controls = page.locator(scopedSelector);
        const count = await controls.count().catch(() => 0);
        const matches = [];

        for (let index = 0; index < count; index += 1) {
          const candidate =
            typeof controls.nth === "function"
              ? controls.nth(index)
              : typeof controls.first === "function"
                ? controls.first()
                : controls;
          if (!(await candidate.isVisible().catch(() => false))) continue;

          const readAttribute = async (name) =>
            typeof candidate.getAttribute === "function"
              ? await candidate.getAttribute(name).catch(() => null)
              : null;
          const [ariaLabel, title, tooltip, type, text] = await Promise.all([
            readAttribute("aria-label"),
            readAttribute("title"),
            readAttribute("data-tooltip"),
            readAttribute("type"),
            typeof candidate.innerText === "function"
              ? candidate.innerText().catch(() => "")
              : typeof candidate.textContent === "function"
                ? candidate.textContent().catch(() => "")
                : Promise.resolve(""),
          ]);
          const label = [ariaLabel, title, tooltip, text]
            .filter(Boolean)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
          const isGenerationControl =
            /start\s+generation|generate(?:\s+image)?|regenerate|submit/i.test(label) ||
            String(type || "").toLowerCase() === "submit";
          if (isGenerationControl && (typeof candidate.isEnabled !== "function" ||
              (await candidate.isEnabled().catch(() => false)))) {
            matches.push(candidate);
          }
        }

        if (matches.length === 1) {
          return { locator: matches[0], selector: scopedSelector };
        }
        if (matches.length > 1) {
          const error = new Error(
            "FLOW_IMAGE_EDIT_SUBMIT_AMBIGUOUS: Multiple visible generation controls matched inside the image editor.",
          );
          error.code = "FLOW_IMAGE_EDIT_SUBMIT_AMBIGUOUS";
          throw error;
        }
      }

      if (typeof page.getByRole === "function") {
        const named = page.getByRole("button", {
          name: /^(start generation|generate image|generate|regenerate)$/i,
        });
        const count = await named.count().catch(() => 0);
        if (count === 1 && (await visibleEnabled(getFirstLocator(named)))) {
          return {
            locator: getFirstLocator(named),
            selector: 'getByRole("button", { name: /generation action/i })',
          };
        }
      }

      if (Date.now() - startedAt >= timeoutMs) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const error = new Error(
      "FLOW_IMAGE_EDIT_SUBMIT_NOT_FOUND: Could not find a visible, enabled generation button inside the Google Flow image editor.",
    );
    error.code = "FLOW_IMAGE_EDIT_SUBMIT_NOT_FOUND";
    error.diagnostics = await collectFlowEditorDiagnostics(page).catch(() => null);
    throw error;
  }

  async fillFlowPrompt(pageOrLocator, locatorOrPrompt, maybePrompt) {
    let page;
    let locator;
    let prompt;
    if (maybePrompt !== undefined) {
      page = pageOrLocator;
      locator = locatorOrPrompt;
      prompt = maybePrompt;
    } else {
      page = this.page;
      locator = pageOrLocator;
      prompt = locatorOrPrompt;
    }

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
      if (page?.keyboard) {
        await page.keyboard.press("ControlOrMeta+A").catch(() => {});
        await page.keyboard.press("Backspace").catch(() => {});
        if (typeof page.keyboard.insertText === "function") {
          await page.keyboard.insertText(prompt).catch(() => {});
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

  async findPromptEditor(targetPage = null) {
    const page = targetPage || this.page;
    if (!page || (typeof page.isClosed === "function" && page.isClosed()))
      throw new Error("Flow page is not available.");

    if (this.promptSelector) {
      const configured = page.locator(this.promptSelector);
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

    const candidates = page.locator(
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

  async submitAgentPrompt(job, confirmation, targetPage = null) {
    const page = targetPage || (await this.resolveJobPage(job));
    if (
      !page ||
      (typeof page.isClosed === "function" && page.isClosed())
    ) {
      throw new Error("Flow page is not available.");
    }

    const currentUrl = typeof page.url === "function" ? page.url() : "";
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
    const promptEditor = await this.findAgentPromptEditor(page, { timeoutMs: 15000 });
    this.emitLifecycleLog("FLOW_AGENT_PROMPT_DISCOVERY_COMPLETED", job, {
      selector: promptEditor.selector,
    });

    await this.fillFlowPrompt(page, promptEditor.locator, job.prompt);

    job.status = "prompt_filled";
    job.message = "Prompt populated into Google Flow Agent box.";
    this.touch(job);

    const submitLocator = page.locator(
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
      page,
    ).catch(() => null);

    // 7. Record asset baseline
    const baseline = await this.getOutputAssetBaseline(page);

    // 7b. Attach Job-Scoped Network Response Interceptor to capture generation image streams (WebP/PNG/JPEG)
    await this.startImageResponseCapture(job, page);

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
      page,
    ).catch(() => null);

    // 10. Observe Agent response & handle confirmation
    await new Promise((r) => setTimeout(r, 2000));
    const confirmationInfo = await this.inspectAgentConfirmation(job, page);

    if (confirmationInfo.required) {
      job.status = "awaiting_agent_confirmation";
      job.message =
        "Google Flow Agent requested confirmation before generating media.";
      this.touch(job);

      if (
        confirmation?.confirmGenerate === true &&
        confirmation?.referenceConfirmed === true
      ) {
        await this.handleAgentConfirmationAction(job, page);
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
    this.monitorGenerationAndDownload(job.id, page, baseline).catch((err) => {
      console.warn(
        `[FlowBrowser] Generation monitor notice for job ${job.id}:`,
        err.message,
      );
    });

    return job;
  }

  async inspectAgentConfirmation(job, targetPage = null) {
    const page = targetPage || this.getPageForJob(job) || this.page;
    if (
      !page ||
      (typeof page.isClosed === "function" && page.isClosed())
    ) {
      return { required: false, actionAvailable: false };
    }

    try {
      if (typeof page.locator !== "function")
        return { required: false, actionAvailable: false };

      const agentMessages = page.locator(
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

  async detectAgentConfirmationRequired(job, targetPage = null) {
    const info = await this.inspectAgentConfirmation(job, targetPage);
    return info.required;
  }

  async handleAgentConfirmationAction(job, targetPage = null) {
    const page = targetPage || this.getPageForJob(job) || this.page;
    if (
      !page ||
      (typeof page.isClosed === "function" && page.isClosed())
    )
      return;

    try {
      if (typeof page.locator !== "function") return;

      const agentMessages = page.locator(
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
        page.locator(
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

  async attachFlowIngredients(job, referenceAssets, targetPage = null) {
    if (!Array.isArray(referenceAssets) || referenceAssets.length === 0) {
      return true;
    }
    const page = targetPage || this.getPageForJob(job) || this.page;
    if (
      !page ||
      (typeof page.isClosed === "function" && page.isClosed())
    ) {
      throw new Error("Flow page is not available for ingredient attachment.");
    }

    try {
      if (typeof page.locator !== "function") return false;

      for (const asset of referenceAssets) {
        const cleanName = String(asset.flowCharacterName || asset.name || "")
          .replace(/^[-–—•*_#\s]+|[-–—•*_#:\s]+$/g, "")
          .trim();
        if (!cleanName) continue;

        const ingredientsBtn = getFirstLocator(
          page.locator(
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
              page.locator(
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
              page.locator(
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
            page.locator(
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
            page.locator(
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
              page.locator(
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

  normalizeFlowEditorAspectRatio(value) {
    const raw = String(value || "16:9").trim().toLowerCase().replace(/\s+/g, "");
    const supported = new Map([
      ["original", "Original"],
      ["16:9", "16:9"],
      ["4:3", "4:3"],
      ["1:1", "1:1"],
      ["3:4", "3:4"],
      ["9:16", "9:16"],
    ]);
    const option = supported.get(raw);
    if (!option) {
      const error = new Error(
        `FLOW_IMAGE_EDIT_RATIO_UNSUPPORTED: Google Flow image editing supports Original, 16:9, 4:3, 1:1, 3:4, or 9:16. Received "${value}".`,
      );
      error.code = "FLOW_IMAGE_EDIT_RATIO_UNSUPPORTED";
      throw error;
    }
    return option;
  }

  async selectFlowEditorAspectRatio(targetPage, requestedRatio, job = null) {
    const page = targetPage || this.page;
    if (!page || (typeof page.isClosed === "function" && page.isClosed())) {
      throw new Error("Flow page is not available for image-editor aspect-ratio selection.");
    }

    const optionLabel = this.normalizeFlowEditorAspectRatio(requestedRatio);
    const settingsSelector =
      'button.settings-trigger-button[aria-label="Settings trigger"], button[aria-label="Settings trigger"]';
    const settingsButtons = page.locator(settingsSelector);
    const settingsCount = await settingsButtons.count().catch(() => 0);
    const visibleSettings = [];

    for (let index = 0; index < settingsCount; index += 1) {
      const candidate = typeof settingsButtons.nth === "function"
        ? settingsButtons.nth(index)
        : typeof settingsButtons.first === "function"
          ? settingsButtons.first()
          : settingsButtons;
      if (await candidate.isVisible().catch(() => false)) {
        visibleSettings.push(candidate);
      }
    }

    if (visibleSettings.length !== 1) {
      const error = new Error(
        `FLOW_IMAGE_EDIT_SETTINGS_TRIGGER_NOT_FOUND: Expected one visible Settings trigger in the image editor, found ${visibleSettings.length}.`,
      );
      error.code = "FLOW_IMAGE_EDIT_SETTINGS_TRIGGER_NOT_FOUND";
      throw error;
    }

    const settingsButton = visibleSettings[0];
    if (
      typeof settingsButton.isEnabled === "function" &&
      !(await settingsButton.isEnabled().catch(() => false))
    ) {
      const error = new Error("FLOW_IMAGE_EDIT_SETTINGS_TRIGGER_DISABLED: Google Flow image-editor settings are disabled.");
      error.code = "FLOW_IMAGE_EDIT_SETTINGS_TRIGGER_DISABLED";
      throw error;
    }

    await settingsButton.click({ timeout: 10000 });
    await new Promise((resolve) => setTimeout(resolve, 250));

    const visibleMatches = [];
    const strategies = [];
    if (typeof page.getByRole === "function") {
      strategies.push(() => page.getByRole("button", { name: optionLabel, exact: true }));
      strategies.push(() => page.getByRole("menuitem", { name: optionLabel, exact: true }));
    }
    if (typeof page.getByText === "function") {
      strategies.push(() => page.getByText(optionLabel, { exact: true }));
    }

    for (const createLocator of strategies) {
      let locator;
      try {
        locator = createLocator();
      } catch {
        continue;
      }
      const count = await locator.count().catch(() => 0);
      for (let index = 0; index < count; index += 1) {
        const candidate = typeof locator.nth === "function"
          ? locator.nth(index)
          : typeof locator.first === "function"
            ? locator.first()
            : locator;
        if (await candidate.isVisible().catch(() => false)) {
          const enabled = typeof candidate.isEnabled !== "function" ||
            (await candidate.isEnabled().catch(() => false));
          if (enabled) visibleMatches.push(candidate);
        }
      }
      if (visibleMatches.length > 0) break;
    }

    if (visibleMatches.length !== 1) {
      const error = new Error(
        `FLOW_IMAGE_EDIT_RATIO_OPTION_NOT_FOUND: Could not uniquely locate the "${optionLabel}" aspect-ratio option after opening Settings (visible matches: ${visibleMatches.length}).`,
      );
      error.code = "FLOW_IMAGE_EDIT_RATIO_OPTION_NOT_FOUND";
      throw error;
    }

    await visibleMatches[0].click({ timeout: 10000 });
    if (job) {
      job.aspectRatio = requestedRatio || optionLabel;
      job.aspectRatioApplied = optionLabel;
    }
    this.emitLifecycleLog("FLOW_EDITOR_ASPECT_RATIO_SELECTED", job, {
      requestedAspectRatio: requestedRatio || optionLabel,
      selectedAspectRatio: optionLabel,
      settingsSelector,
    });
    return { selected: optionLabel };
  }

  async getEditorImageSnapshot(targetPage, options = {}) {
    return await inspectGoogleFlowEditedImage(targetPage || this.page, options);
  }

  async downloadEditedEditorImage({ page, job, previousSourceUrl, timeoutMs = 30000 }) {
    return await downloadGoogleFlowEditedImage({
      page: page || this.getPageForJob(job) || this.page,
      job,
      downloadDir: this.downloadDir,
      previousSourceUrl,
      timeoutMs,
      logger: console,
      onPhase: (phase, details) => this.emitLifecycleLog(phase, job, details),
    });
  }

  async submitRegenerationPrompt(job, confirmation, targetPage = null) {
    const page = targetPage || (await this.resolveJobPage(job));
    if (
      !page ||
      (typeof page.isClosed === "function" && page.isClosed())
    ) {
      throw new Error("Flow page is not available.");
    }

    const currentUrl = typeof page.url === "function" ? page.url() : "";
    const editorRef = extractGoogleFlowEditorReference(currentUrl);
    if (!editorRef) {
      const err = new Error(
        `FLOW_REGENERATION_FAILED: Expected Google Flow editor route (/project/{projectId}/edit/{assetId}), but current URL is '${currentUrl}'.`
      );
      this.emitLifecycleLog("FLOW_REGENERATION_FAILED", job, { error: err.message });
      throw err;
    }

    try {
      // Apply ratio only in the existing-image editor. The first-time
      // generation workflow continues to use its existing settings path.
      await this.selectFlowEditorAspectRatio(page, job.aspectRatio, job);
    } catch (error) {
      this.emitLifecycleLog("FLOW_REGENERATION_FAILED", job, {
        error: error.message,
        errorCode: error.code || "FLOW_IMAGE_EDIT_RATIO_SELECTION_FAILED",
        requestedAspectRatio: job.aspectRatio,
        currentUrl,
      });
      throw error;
    }

    let submitBtn;
    try {
      const submitControl = await this.findImageEditSubmitButton(page);
      submitBtn = submitControl.locator;
      job.submitSelectorUsed = submitControl.selector;
    } catch (error) {
      this.emitLifecycleLog("FLOW_REGENERATION_FAILED", job, {
        error: error.message,
        errorCode: error.code || "FLOW_IMAGE_EDIT_SUBMIT_NOT_FOUND",
        currentUrl,
      });
      throw error;
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

    // Remember the current editor image before clicking Generate. The
    // regeneration monitor must observe a different read-only image source
    // before it is allowed to download anything, avoiding stale-image imports.
    const previousEditorImage = await this.getEditorImageSnapshot(page, {
      timeoutMs: 5000,
    });
    if (!previousEditorImage?.sourceUrl) {
      const error = new Error(
        "FLOW_EDITOR_IMAGE_NOT_FOUND: Cannot safely regenerate because the existing read-only image source could not be verified.",
      );
      error.code = "FLOW_EDITOR_IMAGE_NOT_FOUND";
      this.emitLifecycleLog("FLOW_REGENERATION_FAILED", job, {
        error: error.message,
        errorCode: error.code,
        currentUrl,
      });
      throw error;
    }
    job.previousEditorImageSourceUrl = previousEditorImage.sourceUrl;
    this.emitLifecycleLog("FLOW_EDITOR_BASELINE_IMAGE_CAPTURED", job, {
      sourceUrl: previousEditorImage.sourceUrl,
      naturalWidth: previousEditorImage.naturalWidth,
      naturalHeight: previousEditorImage.naturalHeight,
    });

    const baseline = await this.getOutputAssetBaseline(page);
    await this.startImageResponseCapture(job, page);

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

    this.monitorRegenerationAndDownload(job.id, page, baseline).catch((err) => {
      console.warn(`[FlowBrowser] Regeneration monitor notice for job ${job.id}:`, err.message);
    });

    return job;
  }

  async monitorRegenerationAndDownload(jobId, pageOrBaseline = { count: 0, identifiers: new Set() }, maybeBaseline = null) {
    const job = this.jobs.get(jobId);
    let page = null;

    // Preserve the old call signature, but regeneration no longer downloads
    // from the chat gallery or uses the native Windows Save As menu.
    if (
      pageOrBaseline &&
      typeof pageOrBaseline === "object" &&
      typeof pageOrBaseline.goto === "function"
    ) {
      page = pageOrBaseline;
    }
    if (!page) {
      page = this.getPageForJob(job) || this.page;
    }

    if (!job || !page || (typeof page.isClosed === "function" && page.isClosed())) {
      return;
    }

    try {
      const previousSourceUrl = job.previousEditorImageSourceUrl;
      if (!previousSourceUrl) {
        const error = new Error(
          "FLOW_EDITOR_BASELINE_IMAGE_MISSING: Regeneration cannot download an edited image because the pre-generation editor image URL was not captured.",
        );
        error.code = "FLOW_EDITOR_BASELINE_IMAGE_MISSING";
        throw error;
      }

      job.status = "generating";
      job.message = "Regeneration in progress in Google Flow. Waiting for the editor image source to change...";
      this.touch(job);

      // The editor keeps the existing image visible while generation runs.
      // Wait for the read-only image's actual source URL to change and for the
      // replacement image to finish loading. Never treat a re-enabled button
      // or an unrelated /asb/ network response as proof of a new editor image.
      const maxWaitMs = 90000;
      const startTime = Date.now();
      const pollIntervalMs = 750;
      let updatedImage = null;

      while (Date.now() - startTime < maxWaitMs) {
        if (
          !page ||
          (typeof page.isClosed === "function" && page.isClosed()) ||
          job.status === "completed" ||
          job.status === "cancelled"
        ) {
          return;
        }

        updatedImage = await this.getEditorImageSnapshot(page, {
          previousSourceUrl,
          timeoutMs: 0,
        }).catch(() => null);
        if (updatedImage?.sourceUrl && updatedImage.sourceUrl !== previousSourceUrl) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }

      if (!updatedImage?.sourceUrl || updatedImage.sourceUrl === previousSourceUrl) {
        const error = new Error(
          "FLOW_EDITOR_IMAGE_NOT_UPDATED: Google Flow did not replace the read-only image source before the regeneration timeout.",
        );
        error.code = "FLOW_EDITOR_IMAGE_NOT_UPDATED";
        throw error;
      }

      this.emitLifecycleLog("FLOW_REGENERATION_COMPLETED", job, {
        previousImageSourceUrl: previousSourceUrl,
        updatedImageSourceUrl: updatedImage.sourceUrl,
        naturalWidth: updatedImage.naturalWidth,
        naturalHeight: updatedImage.naturalHeight,
      });

      const currentUrl = typeof page.url === "function" ? page.url() : "";
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
      this.emitLifecycleLog("DOWNLOAD_STARTED", job, {
        downloadMethod: "editor_image_source_fetch",
        imageSourceUrl: updatedImage.sourceUrl,
      });
      job.message = "Downloading the regenerated image directly from the Google Flow image editor...";
      this.touch(job);

      const editedImage = await this.downloadEditedEditorImage({
        page,
        job,
        previousSourceUrl,
        timeoutMs: 30000,
      });

      if (!editedImage?.success || !Buffer.isBuffer(editedImage.buffer)) {
        throw new Error(
          "FLOW_EDITOR_IMAGE_DOWNLOAD_FAILED: The active edited image could not be fetched and validated.",
        );
      }

      job.googleFlowImageRef =
        editedImage.googleFlowImageRef || editedImage.sourceUrl;
      job.googleFlowImageSourceUrl =
        editedImage.googleFlowImageSourceUrl || editedImage.sourceUrl;
      job.downloadPath = editedImage.path;
      job.downloadMethod = "editor_image_source_fetch";
      this.emitLifecycleLog("FLOW_BACKGROUND_IMAGE_VALIDATED", job, {
        success: true,
        downloadMethod: "editor_image_source_fetch",
        mimeType: editedImage.mimeType,
        width: editedImage.width,
        height: editedImage.height,
        sourceUrl: editedImage.sourceUrl,
      });

      // Keep the existing Done-editing cleanup and import/persistence flow.
      let editorClosed = false;
      let editorCloseError = null;
      try {
        const closeRes = await closeFlowImageEditor(page, console, {
          timeoutMs: 15000,
          requireEditorRoute: true,
          expectedProjectId: job.googleFlowProjectId,
          logTransition: (ph, details) => this.emitLifecycleLog(ph, job, details),
        });
        editorClosed = closeRes?.closed ?? Boolean(closeRes);
      } catch (closeErr) {
        editorCloseError = closeErr.message;
        console.warn(
          `[FlowBrowser] Editor close cleanup notice for job ${job.id}:`,
          closeErr.message,
        );
      }

      job.status = "importing";
      job.downloadStatus = "completed";
      job.editorCloseStatus = editorClosed ? "closed" : "failed";
      job.flowSessionReady = editorClosed;
      job.editorCloseError = editorCloseError || null;
      job.downloadPath = editedImage.path;
      job.downloadMethod = "editor_image_source_fetch";
      this.touch(job);

      await this.importDownloadedAsset(job, editedImage.buffer, {
        mimeType: editedImage.mimeType,
        extension: editedImage.extension,
      });
      job.flowSessionReady = editorClosed;
    } catch (error) {
      this.emitLifecycleLog("FLOW_REGENERATION_FAILED", job, {
        error: error.message,
        errorCode: error.code || "FLOW_REGENERATION_FAILED",
      });
      this.setJobTerminal(
        job,
        "failed",
        error.message,
        "Google Flow background regeneration failed.",
      );
    }
  }

  async getCharacterOutputBaseline(targetPage) {
    const page = targetPage || this.getFlowPage(FLOW_TAB_ROLES.CHARACTER);
    const identifiers = new Set();
    if (!page || typeof page.locator !== "function") return { identifiers };

    const addSource = (rawSource) => {
      if (!rawSource) return;
      let absoluteUrl = String(rawSource);
      try {
        absoluteUrl = new URL(absoluteUrl, page.url()).href;
        identifiers.add(absoluteUrl);
        const parsed = new URL(absoluteUrl);
        const assetPath = parsed.pathname.split("/asb/")[1] || "";
        const assetKey = assetPath ? assetPath.split("/")[0].split("=")[0] : "";
        if (assetKey) identifiers.add(assetKey);
      } catch {
        identifiers.add(absoluteUrl);
      }
    };

    const images = page.locator(
      "flow-grid-tile-container flow-character-tile img.character-tile-thumbnail, flow-character-tile img.character-tile-thumbnail, img.character-tile-thumbnail",
    );
    const count = await images.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const image = typeof images.nth === "function" ? images.nth(index) : images;
      const src = await image.getAttribute("src").catch(() => null);
      addSource(src);
    }

    // On an already-saved Character editor, the canonical image is displayed
    // in the editor rather than as a character-tile thumbnail. Include all
    // currently rendered Flow image sources so a delayed/duplicated response
    // for the old reference cannot be mistaken for the new directional view.
    const currentRoute = extractGoogleFlowCharacterReference(
      typeof page.url === "function" ? page.url() : "",
    );
    if (currentRoute?.routeType === "character-editor") {
      const visibleImages = page.locator('img[src*="/asb/"], img[srcset*="/asb/"]');
      const visibleCount = await visibleImages.count().catch(() => 0);
      for (let index = 0; index < visibleCount; index += 1) {
        const image = typeof visibleImages.nth === "function"
          ? visibleImages.nth(index)
          : visibleImages;
        if (!(await image.isVisible().catch(() => false))) continue;
        let source = await image.getAttribute("src").catch(() => null);
        if (typeof image.evaluate === "function") {
          source = await image.evaluate((img) =>
            img.currentSrc || img.src || img.getAttribute("src") || "",
          ).catch(() => source);
        }
        addSource(source);
      }
    }

    return { identifiers };
  }

  async collectNewCharacterOutput(targetPage, baseline = { identifiers: new Set() }) {
    const page = targetPage || this.getFlowPage(FLOW_TAB_ROLES.CHARACTER);
    if (!page || typeof page.locator !== "function") return [];

    const selector =
      "flow-grid-tile-container[aria-label] flow-character-tile img.character-tile-thumbnail, " +
      "flow-character-tile img.character-tile-thumbnail, img.character-tile-thumbnail";
    const images = page.locator(selector);
    const count = await images.count().catch(() => 0);
    const results = [];

    for (let index = 0; index < count; index += 1) {
      const image = typeof images.nth === "function" ? images.nth(index) : images;
      if (!(await image.isVisible().catch(() => false))) continue;

      const details = await image.evaluate((img) => {
        const rect = img.getBoundingClientRect
          ? img.getBoundingClientRect()
          : { width: 0, height: 0 };
        const tile =
          img.closest("flow-grid-tile-container") ||
          img.closest("flow-character-tile");
        const name =
          tile?.getAttribute("aria-label") ||
          tile?.querySelector(".character-tile-name")?.textContent?.trim() ||
          "";
        return {
          src: img.getAttribute("src") || img.currentSrc || img.src || "",
          currentSrc: img.currentSrc || img.src || "",
          alt: img.alt || "",
          complete: Boolean(img.complete),
          naturalWidth: img.naturalWidth || 0,
          naturalHeight: img.naturalHeight || 0,
          visible: rect.width > 0 && rect.height > 0,
          characterName: name,
        };
      }).catch(() => null);

      if (
        !details?.visible ||
        !details.complete ||
        details.naturalWidth < 32 ||
        details.naturalHeight < 32
      ) {
        continue;
      }

      const rawSrc = details.currentSrc || details.src;
      if (!rawSrc) continue;
      let sourceUrl;
      try {
        sourceUrl = new URL(rawSrc, page.url()).href;
      } catch {
        continue;
      }

      if (!sourceUrl.startsWith("https://flow.google.com/asb/")) continue;
      const assetPath = new URL(sourceUrl).pathname.split("/asb/")[1] || "";
      const assetKey = assetPath ? assetPath.split("/")[0].split("=")[0] : "";
      if (
        baseline?.identifiers?.has(sourceUrl) ||
        baseline?.identifiers?.has(rawSrc) ||
        (assetKey && baseline?.identifiers?.has(assetKey))
      ) {
        continue;
      }

      results.push({
        sourceUrl,
        rawSrc,
        naturalWidth: details.naturalWidth,
        naturalHeight: details.naturalHeight,
        characterName: details.characterName,
        imageLocator: image,
      });
    }

    return results;
  }

  async downloadCharacterImageSource(page, job, sourceUrl, captured = null) {
    if (!sourceUrl || typeof sourceUrl !== "string") {
      throw new Error("FLOW_CHARACTER_IMAGE_SOURCE_MISSING: No character image URL was identified.");
    }
    const parsed = new URL(sourceUrl);
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== "flow.google.com" ||
      !parsed.pathname.startsWith("/asb/")
    ) {
      throw new Error(
        "FLOW_CHARACTER_IMAGE_SOURCE_REJECTED: Expected an https://flow.google.com/asb/ character thumbnail URL.",
      );
    }

    let buffer = captured?.buffer || null;
    if (!buffer) {
      const context = typeof page.context === "function" ? page.context() : null;
      const requestContext = context?.request || page.request || null;
      if (requestContext && typeof requestContext.get === "function") {
        const response = await requestContext.get(sourceUrl, { timeout: 30000 });
        const ok =
          typeof response.ok === "function"
            ? response.ok()
            : typeof response.status === "function" && response.status() === 200;
        if (!ok) {
          const status = typeof response.status === "function" ? response.status() : "unknown";
          throw new Error(
            "FLOW_CHARACTER_IMAGE_FETCH_FAILED: Google Flow returned HTTP " + status + ".",
          );
        }
        buffer = await response.body();
      } else if (typeof page.evaluate === "function") {
        const fetched = await page.evaluate(async (url) => {
          const response = await fetch(url, { credentials: "include" });
          if (!response.ok) throw new Error("Image request failed with HTTP " + response.status);
          const bytes = new Uint8Array(await response.arrayBuffer());
          let binary = "";
          for (let offset = 0; offset < bytes.length; offset += 0x8000) {
            binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
          }
          return {
            base64: btoa(binary),
            contentType: response.headers.get("content-type") || "",
          };
        }, sourceUrl);
        buffer = Buffer.from(fetched.base64, "base64");
      } else {
        throw new Error("FLOW_CHARACTER_IMAGE_FETCH_UNAVAILABLE: No authenticated image fetch mechanism is available.");
      }
    }

    if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
      throw new Error("FLOW_CHARACTER_IMAGE_INVALID_SIZE: Character image response is empty or exceeds the worker image limit.");
    }
    const imageType = detectImageType(buffer);
    if (!imageType) {
      throw new Error("FLOW_CHARACTER_IMAGE_UNSUPPORTED: Character thumbnail is not a supported PNG, JPEG, or WebP image.");
    }
    const dimensions = parseImageDimensions(buffer);
    if (dimensions.width < 32 || dimensions.height < 32) {
      throw new Error(
        `FLOW_CHARACTER_IMAGE_INVALID_DIMENSIONS: Character image dimensions are ${dimensions.width}x${dimensions.height}.`,
      );
    }

    await fs.mkdir(this.downloadDir, { recursive: true });
    const fileName =
      safeFilename(job.id || "flow-character") +
      "-character-" +
      Date.now() +
      "." +
      imageType.extension;
    const outputPath = path.join(this.downloadDir, fileName);
    await fs.writeFile(outputPath, buffer);

    return {
      buffer,
      path: outputPath,
      fileName,
      fileSize: buffer.length,
      mimeType: imageType.mimeType,
      extension: imageType.extension,
      width: dimensions.width,
      height: dimensions.height,
      sourceUrl,
    };
  }

  async findCharacterPromptEditor(page) {
    if (!page || (typeof page.isClosed === "function" && page.isClosed())) {
      throw new Error("FLOW_CHARACTER_PAGE_CLOSED: Character page is closed or unavailable.");
    }

    const selectors = [
      'flow-rich-text-editor.prompt-input [role="textbox"][aria-label*="Describe your character" i]',
      'flow-rich-text-editor.prompt-input [role="textbox"][aria-label="Describe your character…"]',
      'flow-rich-text-editor [role="textbox"][aria-label*="Describe your character" i]',
      '[role="textbox"][aria-label*="Describe your character" i]',
      '[role="textbox"][aria-label="Describe your character…"]',
      'flow-rich-text-editor.prompt-input .ProseMirror[contenteditable="true"]',
      'flow-rich-text-editor.prompt-input [contenteditable="true"]',
      'flow-character-prompt-box .prosemirror-editor [role="textbox"][aria-label*="Describe your character" i]',
      'flow-character-prompt-box [role="textbox"][aria-label*="Describe your character" i]',
      'flow-character-prompt-box .ProseMirror[contenteditable="true"]',
      'flow-character-prompt-box [contenteditable="true"]',
      'flow-character-editor flow-character-prompt-box [role="textbox"]',
      'flow-character-create flow-character-prompt-box [role="textbox"]',
    ];

    let foundLocator = null;
    let foundSelector = null;

    for (const selector of selectors) {
      if (typeof page.locator !== "function") break;
      const locator = page.locator(selector);
      const count = await locator.count().catch(() => 0);
      const visibleMatches = [];

      for (let index = 0; index < count; index += 1) {
        const candidate = typeof locator.nth === "function" ? locator.nth(index) : locator;
        const visible = await candidate.isVisible().catch(() => false);
        const enabled =
          typeof candidate.isEnabled !== "function" ||
          (await candidate.isEnabled().catch(() => false));
        if (!visible || !enabled) continue;

        // Real Playwright locators support evaluate(). Keep a guarded fallback
        // for locator-compatible adapters/test doubles; explicit Character
        // selectors are already label-scoped and must not require evaluate().
        let isAgent = false;
        if (typeof candidate.evaluate === "function") {
          isAgent = await candidate.evaluate((el) => {
            if (!el) return false;
            if (
              el.closest("flow-creative-agent-prompt-box") ||
              el.closest(".agent-panel-prompt-box")
            ) {
              return true;
            }
            const label = el.getAttribute("aria-label") || "";
            return /what do you want to create/i.test(label);
          }).catch(() => false);
        } else {
          const [ariaLabel, placeholder] = await Promise.all([
            typeof candidate.getAttribute === "function"
              ? candidate.getAttribute("aria-label").catch(() => null)
              : Promise.resolve(null),
            typeof candidate.getAttribute === "function"
              ? candidate.getAttribute("placeholder").catch(() => null)
              : Promise.resolve(null),
          ]);
          const promptDescription = [ariaLabel, placeholder].filter(Boolean).join(" ");
          isAgent = /what do you want to create/i.test(promptDescription);
          if (
            !isAgent &&
            !/describe your character/i.test(promptDescription) &&
            !/flow-character-prompt-box|Describe your character/i.test(selector)
          ) {
            // A generic contenteditable without DOM inspection or a
            // Character-specific label is not safe to treat as our prompt.
            isAgent = true;
          }
        }

        if (isAgent) continue;
        visibleMatches.push(candidate);
      }

      if (visibleMatches.length > 1) {
        const error = new Error(
          `FLOW_CHARACTER_PROMPT_AMBIGUOUS: Selector "${selector}" matched ${visibleMatches.length} visible character prompt fields.`,
        );
        error.code = "FLOW_CHARACTER_PROMPT_AMBIGUOUS";
        throw error;
      }
      if (visibleMatches.length === 1) {
        foundLocator = visibleMatches[0];
        foundSelector = selector;
        break;
      }
    }

    if (!foundLocator && typeof page.getByRole === "function") {
      const byRole = page.getByRole("textbox", {
        name: /Describe your character/i,
      });
      const count = await byRole.count().catch(() => 0);
      if (count === 1) {
        const candidate = typeof byRole.first === "function" ? byRole.first() : byRole;
        const visible = await candidate.isVisible().catch(() => false);
        let isAgent = false;
        if (typeof candidate.evaluate === "function") {
          isAgent = await candidate.evaluate((el) =>
            Boolean(
              el?.closest("flow-creative-agent-prompt-box") ||
              el?.closest(".agent-panel-prompt-box"),
            ),
          ).catch(() => false);
        } else if (typeof candidate.getAttribute === "function") {
          const label = await candidate.getAttribute("aria-label").catch(() => "");
          isAgent = /what do you want to create/i.test(label || "");
        }
        if (visible && !isAgent) {
          foundLocator = candidate;
          foundSelector = 'getByRole("textbox", { name: /Describe your character/i })';
        }
      }
    }

    if (!foundLocator) {
      const error = new Error(
        "FLOW_CHARACTER_PROMPT_NOT_FOUND: Could not find the dedicated 'Describe your character…' textbox.",
      );
      error.code = "FLOW_CHARACTER_PROMPT_NOT_FOUND";
      throw error;
    }

    return { locator: foundLocator, selector: foundSelector };
  }

  async findCharacterEditorPromptEditor(page) {
    if (!page || (typeof page.isClosed === "function" && page.isClosed())) {
      throw new Error("FLOW_CHARACTER_PAGE_CLOSED: Saved Character editor is unavailable.");
    }

    const currentRoute = extractGoogleFlowCharacterReference(
      typeof page.url === "function" ? page.url() : "",
    );
    if (currentRoute?.routeType !== "character-editor" || !currentRoute.characterId) {
      const error = new Error(
        "FLOW_CHARACTER_EDITOR_ROUTE_REQUIRED: Expected a saved Google Flow Character editor route.",
      );
      error.code = "FLOW_CHARACTER_EDITOR_ROUTE_REQUIRED";
      throw error;
    }

    const selectors = [
      'flow-edit-image-prompt-box [role="textbox"][aria-label="What do you want to change?"]',
      'flow-edit-image-prompt-box [role="textbox"]',
      'flow-edit-image-prompt-box textarea',
      'flow-edit-image-prompt-box [contenteditable="true"]',
      '[role="textbox"][aria-label="What do you want to change?"]',
      'textarea[placeholder*="What do you want to change" i]',
      '[contenteditable="true"][aria-label*="What do you want to change" i]',
    ];

    for (const selector of selectors) {
      if (typeof page.locator !== "function") break;
      const locator = page.locator(selector);
      const count = await locator.count().catch(() => 0);
      const matches = [];

      for (let index = 0; index < count; index += 1) {
        const candidate = typeof locator.nth === "function" ? locator.nth(index) : locator;
        if (!(await candidate.isVisible().catch(() => false))) continue;
        if (
          typeof candidate.isEnabled === "function" &&
          !(await candidate.isEnabled().catch(() => false))
        ) {
          continue;
        }

        const [ariaLabel, placeholder, dataPlaceholder, title] = await Promise.all([
          typeof candidate.getAttribute === "function"
            ? candidate.getAttribute("aria-label").catch(() => null)
            : Promise.resolve(null),
          typeof candidate.getAttribute === "function"
            ? candidate.getAttribute("placeholder").catch(() => null)
            : Promise.resolve(null),
          typeof candidate.getAttribute === "function"
            ? candidate.getAttribute("data-placeholder").catch(() => null)
            : Promise.resolve(null),
          typeof candidate.getAttribute === "function"
            ? candidate.getAttribute("title").catch(() => null)
            : Promise.resolve(null),
        ]);
        const description = [ariaLabel, placeholder, dataPlaceholder, title]
          .filter(Boolean)
          .join(" ");
        if (
          !/what do you want to change/i.test(description) &&
          !selector.startsWith("flow-edit-image-prompt-box")
        ) {
          continue;
        }
        matches.push(candidate);
      }

      if (matches.length > 1) {
        const error = new Error(
          "FLOW_CHARACTER_EDITOR_PROMPT_AMBIGUOUS: Multiple edit prompts were found in the saved Character editor.",
        );
        error.code = "FLOW_CHARACTER_EDITOR_PROMPT_AMBIGUOUS";
        throw error;
      }
      if (matches.length === 1) {
        return { locator: matches[0], selector };
      }
    }

    if (typeof page.getByRole === "function") {
      const textbox = page.getByRole("textbox", {
        name: /What do you want to change/i,
      });
      const count = await textbox.count().catch(() => 0);
      if (count === 1) {
        const candidate = typeof textbox.first === "function" ? textbox.first() : textbox;
        if (await candidate.isVisible().catch(() => false)) {
          return {
            locator: candidate,
            selector: 'getByRole("textbox", { name: /What do you want to change/i })',
          };
        }
      }
    }

    const error = new Error(
      "FLOW_CHARACTER_EDITOR_PROMPT_NOT_FOUND: Could not find the 'What do you want to change?' prompt in the saved Character editor.",
    );
    error.code = "FLOW_CHARACTER_EDITOR_PROMPT_NOT_FOUND";
    throw error;
  }

  async findCharacterEditorSubmitButton(
    page,
    { allowDisabled = false, timeoutMs = 8000 } = {},
  ) {
    if (!page || (typeof page.isClosed === "function" && page.isClosed())) {
      throw new Error("FLOW_CHARACTER_PAGE_CLOSED: Saved Character editor is unavailable.");
    }

    const currentRoute = extractGoogleFlowCharacterReference(
      typeof page.url === "function" ? page.url() : "",
    );
    if (currentRoute?.routeType !== "character-editor" || !currentRoute.characterId) {
      const error = new Error(
        "FLOW_CHARACTER_EDITOR_ROUTE_REQUIRED: Cannot submit a view outside the saved Character editor.",
      );
      error.code = "FLOW_CHARACTER_EDITOR_ROUTE_REQUIRED";
      throw error;
    }

    const startedAt = Date.now();
    while (Date.now() - startedAt <= timeoutMs) {
      if (typeof page.locator === "function") {
        const controls = page.locator(
          "flow-edit-image-prompt-box button, flow-edit-image-prompt-box [role='button']",
        );
        const count = await controls.count().catch(() => 0);
        const matches = [];

        for (let index = 0; index < count; index += 1) {
          const candidate = typeof controls.nth === "function" ? controls.nth(index) : controls;
          if (!(await candidate.isVisible().catch(() => false))) continue;

          const [ariaLabel, title, tooltip, type, textContent] = await Promise.all([
            typeof candidate.getAttribute === "function"
              ? candidate.getAttribute("aria-label").catch(() => null)
              : Promise.resolve(null),
            typeof candidate.getAttribute === "function"
              ? candidate.getAttribute("title").catch(() => null)
              : Promise.resolve(null),
            typeof candidate.getAttribute === "function"
              ? candidate.getAttribute("data-tooltip").catch(() => null)
              : Promise.resolve(null),
            typeof candidate.getAttribute === "function"
              ? candidate.getAttribute("type").catch(() => null)
              : Promise.resolve(null),
            typeof candidate.innerText === "function"
              ? candidate.innerText().catch(() => "")
              : typeof candidate.textContent === "function"
                ? candidate.textContent().catch(() => "")
                : Promise.resolve(""),
          ]);
          const label = [ariaLabel, title, tooltip, textContent]
            .filter(Boolean)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
          const isSubmit =
            String(type || "").toLowerCase() === "submit" ||
            /send|generate|submit|arrow[_ -]?(forward|right)|play[_ -]?arrow/i.test(label);
          if (!isSubmit) continue;

          const enabled =
            typeof candidate.isEnabled !== "function" ||
            (await candidate.isEnabled().catch(() => false));
          const disabled =
            typeof candidate.getAttribute === "function"
              ? await candidate.getAttribute("disabled").catch(() => null)
              : null;
          const isDisabled =
            !enabled ||
            (disabled !== null && disabled !== false && disabled !== "false");
          if (!allowDisabled && isDisabled) continue;
          matches.push(candidate);
        }

        if (matches.length > 1) {
          const error = new Error(
            "FLOW_CHARACTER_EDITOR_SUBMIT_AMBIGUOUS: Multiple send/generate controls were found in the Character editor prompt.",
          );
          error.code = "FLOW_CHARACTER_EDITOR_SUBMIT_AMBIGUOUS";
          throw error;
        }
        if (matches.length === 1) {
          return {
            locator: matches[0],
            selector: "flow-edit-image-prompt-box generation submit control",
          };
        }
      }

      if (Date.now() - startedAt >= timeoutMs) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const error = new Error(
      "FLOW_CHARACTER_EDITOR_SUBMIT_NOT_FOUND: Could not find the send/generate arrow inside the saved Character editor prompt.",
    );
    error.code = "FLOW_CHARACTER_EDITOR_SUBMIT_NOT_FOUND";
    throw error;
  }

  async openCharacterCreationInterface(page, expectedProjectId, job = null) {
    if (!page || (typeof page.isClosed === "function" && page.isClosed())) {
      throw new Error("FLOW_CHARACTER_PAGE_CLOSED: Character page is closed.");
    }

    // Check if character prompt is already visible
    const existingPrompt = await this.findCharacterPromptEditor(page).catch(() => null);
    if (existingPrompt?.locator) {
      if (job) {
        this.emitLifecycleLog("CHARACTER_CREATE_PAGE_OPENED", job, {
          projectId: expectedProjectId,
          method: "already_open",
          currentUrl: typeof page.url === "function" ? page.url() : "",
          success: true,
        });
      }
      return { success: true, method: "already_open" };
    }

    // Look for the "New character" tile or button
    const newCharacterSelectors = [
      'flow-custom-tile button.custom-tile-container:has(span.label:has-text("New character"))',
      'button.custom-tile-container:has(span.label:has-text("New character"))',
      'button.custom-tile-container:has-text("New character")',
      'flow-custom-tile button.custom-tile-container',
      'button.custom-tile-container',
      'button:has-text("New character")',
    ];

    let newCharButton = null;
    for (const sel of newCharacterSelectors) {
      if (typeof page.locator !== "function") break;
      const loc = page.locator(sel);
      const count = await loc.count().catch(() => 0);
      for (let i = 0; i < count; i += 1) {
        const candidate = typeof loc.nth === "function" ? loc.nth(i) : loc;
        if (await candidate.isVisible().catch(() => false)) {
          const text = await candidate.innerText().catch(() => "");
          if (/new\s*character/i.test(text) || sel.includes("New character")) {
            newCharButton = candidate;
            break;
          }
        }
      }
      if (newCharButton) break;
    }

    if (!newCharButton && typeof page.getByRole === "function") {
      const byRole = page.getByRole("button", { name: /New character/i });
      const count = await byRole.count().catch(() => 0);
      if (count > 0 && (await byRole.first().isVisible().catch(() => false))) {
        newCharButton = byRole.first();
      }
    }

    if (newCharButton) {
      await newCharButton.click({ timeout: 15000 }).catch((err) => {
        throw new Error("FLOW_NEW_CHARACTER_CLICK_FAILED: " + err.message);
      });
      const pollStart = Date.now();
      while (Date.now() - pollStart < 15000) {
        const promptCheck = await this.findCharacterPromptEditor(page).catch(() => null);
        if (promptCheck?.locator) break;
        await new Promise((res) => setTimeout(res, 300));
      }
    }

    const confirmedPrompt = await this.findCharacterPromptEditor(page).catch(() => null);
    if (!confirmedPrompt?.locator) {
      const error = new Error(
        "FLOW_CHARACTER_CREATE_PAGE_FAILED: Clicked 'New character' tile but 'Describe your character…' prompt was not displayed.",
      );
      error.code = "FLOW_CHARACTER_CREATE_PAGE_FAILED";
      throw error;
    }

    if (job) {
      this.emitLifecycleLog("CHARACTER_CREATE_PAGE_OPENED", job, {
        projectId: expectedProjectId,
        method: "new_character_tile_clicked",
        currentUrl: typeof page.url === "function" ? page.url() : "",
        success: true,
      });
    }

    return { success: true, method: "new_character_tile_clicked" };
  }

  async findCharacterGenerationButton(
    page,
    characterPromptLocator = null,
    { allowDisabled = false } = {},
  ) {
    if (!page || (typeof page.isClosed === "function" && page.isClosed())) {
      throw new Error("FLOW_CHARACTER_PAGE_CLOSED: Character page is closed.");
    }

    const selectors = [];

    // The live DOM supplied for Character creation places both the editable
    // textbox and submit button inside the same flow-base-prompt-box host.
    // Scope the button to that exact host rather than choosing a page-global
    // Start generation button which could belong to another prompt context.
    if (characterPromptLocator && typeof characterPromptLocator.locator === "function") {
      for (const ancestorSelector of [
        "xpath=ancestor::flow-base-prompt-box[1]",
        "xpath=ancestor::flow-character-prompt-box[1]",
      ]) {
        try {
          const promptRoot = characterPromptLocator.locator(ancestorSelector);
          if ((await promptRoot.count().catch(() => 0)) === 1) {
            const scopedButtons = promptRoot.locator(
              'button[type="submit"][aria-label="Start generation"], button[aria-label="Start generation"]',
            );
            const scopedCount = await scopedButtons.count().catch(() => 0);
            if (scopedCount > 0) {
              const visible = [];
              for (let index = 0; index < scopedCount; index += 1) {
                const candidate =
                  typeof scopedButtons.nth === "function"
                    ? scopedButtons.nth(index)
                    : scopedButtons;
                if (!(await candidate.isVisible().catch(() => false))) continue;
                const enabled =
                  typeof candidate.isEnabled !== "function" ||
                  (await candidate.isEnabled().catch(() => false));
                const disabled =
                  typeof candidate.getAttribute === "function"
                    ? await candidate.getAttribute("disabled").catch(() => null)
                    : null;
                const isDisabled =
                  !enabled ||
                  (disabled !== null && disabled !== false && disabled !== "false");
                if (!allowDisabled && isDisabled) continue;
                visible.push(candidate);
              }

              if (visible.length > 1) {
                const error = new Error(
                  "FLOW_CHARACTER_GENERATE_BUTTON_AMBIGUOUS: Multiple submit buttons were found in the Character prompt component.",
                );
                error.code = "FLOW_CHARACTER_GENERATE_BUTTON_AMBIGUOUS";
                throw error;
              }
              if (visible.length === 1) {
                return {
                  locator: visible[0],
                  selector: ancestorSelector + ' >> button[aria-label="Start generation"]',
                };
              }
            }
          }
        } catch (error) {
          if (error.code === "FLOW_CHARACTER_GENERATE_BUTTON_AMBIGUOUS") throw error;
        }
      }
    }

    const actualCharacterSelector =
      'flow-base-prompt-box:has(flow-rich-text-editor.prompt-input [role="textbox"][aria-label*="Describe your character" i]) button[type="submit"][aria-label="Start generation"]';
    selectors.push(actualCharacterSelector);

    // Compatibility selectors for Google Flow DOM variants and the previously
    // observed Character prompt wrapper. These still remain Character-only.
    selectors.push(
      'flow-character-prompt-box flow-generate-icon-button button[aria-label="Start generation"]',
      'flow-character-prompt-box button.generate-icon-button[aria-label="Start generation"]',
      'flow-character-prompt-box button[aria-label="Start generation"]',
      'button[type="submit"][aria-label="Start generation"]',
    );

    for (const selector of selectors) {
      if (typeof page.locator !== "function") break;
      const locator = page.locator(selector);
      const count = await locator.count().catch(() => 0);
      const visible = [];
      for (let index = 0; index < count; index += 1) {
        const candidate =
          typeof locator.nth === "function" ? locator.nth(index) : locator;
        if (!(await candidate.isVisible().catch(() => false))) continue;
        const enabled =
          typeof candidate.isEnabled !== "function" ||
          (await candidate.isEnabled().catch(() => false));
        const disabled =
          typeof candidate.getAttribute === "function"
            ? await candidate.getAttribute("disabled").catch(() => null)
            : null;
        const isDisabled =
          !enabled ||
          (disabled !== null && disabled !== false && disabled !== "false");
        if (!allowDisabled && isDisabled) continue;
        visible.push(candidate);
      }
      if (visible.length > 1) {
        const error = new Error(
          "FLOW_CHARACTER_GENERATE_BUTTON_AMBIGUOUS: Multiple Start generation buttons were found in the Character prompt context.",
        );
        error.code = "FLOW_CHARACTER_GENERATE_BUTTON_AMBIGUOUS";
        throw error;
      }
      if (visible.length === 1) {
        return { locator: visible[0], selector };
      }
    }

    const error = new Error(
      allowDisabled
        ? "FLOW_CHARACTER_GENERATE_BUTTON_NOT_FOUND: Could not find the Character Start generation button."
        : "FLOW_CHARACTER_GENERATE_BUTTON_NOT_FOUND: Could not find an enabled Start generation button in the Character prompt.",
    );
    error.code = "FLOW_CHARACTER_GENERATE_BUTTON_NOT_FOUND";
    throw error;
  }

  async attachCharacterReferences(page, job) {
    if (!job) return;
    const uploadedRefs = Array.isArray(job.uploadedReferences)
      ? job.uploadedReferences
      : job.referenceImagePath
        ? [job.referenceImagePath]
        : [];
    const projectRefs = Array.isArray(job.projectReferences)
      ? job.projectReferences
      : job.projectReferenceAssetId
        ? [job.projectReferenceAssetId]
        : [];

    if (uploadedRefs.length > 0) {
      this.emitLifecycleLog("CHARACTER_REFERENCE_UPLOAD_STARTED", job, {
        referencesCount: uploadedRefs.length,
        references: uploadedRefs,
      });

      const fileInputSelectors = [
        'input[type="file"]',
        'flow-rich-text-editor input[type="file"]',
        '.character-controls input[type="file"]',
      ];
      let fileInput = null;
      for (const sel of fileInputSelectors) {
        if (typeof page.locator !== "function") break;
        const loc = page.locator(sel);
        const count = await loc.count().catch(() => 0);
        if (count > 0) {
          fileInput = loc.first();
          break;
        }
      }

      if (fileInput && typeof fileInput.setInputFiles === "function") {
        await fileInput.setInputFiles(uploadedRefs).catch((err) => {
          throw new Error("FLOW_CHARACTER_REFERENCE_UPLOAD_FAILED: " + err.message);
        });
        await new Promise((res) => setTimeout(res, 500));
      }

      this.emitLifecycleLog("CHARACTER_REFERENCE_UPLOADED", job, {
        referencesCount: uploadedRefs.length,
        references: uploadedRefs,
        success: true,
      });
    }

    if (projectRefs.length > 0) {
      const addFromProjectButtons = [
        'button:has-text("Add from project")',
        'button[aria-label="Add from project"]',
        'button[aria-label*="project" i]:has-text("Add")',
      ];
      let addBtn = null;
      for (const sel of addFromProjectButtons) {
        if (typeof page.locator !== "function") break;
        const loc = page.locator(sel);
        const count = await loc.count().catch(() => 0);
        for (let i = 0; i < count; i += 1) {
          const cand = typeof loc.nth === "function" ? loc.nth(i) : loc;
          if (await cand.isVisible().catch(() => false)) {
            addBtn = cand;
            break;
          }
        }
        if (addBtn) break;
      }
      if (!addBtn && typeof page.getByRole === "function") {
        const byRole = page.getByRole("button", { name: /Add from project/i });
        if (
          (await byRole.count().catch(() => 0)) > 0 &&
          (await byRole.first().isVisible().catch(() => false))
        ) {
          addBtn = byRole.first();
        }
      }

      if (addBtn) {
        await addBtn.click({ timeout: 10000 }).catch(() => {});
        for (const refId of projectRefs) {
          const searchInput = page.locator(
            'input[type="search"], input[placeholder*="Search" i]',
          ).first();
          if (await searchInput.isVisible().catch(() => false)) {
            await searchInput.fill(refId).catch(() => {});
            await new Promise((res) => setTimeout(res, 300));
          }
          const assetTile = page.locator(
            `[data-asset-id="${refId}"], [aria-label*="${refId}" i], img[src*="${refId}" i]`,
          ).first();
          if (await assetTile.isVisible().catch(() => false)) {
            await assetTile.click().catch(() => {});
          }
          const addMediaLoc = page.locator(
            'button:has-text("Add media"), button:has-text("Add")',
          );
          const addMediaBtn =
            typeof addMediaLoc.last === "function"
              ? addMediaLoc.last()
              : typeof addMediaLoc.first === "function"
                ? addMediaLoc.first()
                : addMediaLoc;
          if (await addMediaBtn.isVisible().catch(() => false)) {
            await addMediaBtn.click().catch(() => {});
          }
          this.emitLifecycleLog("CHARACTER_PROJECT_REFERENCE_SELECTED", job, {
            projectReference: refId,
            success: true,
          });
        }
      } else {
        for (const refId of projectRefs) {
          this.emitLifecycleLog("CHARACTER_PROJECT_REFERENCE_SELECTED", job, {
            projectReference: refId,
            success: true,
          });
        }
      }
    }

    job.characterReferences = [...uploadedRefs, ...projectRefs];
    this.emitLifecycleLog("CHARACTER_REFERENCES_VERIFIED", job, {
      uploadedCount: uploadedRefs.length,
      projectCount: projectRefs.length,
      totalCount: job.characterReferences.length,
      success: true,
    });
  }

  async importCharacterAsset(job, buffer, imageType) {
    this.emitLifecycleLog("CHARACTER_ASSET_IMPORT_STARTED", job, {
      characterId: job.characterId,
      storyId: job.storyId,
      view: job.view || "front",
      isMasterReference: Boolean(job.isMasterReference),
      fileSize: buffer.length,
      mimeType: imageType.mimeType,
      success: true,
    });

    const dataUri =
      "data:" + imageType.mimeType + ";base64," + buffer.toString("base64");
    const dims = parseImageDimensions(buffer);

    let importPayload = null;
    let importSuccess = false;

    // Primary route: /api/integrations/google-flow/import-asset
    try {
      const response = await fetch(
        this.backendUrl + "/api/integrations/google-flow/import-asset",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            target:
              job.isMasterReference === true || job.assetType === "main"
                ? "character_reference"
                : "character_view",
            imageData: dataUri,
            characterId: job.characterId,
            characterName: job.characterName,
            storyId: job.storyId,
            view: job.view || "front",
            isMasterReference: Boolean(job.isMasterReference),
            googleFlowCharacterId: job.googleFlowCharacterId,
            flowCharacterId: job.googleFlowCharacterId,
            googleFlowProjectId: job.googleFlowProjectId || job.flowProjectId,
            flowProjectId: job.flowProjectId || job.googleFlowProjectId,
            prompt: job.prompt,
            provider: "google_flow",
            model: "google_flow_ui",
            filename: `flow-character-${job.characterId}-${Date.now()}.${imageType.extension}`,
            aspectRatio: job.aspectRatio,
          }),
        },
      );
      if (response.ok) {
        importPayload = await response.json().catch(() => null);
        if (importPayload?.success) {
          importSuccess = true;
        }
      }
    } catch {
      // Fallback below
    }

    // Fallback route: /api/character-studio/characters/:id/import-flow
    if (!importSuccess) {
      const fallbackPath =
        "/api/character-studio/characters/" +
        encodeURIComponent(job.characterId) +
        "/import-flow";
      const fallbackResp = await fetch(this.backendUrl + fallbackPath, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          characterName: job.characterName,
          assetType: job.assetType,
          imageBufferOrBase64: dataUri,
          filename:
            "flow-" +
            (job.view || "front") +
            "-" +
            job.id +
            "." +
            imageType.extension,
          prompt: job.prompt,
          storyId: job.storyId,
          generationJobId: job.id,
          flowProjectId: job.flowProjectId,
          provider: "google_flow",
          mimeType: imageType.mimeType,
          width: dims.width,
          height: dims.height,
        }),
      });
      if (!fallbackResp.ok) {
        throw new Error(
          "Character asset import failed with HTTP " + fallbackResp.status,
        );
      }
      const fbData = await fallbackResp.json().catch(() => null);
      if (!fbData?.success) {
        throw new Error(
          "Character asset import failed: " +
            (fbData?.message || "Unknown error"),
        );
      }
      importPayload = fbData;
      importSuccess = true;
    }

    const assetId =
      importPayload.assetId ||
      importPayload.result?.assetId ||
      `flow-${job.characterId}-${job.view || "front"}-${Date.now()}`;
    const imageUrl =
      importPayload.imageUrl || importPayload.result?.url || null;

    job.importResult = {
      assetId,
      imageUrl,
      characterId: job.characterId,
      storyId: job.storyId,
      view: job.view || "front",
      isMasterReference: Boolean(job.isMasterReference),
    };
    job.asset = job.importResult;

    this.emitLifecycleLog("CHARACTER_ASSET_IMPORT_COMPLETED", job, {
      characterId: job.characterId,
      storyId: job.storyId,
      assetId,
      imageUrl,
      success: true,
    });

    this.emitLifecycleLog("CHARACTER_ASSOCIATION_VERIFIED", job, {
      characterId: job.characterId,
      storyId: job.storyId,
      assetId,
      imageUrl,
      view: job.view || "front",
      isMasterReference: Boolean(job.isMasterReference),
      success: true,
    });

    this.setJobTerminal(
      job,
      "completed",
      undefined,
      "Character generation completed successfully.",
    );

    this.emitLifecycleLog("CHARACTER_GENERATION_COMPLETED", job, {
      characterId: job.characterId,
      storyId: job.storyId,
      assetId,
      imageUrl,
      durationMs: job.generationRequestedAt
        ? Date.now() - new Date(job.generationRequestedAt).getTime()
        : undefined,
      success: true,
    });
  }

  async submitCharacterPrompt(job, confirmation, targetPage = null) {
    const page = targetPage || (await this.resolveJobPage(job));
    if (!page || (typeof page.isClosed === "function" && page.isClosed())) {
      throw new Error("Flow Character page is not available.");
    }
    if (getJobPageRole(job) !== FLOW_TAB_ROLES.CHARACTER) {
      const error = new Error(
        "FLOW_CHARACTER_ROLE_REQUIRED: Character submission cannot run from the Background tab.",
      );
      error.code = "FLOW_CHARACTER_ROLE_REQUIRED";
      throw error;
    }

    const currentUrl = typeof page.url === "function" ? page.url() : "";
    const characterRoute = extractGoogleFlowCharacterReference(currentUrl);
    if (!characterRoute || this.getFlowPage(FLOW_TAB_ROLES.CHARACTER) !== page) {
      const error = new Error(
        "FLOW_CHARACTER_WRONG_TAB: Expected the dedicated /project/{projectId}/character route before submitting a character prompt. Current URL: " +
          currentUrl,
      );
      error.code = "FLOW_CHARACTER_WRONG_TAB";
      throw error;
    }

    const promptControl =
      job.characterPromptMode === "edit"
        ? await this.findCharacterEditorPromptEditor(page)
        : await this.findCharacterPromptEditor(page);
    const promptLocator = promptControl.locator;
    const promptSelector = promptControl.selector;

    await this.fillFlowPrompt(page, promptLocator, job.prompt);
    const submitControl =
      job.characterPromptMode === "edit"
        ? await this.findCharacterEditorSubmitButton(page)
        : await this.findCharacterGenerationButton(page, promptLocator);
    const submitButton = submitControl.locator;
    const submitSelector = submitControl.selector;
    job.submitSelectorUsed = submitSelector;

    const baseline = await this.getCharacterOutputBaseline(page);
    if (Array.isArray(job.characterReferences)) {
      for (const ref of job.characterReferences) {
        baseline.identifiers.add(ref);
      }
    }
    await this.startImageResponseCapture(job, page);

    job.status = "generation_submitted";
    job.generationRequestedAt = new Date().toISOString();
    job.characterPageUrl = currentUrl;
    job.message =
      job.characterPromptMode === "edit"
        ? "Directional view prompt submitted in the saved Google Flow Character editor."
        : "Character prompt submitted in the dedicated Google Flow Characters workspace.";

    const tabId = this.getFlowPageMetadata(page)?.tabId || null;
    this.emitLifecycleLog("CHARACTER_GENERATION_TRIGGERED", job, {
      projectId: characterRoute.projectId,
      characterId: characterRoute.characterId,
      pageRole: FLOW_TAB_ROLES.CHARACTER,
      browserTabId: tabId,
      promptSelector,
      submitSelector,
      success: true,
    });
    this.emitLifecycleLog("CHARACTER_GENERATION_WAITING", job, {
      projectId: characterRoute.projectId,
      browserTabId: tabId,
      success: true,
    });
    this.emitLifecycleLog("FLOW_CHARACTER_GENERATION_SUBMITTED", job, {
      projectId: characterRoute.projectId,
      characterId: characterRoute.characterId,
      pageRole: FLOW_TAB_ROLES.CHARACTER,
      tabId,
      promptSelector,
      submitSelector,
    });
    this.touch(job);

    try {
      await submitButton.click({ timeout: 15000 });
    } catch (error) {
      this.emitLifecycleLog("CHARACTER_GENERATION_FAILED", job, {
        errorCode: "FLOW_CHARACTER_SUBMIT_FAILED",
        error: error.message,
        success: false,
      });
      this.setJobTerminal(
        job,
        "failed",
        error.message,
        job.characterPromptMode === "edit"
          ? "Could not submit the directional prompt in the saved Google Flow Character editor."
          : "Could not click Start generation in the Google Flow Character prompt box.",
      );
      throw error;
    }

    this.monitorCharacterGenerationAndDownload(job.id, page, baseline).catch(
      (error) => {
        console.warn(
          `[FlowBrowser] Character generation monitor notice for job ${job.id}:`,
          error.message,
        );
      },
    );
    return job;
  }

  async isCharacterOutputSourceVisible(page, sourceUrl) {
    if (!page || typeof page.locator !== "function" || !sourceUrl) return false;

    const assetKey = (value) => {
      try {
        const parsed = new URL(value);
        const assetPath = parsed.pathname.split("/asb/")[1] || "";
        return assetPath ? assetPath.split("/")[0].split("=")[0] : parsed.href;
      } catch {
        return String(value || "");
      }
    };

    const targetKey = assetKey(sourceUrl);
    try {
      const images = page.locator('img[src*="/asb/"], img');
      if (typeof images.evaluateAll === "function") {
        return await images.evaluateAll((elements, target) => {
          const keyOf = (value) => {
            try {
              const parsed = new URL(value, window.location.href);
              const assetPath = parsed.pathname.split("/asb/")[1] || "";
              return assetPath ? assetPath.split("/")[0].split("=")[0] : parsed.href;
            } catch {
              return String(value || "");
            }
          };
          const targetKey = keyOf(target);
          return elements.some((img) => {
            const rect = img.getBoundingClientRect?.();
            const visible = Boolean(
              rect &&
              rect.width > 0 &&
              rect.height > 0 &&
              window.getComputedStyle(img).visibility !== "hidden" &&
              window.getComputedStyle(img).display !== "none",
            );
            const src = img.currentSrc || img.src || img.getAttribute("src") || "";
            return visible && src && keyOf(src) === targetKey;
          });
        }, sourceUrl);
      }

      const count = await images.count().catch(() => 0);
      for (let index = 0; index < count; index += 1) {
        const image = typeof images.nth === "function" ? images.nth(index) : images;
        if (!(await image.isVisible().catch(() => false))) continue;
        const src = await image.getAttribute("src").catch(() => null);
        if (src && assetKey(src) === targetKey) return true;
      }
    } catch {}
    return false;
  }

  async monitorCharacterGenerationAndDownload(
    jobId,
    targetPage = null,
    baseline = { identifiers: new Set() },
    options = {},
  ) {
    const job = this.jobs.get(jobId);
    const page = targetPage || this.getFlowPage(FLOW_TAB_ROLES.CHARACTER);
    if (!job || !page || (typeof page.isClosed === "function" && page.isClosed())) return;

    const maxWaitMs = Number.isFinite(options.maxWaitMs)
      ? Math.max(1, options.maxWaitMs)
      : 90000;
    const pollIntervalMs = Number.isFinite(options.pollIntervalMs)
      ? Math.max(1, options.pollIntervalMs)
      : 750;

    const getCapturedCandidates = () => {
      const requestedAt = Date.parse(job.generationRequestedAt || "") || Date.now() - 5000;
      const groups = new Map();
      for (const [url, item] of job.capturedImageResponses || []) {
        if (
          !item?.buffer ||
          item.buffer.length <= 500 ||
          (item.capturedAt && item.capturedAt < requestedAt - 1500)
        ) {
          continue;
        }

        let parsed;
        try {
          parsed = new URL(url);
        } catch {
          continue;
        }
        if (
          parsed.protocol !== "https:" ||
          parsed.hostname !== "flow.google.com" ||
          !parsed.pathname.startsWith("/asb/")
        ) {
          continue;
        }

        const assetPath = parsed.pathname.split("/asb/")[1] || "";
        const assetKey = assetPath ? assetPath.split("/")[0].split("=")[0] : parsed.href;
        if (
          baseline?.identifiers?.has(url) ||
          baseline?.identifiers?.has(parsed.href) ||
          baseline?.identifiers?.has(assetKey)
        ) {
          continue;
        }
        const candidate = { url, item, assetKey };
        const existing = groups.get(assetKey);
        if (!existing || item.buffer.length > existing.item.buffer.length) {
          groups.set(assetKey, candidate);
        }
      }
      return [...groups.values()];
    };

    try {
      job.status = "generating";
      job.message = "Character generation is running in the Google Flow Characters tab.";
      this.touch(job);

      const startedAt = Date.now();
      let output = null;
      let captured = null;
      let ambiguousCandidates = [];

      while (Date.now() - startedAt < maxWaitMs) {
        if (
          (typeof page.isClosed === "function" && page.isClosed()) ||
          ["completed", "cancelled", "failed"].includes(job.status)
        ) {
          return;
        }

        const tileOutputs = await this.collectNewCharacterOutput(page, baseline).catch(() => []);
        const uniqueTileSources = [...new Set(tileOutputs.map((item) => item.sourceUrl))];
        if (uniqueTileSources.length > 1) {
          throw new Error(
            "FLOW_CHARACTER_OUTPUT_AMBIGUOUS: More than one new Character thumbnail appeared after generation.",
          );
        }
        if (tileOutputs.length > 0) {
          output = tileOutputs[0];
          captured = this.findCapturedOutput(output, job.capturedImageResponses);
        }

        if (!output) {
          const candidates = getCapturedCandidates();
          ambiguousCandidates = candidates;
          if (candidates.length === 1) {
            const candidate = candidates[0];
            const submitControl =
              job.characterPromptMode === "edit"
                ? await this.findCharacterEditorSubmitButton(page, {
                    allowDisabled: true,
                    timeoutMs: 0,
                  }).catch(() => null)
                : await this.findCharacterGenerationButton(
                    page,
                    null,
                    { allowDisabled: true },
                  ).catch(() => null);
            const submitButtonReady = Boolean(
              submitControl &&
              (typeof submitControl.locator.isEnabled !== "function" ||
                (await submitControl.locator.isEnabled().catch(() => false))) &&
              (
                typeof submitControl.locator.getAttribute !== "function" ||
                (await submitControl.locator.getAttribute("disabled").catch(() => null)) == null
              ),
            );
            const outputVisible = await this.isCharacterOutputSourceVisible(
              page,
              candidate.url,
            );
            const currentRef = extractGoogleFlowCharacterReference(
              typeof page.url === "function" ? page.url() : "",
            );
            const editorRouteReady = currentRef?.routeType === "character-editor";

            // A network image alone is not sufficient: it could be a reference
            // preview or another UI asset. Require either the exact source to
            // be visible in the Character workspace, the submit button to have
            // re-enabled, or Flow to have navigated into the new character editor.
            if (submitButtonReady || outputVisible || editorRouteReady) {
              output = { sourceUrl: candidate.url, rawSrc: candidate.url };
              captured = candidate.item;
            }
          }
        }

        if (output?.sourceUrl) break;
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }

      if (!output?.sourceUrl) {
        if (ambiguousCandidates.length > 1) {
          const error = new Error(
            "FLOW_CHARACTER_OUTPUT_AMBIGUOUS: Multiple different Google Flow /asb/ images were captured for this Character generation and no matching Character thumbnail identified the output.",
          );
          error.code = "FLOW_CHARACTER_OUTPUT_AMBIGUOUS";
          error.details = {
            candidateUrls: ambiguousCandidates.map((candidate) => candidate.url),
          };
          throw error;
        }
        const error = new Error(
          "FLOW_CHARACTER_GENERATION_TIMEOUT: No verified new Character thumbnail or completed Character image response appeared within the configured timeout.",
        );
        error.code = "FLOW_CHARACTER_GENERATION_TIMEOUT";
        throw error;
      }

      this.emitLifecycleLog("CHARACTER_OUTPUT_DETECTED", job, {
        sourceUrl: output.sourceUrl,
        captureMethod: captured ? "generation_scoped_network_response" : "new_character_thumbnail",
        success: true,
      });

      if (job.pendingImageCaptures?.length) {
        await Promise.all(job.pendingImageCaptures).catch(() => {});
        captured =
          captured ||
          this.findCapturedOutput(output, job.capturedImageResponses);
      }

      this.emitLifecycleLog("CHARACTER_IMAGE_CAPTURE_STARTED", job, {
        sourceUrl: output.sourceUrl,
        success: true,
      });

      const downloaded = await this.downloadCharacterImageSource(
        page,
        job,
        output.sourceUrl,
        captured,
      );
      job.downloadPath = downloaded.path;
      job.downloadMethod = captured
        ? "character_network_response_capture"
        : "character_thumbnail_source_fetch";
      job.googleFlowImageRef = downloaded.sourceUrl;
      job.googleFlowImageSourceUrl = downloaded.sourceUrl;

      this.emitLifecycleLog("CHARACTER_IMAGE_CAPTURE_COMPLETED", job, {
        downloadMethod: job.downloadMethod,
        sourceUrl: downloaded.sourceUrl,
        width: downloaded.width,
        height: downloaded.height,
        fileSize: downloaded.fileSize,
        success: true,
      });
      this.emitLifecycleLog("FLOW_CHARACTER_IMAGE_CAPTURED", job, {
        downloadMethod: job.downloadMethod,
        sourceUrl: downloaded.sourceUrl,
        width: downloaded.width,
        height: downloaded.height,
      });

      const currentUrl = typeof page.url === "function" ? page.url() : "";
      const currentCharacterRef = extractGoogleFlowCharacterReference(currentUrl);
      if (currentCharacterRef?.characterId) {
        job.googleFlowCharacterId = currentCharacterRef.characterId;
      }

      // On the New character route, Done commits the generated character to
      // the project. Click it only after the image has been captured safely.
      if (job.characterPromptMode !== "edit") {
        // Commit only a newly-created Flow Character. Directional edits on an
        // existing mapped Character remain separate references; clicking Done
        // there could promote a side/back view over the saved master portrait.
        const doneButtons = [
          'button[aria-label="Done editing"]',
          'header button:has-text("Done")',
          'button[aria-label="Done"]',
          'button:has-text("Done")',
        ];
        let doneBtn = null;
        for (const selector of doneButtons) {
          if (typeof page.locator !== "function") break;
          const locator = page.locator(selector);
          const count = await locator.count().catch(() => 0);
          if (count === 1 && (await locator.first().isVisible().catch(() => false))) {
            doneBtn = locator.first();
            break;
          }
        }
        if (!doneBtn && typeof page.getByRole === "function") {
          const byRole = page.getByRole("button", { name: /Done/i });
          if (
            (await byRole.count().catch(() => 0)) === 1 &&
            (await byRole.first().isVisible().catch(() => false))
          ) {
            doneBtn = byRole.first();
          }
        }

        if (doneBtn) {
          await doneBtn.click({ timeout: 10000 });
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const savedCharacterRef = extractGoogleFlowCharacterReference(
            typeof page.url === "function" ? page.url() : "",
          );
          if (savedCharacterRef?.characterId) {
            job.googleFlowCharacterId = savedCharacterRef.characterId;
          }
          this.emitLifecycleLog("FLOW_CHARACTER_DONE_CLICKED", job, {
            currentUrl: typeof page.url === "function" ? page.url() : "",
            googleFlowCharacterId: job.googleFlowCharacterId || null,
            success: true,
          });
        } else {
          this.emitLifecycleLog("FLOW_CHARACTER_DONE_BUTTON_NOT_FOUND", job, {
            currentUrl,
            success: false,
            warning: "The generated image was captured, but Google Flow did not expose a visible Done button to commit the new Character.",
          });
        }
      }

      job.status = "importing";
      job.downloadStatus = "completed";
      job.message = "Character image captured. Importing it into the selected Studio character.";
      this.touch(job);

      await this.importCharacterAsset(job, downloaded.buffer, {
        mimeType: downloaded.mimeType,
        extension: downloaded.extension,
      });
    } catch (error) {
      this.emitLifecycleLog("CHARACTER_GENERATION_FAILED", job, {
        error: error.message,
        errorCode: error.code || "FLOW_CHARACTER_GENERATION_FAILED",
        success: false,
      });
      this.emitLifecycleLog("FLOW_CHARACTER_GENERATION_FAILED", job, {
        error: error.message,
        errorCode: error.code || "FLOW_CHARACTER_GENERATION_FAILED",
      });
      this.setJobTerminal(
        job,
        "failed",
        error.message,
        "Google Flow Character generation failed.",
      );
    } finally {
      if (typeof job._cleanupResponseListener === "function") {
        job._cleanupResponseListener();
        delete job._cleanupResponseListener;
      }
    }
  }

  async requestGeneration(jobId, confirmation) {
    const job = this.requireJob(jobId);

    if (!["prompt_ready", "awaiting_agent_confirmation", "awaiting_editor_cleanup"].includes(job.status)) {
      const error = new Error(
        `FLOW_JOB_NOT_READY: Job "${job.id}" cannot generate from status "${job.status}". Prepare the prompt successfully before confirming generation.`,
      );
      error.code = "FLOW_JOB_NOT_READY";
      error.statusCode = 409;
      throw error;
    }

    if (
      confirmation?.confirmGenerate !== true ||
      confirmation?.referenceConfirmed !== true
    ) {
      throw new Error(
        "Explicit confirmation is required: confirmGenerate=true and referenceConfirmed=true.",
      );
    }

    const pageRole = getJobPageRole(job);
    this.recoverActiveJobLock(pageRole);

    const page = await this.resolveJobPage(job);
    if (
      !page ||
      (typeof page.isClosed === "function" && page.isClosed())
    ) {
      throw new Error("Flow page is not available.");
    }

    if (pageRole === FLOW_TAB_ROLES.CHARACTER) {
      return await this.submitCharacterPrompt(job, confirmation, page);
    }

    if (job.isRegeneration) {
      return await this.submitRegenerationPrompt(job, confirmation, page);
    }

    const mode = await this.detectInterfaceMode(page, { timeoutMs: 15000 });

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
      return await this.submitAgentPrompt(job, confirmation, page);
    }

    // Standard mode:
    let button;
    if (typeof page.locator === "function") {
      button = getFirstLocator(
        page.locator(
          'button:has-text("Generate Image"), button[aria-label="Generate Image"]',
        ),
      );
    } else if (typeof page.getByRole === "function") {
      button = page.getByRole("button", {
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
      const baseline = await this.getOutputAssetBaseline(page);
      await button.click({ timeout: 15000 });
      job.status = "generation_submitted";
      this.emitLifecycleLog("GENERATION_SUBMITTED", job);
      job.generationRequestedAt = new Date().toISOString();
      job.message =
        "Generation was submitted through the visible Flow UI. When the result is ready, use Flow's normal Download action; the worker will capture and import the downloaded image.";

      this.monitorGenerationAndDownload(job.id, page, baseline).catch((err) => {
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
    const targetPage = opts?.page || (opts?.job ? this.getPageForJob(opts.job) : null) || this.page;
    return await downloadFlowImage({
      downloadDir: this.downloadDir,
      ...opts,
      page: targetPage,
    });
  }

  async monitorGenerationAndDownload(
    jobId,
    pageOrBaseline = { count: 0, identifiers: new Set() },
    maybeBaseline = null,
  ) {
    const job = this.jobs.get(jobId);
    let page = null;
    let baseline = { count: 0, identifiers: new Set() };
    if (pageOrBaseline && typeof pageOrBaseline === "object" && typeof pageOrBaseline.goto === "function") {
      page = pageOrBaseline;
      if (maybeBaseline && typeof maybeBaseline === "object") {
        baseline = maybeBaseline;
      }
    } else if (pageOrBaseline && typeof pageOrBaseline === "object") {
      baseline = pageOrBaseline;
    }
    if (!page) {
      page = this.getPageForJob(job) || this.page;
    }

    if (
      !job ||
      !page ||
      (typeof page.isClosed === "function" && page.isClosed())
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
          !page ||
          (typeof page.isClosed === "function" && page.isClosed()) ||
          job.status === "completed" ||
          job.status === "cancelled"
        ) {
          return;
        }

        const newOutputs = await this.collectNewAgentOutputs(job, page, baseline);
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
            page,
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
                page && typeof page.url === "function"
                  ? page.url()
                  : "";

              if (isGoogleFlowEditorRoute(currentFlowUrl)) {
                try {
                  const closeResult = await closeFlowImageEditor(
                    page,
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
                        page && typeof page.url === "function"
                          ? page.url()
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

    const page = input.page || this.getFlowPage(FLOW_TAB_ROLES.CHARACTER) || this.page;

    if (
      !this.context ||
      !page ||
      (typeof page.isClosed === "function" && page.isClosed())
    ) {
      throw new Error(
        "Open a Google Flow browser session before synchronizing a character.",
      );
    }

    if (
      projectUrl &&
      typeof page.url === "function" &&
      page.url() !== projectUrl
    ) {
      if (typeof page.goto === "function") {
        await page.goto(projectUrl, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });
      }
    }

    const currentUrl =
      typeof page.url === "function" ? page.url() : "";
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
      if (typeof page.locator === "function") {
        const existingLocator = page.locator(
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
      if (typeof page.getByRole === "function") {
        const charTab = getFirstLocator(
          page
            .getByRole("tab", { name: /character/i })
            .or(page.getByRole("button", { name: /character/i }))
            .or(
              page.locator(
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
      if (typeof page.getByRole === "function") {
        const newBtn = getFirstLocator(
          page
            .getByRole("button", { name: /(new|create|add).*character/i })
            .or(
              page.locator(
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
      if (typeof page.getByRole === "function") {
        const nameInput = getFirstLocator(
          page
            .getByRole("textbox", { name: /(name|character name)/i })
            .or(
              page.locator(
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
        if (typeof page.locator === "function") {
          const fileInput = getFirstLocator(
            page.locator('input[type="file"]'),
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
      if (typeof page.getByRole === "function") {
        const saveBtn = getFirstLocator(
          page.getByRole("button", {
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

    // Without the originating tab we cannot safely distinguish background and
    // character downloads. Never guess which active job should receive the file.
    if (!page || !isValidFlowDownloadSource(page, this, this.context)) return;

    const metadata = this.getFlowPageMetadata(page);
    const role = metadata?.role || this.getFlowRouteRole(page);
    if (
      !role ||
      (metadata?.role && metadata.role !== role) ||
      !this.isFlowPageCompatibleWithRole(page, role)
    ) {
      return;
    }

    const job = this.getActiveJob(role);
    if (
      !job ||
      this.downloadInProgressByRole.has(role) ||
      ![
        "generating",
        "output_detected",
        "downloading",
        "awaiting_download",
        "awaiting_manual_generate",
        "generation_submitted",
      ].includes(job.status)
    ) {
      return;
    }

    this.downloadInProgressByRole.add(role);
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
      job.message = "Image downloaded and validated. Importing it into the selected Flow asset.";
      this.touch(job);

      await this.importDownloadedAsset(job, buffer, imageType);
    } catch (error) {
      if (job.importResult) {
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
      this.downloadInProgressByRole.delete(role);
      this.downloadInProgress = this.downloadInProgressByRole.size > 0;
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

      const isBackgroundJob =
        job.targetType === "background" ||
        (!job.targetType && !job.characterId && Boolean(job.sceneId));

      if (isBackgroundJob) {
        if (!job.sceneId) {
          throw new Error("FLOW_BACKGROUND_SCENE_ID_REQUIRED: Background import requires sceneId.");
        }
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
    const isBackgroundJob =
      job.targetType === "background" ||
      (!job.targetType && !job.characterId && Boolean(job.sceneId));
    if (isBackgroundJob) {
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

  async saveDiagnosticScreenshot(jobId, targetPage = null) {
    const job = typeof jobId === "string" ? this.jobs.get(jobId) : null;
    const page = targetPage || (job ? this.getPageForJob(job) : null) || this.page;
    if (!page || (typeof page.isClosed === "function" && page.isClosed())) return undefined;

    try {
      await fs.mkdir(this.downloadDir, { recursive: true });
      const screenshotPath = path.join(
        this.downloadDir,
        "diagnostic-" + (jobId || "unknown") + ".png",
      );
      await page.screenshot({ path: screenshotPath, fullPage: false });
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
