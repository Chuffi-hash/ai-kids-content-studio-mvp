import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  GoogleFlowCredentialService,
  getDefaultFlowProfileDir,
} from '../src/services/google-flow/google-flow-credential.service';
import { stripMarkdownProductionLabels } from '../src/services/google-flow/story-context.service';

test('Google Flow Self-Healing Credential & UI Polish Suite', async (t) => {
  await t.test('1. stripMarkdownProductionLabels strips production prefixes and markdown asterisks', () => {
    const raw1 = '***Visual Direction:*** "एक घने और खूबसूरत जंगल में चिंटू नाम का एक छोटा-सा जुगनू रहता था..."';
    assert.equal(
      stripMarkdownProductionLabels(raw1),
      '"एक घने और खूबसूरत जंगल में चिंटू नाम का एक छोटा-सा जुगनू रहता था..."'
    );

    const raw2 = '**Visual Direction:** Lush enchanted forest with sparkling fireflies';
    assert.equal(
      stripMarkdownProductionLabels(raw2),
      'Lush enchanted forest with sparkling fireflies'
    );

    const raw3 = '### Environment: Sunny Meadow with wildflowers';
    assert.equal(
      stripMarkdownProductionLabels(raw3),
      'Sunny Meadow with wildflowers'
    );

    const raw4 = 'Standard storytelling text with no prefix';
    assert.equal(stripMarkdownProductionLabels(raw4), 'Standard storytelling text with no prefix');
  });

  await t.test('2. syncLocalWorkerTokenFile writes token to workspace target directory', () => {
    const testDir = path.resolve(process.cwd(), '.test-flow-profile');
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    const testToken = 'test-token-77f9812e987c6b5a41d0823';
    GoogleFlowCredentialService.syncLocalWorkerTokenFile(testToken, testDir);

    const expectedFile = path.join(testDir, '.flow-worker-token');
    assert.ok(fs.existsSync(expectedFile), 'Token file must exist in profile directory');

    const content = fs.readFileSync(expectedFile, 'utf8').trim();
    assert.equal(content, testToken, 'Token content on disk must match active decrypted credential');

    // Clean up test dir
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  await t.test('3. GoogleFlowCredentialService resolves stable and consistent profile directory', () => {
    const dir = getDefaultFlowProfileDir();
    assert.ok(typeof dir === 'string' && dir.length > 0);
    assert.ok(
      dir.includes('GoogleFlowProfile') || dir.includes('GoogleFlowChromeProfile'),
      'Must resolve a GoogleFlow profile directory'
    );
  });
});
