import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { contentRouter } from "./routes/content.js";
import { productionRouter } from "./routes/production.js";
import { characterRouter } from "./routes/characters.js";
import { characterStudioRouter } from "./routes/character-studio.js";
import { backgroundStudioRouter } from "./routes/background-studio.js";
import { sceneDirectorRouter } from "./routes/scene-director.js";
import { shotRouter } from "./routes/shots.js";
import { brandingRouter } from "./routes/branding.js";
import { googleFlowRouter } from "./routes/google-flow.js";
import { initializeDatabase } from "./services/database/database.service.js";
import { GoogleFlowCredentialService } from "./services/google-flow/google-flow-credential.service.js";

const app = express();
const port = Number(process.env.PORT ?? 5001);
const storageDir = process.env.STORAGE_DIR || "./storage";
app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
  }),
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Serve static files from storage directory with proper streaming, CORS, and audio/video MIME headers
const candidateStorageDirs = [
  path.resolve(process.cwd(), storageDir),
  path.resolve(process.cwd(), "backend", storageDir),
  path.resolve(process.cwd(), "..", storageDir),
].filter((dir, idx, self) => fs.existsSync(dir) && self.indexOf(dir) === idx);

for (const dir of candidateStorageDirs) {
  app.use(
    "/storage",
    express.static(dir, {
      setHeaders: (res, filePath) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        res.setHeader("Accept-Ranges", "bytes");
        if (filePath.endsWith(".mp3")) {
          res.setHeader("Content-Type", "audio/mpeg");
        } else if (filePath.endsWith(".wav")) {
          res.setHeader("Content-Type", "audio/wav");
        } else if (filePath.endsWith(".m4a")) {
          res.setHeader("Content-Type", "audio/mp4");
        } else if (filePath.endsWith(".mp4")) {
          res.setHeader("Content-Type", "video/mp4");
        }
      },
    })
  );
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "ai-kids-content-studio-api" });
});

app.use("/api/content", contentRouter);
app.use("/api/production", productionRouter);
app.use("/api/characters", characterRouter);
app.use("/api/character-studio", characterStudioRouter);
app.use("/api/background-studio", backgroundStudioRouter);
app.use("/api/scene-director", sceneDirectorRouter);
app.use("/api/shots", shotRouter);
app.use("/api/branding", brandingRouter);
app.use("/api/integrations/google-flow", googleFlowRouter);

async function startServer() {
  await initializeDatabase();

  // Initialize and verify Google Flow integration credentials in PostgreSQL
  try {
    await GoogleFlowCredentialService.getOrCreateWorkerCredential();
    GoogleFlowCredentialService.provisionWorker().catch(() => {});
  } catch (err: any) {
    console.warn('[Server] Google Flow credential notice:', err.message);
  }

  app.listen(port, "0.0.0.0", () => {
    console.log(`API running on http://127.0.0.1:${port}`);
  });
}

startServer().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});
