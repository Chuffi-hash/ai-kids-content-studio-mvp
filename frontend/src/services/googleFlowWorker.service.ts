import { getApiUrl } from '../utils/urlHelper';

export type FlowAuthenticationStatus = 'authenticated' | 'login_required' | 'blocked' | 'unknown';

export interface FlowProfileDiagnostics {
  browserChannel: string;
  configuredProfileDir: string;
  profileDirExists: boolean;
  ownsActiveBrowser: boolean;
  googleSigninRequired: boolean;
  googleSigninBlocked: boolean;
  authenticationStatus: FlowAuthenticationStatus;
}

export interface FlowWorkerSession {
  connected: boolean;
  workerOnline?: boolean;
  browserRunning: boolean;
  flowPageOpen: boolean;
  googleAuthenticated: boolean;
  manualLoginRequired: boolean;
  googleSigninBlocked: boolean;
  projectSelected: boolean;
  authenticationStatus: FlowAuthenticationStatus;
  canPrepareJob?: boolean;
  canGenerateJob?: boolean;
  state: string;
  currentUrl?: string;
  title?: string;
  message?: string;
  browserChannel?: string;
  configuredProfileDir?: string;
  profileDirExists?: boolean;
  ownsActiveBrowser?: boolean;
  diagnostics?: FlowProfileDiagnostics;
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

export interface FlowCredentialMetadata {
  workerUrl: string;
  browserChannel: string;
  profileDir?: string;
  selectedProjectUrl?: string;
  lastSelectedStoryId?: string;
  lastSelectedCharacterId?: string;
  pairingStatus: 'paired' | 'awaiting_provisioning' | 'unpaired';
  lastVerifiedAt?: string;
}

export interface FlowCredentialStatus {
  configured: boolean;
  masterKeyAvailable?: boolean;
  decryptedSuccessfully?: boolean;
  decryptionError?: string;
  lastUpdated: string | null;
  keyVersion: string;
  metadata: FlowCredentialMetadata;
}

export interface FlowWorkerHealthStatus {
  online: boolean;
  workerReachable?: boolean;
  service?: string;
  host?: string;
  port?: number;
  hasConfiguredToken?: boolean;
  isProvisioned?: boolean;
  browserChannel?: string;
  profileDir?: string;
  latencyMs?: number;
  pairingStatus?: string;
  credentialConfigured?: boolean;
  masterKeyAvailable?: boolean;
  credentialDecryptable?: boolean;
  credentialError?: string;
  error?: string;
  code?: string;
}

async function flowRequest<T>(
  proxyEndpoint: string,
  directWorkerEndpoint: string,
  workerUrl?: string,
  token?: string,
  init: RequestInit = {}
): Promise<T> {
  const apiUrl = getApiUrl();
  const useDirect = Boolean(token && token.trim() && workerUrl && workerUrl.includes(':4177'));

  let url: string;
  let headers: HeadersInit = {
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...init.headers,
  };

  if (useDirect) {
    const base = workerUrl!.trim().replace(/\/+$/, '');
    url = `${base}${directWorkerEndpoint}`;
    headers = {
      ...headers,
      Authorization: `Bearer ${token!.trim()}`,
    };
  } else {
    url = `${apiUrl}/api/integrations/google-flow${proxyEndpoint}`;
  }

  let response: Response;
  try {
    response = await fetch(url, { ...init, headers });
  } catch (err: any) {
    throw new Error(
      useDirect
        ? 'Cannot reach the local Flow worker. Verify the process is running on loopback.'
        : `Cannot reach studio backend: ${err.message}`
    );
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const errorMsg = payload.error || payload.message || `Flow worker request failed (HTTP ${response.status}).`;
    const err = new Error(errorMsg);
    (err as any).code = payload.code;
    throw err;
  }
  return payload as T;
}

export async function openFlowWorkerSession(
  workerUrl?: string,
  token?: string,
  projectUrl?: string,
): Promise<FlowWorkerSession> {
  const payload = await flowRequest<{ session: FlowWorkerSession }>(
    '/worker/session/open',
    '/session/open',
    workerUrl,
    token,
    {
      method: 'POST',
      body: JSON.stringify(projectUrl?.trim() ? { projectUrl: projectUrl.trim() } : {}),
    },
  );
  return payload.session;
}

export async function getFlowWorkerSession(
  workerUrl?: string,
  token?: string,
): Promise<FlowWorkerSession> {
  const payload = await flowRequest<{ session: FlowWorkerSession }>(
    '/worker/session',
    '/session/status',
    workerUrl,
    token,
  );
  return payload.session;
}

export async function closeFlowWorkerSession(workerUrl?: string, token?: string) {
  const payload = await flowRequest<{ session: FlowWorkerSession }>(
    '/worker/session/close',
    '/session/close',
    workerUrl,
    token,
    { method: 'POST', body: JSON.stringify({}) },
  );
  return payload.session;
}

export async function createFlowCharacterJob(
  workerUrl: string | undefined,
  token: string | undefined,
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
  const payload = await flowRequest<{ job: FlowWorkerJob }>(
    '/worker/jobs',
    '/jobs',
    workerUrl,
    token,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return payload.job;
}

export async function prepareFlowCharacterJob(
  workerUrl: string | undefined,
  token: string | undefined,
  jobId: string,
): Promise<FlowWorkerJob> {
  const encoded = encodeURIComponent(jobId);
  const payload = await flowRequest<{ job: FlowWorkerJob }>(
    `/worker/jobs/${encoded}/prepare`,
    `/jobs/${encoded}/prepare`,
    workerUrl,
    token,
    { method: 'POST', body: JSON.stringify({}) },
  );
  return payload.job;
}

export async function requestFlowCharacterGeneration(
  workerUrl: string | undefined,
  token: string | undefined,
  jobId: string,
): Promise<FlowWorkerJob> {
  const encoded = encodeURIComponent(jobId);
  const payload = await flowRequest<{ job: FlowWorkerJob }>(
    `/worker/jobs/${encoded}/generate`,
    `/jobs/${encoded}/generate`,
    workerUrl,
    token,
    {
      method: 'POST',
      body: JSON.stringify({ confirmGenerate: true, referenceConfirmed: true }),
    },
  );
  return payload.job;
}

export async function getFlowCharacterJob(
  workerUrl: string | undefined,
  token: string | undefined,
  jobId: string,
): Promise<FlowWorkerJob> {
  const encoded = encodeURIComponent(jobId);
  const payload = await flowRequest<{ job: FlowWorkerJob }>(
    `/worker/jobs/${encoded}`,
    `/jobs/${encoded}`,
    workerUrl,
    token,
  );
  return payload.job;
}

export async function retryFlowCharacterAssetRegistration(
  workerUrl: string | undefined,
  token: string | undefined,
  jobId: string,
): Promise<FlowWorkerJob> {
  const encoded = encodeURIComponent(jobId);
  const payload = await flowRequest<{ job: FlowWorkerJob }>(
    `/worker/jobs/${encoded}/retry-import`,
    `/jobs/${encoded}/retry-import`,
    workerUrl,
    token,
    { method: 'POST', body: JSON.stringify({}) },
  );
  return payload.job;
}

export async function checkFlowWorkerHealth(workerUrl?: string): Promise<FlowWorkerHealthStatus> {
  const apiUrl = getApiUrl();
  const start = performance.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(`${apiUrl}/api/integrations/google-flow/worker/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const latencyMs = Math.round(performance.now() - start);

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        online: false,
        workerReachable: false,
        latencyMs,
        credentialConfigured: data.credentialConfigured,
        masterKeyAvailable: data.masterKeyAvailable,
        credentialDecryptable: data.credentialDecryptable,
        credentialError: data.credentialError,
        error: data.error || data.message || `Worker proxy returned HTTP ${response.status}`,
        code: data.code || 'ERR_PROXY_HTTP',
      };
    }

    return {
      online: Boolean(data.online),
      workerReachable: Boolean(data.workerReachable ?? data.online),
      service: data.service,
      host: data.host,
      port: data.port,
      hasConfiguredToken: data.hasConfiguredToken,
      isProvisioned: data.isProvisioned,
      browserChannel: data.browserChannel,
      profileDir: data.profileDir,
      pairingStatus: data.pairingStatus,
      latencyMs: data.latencyMs || latencyMs,
      credentialConfigured: data.credentialConfigured,
      masterKeyAvailable: data.masterKeyAvailable,
      credentialDecryptable: data.credentialDecryptable,
      credentialError: data.credentialError,
      error: data.error,
      code: data.code,
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      online: false,
      workerReachable: false,
      latencyMs,
      error: err.name === 'AbortError' ? 'Worker health check timed out.' : 'Backend API is unreachable.',
      code: err.name === 'AbortError' ? 'ERR_TIMEOUT' : 'ERR_BACKEND_UNREACHABLE',
    };
  }
}

export async function getFlowWorkerHealth(workerUrl?: string): Promise<boolean> {
  const status = await checkFlowWorkerHealth(workerUrl);
  return status.online;
}

// ----------------------------------------------------
// Credential Management Service Calls
// ----------------------------------------------------

export async function getFlowCredentialStatus(): Promise<FlowCredentialStatus> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/integrations/google-flow/credential/status`);
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || data.error || 'Could not fetch credential status.');
  }
  return data;
}

export async function verifyFlowWorkerAuthentication(workerUrl?: string): Promise<{
  ok: boolean;
  workerOnline: boolean;
  authenticated: boolean;
  pairingStatus: string;
  error?: string;
}> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/integrations/google-flow/credential/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workerUrl }),
  });
  return res.json();
}

export async function recoverFlowCredential(metadataUpdates?: Partial<FlowCredentialMetadata>): Promise<{
  success: boolean;
  message: string;
  keyVersion?: string;
  metadata?: FlowCredentialMetadata;
  provisioned?: boolean;
}> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/integrations/google-flow/credential/recover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metadata: metadataUpdates }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || data.error || 'Credential recovery failed.');
  }
  return data;
}

export async function regenerateFlowCredential(metadataUpdates?: Partial<FlowCredentialMetadata>): Promise<{
  success: boolean;
  message: string;
  keyVersion: string;
  updatedAt: string;
  metadata: FlowCredentialMetadata;
}> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/integrations/google-flow/credential/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metadata: metadataUpdates }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Could not regenerate credential.');
  }
  return data;
}

export async function reconnectFlowWorker(workerUrl?: string): Promise<{
  success: boolean;
  ok: boolean;
  message: string;
}> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/integrations/google-flow/credential/reconnect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workerUrl }),
  });
  return res.json();
}

export async function updateFlowWorkerConfig(config: Partial<FlowCredentialMetadata>): Promise<FlowCredentialMetadata> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/integrations/google-flow/credential/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Could not update configuration.');
  }
  return data.metadata;
}

export async function resetFlowBrowserProfile(): Promise<{ success: boolean; message: string }> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/integrations/google-flow/worker/session/reset-profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Could not reset Google Flow profile.');
  }
  return data;
}

export interface FlowImportAssetPayload {
  target: 'scene_background' | 'background_library' | 'character_view' | 'character_reference';
  imageData: string;
  filename?: string;
  sceneId?: string;
  characterId?: string;
  view?: string;
  isMasterReference?: boolean;
  fit?: 'cover' | 'contain';
  prompt?: string;
  aspectRatio?: string;
  name?: string;
  environmentType?: string;
  notes?: string;
}

export async function importFlowAsset(payload: FlowImportAssetPayload): Promise<any> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/integrations/google-flow/import-asset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Asset import failed.');
  }
  return data;
}
