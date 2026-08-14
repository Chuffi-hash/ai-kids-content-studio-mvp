import Database from "better-sqlite3";
import * as path from "path";

const dbPath = path.join(process.cwd(), "prisma", "dev.db");
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma("journal_mode = WAL");

// Initialize tables
export function initializeDatabase() {
  // Create stories table
  db.exec(`
    CREATE TABLE IF NOT EXISTS stories (
      id TEXT PRIMARY KEY,
      story_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      logline TEXT NOT NULL,
      lesson TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes for stories
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_stories_story_id ON stories(story_id)`,
  );

  // Create scenes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS scenes (
      id TEXT PRIMARY KEY,
      scene_id TEXT UNIQUE NOT NULL,
      story_id TEXT NOT NULL,
      title TEXT NOT NULL,
      number INTEGER NOT NULL,
      narration TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (story_id) REFERENCES stories(story_id)
    )
  `);

  // Ensure narration column exists (fixes schema drift on existing DBs)
  const sceneColumns = db.prepare("PRAGMA table_info(scenes)").all() as Array<{
    name: string;
  }>;
  if (!sceneColumns.some((col) => col.name === "narration")) {
    db.exec("ALTER TABLE scenes ADD COLUMN narration TEXT");
  }

  // Create indexes for scenes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_scenes_scene_id ON scenes(scene_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_scenes_story_id ON scenes(story_id)`);

  // Create images table
  db.exec(`
    CREATE TABLE IF NOT EXISTS images (
      id TEXT PRIMARY KEY,
      scene_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      image_url TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (scene_id) REFERENCES scenes(scene_id)
    )
  `);

  // Create indexes for images
  db.exec(`CREATE INDEX IF NOT EXISTS idx_images_scene_id ON images(scene_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_images_status ON images(status)`);

  console.log("[Database] Database initialized");
}

// Story operations
export function createStory(data: {
  id: string;
  storyId: string;
  title: string;
  logline: string;
  lesson: string;
}) {
  const stmt = db.prepare(`
    INSERT INTO stories (id, story_id, title, logline, lesson)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(story_id) DO UPDATE SET
      title = excluded.title,
      logline = excluded.logline,
      lesson = excluded.lesson,
      updated_at = CURRENT_TIMESTAMP
  `);
  return stmt.run(data.id, data.storyId, data.title, data.logline, data.lesson);
}

export function getStoryByStoryId(storyId: string) {
  const stmt = db.prepare("SELECT * FROM stories WHERE story_id = ?");
  return stmt.get(storyId) as any;
}

// Scene operations
export function createScene(data: {
  id: string;
  sceneId: string;
  storyId: string;
  title: string;
  number: number;
  narration?: string;
}) {
  const stmt = db.prepare(`
    INSERT INTO scenes (id, scene_id, story_id, title, number, narration)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(scene_id) DO UPDATE SET
      title = excluded.title,
      narration = excluded.narration,
      updated_at = CURRENT_TIMESTAMP
  `);
  return stmt.run(
    data.id,
    data.sceneId,
    data.storyId,
    data.title,
    data.number,
    data.narration || null,
  );
}

export function getSceneBySceneId(sceneId: string) {
  const stmt = db.prepare("SELECT * FROM scenes WHERE scene_id = ?");
  return stmt.get(sceneId) as any;
}

export function getScenesByStoryId(storyId: string) {
  const stmt = db.prepare(
    "SELECT * FROM scenes WHERE story_id = ? ORDER BY number ASC",
  );
  return stmt.all(storyId) as any[];
}

// Image operations
export function createImage(data: {
  id: string;
  sceneId: string;
  provider: string;
  model: string;
  prompt: string;
  storageKey: string;
  imageUrl: string;
  width: number;
  height: number;
  status: string;
}) {
  const stmt = db.prepare(`
    INSERT INTO images (id, scene_id, provider, model, prompt, storage_key, image_url, width, height, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    data.id,
    data.sceneId,
    data.provider,
    data.model,
    data.prompt,
    data.storageKey,
    data.imageUrl,
    data.width,
    data.height,
    data.status,
  );
}

export function getImagesBySceneId(sceneId: string) {
  const stmt = db.prepare(
    "SELECT * FROM images WHERE scene_id = ? ORDER BY created_at DESC",
  );
  return stmt.all(sceneId) as any[];
}

export function getImageById(id: string) {
  const stmt = db.prepare("SELECT * FROM images WHERE id = ?");
  return stmt.get(id) as any;
}

export function updateImageStatus(id: string, status: string) {
  const stmt = db.prepare(`
    UPDATE images
    SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  return stmt.run(status, id);
}

export default db;
