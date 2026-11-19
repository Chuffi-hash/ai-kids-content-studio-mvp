import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  checkFlowWorkerHealth,
  getFlowWorkerSession,
  openFlowWorkerSession,
  closeFlowWorkerSession,
  getFlowCredentialStatus,
  verifyFlowWorkerAuthentication,
  regenerateFlowCredential,
  reconnectFlowWorker,
  updateFlowWorkerConfig,
  FlowWorkerSession,
  FlowWorkerHealthStatus,
  FlowCredentialStatus,
  FlowCredentialMetadata,
} from '../services/googleFlowWorker.service';

const DEFAULT_WORKER_URL = 'http://127.0.0.1:4177';

export interface GoogleFlowConnectionContextType {
  workerUrl: string;
  setWorkerUrl: (url: string) => void;
  browserChannel: string;
  setBrowserChannel: (channel: string) => void;
  selectedProjectUrl: string;
  setSelectedProjectUrl: (url: string) => void;
  lastSelectedStoryId: string;
  setLastSelectedStoryId: (id: string) => void;
  lastSelectedCharacterId: string;
  setLastSelectedCharacterId: (id: string) => void;

  credentialStatus: FlowCredentialStatus | null;
  workerHealth: FlowWorkerHealthStatus | null;
  session: FlowWorkerSession | null;
  setSession: React.Dispatch<React.SetStateAction<FlowWorkerSession | null>>;

  isCheckingHealth: boolean;
  isSessionBusy: boolean;
  error: string | null;
  success: string | null;
  setError: (err: string | null) => void;
  setSuccess: (msg: string | null) => void;
  clearMessages: () => void;

  checkHealth: (targetUrl?: string) => Promise<FlowWorkerHealthStatus>;
  openBrowser: (projectUrl?: string) => Promise<FlowWorkerSession>;
  refreshSession: () => Promise<FlowWorkerSession | null>;
  closeBrowser: () => Promise<FlowWorkerSession | null>;
  verifyAuthentication: () => Promise<{ ok: boolean; authenticated: boolean; error?: string }>;
  regenerateCredential: () => Promise<void>;
  reconnectWorker: () => Promise<{ ok: boolean; message: string }>;
  saveConfig: () => Promise<void>;

  // Backwards-compatible stubs
  workerToken: string;
  setWorkerToken: (t: string) => void;
  rememberConnection: boolean;
  setRememberConnection: (r: boolean) => void;
  saveConnection: () => void;
  clearConnection: () => void;
}

const GoogleFlowConnectionContext = createContext<GoogleFlowConnectionContextType | null>(null);

export const GoogleFlowConnectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [credentialStatus, setCredentialStatus] = useState<FlowCredentialStatus | null>(null);
  const [workerUrl, setWorkerUrlState] = useState<string>(DEFAULT_WORKER_URL);
  const [browserChannel, setBrowserChannelState] = useState<string>('chrome');
  const [selectedProjectUrl, setSelectedProjectUrlState] = useState<string>('');
  const [lastSelectedStoryId, setLastSelectedStoryIdState] = useState<string>('');
  const [lastSelectedCharacterId, setLastSelectedCharacterIdState] = useState<string>('');

  const [workerHealth, setWorkerHealth] = useState<FlowWorkerHealthStatus | null>(null);
  const [session, setSession] = useState<FlowWorkerSession | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState<boolean>(false);
  const [isSessionBusy, setIsSessionBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const clearMessages = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  const setWorkerUrl = useCallback((url: string) => {
    setWorkerUrlState(url);
  }, []);

  const setBrowserChannel = useCallback((channel: string) => {
    setBrowserChannelState(channel);
  }, []);

  const setSelectedProjectUrl = useCallback((url: string) => {
    setSelectedProjectUrlState(url);
  }, []);

  const setLastSelectedStoryId = useCallback((id: string) => {
    setLastSelectedStoryIdState(id);
  }, []);

  const setLastSelectedCharacterId = useCallback((id: string) => {
    setLastSelectedCharacterIdState(id);
  }, []);

  // Durable config sync
  const saveConfig = useCallback(async () => {
    try {
      const updatedMeta = await updateFlowWorkerConfig({
        workerUrl,
        browserChannel,
        selectedProjectUrl,
        lastSelectedStoryId,
        lastSelectedCharacterId,
      });
      setCredentialStatus((prev) => (prev ? { ...prev, metadata: updatedMeta } : prev));
      setSuccess('Configuration saved to database.');
    } catch (err: any) {
      setError(err.message || 'Could not save configuration.');
    }
  }, [workerUrl, browserChannel, selectedProjectUrl, lastSelectedStoryId, lastSelectedCharacterId]);

  const checkHealth = useCallback(async (targetUrl?: string): Promise<FlowWorkerHealthStatus> => {
    setIsCheckingHealth(true);
    try {
      const res = await checkFlowWorkerHealth(targetUrl || workerUrl);
      setWorkerHealth(res);
      return res;
    } finally {
      setIsCheckingHealth(false);
    }
  }, [workerUrl]);

  const refreshSession = useCallback(async (): Promise<FlowWorkerSession | null> => {
    setIsSessionBusy(true);
    try {
      const sess = await getFlowWorkerSession();
      setSession(sess);
      return sess;
    } catch (err: any) {
      setError(err.message || 'Could not query Flow browser session.');
      return null;
    } finally {
      setIsSessionBusy(false);
    }
  }, []);

  const openBrowser = useCallback(async (projectUrl?: string): Promise<FlowWorkerSession> => {
    setIsSessionBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const targetProject = projectUrl !== undefined ? projectUrl : selectedProjectUrl;
      const sess = await openFlowWorkerSession(undefined, undefined, targetProject || undefined);
      setSession(sess);
      setSuccess('Persistent Google Flow browser opened via secure proxy.');
      return sess;
    } catch (err: any) {
      setError(err.message || 'Could not open Google Flow browser session.');
      throw err;
    } finally {
      setIsSessionBusy(false);
    }
  }, [selectedProjectUrl]);

  const closeBrowser = useCallback(async (): Promise<FlowWorkerSession | null> => {
    setIsSessionBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const sess = await closeFlowWorkerSession();
      setSession(sess);
      setSuccess('Google Flow browser closed. Profile data is preserved on disk.');
      return sess;
    } catch (err: any) {
      setError(err.message || 'Could not close browser session.');
      return null;
    } finally {
      setIsSessionBusy(false);
    }
  }, []);

  const verifyAuthentication = useCallback(async () => {
    setIsSessionBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await verifyFlowWorkerAuthentication(workerUrl);
      if (res.authenticated) {
        setSuccess('Worker authentication verified using database credential.');
      } else {
        setError(res.error || 'Worker authentication failed.');
      }
      return res;
    } catch (err: any) {
      const msg = err.message || 'Verification failed.';
      setError(msg);
      return { ok: false, authenticated: false, error: msg };
    } finally {
      setIsSessionBusy(false);
    }
  }, [workerUrl]);

  const regenerateCredential = useCallback(async () => {
    setIsSessionBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await regenerateFlowCredential({ workerUrl, browserChannel });
      setCredentialStatus((prev) =>
        prev
          ? {
              ...prev,
              keyVersion: res.keyVersion,
              lastUpdated: res.updatedAt,
              metadata: res.metadata,
            }
          : null
      );
      setSuccess('New credential generated and encrypted in PostgreSQL. Worker re-provisioned.');
    } catch (err: any) {
      setError(err.message || 'Failed to regenerate credential.');
    } finally {
      setIsSessionBusy(false);
    }
  }, [workerUrl, browserChannel]);

  const reconnectWorker = useCallback(async () => {
    setIsSessionBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await reconnectFlowWorker(workerUrl);
      if (res.ok) {
        setSuccess(res.message || 'Worker provisioned and connected.');
        await refreshSession();
      } else {
        setError(res.message || 'Could not provision worker.');
      }
      return res;
    } catch (err: any) {
      const msg = err.message || 'Reconnection failed.';
      setError(msg);
      return { ok: false, success: false, message: msg };
    } finally {
      setIsSessionBusy(false);
    }
  }, [workerUrl, refreshSession]);

  // Initial load: fetch durable credentials & status from PostgreSQL
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const cred = await getFlowCredentialStatus();
        if (!mounted) return;
        setCredentialStatus(cred);

        if (cred.metadata) {
          if (cred.metadata.workerUrl) setWorkerUrlState(cred.metadata.workerUrl);
          if (cred.metadata.browserChannel) setBrowserChannelState(cred.metadata.browserChannel);
          if (cred.metadata.selectedProjectUrl) setSelectedProjectUrlState(cred.metadata.selectedProjectUrl);
          if (cred.metadata.lastSelectedStoryId) setLastSelectedStoryIdState(cred.metadata.lastSelectedStoryId);
          if (cred.metadata.lastSelectedCharacterId) setLastSelectedCharacterIdState(cred.metadata.lastSelectedCharacterId);
        }

        const health = await checkFlowWorkerHealth(cred.metadata?.workerUrl || DEFAULT_WORKER_URL);
        if (!mounted) return;
        setWorkerHealth(health);

        if (health.online) {
          try {
            const liveSess = await getFlowWorkerSession();
            if (!mounted) return;
            setSession(liveSess);
          } catch {}
        }
      } catch (err: any) {
        if (!mounted) return;
        console.warn('Google Flow initialization notice:', err.message);
      }
    }

    init();

    return () => {
      mounted = false;
      // Never close browser session on unmount or page navigation
    };
  }, []);

  const value: GoogleFlowConnectionContextType = {
    workerUrl,
    setWorkerUrl,
    browserChannel,
    setBrowserChannel,
    selectedProjectUrl,
    setSelectedProjectUrl,
    lastSelectedStoryId,
    setLastSelectedStoryId,
    lastSelectedCharacterId,
    setLastSelectedCharacterId,

    credentialStatus,
    workerHealth,
    session,
    setSession,
    isCheckingHealth,
    isSessionBusy,
    error,
    success,
    setError,
    setSuccess,
    clearMessages,

    checkHealth,
    openBrowser,
    refreshSession,
    closeBrowser,
    verifyAuthentication,
    regenerateCredential,
    reconnectWorker,
    saveConfig,

    // Backwards-compatible stubs (token is now in PostgreSQL, not localStorage)
    workerToken: '',
    setWorkerToken: () => {},
    rememberConnection: true,
    setRememberConnection: () => {},
    saveConnection: () => {
      saveConfig();
    },
    clearConnection: () => {
      setWorkerUrlState(DEFAULT_WORKER_URL);
      setSelectedProjectUrlState('');
    },
  };

  return (
    <GoogleFlowConnectionContext.Provider value={value}>
      {children}
    </GoogleFlowConnectionContext.Provider>
  );
};

export function useGoogleFlowConnection(): GoogleFlowConnectionContextType {
  const context = useContext(GoogleFlowConnectionContext);
  if (!context) {
    throw new Error('useGoogleFlowConnection must be used within a GoogleFlowConnectionProvider');
  }
  return context;
}
