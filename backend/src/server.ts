import express from "express";
import cors from "cors";
import path from "path";
import { contentRouter } from "./routes/content.js";
import { productionRouter } from "./routes/production.js";
import { characterRouter } from "./routes/characters.js";
import { initializeDatabase } from "./services/database/database.service.js";

// Initialize database
initializeDatabase();

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
app.use(
  "/storage",
  express.static(path.join(process.cwd(), storageDir), {
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

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "ai-kids-content-studio-api" });
});

app.use("/api/content", contentRouter);
app.use("/api/production", productionRouter);
app.use("/api/characters", characterRouter);

app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});
