import { Router, Request, Response } from 'express';
import { GoogleFlowCredentialService } from '../services/google-flow/google-flow-credential.service.js';

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
  const { token, metadata } = await GoogleFlowCredentialService.getOrCreateWorkerCredential();
  const workerBase = (metadata.workerUrl || 'http://127.0.0.1:4177').replace(/\/+$/, '');

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${workerBase}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
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
    res.json({ success: true, metadata: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// 2. Protected Local Provisioning Handshake
// ----------------------------------------------------

googleFlowRouter.post('/worker/handshake', async (req: Request, res: Response) => {
  // Enforce loopback check: handshake cannot be called across external networks
  if (!isLoopback(req)) {
    res.status(403).json({ success: false, message: 'Worker handshake restricted to loopback networking.' });
    return;
  }

  const { port, ticket } = req.body || {};
  if (!port || !ticket) {
    res.status(400).json({ success: false, message: 'Worker port and ticket are required.' });
    return;
  }

  try {
    const workerUrl = `http://127.0.0.1:${port}`;
    const result = await GoogleFlowCredentialService.provisionWorker(workerUrl, ticket);
    if (!result.ok) {
      res.status(400).json({ success: false, message: result.message });
      return;
    }
    res.json({ success: true, message: result.message });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// 3. Backend Proxy Endpoints for Google Flow Worker
// ----------------------------------------------------

googleFlowRouter.get('/worker/health', async (_req: Request, res: Response) => {
  try {
    const { metadata } = await GoogleFlowCredentialService.getOrCreateWorkerCredential();
    const workerBase = (metadata.workerUrl || 'http://127.0.0.1:4177').replace(/\/+$/, '');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const start = performance.now();

    try {
      const workerRes = await fetch(`${workerBase}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      const latencyMs = Math.round(performance.now() - start);

      if (!workerRes.ok) {
        res.json({
          success: false,
          online: false,
          latencyMs,
          pairingStatus: metadata.pairingStatus,
          error: `Worker returned HTTP ${workerRes.status}`,
        });
        return;
      }

      const data = await workerRes.json().catch(() => ({}));
      res.json({
        success: true,
        online: true,
        service: data.service,
        host: data.host,
        port: data.port,
        latencyMs,
        hasConfiguredToken: data.hasConfiguredToken,
        isProvisioned: data.isProvisioned,
        browserChannel: data.browserChannel || metadata.browserChannel,
        profileDir: data.profileDir || metadata.profileDir,
        pairingStatus: metadata.pairingStatus,
      });
    } catch (fetchErr: any) {
      clearTimeout(timeout);
      const latencyMs = Math.round(performance.now() - start);
      res.json({
        success: false,
        online: false,
        latencyMs,
        pairingStatus: metadata.pairingStatus,
        error: fetchErr.name === 'AbortError' ? 'Worker connection timed out.' : 'Worker is offline on loopback.',
      });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, online: false, error: err.message });
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
