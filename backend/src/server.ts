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
app.use(express.json());

// Serve static files from storage directory
app.use("/storage", express.static(path.join(process.cwd(), storageDir)));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "ai-kids-content-studio-api" });
});

app.use("/api/content", contentRouter);
app.use("/api/production", productionRouter);
app.use("/api/characters", characterRouter);

app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});
