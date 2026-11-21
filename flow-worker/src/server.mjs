import "dotenv/config";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { FlowBrowserWorker } from "./flow-browser.mjs";

const currentFileDir = path.dirname(fileURLToPath(import.meta.url));
const HOST = process.env.FLOW_WORKER_HOST || "127.0.0.1";
const PORT = Number.parseInt(process.env.FLOW_WORKER_PORT || "4177", 10);
const BACKEND_URL = (process.env.FLOW_BACKEND_URL || "http://127.0.0.1:5001").replace(/\/+$/, "");
const isConfiguredToken = Boolean(process.env.FLOW_WORKER_TOKEN && process.env.FLOW_WORKER_TOKEN.trim());
let activeToken = isConfiguredToken ? process.env.FLOW_WORKER_TOKEN.trim() : null;
let provisionTicket = isConfiguredToken ? null : randomBytes(32).toString("hex");

const MAX_BODY_BYTES = 1024 * 1024;
const ALLOWED_ORIGINS = new Set(
  (process.env.FLOW_WORKER_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

if (HOST !== "127.0.0.1" && HOST !== "::1" && HOST !== "localhost") {
  throw new Error("The Google Flow worker must bind to loopback only (127.0.0.1).");
}

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("FLOW_WORKER_PORT must be a valid TCP port.");
}

const worker = new FlowBrowserWorker();

function getProvisionTicketFilePath() {
  return path.join(worker.profileDir, ".worker-provision-ticket.json");
}

function getLocalSharedTokenPaths() {
  const paths = [
    path.resolve(currentFileDir, "..", ".flow-worker-token"),
    path.resolve(currentFileDir, ".flow-worker-token"),
    path.resolve(process.cwd(), "flow-worker", ".flow-worker-token"),
    path.resolve(process.cwd(), ".flow-worker-token"),
    path.resolve(process.cwd(), "..", ".flow-worker-token"),
    path.resolve(process.cwd(), "..", "flow-worker", ".flow-worker-token"),
    path.resolve(process.cwd(), "backend", ".flow-worker-token"),
    path.resolve(process.cwd(), "..", "backend", ".flow-worker-token"),
    path.join(worker.profileDir, ".flow-worker-token"),
    path.join(os.homedir(), ".ai-kids-content-studio", ".flow-worker-token"),
  ];
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    paths.push(path.join(localAppData, "AIKidsContentStudio", ".flow-worker-token"));
    paths.push(path.join(localAppData, "AIKidsContentStudio", "GoogleFlowProfile", ".flow-worker-token"));
    paths.push(path.join(localAppData, "AIKidsContentStudio", "GoogleFlowChromeProfile", ".flow-worker-token"));
  }
  return Array.from(new Set(paths));
}

// Auto-initialize activeToken from local persistent application credential store if not explicitly set in env
if (!activeToken) {
  for (const tokenPath of getLocalSharedTokenPaths()) {
    try {
      if (fs.existsSync(tokenPath)) {
        const val = fs.readFileSync(tokenPath, "utf8").trim();
        if (val) {
          activeToken = val;
          provisionTicket = null;
          console.log("[FlowWorker] Loaded active bearer token from local credential store (" + tokenPath + ").");
          break;
        }
      }
    } catch {}
  }
}

function writeProvisionTicketFile() {
  if (!provisionTicket) return;
  try {
    if (!fs.existsSync(worker.profileDir)) {
      fs.mkdirSync(worker.profileDir, { recursive: true, mode: 0o700 });
    }
    const ticketFile = getProvisionTicketFilePath();
    fs.writeFileSync(
      ticketFile,
      JSON.stringify({
        ticket: provisionTicket,
        pid: process.pid,
        port: PORT,
        createdAt: Date.now(),
      }),
      { mode: 0o600, encoding: "utf8" }
    );
  } catch (err) {
    console.warn("[FlowWorker] Warning: could not write local provision ticket file:", err.message);
  }
}

function cleanProvisionTicketFile() {
  try {
    const ticketFile = getProvisionTicketFilePath();
    if (fs.existsSync(ticketFile)) {
      fs.unlinkSync(ticketFile);
    }
  } catch {}
}

async function requestBackendProvisioning() {
  if (activeToken || !provisionTicket) return;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const response = await fetch(`${BACKEND_URL}/api/integrations/google-flow/worker/handshake`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        port: PORT,
        ticket: provisionTicket,
        pid: process.pid,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      console.log("[FlowWorker] Connected to studio backend for automated credential provisioning.");
    }
  } catch {
    // Backend may not be online yet; ticket file remains on disk for backend to provision upon startup
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  response.end(JSON.stringify(payload));
}

function isAuthorized(request) {
  const header = request.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return false;
  const providedStr = header.slice(7).trim();
  if (!providedStr) return false;

  const provided = Buffer.from(providedStr);

  if (activeToken) {
    const expected = Buffer.from(activeToken);
    if (provided.length === expected.length && timingSafeEqual(provided, expected)) {
      return true;
    }
  }

  // Self-healing check: if token was uninitialized or updated in PostgreSQL, check disk tokens
  for (const tokenPath of getLocalSharedTokenPaths()) {
    try {
      if (fs.existsSync(tokenPath)) {
        const diskToken = fs.readFileSync(tokenPath, "utf8").trim();
        if (diskToken) {
          const expectedDisk = Buffer.from(diskToken);
          if (provided.length === expectedDisk.length && timingSafeEqual(provided, expectedDisk)) {
            activeToken = diskToken;
            provisionTicket = null;
            cleanProvisionTicketFile();
            console.log("[FlowWorker] Synchronized active bearer token from local credential store (" + tokenPath + ").");
            return true;
          }
        }
      }
    } catch {}
  }

  // Loopback auto-adoption: If request is strictly from loopback and activeToken is uninitialized or unaligned,
  // adopt the backend's provided token and sync it across all local disk paths
  const remoteAddress = request.socket.remoteAddress || "";
  const isLoopbackReq = [
    "127.0.0.1",
    "::1",
    "::ffff:127.0.0.1"
  ].includes(remoteAddress);
  if (isLoopbackReq && providedStr.length >= 32) {
    activeToken = providedStr;
    provisionTicket = null;
    cleanProvisionTicketFile();
    for (const tokenPath of getLocalSharedTokenPaths()) {
      try {
        const dir = path.dirname(tokenPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        }
        fs.writeFileSync(tokenPath, activeToken, { mode: 0o600, encoding: "utf8" });
      } catch {}
    }
    console.log("[FlowWorker] Auto-synchronized active bearer token from local backend loopback handshake.");
    return true;
  }

  return false;
}

function checkOrigin(request, response) {
  const origin = request.headers.origin;
  if (!origin) return true;

  if (!ALLOWED_ORIGINS.has(origin)) {
    sendJson(response, 403, { success: false, message: "Origin is not allowed by the local Flow worker." });
    return false;
  }

  response.setHeader("access-control-allow-origin", origin);
  response.setHeader("vary", "Origin");
  response.setHeader("access-control-allow-headers", "authorization, content-type, x-flow-provision-ticket");
  response.setHeader("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
  return true;
}

async function readJson(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("Request body exceeds the 1 MB limit.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body must contain valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

const server = http.createServer(async (request, response) => {
  try {
    if (!checkOrigin(request, response)) return;

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    const url = new URL(request.url || "/", "http://" + HOST + ":" + PORT);
    const pathname = url.pathname;

    if (request.method === "GET" && pathname === "/health") {
      sendJson(response, 200, {
        success: true,
        service: "ai-kids-content-studio-flow-worker",
        host: HOST,
        port: PORT,
        hasConfiguredToken: isConfiguredToken,
        isProvisioned: Boolean(activeToken),
        browserChannel: worker.browserChannel || "bundled-chromium",
        profileDir: worker.profileDir,
      });
      return;
    }

    // Protected provisioning endpoint
    if (request.method === "POST" && pathname === "/session/provision") {
      const ticketHeader = request.headers["x-flow-provision-ticket"];
      let authorized = false;

      // 1. Check in-memory provisionTicket
      if (provisionTicket && ticketHeader) {
        const providedTicket = Buffer.from(String(ticketHeader).trim());
        const expectedTicket = Buffer.from(provisionTicket);
        if (providedTicket.length === expectedTicket.length && timingSafeEqual(providedTicket, expectedTicket)) {
          authorized = true;
        }
      }

      // 2. Check disk ticket file
      if (!authorized && ticketHeader) {
        const ticketFile = getProvisionTicketFilePath();
        try {
          if (fs.existsSync(ticketFile)) {
            const data = JSON.parse(fs.readFileSync(ticketFile, "utf8"));
            if (data?.ticket && data.ticket.trim() === String(ticketHeader).trim()) {
              authorized = true;
            }
          }
        } catch {}
      }

      // 3. Loopback request from local backend
      const remoteAddress = request.socket.remoteAddress || "";
      const isLoopbackReq = remoteAddress === "127.0.0.1" || remoteAddress === "::1" || remoteAddress === "::ffff:127.0.0.1";
      if (!authorized && isLoopbackReq) {
        authorized = true;
      }

      if (!authorized) {
        sendJson(response, 403, {
          success: false,
          message: "Worker provisioning ticket mismatch or unauthorized.",
        });
        return;
      }

      const body = await readJson(request);
      if (!body.token || typeof body.token !== "string" || !body.token.trim()) {
        sendJson(response, 400, {
          success: false,
          message: "A valid bearer token is required to provision the worker.",
        });
        return;
      }

      activeToken = body.token.trim();
      provisionTicket = null;
      cleanProvisionTicketFile();

      // Persist to local shared token paths
      for (const tokenPath of getLocalSharedTokenPaths()) {
        try {
          const dir = path.dirname(tokenPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
          }
          fs.writeFileSync(tokenPath, activeToken, { mode: 0o600, encoding: "utf8" });
        } catch {}
      }

      console.log("[FlowWorker] Successfully provisioned with persistent application credential from PostgreSQL.");
      sendJson(response, 200, {
        success: true,
        message: "Worker provisioned and authenticated successfully.",
      });
      return;
    }

    if (!isAuthorized(request)) {
      sendJson(response, 401, {
        success: false,
        message: activeToken
          ? "Missing or invalid local Flow worker bearer token."
          : "Worker is awaiting credential provisioning from the studio backend.",
      });
      return;
    }

    if (request.method === "GET" && pathname === "/session/status") {
      sendJson(response, 200, { success: true, session: await worker.getSessionStatus() });
      return;
    }

    if (request.method === "GET" && pathname === "/session/tabs") {
      const tabs = worker.getFlowPages().map((t) => ({
        role: t.role,
        isClosed: t.isClosed,
        metadata: t.metadata,
        url: !t.isClosed && typeof t.page.url === "function" ? t.page.url() : null,
      }));
      sendJson(response, 200, { success: true, tabs });
      return;
    }

    if (request.method === "POST" && pathname === "/session/tabs/ensure") {
      const body = await readJson(request);
      const role = body.role || "background";
      const page = await worker.ensureFlowPage(role, body.projectId, body.projectUrl);
      const metadata = worker.getFlowPageMetadata(page);
      sendJson(response, 200, {
        success: true,
        role,
        url: typeof page.url === "function" ? page.url() : null,
        metadata,
      });
      return;
    }

    if (request.method === "POST" && pathname === "/session/tabs/navigate") {
      const body = await readJson(request);
      const role = body.role || "background";
      const page = await worker.ensureFlowPage(role, body.projectId, body.url);
      if (body.url) {
        await page.goto(body.url, { waitUntil: "domcontentloaded", timeout: 60000 });
        worker.updateFlowPageRouteMetadata(page);
      }
      sendJson(response, 200, {
        success: true,
        role,
        url: typeof page.url === "function" ? page.url() : null,
        metadata: worker.getFlowPageMetadata(page),
      });
      return;
    }

    if (request.method === "POST" && pathname === "/character/prepare") {
      const body = await readJson(request);
      if (!worker.context) {
        sendJson(response, 409, { success: false, message: "Open the visible Flow browser session first." });
        return;
      }
      const result = await worker.navigateToCharacterTab(body.projectId);
      sendJson(response, 200, { success: true, ...result });
      return;
    }

    if (request.method === "POST" && pathname === "/character/open") {
      const body = await readJson(request);
      if (!worker.context) {
        sendJson(response, 409, { success: false, message: "Open the visible Flow browser session first." });
        return;
      }
      const result = await worker.openGoogleFlowCharacterEditor({
        projectId: body.projectId,
        characterId: body.characterId,
        characterUrl: body.characterUrl,
      });
      sendJson(response, 200, { success: true, ...result });
      return;
    }

    if (request.method === "GET" && pathname === "/character/status") {
      const charPage = worker.getFlowPage("character");
      if (!charPage || (typeof charPage.isClosed === "function" && charPage.isClosed())) {
        sendJson(response, 200, {
          success: true,
          open: false,
          message: "Character tab is not open.",
        });
        return;
      }
      const diagnostics = await worker.inspectFlowCharacterWorkspace(charPage);
      sendJson(response, 200, {
        success: true,
        open: true,
        url: typeof charPage.url === "function" ? charPage.url() : "",
        routeType: worker.getFlowPageMetadata(charPage)?.currentRouteType || "unknown",
        metadata: worker.getFlowPageMetadata(charPage),
        diagnostics,
      });
      return;
    }

    if (request.method === "GET" && pathname === "/diagnostics/inspect") {
      const inspection = await worker.inspectFlowPage();
      sendJson(response, 200, { success: true, inspection });
      return;
    }

    if (request.method === "POST" && pathname === "/config") {
      const body = await readJson(request);
      try {
        worker.configure(body);
        sendJson(response, 200, {
          success: true,
          config: {
            browserChannel: worker.browserChannel || "bundled-chromium",
            profileDir: worker.profileDir,
          },
        });
      } catch (configErr) {
        sendJson(response, configErr.statusCode || 409, {
          success: false,
          message: configErr.message,
        });
      }
      return;
    }

    if (request.method === "POST" && pathname === "/session/open") {
      const body = await readJson(request);
      const session = await worker.launch(body.projectUrl);
      sendJson(response, 200, { success: true, session });
      return;
    }

    if (request.method === "POST" && pathname === "/session/close") {
      sendJson(response, 200, { success: true, session: await worker.close() });
      return;
    }

    if (request.method === "POST" && pathname === "/session/reset-profile") {
      const result = await worker.resetProfile();
      sendJson(response, 200, { success: true, ...result });
      return;
    }

    if (request.method === "POST" && pathname === "/characters/sync") {
      const body = await readJson(request);
      if (!worker.context || !worker.page || (typeof worker.page.isClosed === "function" && worker.page.isClosed())) {
        sendJson(response, 409, { success: false, message: "Open the visible Flow browser session first." });
        return;
      }
      const result = await worker.synchronizeCharacter(body);
      sendJson(response, 200, { success: true, ...result });
      return;
    }

    if (request.method === "POST" && (pathname === "/jobs/cancel-active" || pathname === "/session/cancel-active")) {
      const result = worker.cancelActiveJob();
      sendJson(response, 200, { success: true, ...result });
      return;
    }

    if (request.method === "POST" && pathname === "/jobs") {
      const body = await readJson(request);
      if (!worker.context) {
        sendJson(response, 409, { success: false, message: "Open the visible Flow browser session first." });
        return;
      }
      const role = body.pageRole || (body.targetType === "character" ? "character" : "background");
      const targetPage = worker.getFlowPage(role) || worker.page;
      if (!targetPage || (typeof targetPage.isClosed === "function" && targetPage.isClosed())) {
        sendJson(response, 409, { success: false, message: `The ${role} Flow browser page is not open.` });
        return;
      }
      if (body.cancelPrevious) {
        worker.cancelActiveJob("Cancelled by new incoming job request.");
      }
      const job = worker.createJob(body);
      const prepared = await worker.prepareJob(job.id);
      sendJson(response, 201, { success: true, job: prepared });
      return;
    }

    const match = pathname.match(/^\/jobs\/([a-f0-9-]+)(?:\/(prepare|generate|retry-import))?$/i);
    if (match) {
      const jobId = decodeURIComponent(match[1]);
      const action = match[2];

      if (request.method === "GET" && !action) {
        sendJson(response, 200, { success: true, job: worker.getJob(jobId) });
        return;
      }

      if (request.method === "POST" && action === "prepare") {
        sendJson(response, 200, { success: true, job: await worker.prepareJob(jobId) });
        return;
      }

      if (request.method === "POST" && action === "generate") {
        const body = await readJson(request);
        const job = await worker.requestGeneration(jobId, body);
        sendJson(response, 200, { success: true, job });
        return;
      }

      if (request.method === "POST" && action === "retry-import") {
        sendJson(response, 200, { success: true, job: await worker.retryMetadataImport(jobId) });
        return;
      }

      if (request.method === "DELETE" && !action) {
        sendJson(response, 200, { success: true, job: await worker.cancelJob(jobId) });
        return;
      }
    }

    sendJson(response, 404, { success: false, message: "Endpoint not found." });
  } catch (error) {
    console.error("[FlowWorker] Request failed:", error.message);
    const statusCode = error.statusCode || 500;
    sendJson(response, statusCode, {
      success: false,
      message: error.message || "Flow worker request failed.",
      activeJob: error.activeJob,
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log("");
  console.log("AI Kids Content Studio — Google Flow local worker");
  console.log("Listening on http://" + HOST + ":" + PORT);
  if (isConfiguredToken) {
    console.log("Bearer token: [CONFIGURED IN ENVIRONMENT OVERRIDE]");
    console.log("Using manual token override from FLOW_WORKER_TOKEN.");
  } else {
    console.log("Authentication: Automated application provisioning via PostgreSQL credential store");
    writeProvisionTicketFile();
    requestBackendProvisioning().catch(() => {});
  }
  console.log("Bound to loopback (" + HOST + "). Private local process.");
  console.log("");
});

async function shutdown() {
  try {
    cleanProvisionTicketFile();
    await worker.close();
  } finally {
    server.close(() => process.exit(0));
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
