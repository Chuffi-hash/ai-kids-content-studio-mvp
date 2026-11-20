import { StorageService } from './storage.service.js';
import * as fs from 'fs';
import * as path from 'path';

export class LocalStorageService implements StorageService {
  private storageDir: string;

  constructor() {
    const storageBaseDir = process.env.STORAGE_DIR || './storage';
    this.storageDir = path.join(process.cwd(), storageBaseDir, 'images');

    // Ensure storage directory exists
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  async saveFile(data: Buffer, filename: string, contentType: string): Promise<{ url: string }> {
    const filepath = path.join(this.storageDir, filename);

    await fs.promises.writeFile(filepath, data);

    // Also mirror to other candidate storage directories to prevent 404s when working directory differs
    const candidateBaseDirs = [
      path.resolve(process.cwd(), 'storage', 'images'),
      path.resolve(process.cwd(), 'backend', 'storage', 'images'),
      path.resolve(process.cwd(), '..', 'storage', 'images'),
    ];
    for (const altDir of candidateBaseDirs) {
      if (altDir !== this.storageDir && fs.existsSync(path.dirname(altDir))) {
        try {
          if (!fs.existsSync(altDir)) {
            fs.mkdirSync(altDir, { recursive: true });
          }
          await fs.promises.writeFile(path.join(altDir, filename), data);
        } catch {}
      }
    }

    // Return a URL that can be used to access the file
    // For local storage, we'll use a relative path that can be served statically
    const url = `/storage/images/${filename}`;

    return { url };
  }
}
