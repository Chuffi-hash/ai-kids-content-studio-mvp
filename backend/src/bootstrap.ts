import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Load the backend configuration before any route or service module runs.
// This works in both `src` (development) and `dist/src` (production).
const envPaths = [
  path.resolve(__dirname, "..", ".env"),
  path.resolve(__dirname, "..", "..", ".env"),
];
const envPath = envPaths.find((candidate) => fs.existsSync(candidate));
dotenv.config({ path: envPath });

require("./server.js");
