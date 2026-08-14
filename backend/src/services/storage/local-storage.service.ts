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

    // Return a URL that can be used to access the file
    // For local storage, we'll use a relative path that can be served statically
    const url = `/storage/images/${filename}`;

    return { url };
  }
}
