import { getApiUrl } from '../utils/urlHelper';

export interface FlowWorkerSession {
  connected: boolean;
  state: string;
  currentUrl?: string;
  title?: string;
  manualLoginRequired?: boolean;
  message?: string;
}

export interface FlowWorkerJob {
  id: string;
  characterId: string;
  characterName: string;
  view: string;
  assetType: string;
  status: string;
  message: string;
  error?: string;
  prompt?: string;
  downloadPath?: string;
  asset?: { id?: string; url?: string; direction?: string };
  createdAt: string;
  updatedAt: string;
}

async function workerRequest<T>(
  workerUrl: string,
  token: string,
  endpoint: string,
  init: RequestInit = {},
): Promise<T> {
  const base = workerUrl.trim().replace(/\/+$/, '');
  if (!base) throw new Error('Local Flow worker URL is required.');
  if (!token.trim()) throw new Error('Enter the local Flow worker token shown in its terminal.');

  let response: Response;
  try {
    response = await fetch(`${base}${endpoint}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new Error('Cannot reach the local Flow worker. Start flow-worker on this computer and check the URL and allowed browser origin.');
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || `Flow worker request failed (HTTP ${response.status}).`);
  }
  return payload as T;
}

export async function openFlowWorkerSession(
  workerUrl: string,
  token: string,
  projectUrl?: string,
): Promise<FlowWorkerSession> {
  const payload = await workerRequest<{ session: FlowWorkerSession }>(
    workerUrl,
    token,
    '/session/open',
    {
      method: 'POST',
      body: JSON.stringify(projectUrl?.trim() ? { projectUrl: projectUrl.trim() } : {}),
    },
  );
  return payload.session;
}

export async function getFlowWorkerSession(
  workerUrl: string,
  token: string,
): Promise<FlowWorkerSession> {
  const payload = await workerRequest<{ session: FlowWorkerSession }>(
    workerUrl,
    token,
    '/session/status',
  );
  return payload.session;
}

export async function closeFlowWorkerSession(workerUrl: string, token: string) {
  const payload = await workerRequest<{ session: FlowWorkerSession }>(
    workerUrl,
    token,
    '/session/close',
    { method: 'POST', body: JSON.stringify({}) },
  );
  return payload.session;
}

export async function createFlowCharacterJob(
  workerUrl: string,
  token: string,
  input: {
    characterId: string;
    characterName: string;
    view: string;
    projectUrl?: string;
    assetType: 'main' | 'custom';
    isMasterReference: boolean;
    additionalInstructions?: string;
  },
): Promise<FlowWorkerJob> {
  const payload = await workerRequest<{ job: FlowWorkerJob }>(
    workerUrl,
    token,
    '/jobs',
    { method: 'POST', body: JSON.stringify(input) },
  );
  return payload.job;
}

export async function prepareFlowCharacterJob(
  workerUrl: string,
  token: string,
  jobId: string,
): Promise<FlowWorkerJob> {
  const payload = await workerRequest<{ job: FlowWorkerJob }>(
    workerUrl,
    token,
    `/jobs/${encodeURIComponent(jobId)}/prepare`,
    { method: 'POST', body: JSON.stringify({}) },
  );
  return payload.job;
}

export async function requestFlowCharacterGeneration(
  workerUrl: string,
  token: string,
  jobId: string,
): Promise<FlowWorkerJob> {
  const payload = await workerRequest<{ job: FlowWorkerJob }>(
    workerUrl,
    token,
    `/jobs/${encodeURIComponent(jobId)}/generate`,
    {
      method: 'POST',
      body: JSON.stringify({ confirmGenerate: true, referenceConfirmed: true }),
    },
  );
  return payload.job;
}

export async function getFlowCharacterJob(
  workerUrl: string,
  token: string,
  jobId: string,
): Promise<FlowWorkerJob> {
  const payload = await workerRequest<{ job: FlowWorkerJob }>(
    workerUrl,
    token,
    `/jobs/${encodeURIComponent(jobId)}`,
  );
  return payload.job;
}

export async function getFlowWorkerHealth(workerUrl: string): Promise<boolean> {
  const base = workerUrl.trim().replace(/\/+$/, '');
  const response = await fetch(`${base}/health`);
  return response.ok;
}
