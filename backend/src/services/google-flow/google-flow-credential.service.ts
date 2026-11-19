import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { prisma } from '../database/database.service.js';
import { EncryptionKeyManager } from './encryption-key.manager.js';

export interface GoogleFlowMetadata {
  workerUrl: string;
  browserChannel: string;
  profileDir?: string;
  selectedProjectUrl?: string;
  lastSelectedStoryId?: string;
  lastSelectedCharacterId?: string;
  pairingStatus: 'paired' | 'awaiting_provisioning' | 'unpaired';
  lastVerifiedAt?: string;
}

const PROVIDER = 'google-flow';
const CREDENTIAL_TYPE = 'worker-bearer-token';
const DEFAULT_WORKER_URL = 'http://127.0.0.1:4177';

export function getDefaultFlowProfileDir(): string {
  if (process.env.FLOW_PROFILE_DIR && process.env.FLOW_PROFILE_DIR.trim()) {
    return path.resolve(process.env.FLOW_PROFILE_DIR.trim());
  }
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(localAppData, 'AIKidsContentStudio', 'GoogleFlowChromeProfile');
  }
  if (process.platform === 'darwin') {
    return path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'AIKidsContentStudio',
      'GoogleFlowChromeProfile'
    );
  }
  return path.join(
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
    'ai-kids-content-studio',
    'GoogleFlowChromeProfile'
  );
}

export function getProvisionTicketPath(profileDir?: string): string {
  const dir = profileDir || getDefaultFlowProfileDir();
  return path.join(dir, '.worker-provision-ticket.json');
}

export class GoogleFlowCredentialService {
  /**
   * Reads existing metadata directly from PostgreSQL without decrypting the token.
   * Guaranteed never to fail due to decryption or master key issues.
   */
  public static async readMetadataOnly(): Promise<GoogleFlowMetadata> {
    try {
      const existing = await prisma.integrationCredential.findUnique({
        where: {
          provider_credentialType: {
            provider: PROVIDER,
            credentialType: CREDENTIAL_TYPE,
          },
        },
        select: { metadata: true },
      });
      if (existing && existing.metadata) {
        return existing.metadata as unknown as GoogleFlowMetadata;
      }
    } catch {
      // DB not yet populated or offline
    }
    return {
      workerUrl: DEFAULT_WORKER_URL,
      browserChannel: process.env.FLOW_BROWSER_CHANNEL?.trim() || 'chrome',
      profileDir: getDefaultFlowProfileDir(),
      pairingStatus: 'unpaired',
    };
  }

  /**
   * Safe check: tests whether the credential record exists and can be decrypted.
   */
  public static async testCredentialDecryption(): Promise<{
    recordExists: boolean;
    decryptedSuccessfully: boolean;
    keyVersion?: string;
    error?: string;
  }> {
    try {
      const existing = await prisma.integrationCredential.findUnique({
        where: {
          provider_credentialType: {
            provider: PROVIDER,
            credentialType: CREDENTIAL_TYPE,
          },
        },
      });

      if (!existing) {
        return { recordExists: false, decryptedSuccessfully: false };
      }

      try {
        EncryptionKeyManager.decrypt(
          existing.encryptedValue,
          existing.iv,
          existing.authTag,
          existing.keyVersion
        );
        return {
          recordExists: true,
          decryptedSuccessfully: true,
          keyVersion: existing.keyVersion,
        };
      } catch (decErr: any) {
        return {
          recordExists: true,
          decryptedSuccessfully: false,
          keyVersion: existing.keyVersion,
          error: decErr.message,
        };
      }
    } catch (dbErr: any) {
      return {
        recordExists: false,
        decryptedSuccessfully: false,
        error: `Database query failed: ${dbErr.message}`,
      };
    }
  }

  /**
   * Internal method: gets or creates the decrypted worker bearer token and metadata.
   * If a credential does not exist in PostgreSQL, inspects existing environment/file
   * configuration for backward-compatibility or generates a new 32-byte cryptographic token.
   */
  public static async getOrCreateWorkerCredential(): Promise<{
    token: string;
    metadata: GoogleFlowMetadata;
    keyVersion: string;
    updatedAt: Date;
  }> {
    const existing = await prisma.integrationCredential.findUnique({
      where: {
        provider_credentialType: {
          provider: PROVIDER,
          credentialType: CREDENTIAL_TYPE,
        },
      },
    });

    if (existing) {
      try {
        const decrypted = EncryptionKeyManager.decrypt(
          existing.encryptedValue,
          existing.iv,
          existing.authTag,
          existing.keyVersion
        );
        const meta = (existing.metadata as unknown as GoogleFlowMetadata) || {
          workerUrl: DEFAULT_WORKER_URL,
          browserChannel: 'chrome',
          profileDir: getDefaultFlowProfileDir(),
          pairingStatus: 'unpaired',
        };
        return {
          token: decrypted,
          metadata: meta,
          keyVersion: existing.keyVersion,
          updatedAt: existing.updatedAt,
        };
      } catch (err: any) {
        console.warn(
          `[GoogleFlowCredentialService] Notice: Stale or unrecoverable integration credential found in database (${err.message}). Auto-recovering by regenerating credential with active master key...`
        );
        await this.regenerateWorkerCredential();
        const fresh = await prisma.integrationCredential.findUnique({
          where: {
            provider_credentialType: {
              provider: PROVIDER,
              credentialType: CREDENTIAL_TYPE,
            },
          },
        });
        if (fresh) {
          const decryptedFresh = EncryptionKeyManager.decrypt(
            fresh.encryptedValue,
            fresh.iv,
            fresh.authTag,
            fresh.keyVersion
          );
          return {
            token: decryptedFresh,
            metadata: (fresh.metadata as unknown as GoogleFlowMetadata) || {
              workerUrl: DEFAULT_WORKER_URL,
              browserChannel: 'chrome',
              profileDir: getDefaultFlowProfileDir(),
              pairingStatus: 'unpaired',
            },
            keyVersion: fresh.keyVersion,
            updatedAt: fresh.updatedAt,
          };
        }
        throw new Error(
          `Failed to decrypt Google Flow integration credential from database: ${err.message}. If the encryption master key changed, regenerate credentials from Integration Studio.`
        );
      }
    }

    // Step 2: Backward compatibility check for existing FLOW_WORKER_TOKEN in environment or .env
    let initialToken = process.env.FLOW_WORKER_TOKEN?.trim() || '';
    if (!initialToken) {
      try {
        const workerEnvPath = path.resolve(process.cwd(), '../flow-worker/.env');
        if (fs.existsSync(workerEnvPath)) {
          const content = fs.readFileSync(workerEnvPath, 'utf8');
          const match = content.match(/^FLOW_WORKER_TOKEN=(.+)$/m);
          if (match && match[1]?.trim()) {
            initialToken = match[1].trim();
          }
        }
      } catch {
        // Ignore file read error, fall back to generation
      }
    }

    // Generate new random 32-byte hex token if no existing token
    if (!initialToken) {
      initialToken = crypto.randomBytes(32).toString('hex');
    }

    const { encryptedValue, iv, authTag, keyVersion } = EncryptionKeyManager.encrypt(initialToken);
    const initialMeta: GoogleFlowMetadata = {
      workerUrl: DEFAULT_WORKER_URL,
      browserChannel: process.env.FLOW_BROWSER_CHANNEL?.trim() || 'chrome',
      profileDir: getDefaultFlowProfileDir(),
      pairingStatus: 'unpaired',
    };

    const created = await prisma.integrationCredential.create({
      data: {
        provider: PROVIDER,
        credentialType: CREDENTIAL_TYPE,
        encryptedValue,
        iv,
        authTag,
        keyVersion,
        metadata: initialMeta as any,
      },
    });

    return {
      token: initialToken,
      metadata: initialMeta,
      keyVersion: created.keyVersion,
      updatedAt: created.updatedAt,
    };
  }

  /**
   * Safe public status endpoint: NEVER exposes the decrypted token to frontend or API consumers.
   * Reports truthful, independent states without failing if decryption encounters an error.
   */
  public static async getPublicCredentialStatus(): Promise<{
    configured: boolean;
    masterKeyAvailable: boolean;
    decryptedSuccessfully: boolean;
    decryptionError?: string;
    lastUpdated: string | null;
    keyVersion: string;
    metadata: GoogleFlowMetadata;
  }> {
    const keyHealth = EncryptionKeyManager.checkKeyHealth();
    const decTest = await this.testCredentialDecryption();
    const metadata = await this.readMetadataOnly();

    if (!decTest.recordExists) {
      // Auto-initialize if not yet created so the app is immediately ready
      try {
        const initialized = await this.getOrCreateWorkerCredential();
        return {
          configured: true,
          masterKeyAvailable: keyHealth.healthy,
          decryptedSuccessfully: true,
          lastUpdated: initialized.updatedAt.toISOString(),
          keyVersion: initialized.keyVersion,
          metadata: initialized.metadata,
        };
      } catch (initErr: any) {
        return {
          configured: false,
          masterKeyAvailable: keyHealth.healthy,
          decryptedSuccessfully: false,
          decryptionError: initErr.message,
          lastUpdated: null,
          keyVersion: 'v1',
          metadata,
        };
      }
    }

    let lastUpdated: string | null = null;
    let keyVersion = 'v1';
    try {
      const credRecord = await prisma.integrationCredential.findUnique({
        where: {
          provider_credentialType: {
            provider: PROVIDER,
            credentialType: CREDENTIAL_TYPE,
          },
        },
        select: { updatedAt: true, keyVersion: true },
      });
      if (credRecord) {
        lastUpdated = credRecord.updatedAt.toISOString();
        keyVersion = credRecord.keyVersion;
      }
    } catch {}

    return {
      configured: true,
      masterKeyAvailable: keyHealth.healthy,
      decryptedSuccessfully: decTest.decryptedSuccessfully,
      decryptionError: decTest.error,
      lastUpdated,
      keyVersion,
      metadata,
    };
  }

  /**
   * Regenerates a new cryptographically secure token and updates PostgreSQL.
   * Never attempts to decrypt the old token, ensuring recovery works even if
   * the previous record or master key was corrupted.
   */
  public static async regenerateWorkerCredential(
    metadataUpdates?: Partial<GoogleFlowMetadata>
  ): Promise<{
    keyVersion: string;
    updatedAt: Date;
    metadata: GoogleFlowMetadata;
    provisioned: boolean;
    provisionMessage?: string;
  }> {
    const newToken = crypto.randomBytes(32).toString('hex');
    const { encryptedValue, iv, authTag, keyVersion } = EncryptionKeyManager.encrypt(newToken);

    // Read existing metadata directly from PostgreSQL without decrypting the old token!
    const currentMeta = await this.readMetadataOnly();
    const mergedMeta: GoogleFlowMetadata = {
      ...currentMeta,
      ...metadataUpdates,
      pairingStatus: 'awaiting_provisioning',
    };

    const updated = await prisma.integrationCredential.upsert({
      where: {
        provider_credentialType: {
          provider: PROVIDER,
          credentialType: CREDENTIAL_TYPE,
        },
      },
      update: {
        encryptedValue,
        iv,
        authTag,
        keyVersion,
        metadata: mergedMeta as any,
      },
      create: {
        provider: PROVIDER,
        credentialType: CREDENTIAL_TYPE,
        encryptedValue,
        iv,
        authTag,
        keyVersion,
        metadata: mergedMeta as any,
      },
    });

    // Proactively attempt to push the regenerated token to the running worker if ticket exists
    let provisioned = false;
    let provisionMessage = 'Credential regenerated. Reconnect worker to apply new authorization.';
    try {
      const provRes = await this.provisionWorker(mergedMeta.workerUrl);
      provisioned = provRes.ok;
      if (provRes.ok) {
        provisionMessage = provRes.message;
      }
    } catch {}

    return {
      keyVersion: updated.keyVersion,
      updatedAt: updated.updatedAt,
      metadata: mergedMeta,
      provisioned,
      provisionMessage,
    };
  }

  /**
   * Update durable configuration in metadata (workerUrl, browserChannel, profileDir, projectUrl, etc.)
   * Safe against decryption failures.
   */
  public static async updateMetadata(
    updates: Partial<GoogleFlowMetadata>
  ): Promise<GoogleFlowMetadata> {
    const current = await this.readMetadataOnly();
    const mergedMeta: GoogleFlowMetadata = {
      ...current,
      ...updates,
    };

    try {
      await prisma.integrationCredential.update({
        where: {
          provider_credentialType: {
            provider: PROVIDER,
            credentialType: CREDENTIAL_TYPE,
          },
        },
        data: {
          metadata: mergedMeta as any,
        },
      });
    } catch {}

    return mergedMeta;
  }

  /**
   * Verifies worker authentication through loopback using the decrypted token.
   */
  public static async verifyWorkerAuthentication(workerUrlOverride?: string): Promise<{
    ok: boolean;
    workerOnline: boolean;
    authenticated: boolean;
    pairingStatus: 'paired' | 'unpaired' | 'awaiting_provisioning';
    session?: any;
    error?: string;
  }> {
    let token: string;
    let metadata: GoogleFlowMetadata;
    try {
      const cred = await this.getOrCreateWorkerCredential();
      token = cred.token;
      metadata = cred.metadata;
    } catch (decErr: any) {
      const meta = await this.readMetadataOnly();
      return {
        ok: false,
        workerOnline: false,
        authenticated: false,
        pairingStatus: 'unpaired',
        error: `Credential decryption failed: ${decErr.message}. Click "Recover Credential" to re-initialize.`,
      };
    }

    const workerUrl = (workerUrlOverride || metadata.workerUrl || DEFAULT_WORKER_URL).replace(/\/+$/, '');

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(`${workerUrl}/session/status`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        // Update pairing status in DB
        await this.updateMetadata({
          pairingStatus: 'paired',
          lastVerifiedAt: new Date().toISOString(),
        });

        return {
          ok: true,
          workerOnline: true,
          authenticated: true,
          pairingStatus: 'paired',
          session: data.session,
        };
      }

      if (res.status === 401) {
        await this.updateMetadata({ pairingStatus: 'awaiting_provisioning' });
        return {
          ok: false,
          workerOnline: true,
          authenticated: false,
          pairingStatus: 'awaiting_provisioning',
          error: 'Worker responded with HTTP 401 Unauthorized. Worker is awaiting provisioning or token mismatch.',
        };
      }

      return {
        ok: false,
        workerOnline: true,
        authenticated: false,
        pairingStatus: 'unpaired',
        error: `Worker returned HTTP ${res.status}`,
      };
    } catch (err: any) {
      return {
        ok: false,
        workerOnline: false,
        authenticated: false,
        pairingStatus: metadata.pairingStatus || 'unpaired',
        error: err.name === 'AbortError' ? 'Worker request timed out.' : 'Worker is offline on loopback.',
      };
    }
  }

  /**
   * Protected worker provisioning handshake:
   * Inspects local disk ticket or supplied ticket to push the decrypted token to worker.
   */
  public static async provisionWorker(
    workerUrlOverride?: string,
    suppliedTicket?: string
  ): Promise<{ ok: boolean; message: string }> {
    let token: string;
    let metadata: GoogleFlowMetadata;
    try {
      const cred = await this.getOrCreateWorkerCredential();
      token = cred.token;
      metadata = cred.metadata;
    } catch (decErr: any) {
      return {
        ok: false,
        message: `Failed to decrypt credential: ${decErr.message}. Click "Recover Credential" to re-generate authorization.`,
      };
    }

    const workerUrl = (workerUrlOverride || metadata.workerUrl || DEFAULT_WORKER_URL).replace(/\/+$/, '');

    let ticket = suppliedTicket?.trim() || '';

    // Check local ticket file if not supplied
    if (!ticket) {
      const profileDir = metadata.profileDir || getDefaultFlowProfileDir();
      const ticketPath = getProvisionTicketPath(profileDir);
      try {
        if (fs.existsSync(ticketPath)) {
          const raw = fs.readFileSync(ticketPath, 'utf8');
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.ticket === 'string') {
            ticket = parsed.ticket.trim();
          }
        }
      } catch {
        // Ticket file read failed or doesn't exist
      }
    }

    if (!ticket) {
      // Check if worker is already paired
      const testStatus = await this.verifyWorkerAuthentication(workerUrl);
      if (testStatus.authenticated) {
        return { ok: true, message: 'Worker is already paired and authenticated.' };
      }
      return {
        ok: false,
        message: 'No active provisioning ticket found on disk. Start flow-worker to initiate handshake.',
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(`${workerUrl}/session/provision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-flow-provision-ticket': ticket,
        },
        body: JSON.stringify({ token }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload.success === false) {
        return {
          ok: false,
          message: payload.message || `Provisioning failed with status ${res.status}`,
        };
      }

      // Cleanup local ticket file once provisioned
      try {
        const ticketPath = getProvisionTicketPath();
        if (fs.existsSync(ticketPath)) {
          fs.unlinkSync(ticketPath);
        }
      } catch {}

      await this.updateMetadata({
        pairingStatus: 'paired',
        lastVerifiedAt: new Date().toISOString(),
      });

      return {
        ok: true,
        message: 'Worker successfully provisioned and paired with persistent credential.',
      };
    } catch (err: any) {
      return {
        ok: false,
        message: `Could not connect to worker on ${workerUrl}: ${err.message}`,
      };
    }
  }
}
