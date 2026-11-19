import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { EncryptionKeyManager } from '../src/services/google-flow/encryption-key.manager.js';
import {
  GoogleFlowCredentialService,
  getProvisionTicketPath,
} from '../src/services/google-flow/google-flow-credential.service.js';
import { prisma } from '../src/services/database/database.service.js';

describe('Google Flow Database-Backed Credentials & Proxy Architecture', () => {
  let tempKeyFile: string;
  let mockWorkerServer: http.Server;
  let workerPort: number;
  let currentWorkerToken: string | null = null;
  let workerProvisionTicket: string | null = 'test-ticket-xyz-789';

  before(async () => {
    // 1. Setup isolated master key file
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flow-key-test-'));
    tempKeyFile = path.join(tempDir, 'test-master.key');
    EncryptionKeyManager.setKeyPath(tempKeyFile);

    // 2. Start mock worker server on loopback
    mockWorkerServer = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);

      if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: true,
            service: 'ai-kids-content-studio-flow-worker',
            host: '127.0.0.1',
            port: workerPort,
            hasConfiguredToken: false,
            isProvisioned: Boolean(currentWorkerToken),
          })
        );
        return;
      }

      // Provisioning endpoint
      if (req.method === 'POST' && url.pathname === '/session/provision') {
        const ticket = req.headers['x-flow-provision-ticket'];
        if (ticket !== workerProvisionTicket) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Invalid ticket' }));
          return;
        }

        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          const parsed = JSON.parse(body || '{}');
          currentWorkerToken = parsed.token;
          workerProvisionTicket = null;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Worker provisioned' }));
        });
        return;
      }

      // Protected endpoints requiring Bearer token
      const auth = req.headers.authorization;
      if (!auth || !currentWorkerToken || auth !== `Bearer ${currentWorkerToken}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Unauthorized' }));
        return;
      }

      if (url.pathname === '/session/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: true,
            session: {
              connected: true,
              browserRunning: true,
              authenticationStatus: 'authenticated',
            },
          })
        );
        return;
      }

      if (url.pathname === '/session/open') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: true,
            session: { connected: true, browserRunning: true, state: 'flow_page_open' },
          })
        );
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Not found' }));
    });

    await new Promise<void>((resolve) => {
      mockWorkerServer.listen(0, '127.0.0.1', () => {
        const addr = mockWorkerServer.address();
        if (typeof addr === 'object' && addr !== null) {
          workerPort = addr.port;
        }
        resolve();
      });
    });
  });

  after(async () => {
    EncryptionKeyManager.resetKeyPath();
    await new Promise<void>((resolve) => mockWorkerServer.close(() => resolve()));
    try {
      await fs.rm(path.dirname(tempKeyFile), { recursive: true, force: true });
    } catch {}
  });

  test('1. AES-256-GCM encryption and decryption roundtrip', () => {
    const secret = 'super-secret-worker-token-test-123456';
    const encrypted = EncryptionKeyManager.encrypt(secret);

    assert.ok(encrypted.encryptedValue, 'Should produce encrypted value');
    assert.strictEqual(encrypted.iv.length, 24, 'IV should be 12 bytes (24 hex characters)');
    assert.strictEqual(encrypted.authTag.length, 32, 'Auth tag should be 16 bytes (32 hex characters)');
    assert.strictEqual(encrypted.keyVersion, 'v1');

    const decrypted = EncryptionKeyManager.decrypt(
      encrypted.encryptedValue,
      encrypted.iv,
      encrypted.authTag,
      encrypted.keyVersion
    );
    assert.strictEqual(decrypted, secret, 'Decrypted text should match original');
  });

  test('2. Decryption fails with invalid auth tag or altered ciphertext', () => {
    const encrypted = EncryptionKeyManager.encrypt('sensitive-token-payload');
    const tamperedCiphertext =
      encrypted.encryptedValue.slice(0, -2) + (encrypted.encryptedValue.endsWith('aa') ? 'bb' : 'aa');

    assert.throws(
      () =>
        EncryptionKeyManager.decrypt(
          tamperedCiphertext,
          encrypted.iv,
          encrypted.authTag,
          encrypted.keyVersion
        ),
      /Decryption failed|tag verification failed/i
    );
  });

  test('3. Master key is persisted to isolated file outside repository', async () => {
    const stat = await fs.stat(tempKeyFile);
    assert.strictEqual(stat.isFile(), true);
    const content = await fs.readFile(tempKeyFile, 'utf8');
    assert.strictEqual(content.trim().length, 64, 'Master key should be 256 bits (64 hex characters)');
  });

  test('4. GoogleFlowCredentialService: Generates and persists credential in PostgreSQL', async () => {
    // Clean any pre-existing credential for test isolation
    await prisma.integrationCredential
      .deleteMany({
        where: { provider: 'google-flow', credentialType: 'worker-bearer-token' },
      })
      .catch(() => {});

    const cred = await GoogleFlowCredentialService.getOrCreateWorkerCredential();
    assert.ok(cred.token, 'Should generate token');
    assert.strictEqual(cred.token.length, 64, 'Token should be 32 bytes (64 hex chars)');
    assert.strictEqual(cred.keyVersion, 'v1');

    // Verify row in database is encrypted, never plaintext!
    const row = await prisma.integrationCredential.findUnique({
      where: {
        provider_credentialType: {
          provider: 'google-flow',
          credentialType: 'worker-bearer-token',
        },
      },
    });

    assert.ok(row, 'Row should exist in PostgreSQL');
    assert.notStrictEqual(row!.encryptedValue, cred.token, 'PostgreSQL must NEVER store plaintext token');
    assert.ok(row!.iv, 'IV should be stored');
    assert.ok(row!.authTag, 'Auth tag should be stored');

    // Calling again returns the SAME token without regenerating
    const cred2 = await GoogleFlowCredentialService.getOrCreateWorkerCredential();
    assert.strictEqual(cred2.token, cred.token, 'Should reuse existing token on restart');
  });

  test('5. getPublicCredentialStatus NEVER exposes the decrypted token', async () => {
    const status = await GoogleFlowCredentialService.getPublicCredentialStatus();
    assert.strictEqual(status.configured, true);
    assert.strictEqual((status as any).token, undefined, 'Public status must NOT contain token');
    assert.strictEqual((status as any).encryptedValue, undefined);
    assert.strictEqual((status as any).iv, undefined);
  });

  test('6. Worker provisioning handshake securely delivers token via loopback ticket', async () => {
    const workerUrl = `http://127.0.0.1:${workerPort}`;

    // Provision with ticket
    const provisionResult = await GoogleFlowCredentialService.provisionWorker(
      workerUrl,
      'test-ticket-xyz-789'
    );
    assert.strictEqual(provisionResult.ok, true);

    // Verify worker is now provisioned and accepts requests
    const verifyResult = await GoogleFlowCredentialService.verifyWorkerAuthentication(workerUrl);
    assert.strictEqual(verifyResult.ok, true);
    assert.strictEqual(verifyResult.authenticated, true);
    assert.strictEqual(verifyResult.pairingStatus, 'paired');
  });

  test('7. Regenerate credential updates token and keyVersion in PostgreSQL', async () => {
    const before = await GoogleFlowCredentialService.getOrCreateWorkerCredential();
    const regenerated = await GoogleFlowCredentialService.regenerateWorkerCredential({
      workerUrl: `http://127.0.0.1:${workerPort}`,
    });

    const after = await GoogleFlowCredentialService.getOrCreateWorkerCredential();
    assert.notStrictEqual(after.token, before.token, 'New token should differ from old token');
    assert.strictEqual(after.keyVersion, 'v1');
    assert.ok(after.updatedAt.getTime() >= before.updatedAt.getTime());
  });
});
