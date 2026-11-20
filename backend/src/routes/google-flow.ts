import { Router, Request, Response } from 'express';
import { GoogleFlowCredentialService } from '../services/google-flow/google-flow-credential.service.js';
import { EncryptionKeyManager } from '../services/google-flow/encryption-key.manager.js';
import { GoogleFlowAssetImportService } from '../services/google-flow/google-flow-asset-import.service.js';
import { StoryContextService } from '../services/google-flow/story-context.service.js';
import { GenerationOrchestratorService } from '../services/generation-orchestrator/generation-orchestrator.service.js';

export const googleFlowRouter = Router();

function isLoopback(req: Request): boolean {
  const ip = req.ip || req.socket.remoteAddress || '';
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip.endsWith('127.0.0.1')
  );
}

async function forwardToWorker(
  endpoint: string,
  method: string,
  body?: any,
  signal?: AbortSignal
): Promise<{ status: number; data: any }> {
  let token: string;
  let metadata: any;
  try {
    const cred = await GoogleFlowCredentialService.getOrCreateWorkerCredential();
    token = cred.token;
    metadata = cred.metadata;
  } catch (decErr: any) {
    return {
      status: 503,
      data: {
        success: false,
        code: 'ERR_CREDENTIAL_DECRYPT',
        message: `Database credential decryption failed: ${decErr.message}. Use "Recover Credential" in Integration Studio.`,
      },
    };
  }

  const workerBase = (metadata.workerUrl || 'http://127.0.0.1:4177').replace(/\/+$/, '');

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    let response = await fetch(`${workerBase}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });

    // Self-healing recovery: if worker returns 401, sync token to disk & re-provision before failing
    if (response.status === 401 && token) {
      try {
        GoogleFlowCredentialService.syncLocalWorkerTokenFile(token);
        await GoogleFlowCredentialService.provisionWorker(workerBase);
        response = await fetch(`${workerBase}${endpoint}`, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal,
        });
      } catch {}
    }

    const data = await response.json().catch(() => ({}));
    return { status: response.status, data };
  } catch (netErr: any) {
    return {
      status: 502,
      data: {
        success: false,
        code: 'ERR_WORKER_OFFLINE',
        message: `Cannot reach local Flow worker at ${workerBase}. Ensure worker is running on loopback: ${netErr.message}`,
      },
    };
  }
}

// ----------------------------------------------------
// 1. Credential Management Endpoints
// ----------------------------------------------------

googleFlowRouter.get('/credential/status', async (_req: Request, res: Response) => {
  try {
    const status = await GoogleFlowCredentialService.getPublicCredentialStatus();
    res.json({ success: true, ...status });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

googleFlowRouter.post('/credential/verify', async (req: Request, res: Response) => {
  try {
    const workerUrl = req.body?.workerUrl;
    const result = await GoogleFlowCredentialService.verifyWorkerAuthentication(workerUrl);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

googleFlowRouter.post('/credential/regenerate', async (req: Request, res: Response) => {
  try {
    const result = await GoogleFlowCredentialService.regenerateWorkerCredential(req.body?.metadata);
    res.json({
      success: true,
      message: 'Integration credential regenerated. Reconnect worker to apply new authorization.',
      ...result,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

googleFlowRouter.post('/credential/reconnect', async (req: Request, res: Response) => {
  try {
    const result = await GoogleFlowCredentialService.provisionWorker(req.body?.workerUrl);
    res.json({ success: result.ok, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

googleFlowRouter.post('/credential/config', async (req: Request, res: Response) => {
  try {
    const updated = await GoogleFlowCredentialService.updateMetadata(req.body || {});
    try {
      await forwardToWorker('/config', 'POST', req.body);
    } catch {
      // If worker is currently offline, configuration is safely persisted in DB and applied upon launch
    }
    res.json({ success: true, metadata: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

googleFlowRouter.post('/credential/recover', async (req: Request, res: Response) => {
  try {
    const result = await GoogleFlowCredentialService.regenerateWorkerCredential(req.body?.metadata);
    res.json({
      success: true,
      message: 'Credential successfully recovered and re-encrypted with active master key.',
      ...result,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, code: 'ERR_RECOVERY_FAILED', message: err.message });
  }
});

// ----------------------------------------------------
// 2. Protected Local Provisioning Handshake
// ----------------------------------------------------

googleFlowRouter.post('/worker/handshake', async (req: Request, res: Response) => {
  // Enforce loopback check: handshake cannot be called across external networks
  if (!isLoopback(req)) {
    res.status(403).json({ success: false, code: 'ERR_FORBIDDEN', message: 'Worker handshake restricted to loopback networking.' });
    return;
  }

  const { port, ticket } = req.body || {};
  const parsedPort = Number.parseInt(String(port), 10);
  if (!parsedPort || parsedPort < 1 || parsedPort > 65535 || !ticket) {
    res.status(400).json({ success: false, code: 'ERR_INVALID_HANDSHAKE', message: 'Valid worker port (1-65535) and ticket are required.' });
    return;
  }

  try {
    const workerUrl = `http://127.0.0.1:${parsedPort}`;
    // Persist actual worker URL in PostgreSQL metadata so subsequent requests use the exact port!
    await GoogleFlowCredentialService.updateMetadata({ workerUrl });

    const result = await GoogleFlowCredentialService.provisionWorker(workerUrl, String(ticket).trim());
    if (!result.ok) {
      res.status(400).json({ success: false, code: 'ERR_PROVISION_FAILED', message: result.message });
      return;
    }
    res.json({ success: true, message: result.message, workerUrl });
  } catch (err: any) {
    res.status(500).json({ success: false, code: 'ERR_INTERNAL', message: err.message });
  }
});

// ----------------------------------------------------
// 3. Backend Proxy Endpoints for Google Flow Worker
// ----------------------------------------------------

googleFlowRouter.get('/worker/health', async (_req: Request, res: Response) => {
  try {
    // Read non-sensitive metadata directly without attempting decryption
    const metadata = await GoogleFlowCredentialService.readMetadataOnly();
    const workerBase = (metadata.workerUrl || 'http://127.0.0.1:4177').replace(/\/+$/, '');

    const keyHealth = EncryptionKeyManager.checkKeyHealth();
    const decTest = await GoogleFlowCredentialService.testCredentialDecryption();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const start = performance.now();

    try {
      const workerRes = await fetch(`${workerBase}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      const latencyMs = Math.round(performance.now() - start);

      if (!workerRes.ok) {
        res.json({
          success: true,
          online: false,
          workerReachable: false,
          latencyMs,
          pairingStatus: metadata.pairingStatus,
          credentialConfigured: decTest.recordExists,
          masterKeyAvailable: keyHealth.healthy,
          credentialDecryptable: decTest.decryptedSuccessfully,
          credentialError: decTest.error,
          error: `Worker returned HTTP ${workerRes.status}`,
          code: 'ERR_WORKER_HTTP',
        });
        return;
      }

      const data = await workerRes.json().catch(() => ({}));
      res.json({
        success: true,
        online: true,
        workerReachable: true,
        service: data.service,
        host: data.host,
        port: data.port,
        latencyMs,
        hasConfiguredToken: data.hasConfiguredToken,
        isProvisioned: data.isProvisioned,
        browserChannel: data.browserChannel || metadata.browserChannel,
        profileDir: data.profileDir || metadata.profileDir,
        pairingStatus: metadata.pairingStatus,
        credentialConfigured: decTest.recordExists,
        masterKeyAvailable: keyHealth.healthy,
        credentialDecryptable: decTest.decryptedSuccessfully,
        credentialError: decTest.error,
      });
    } catch (fetchErr: any) {
      clearTimeout(timeout);
      const latencyMs = Math.round(performance.now() - start);
      res.json({
        success: true,
        online: false,
        workerReachable: false,
        latencyMs,
        pairingStatus: metadata.pairingStatus,
        credentialConfigured: decTest.recordExists,
        masterKeyAvailable: keyHealth.healthy,
        credentialDecryptable: decTest.decryptedSuccessfully,
        credentialError: decTest.error,
        error: fetchErr.name === 'AbortError' ? 'Worker connection timed out.' : 'Worker is offline on loopback.',
        code: 'ERR_WORKER_OFFLINE',
      });
    }
  } catch (err: any) {
    res.status(200).json({
      success: false,
      online: false,
      workerReachable: false,
      credentialDecryptable: false,
      error: err.message,
      code: 'ERR_HEALTH_CHECK_FAILED',
    });
  }
});

googleFlowRouter.get('/worker/session', async (_req: Request, res: Response) => {
  try {
    const { status, data } = await forwardToWorker('/session/status', 'GET');
    res.status(status).json(data);
  } catch (err: any) {
    res.status(502).json({ success: false, message: `Worker proxy error: ${err.message}` });
  }
});

googleFlowRouter.get('/worker/inspect', async (_req: Request, res: Response) => {
  try {
    const { status, data } = await forwardToWorker('/diagnostics/inspect', 'GET');
    res.status(status).json(data);
  } catch (err: any) {
    res.status(502).json({ success: false, message: `Worker proxy error: ${err.message}` });
  }
});

googleFlowRouter.get('/inspect', async (_req: Request, res: Response) => {
  try {
    const { status, data } = await forwardToWorker('/diagnostics/inspect', 'GET');
    res.status(status).json(data);
  } catch (err: any) {
    res.status(502).json({ success: false, message: `Worker proxy error: ${err.message}` });
  }
});

googleFlowRouter.post('/worker/session/open', async (req: Request, res: Response) => {
  try {
    const { status, data } = await forwardToWorker('/session/open', 'POST', req.body);
    res.status(status).json(data);
  } catch (err: any) {
    res.status(502).json({ success: false, message: `Worker proxy error: ${err.message}` });
  }
});

googleFlowRouter.post('/worker/session/close', async (req: Request, res: Response) => {
  try {
    const { status, data } = await forwardToWorker('/session/close', 'POST', req.body);
    res.status(status).json(data);
  } catch (err: any) {
    res.status(502).json({ success: false, message: `Worker proxy error: ${err.message}` });
  }
});

googleFlowRouter.post('/worker/session/reset-profile', async (req: Request, res: Response) => {
  try {
    const { status, data } = await forwardToWorker('/session/reset-profile', 'POST', req.body);
    res.status(status).json(data);
  } catch (err: any) {
    res.status(502).json({ success: false, message: `Worker proxy error: ${err.message}` });
  }
});

googleFlowRouter.post('/worker/jobs', async (req: Request, res: Response) => {
  try {
    const { status, data } = await forwardToWorker('/jobs', 'POST', req.body);
    res.status(status).json(data);
  } catch (err: any) {
    res.status(502).json({ success: false, message: `Worker proxy error: ${err.message}` });
  }
});

googleFlowRouter.get('/worker/jobs/:id', async (req: Request, res: Response) => {
  try {
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const jobId = encodeURIComponent(String(rawId));
    const { status, data } = await forwardToWorker(`/jobs/${jobId}`, 'GET');
    res.status(status).json(data);
  } catch (err: any) {
    res.status(502).json({ success: false, message: `Worker proxy error: ${err.message}` });
  }
});

googleFlowRouter.post('/worker/jobs/:id/prepare', async (req: Request, res: Response) => {
  try {
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const jobId = encodeURIComponent(String(rawId));
    const { status, data } = await forwardToWorker(`/jobs/${jobId}/prepare`, 'POST', req.body);
    res.status(status).json(data);
  } catch (err: any) {
    res.status(502).json({ success: false, message: `Worker proxy error: ${err.message}` });
  }
});

googleFlowRouter.post('/worker/jobs/:id/generate', async (req: Request, res: Response) => {
  try {
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const jobId = encodeURIComponent(String(rawId));
    const { status, data } = await forwardToWorker(`/jobs/${jobId}/generate`, 'POST', req.body);
    res.status(status).json(data);
  } catch (err: any) {
    res.status(502).json({ success: false, message: `Worker proxy error: ${err.message}` });
  }
});

googleFlowRouter.post('/worker/jobs/:id/retry-import', async (req: Request, res: Response) => {
  try {
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const jobId = encodeURIComponent(String(rawId));
    const { status, data } = await forwardToWorker(`/jobs/${jobId}/retry-import`, 'POST', req.body);
    res.status(status).json(data);
  } catch (err: any) {
    res.status(502).json({ success: false, message: `Worker proxy error: ${err.message}` });
  }
});

googleFlowRouter.delete('/worker/jobs/:id', async (req: Request, res: Response) => {
  try {
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const jobId = encodeURIComponent(String(rawId));
    const { status, data } = await forwardToWorker(`/jobs/${jobId}`, 'DELETE');
    res.status(status).json(data);
  } catch (err: any) {
    res.status(502).json({ success: false, message: `Worker proxy error: ${err.message}` });
  }
});

// ----------------------------------------------------
// 4. Unified Asset Import
// ----------------------------------------------------

googleFlowRouter.post('/import-asset', async (req: Request, res: Response) => {
  try {
    const result = await GoogleFlowAssetImportService.importAsset(req.body || {});
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message || 'Asset import failed' });
  }
});

// ----------------------------------------------------
// 5. Story Context & Direct Generation Engine
// ----------------------------------------------------

googleFlowRouter.get('/stories/:storyId/context', async (req: Request, res: Response) => {
  try {
    const rawStoryId = Array.isArray(req.params.storyId) ? req.params.storyId[0] : req.params.storyId;
    const storyId = String(rawStoryId);
    const { sceneId, characterId } = req.query;
    const context = await StoryContextService.resolveStoryContext(storyId, {
      sceneId: sceneId ? String(sceneId) : undefined,
      characterId: characterId ? String(characterId) : undefined,
    });
    res.json({ success: true, context });
  } catch (err: any) {
    console.error('[GoogleFlowRouter] Resolve context failed:', err);
    res.status(err.message?.includes('not found') ? 404 : 500).json({
      success: false,
      message: err.message || 'Failed to resolve story context',
    });
  }
});

googleFlowRouter.get('/providers/status', async (_req: Request, res: Response) => {
  try {
    const status = await GenerationOrchestratorService.getProviderStatus();
    res.json({ success: true, providers: status });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

googleFlowRouter.post('/generate/background', async (req: Request, res: Response) => {
  try {
    const { storyId, sceneId, provider, promptOverride, aspectRatio } = req.body;
    if (!storyId || !sceneId) {
      return res.status(400).json({ success: false, message: 'storyId and sceneId are required' });
    }
    const result = await GenerationOrchestratorService.generateSceneBackground({
      storyId,
      sceneId,
      provider: provider || 'gemini_api',
      promptOverride,
      aspectRatio,
    });
    res.json({ success: true, asset: result });
  } catch (err: any) {
    console.error('[GoogleFlowRouter] Background generation failed:', err);
    res.status(500).json({ success: false, message: err.message || 'Background generation failed' });
  }
});

googleFlowRouter.post('/generate/character', async (req: Request, res: Response) => {
  try {
    const { storyId, characterId, provider, assetType, variation, promptOverride } = req.body;
    if (!storyId || !characterId) {
      return res.status(400).json({ success: false, message: 'storyId and characterId are required' });
    }
    const result = await GenerationOrchestratorService.generateCharacterAsset({
      storyId,
      characterId,
      provider: provider || 'gemini_api',
      assetType: assetType || 'master_reference',
      variation,
      promptOverride,
    });
    res.json({ success: true, asset: result });
  } catch (err: any) {
    console.error('[GoogleFlowRouter] Character generation failed:', err);
    res.status(500).json({ success: false, message: err.message || 'Character generation failed' });
  }
});

googleFlowRouter.post('/generate/batch-backgrounds', async (req: Request, res: Response) => {
  try {
    const { storyId, provider } = req.body;
    if (!storyId) {
      return res.status(400).json({ success: false, message: 'storyId is required' });
    }
    const result = await GenerationOrchestratorService.generateAllMissingBackgrounds(
      storyId,
      provider || 'gemini_api'
    );
    res.json({ success: true, result });
  } catch (err: any) {
    console.error('[GoogleFlowRouter] Batch background generation failed:', err);
    res.status(500).json({ success: false, message: err.message || 'Batch background generation failed' });
  }
});

googleFlowRouter.post('/generate/batch-characters', async (req: Request, res: Response) => {
  try {
    const { storyId, provider } = req.body;
    if (!storyId) {
      return res.status(400).json({ success: false, message: 'storyId is required' });
    }
    const result = await GenerationOrchestratorService.generateAllMissingCharacterReferences(
      storyId,
      provider || 'gemini_api'
    );
    res.json({ success: true, result });
  } catch (err: any) {
    console.error('[GoogleFlowRouter] Batch character generation failed:', err);
    res.status(500).json({ success: false, message: err.message || 'Batch character generation failed' });
  }
});

googleFlowRouter.post('/stories/:storyId/characters/:characterId/sync-flow', async (req: Request, res: Response) => {
  try {
    const rawStoryId = Array.isArray(req.params.storyId) ? req.params.storyId[0] : req.params.storyId;
    const rawCharId = Array.isArray(req.params.characterId) ? req.params.characterId[0] : req.params.characterId;
    const storyId = String(rawStoryId);
    const characterId = String(rawCharId);

    const result = await GenerationOrchestratorService.syncCharacterToGoogleFlow(storyId, characterId);
    res.json(result);
  } catch (err: any) {
    console.error('[GoogleFlowRouter] Character sync failed:', err);
    res.status(500).json({ success: false, message: err.message || 'Character sync to Google Flow failed' });
  }
});

googleFlowRouter.get('/stories/:storyId/character-mappings', async (req: Request, res: Response) => {
  try {
    const rawStoryId = Array.isArray(req.params.storyId) ? req.params.storyId[0] : req.params.storyId;
    const storyId = String(rawStoryId);

    const mappings = await GenerationOrchestratorService.getCharacterMappings(storyId);
    res.json({ success: true, mappings });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to list character mappings' });
  }
});

googleFlowRouter.get('/jobs', async (req: Request, res: Response) => {
  try {
    const storyId = req.query.storyId ? String(req.query.storyId) : undefined;
    const jobs = await GenerationOrchestratorService.listJobs(storyId);
    res.json({ success: true, jobs });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to list jobs' });
  }
});

googleFlowRouter.get('/jobs/:id', async (req: Request, res: Response) => {
  try {
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const jobId = String(rawId);
    const job = await GenerationOrchestratorService.getJob(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    res.json({ success: true, job });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to get job' });
  }
});

googleFlowRouter.post('/jobs/cancel-active', async (_req: Request, res: Response) => {
  try {
    const result = await GenerationOrchestratorService.cancelActiveFlowJob();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to cancel active job' });
  }
});

googleFlowRouter.delete('/jobs/:id', async (req: Request, res: Response) => {
  try {
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const jobId = String(rawId);
    const result = await GenerationOrchestratorService.cancelJob(jobId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to cancel job' });
  }
});
