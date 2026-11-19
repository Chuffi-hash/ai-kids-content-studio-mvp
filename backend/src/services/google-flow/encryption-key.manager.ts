import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DEFAULT_KEY_VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // Standard 96-bit IV for AES-GCM

export function getDefaultMasterKeyPath(): string {
  if (process.env.INTEGRATION_MASTER_KEY_FILE && process.env.INTEGRATION_MASTER_KEY_FILE.trim()) {
    return path.resolve(process.env.INTEGRATION_MASTER_KEY_FILE.trim());
  }

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(localAppData, 'AIKidsContentStudio', 'keys', 'integration-master.key');
  }

  if (process.platform === 'darwin') {
    return path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'AIKidsContentStudio',
      'keys',
      'integration-master.key'
    );
  }

  return path.join(
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
    'ai-kids-content-studio',
    'keys',
    'integration-master.key'
  );
}

export class EncryptionKeyManager {
  private static cachedKey: Buffer | null = null;
  private static keyPath: string = getDefaultMasterKeyPath();

  /**
   * For testing or custom deployment paths
   */
  public static setKeyPath(customPath: string): void {
    this.keyPath = path.resolve(customPath);
    this.cachedKey = null;
  }

  public static resetKeyPath(): void {
    this.keyPath = getDefaultMasterKeyPath();
    this.cachedKey = null;
  }

  /**
   * Retrieve the 256-bit master key from environment or protected local OS file storage.
   */
  public static getMasterKey(keyVersion = DEFAULT_KEY_VERSION): Buffer {
    if (this.cachedKey) {
      return this.cachedKey;
    }

    // 1. Environment variable override if explicitly configured
    const envKey = process.env.INTEGRATION_MASTER_KEY;
    if (envKey && envKey.trim()) {
      const trimmed = envKey.trim();
      let keyBuffer: Buffer;
      if (trimmed.length === 64 && /^[0-9a-fA-F]+$/.test(trimmed)) {
        keyBuffer = Buffer.from(trimmed, 'hex');
      } else {
        keyBuffer = crypto.createHash('sha256').update(trimmed).digest();
      }
      this.cachedKey = keyBuffer;
      return keyBuffer;
    }

    // 2. Protected OS-level file storage
    try {
      if (fs.existsSync(this.keyPath)) {
        const raw = fs.readFileSync(this.keyPath, 'utf8').trim();
        if (raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw)) {
          this.cachedKey = Buffer.from(raw, 'hex');
          return this.cachedKey;
        }
        if (raw.length >= 32) {
          this.cachedKey = crypto.createHash('sha256').update(raw).digest();
          return this.cachedKey;
        }
      }

      // Generate new 256-bit random master key and save securely
      const parentDir = path.dirname(this.keyPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true, mode: 0o700 });
      }

      const newKey = crypto.randomBytes(32);
      const hexKey = newKey.toString('hex');
      fs.writeFileSync(this.keyPath, hexKey, { mode: 0o600, encoding: 'utf8' });

      this.cachedKey = newKey;
      return newKey;
    } catch (err: any) {
      throw new Error(
        `Failed to access or initialize local integration master encryption key at ${this.keyPath}: ${err.message}`
      );
    }
  }

  /**
   * Authenticated encryption with AES-256-GCM
   */
  public static encrypt(
    plaintext: string,
    keyVersion = DEFAULT_KEY_VERSION
  ): { encryptedValue: string; iv: string; authTag: string; keyVersion: string } {
    if (!plaintext || typeof plaintext !== 'string') {
      throw new Error('Encryption requires a non-empty string plaintext.');
    }

    const key = this.getMasterKey(keyVersion);
    const iv = crypto.randomBytes(IV_LENGTH_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return {
      encryptedValue: encrypted,
      iv: iv.toString('hex'),
      authTag,
      keyVersion,
    };
  }

  /**
   * Authenticated decryption with AES-256-GCM
   */
  public static decrypt(
    encryptedValue: string,
    ivHex: string,
    authTagHex: string,
    keyVersion = DEFAULT_KEY_VERSION
  ): string {
    if (!encryptedValue || !ivHex || !authTagHex) {
      throw new Error('Decryption requires encryptedValue, iv, and authTag.');
    }

    const key = this.getMasterKey(keyVersion);
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    if (iv.length !== IV_LENGTH_BYTES) {
      throw new Error(`Invalid IV length for AES-GCM: expected ${IV_LENGTH_BYTES} bytes.`);
    }

    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encryptedValue, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err: any) {
      throw new Error(
        `Decryption failed: Authenticated tag verification failed or master encryption key is invalid. (${err.message})`
      );
    }
  }
}
