import "node:process";
import http from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { FlowBrowserWorker } from "./flow-browser.mjs";

const HOST = process.env.FLOW_WORKER_HOST || "127.0.0.1";
const PORT = Number.parseInt(process.env.FLOW_WORKER_PORT || "4177", 10);
const TOKEN = process.env.FLOW_WORKER_TOKEN || randomBytes(32).toString("hex");
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

  const provided = Buffer.from(header.slice(7));
  const expected = Buffer.from(TOKEN);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
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
  response.setHeader("access-control-allow-headers", "authorization, content-type");
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
        port: PORT
      });
      return;
    }

    if (!isAuthorized(request)) {
      sendJson(response, 401, { success: false, message: "Missing or invalid local Flow worker bearer token." });
      return;
    }

    if (request.method === "GET" && pathname === "/session/status") {
      sendJson(response, 200, { success: true, session: await worker.getSessionStatus() });
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

    if (request.method === "POST" && pathname === "/jobs") {
      const body = await readJson(request);
      if (!worker.context || !worker.page || worker.page.isClosed()) {
        sendJson(response, 409, { success: false, message: "Open the visible Flow browser session first." });
        return;
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
    sendJson(response, error.statusCode || 500, {
      success: false,
      message: error.message || "Flow worker request failed."
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log("");
  console.log("AI Kids Content Studio — Google Flow local worker");
  console.log("Listening on http://" + HOST + ":" + PORT);
  console.log("Bearer token: " + TOKEN);
  console.log("Keep this terminal private. Do not share the token.");
  console.log("Open /session/open to launch the visible Google Flow browser.");
  console.log("");
});

async function shutdown() {
  try {
    await worker.close();
  } finally {
    server.close(() => process.exit(0));
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
