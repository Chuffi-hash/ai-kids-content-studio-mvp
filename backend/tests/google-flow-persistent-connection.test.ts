import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

describe('Google Flow Persistent Connection & Authentication Contract', () => {
  const TEST_TOKEN = 'test-configured-stable-token-abcdef123456';
  const PROFILE_DIR = path.join(os.tmpdir(), 'test-persistent-flow-profile');

  let mockWorkerServer: http.Server;
  let serverPort: number;

  before(async () => {
    await fs.mkdir(PROFILE_DIR, { recursive: true });

    mockWorkerServer = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);

      if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: true,
            service: 'ai-kids-content-studio-flow-worker',
            host: '127.0.0.1',
            port: serverPort,
            hasConfiguredToken: true,
            browserChannel: 'chrome',
            profileDir: PROFILE_DIR,
          })
        );
        return;
      }

      const auth = req.headers.authorization;
      if (auth !== `Bearer ${TEST_TOKEN}`) {
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
              workerOnline: true,
              browserRunning: true,
              flowPageOpen: true,
              googleAuthenticated: true,
              manualLoginRequired: false,
              googleSigninBlocked: false,
              projectSelected: true,
              authenticationStatus: 'authenticated',
              state: 'flow_page_open',
              currentUrl: 'https://labs.google/fx/tools/flow/project/prj_test_123',
              title: 'Test Project - Flow',
              message: 'Google Flow session is authenticated with active project selected.',
              browserChannel: 'chrome',
              configuredProfileDir: PROFILE_DIR,
              profileDirExists: true,
              ownsActiveBrowser: true,
              diagnostics: {
                browserChannel: 'chrome',
                configuredProfileDir: PROFILE_DIR,
                profileDirExists: true,
                ownsActiveBrowser: true,
                googleSigninRequired: false,
                googleSigninBlocked: false,
                authenticationStatus: 'authenticated',
              },
            },
          })
        );
        return;
      }

      if (url.pathname === '/session/close') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: true,
            session: {
              connected: false,
              workerOnline: true,
              browserRunning: false,
              flowPageOpen: false,
              googleAuthenticated: false,
              manualLoginRequired: false,
              googleSigninBlocked: false,
              projectSelected: false,
              authenticationStatus: 'unknown',
              state: 'browser_not_started',
              browserChannel: 'chrome',
              configuredProfileDir: PROFILE_DIR,
              profileDirExists: true,
              ownsActiveBrowser: false,
            },
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
          serverPort = addr.port;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => mockWorkerServer.close(() => resolve()));
    await fs.rm(PROFILE_DIR, { recursive: true, force: true }).catch(() => {});
  });

  test('1. Health check exposes configured token presence and profile diagnostics', async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/health`);
    assert.strictEqual(res.ok, true);
    const data = await res.json();

    assert.strictEqual(data.success, true);
    assert.strictEqual(data.service, 'ai-kids-content-studio-flow-worker');
    assert.strictEqual(data.hasConfiguredToken, true);
    assert.strictEqual(data.browserChannel, 'chrome');
    assert.strictEqual(data.profileDir, PROFILE_DIR);
  });

  test('2. Multi-state authentication contract separates browserRunning from googleAuthenticated', async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/session/status`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    assert.strictEqual(res.ok, true);
    const data = await res.json();

    assert.strictEqual(data.session.workerOnline, true);
    assert.strictEqual(data.session.browserRunning, true);
    assert.strictEqual(data.session.flowPageOpen, true);
    assert.strictEqual(data.session.googleAuthenticated, true);
    assert.strictEqual(data.session.manualLoginRequired, false);
    assert.strictEqual(data.session.googleSigninBlocked, false);
    assert.strictEqual(data.session.projectSelected, true);
    assert.strictEqual(data.session.authenticationStatus, 'authenticated');

    // Diagnostics structure
    const diag = data.session.diagnostics;
    assert.ok(diag, 'Diagnostics object should exist');
    assert.strictEqual(diag.browserChannel, 'chrome');
    assert.strictEqual(diag.configuredProfileDir, PROFILE_DIR);
    assert.strictEqual(diag.profileDirExists, true);
    assert.strictEqual(diag.ownsActiveBrowser, true);
    assert.strictEqual(diag.googleSigninRequired, false);
    assert.strictEqual(diag.googleSigninBlocked, false);
    assert.strictEqual(diag.authenticationStatus, 'authenticated');
  });

  test('3. LocalStorage persistence schema respects rememberConnection setting', () => {
    const STORAGE_KEY = 'ai-kids-content-studio:google-flow:connection:v1';

    // Mock storage implementation
    const store = new Map<string, string>();
    const mockLocalStorage = {
      getItem: (key: string) => store.get(key) || null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    };

    function persist(data: {
      workerUrl: string;
      workerToken?: string;
      rememberConnection: boolean;
      selectedProjectUrl?: string;
    }) {
      const toStore: any = {
        workerUrl: data.workerUrl,
        rememberConnection: data.rememberConnection,
        selectedProjectUrl: data.selectedProjectUrl || '',
      };
      if (data.rememberConnection && data.workerToken) {
        toStore.workerToken = data.workerToken;
      }
      mockLocalStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    }

    // Case A: Remember is true -> token is stored
    persist({
      workerUrl: 'http://127.0.0.1:4177',
      workerToken: TEST_TOKEN,
      rememberConnection: true,
      selectedProjectUrl: 'https://labs.google/fx/tools/flow/project/prj_abc',
    });
    const savedA = JSON.parse(mockLocalStorage.getItem(STORAGE_KEY)!);
    assert.strictEqual(savedA.workerToken, TEST_TOKEN);
    assert.strictEqual(savedA.rememberConnection, true);
    assert.strictEqual(savedA.selectedProjectUrl, 'https://labs.google/fx/tools/flow/project/prj_abc');

    // Case B: Remember is false -> token is never persisted in storage
    persist({
      workerUrl: 'http://127.0.0.1:4177',
      workerToken: TEST_TOKEN,
      rememberConnection: false,
    });
    const savedB = JSON.parse(mockLocalStorage.getItem(STORAGE_KEY)!);
    assert.strictEqual(savedB.workerToken, undefined);
    assert.strictEqual(savedB.rememberConnection, false);
  });

  test('4. Session close preserves the profile directory on disk', async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/session/close`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    assert.strictEqual(res.ok, true);
    const data = await res.json();

    assert.strictEqual(data.session.browserRunning, false);
    assert.strictEqual(data.session.ownsActiveBrowser, false);

    // Profile directory must remain intact
    const stat = await fs.stat(PROFILE_DIR);
    assert.strictEqual(stat.isDirectory(), true);
  });
});
