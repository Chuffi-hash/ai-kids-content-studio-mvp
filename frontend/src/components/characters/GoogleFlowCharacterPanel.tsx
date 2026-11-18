import React, { useEffect, useRef, useState } from 'react';
import {
  FlowWorkerJob,
  FlowWorkerSession,
  closeFlowWorkerSession,
  createFlowCharacterJob,
  getFlowCharacterJob,
  getFlowWorkerSession,
  openFlowWorkerSession,
  prepareFlowCharacterJob,
  requestFlowCharacterGeneration,
  retryFlowCharacterAssetRegistration,
} from '../../services/googleFlowWorker.service';
import './GoogleFlowCharacterPanel.css';

interface GoogleFlowCharacterPanelProps {
  characterId: string;
  characterName: string;
  characterDescription?: string;
  species?: string;
  clothing?: string;
  artStyle?: string;
  onImported?: () => void;
}

const VIEW_OPTIONS = [
  { value: 'front', label: 'Front' },
  { value: 'front-left', label: 'Front three-quarter left' },
  { value: 'front-right', label: 'Front three-quarter right' },
  { value: 'left', label: 'Left profile' },
  { value: 'right', label: 'Right profile' },
  { value: 'back-left', label: 'Rear three-quarter left' },
  { value: 'back-right', label: 'Rear three-quarter right' },
  { value: 'back', label: 'Back' },
];

const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'failed']);
const POLLING_STATUSES = new Set([
  'awaiting_download',
  'awaiting_manual_generate',
  'importing',
  'import_metadata_failed',
]);

export default function GoogleFlowCharacterPanel({
  characterId,
  characterName,
  characterDescription = '',
  species = '',
  clothing = '',
  artStyle = '2D cartoon',
  onImported,
}: GoogleFlowCharacterPanelProps) {
  const [workerUrl, setWorkerUrl] = useState('http://127.0.0.1:4177');
  const [workerToken, setWorkerToken] = useState('');
  const [projectUrl, setProjectUrl] = useState('');
  const [view, setView] = useState('front-left');
  const [additionalInstructions, setAdditionalInstructions] = useState('');
  const [isMasterReference, setIsMasterReference] = useState(false);
  const [session, setSession] = useState<FlowWorkerSession | null>(null);
  const [job, setJob] = useState<FlowWorkerJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referenceConfirmed, setReferenceConfirmed] = useState(false);
  const [generationConfirmed, setGenerationConfirmed] = useState(false);
  const importedJobRef = useRef<string | null>(null);

  const jobBelongsToCurrentCharacter = job?.characterId === characterId;
  const activeJob = job && !TERMINAL_STATUSES.has(job.status);
  const canPrepare = Boolean(session?.connected) && !activeJob && !busy;
  const canGenerate = Boolean(
    jobBelongsToCurrentCharacter &&
    job?.status === 'prompt_ready' &&
    referenceConfirmed &&
    generationConfirmed &&
    !busy
  );

  useEffect(() => {
    if (!job?.id || !workerToken.trim() || !POLLING_STATUSES.has(job.status)) {
      return;
    }

    let stopped = false;
    let running = false;

    const poll = async () => {
      if (stopped || running) return;
      running = true;
      try {
        const latest = await getFlowCharacterJob(workerUrl, workerToken, job.id);
        if (!stopped) setJob(latest);
      } catch (pollError: any) {
        if (!stopped) setError(pollError.message || 'Could not refresh the Flow job.');
      } finally {
        running = false;
      }
    };

    const timer = window.setInterval(poll, 2500);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [job?.id, job?.status, workerUrl, workerToken]);

  useEffect(() => {
    if (job?.status === 'completed' && job.id !== importedJobRef.current) {
      importedJobRef.current = job.id;
      onImported?.();
    }
  }, [job?.id, job?.status, onImported]);

  useEffect(() => {
    setReferenceConfirmed(false);
    setGenerationConfirmed(false);
  }, [job?.id, job?.status]);

  const initialCharacterPrompt = [
    `Create one original reusable ${artStyle} animated character for a children's story studio.`,
    `Character name: ${characterName}.`,
    species ? `Species: ${species}.` : '',
    characterDescription ? `Appearance and identity: ${characterDescription}.` : '',
    clothing ? `Clothing and accessories: ${clothing}.` : '',
    'Show a full-body front-facing view, head to feet, with a clear readable silhouette.',
    'Use a simple clean plain background. Keep the character centered and fully inside the frame.',
    'Use consistent colors, proportions, face shape, eyes, clothing and distinctive features.',
    'Create a polished 2D illustration suitable as the canonical reference for a reusable animated character.',
    'Do not include text, labels, watermarks, extra characters, multiple views or a turnaround sheet.'
  ].filter(Boolean).join('\\n\\n');

  async function handleCopyInitialPrompt() {
    setError(null);
    try {
      await navigator.clipboard.writeText(initialCharacterPrompt);
    } catch {
      setError('Clipboard access was blocked. Select and copy the setup prompt from the preview below.');
    }
  }

  async function handleOpenSession() {
    setBusy(true);
    setError(null);
    try {
      const result = await openFlowWorkerSession(workerUrl, workerToken, projectUrl);
      setSession(result);
    } catch (openError: any) {
      setError(openError.message || 'Could not open Google Flow.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRefreshSession() {
    setBusy(true);
    setError(null);
    try {
      setSession(await getFlowWorkerSession(workerUrl, workerToken));
      if (job && workerToken.trim()) {
        setJob(await getFlowCharacterJob(workerUrl, workerToken, job.id));
      }
    } catch (refreshError: any) {
      setError(refreshError.message || 'Could not refresh worker status.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCloseSession() {
    setBusy(true);
    setError(null);
    try {
      setSession(await closeFlowWorkerSession(workerUrl, workerToken));
    } catch (closeError: any) {
      setError(closeError.message || 'Could not close the Flow browser.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePrepare() {
    if (!characterId || !characterName.trim()) {
      setError('Save this character in Character Studio before preparing a Flow job.');
      return;
    }

    setBusy(true);
    setError(null);
    setJob(null);
    try {
      const result = await createFlowCharacterJob(workerUrl, workerToken, {
        characterId,
        characterName,
        view,
        projectUrl: projectUrl.trim() || undefined,
        assetType: view === 'front' && isMasterReference ? 'main' : 'custom',
        isMasterReference: view === 'front' && isMasterReference,
        additionalInstructions,
      });
      setJob(result);
      if (result.status === 'awaiting_manual_login' || result.status === 'awaiting_project_selection') {
        setSession((current) => current ? { ...current, message: result.message, state: result.status } : current);
      }
    } catch (prepareError: any) {
      setError(prepareError.message || 'Could not prepare the Flow prompt.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRetryPrepare() {
    if (!job) return;
    setBusy(true);
    setError(null);
    try {
      setJob(await prepareFlowCharacterJob(workerUrl, workerToken, job.id));
    } catch (prepareError: any) {
      setError(prepareError.message || 'Could not prepare the Flow prompt.');
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerate() {
    if (!job || !referenceConfirmed || !generationConfirmed) return;
    setBusy(true);
    setError(null);
    try {
      setJob(await requestFlowCharacterGeneration(workerUrl, workerToken, job.id));
    } catch (generateError: any) {
      setError(generateError.message || 'Could not request Flow generation.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRefreshJob() {
    if (!job) return;
    setBusy(true);
    setError(null);
    try {
      setJob(await getFlowCharacterJob(workerUrl, workerToken, job.id));
    } catch (refreshError: any) {
      setError(refreshError.message || 'Could not refresh the Flow job.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRetryImport() {
    if (!job) return;
    setBusy(true);
    setError(null);
    try {
      setJob(await retryFlowCharacterAssetRegistration(workerUrl, workerToken, job.id));
    } catch (retryError: any) {
      setError(retryError.message || 'Could not register the downloaded asset.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="google-flow-panel">
      <div className="google-flow-panel-heading">
        <div>
          <h4>Google Flow character views</h4>
          <p>Generate real alternate-view artwork using your saved Flow character.</p>
        </div>
        <span className="google-flow-local-badge">Local browser worker</span>
      </div>

      <div className="google-flow-callout">
        <strong>One-time setup for a new Flow character</strong>
        <ol>
          <li>Start the local <code>flow-worker</code> process and open the Google Flow browser below.</li>
          <li>In Flow, open your project, select <strong>Characters → New Character</strong>, and paste the setup prompt below.</li>
          <li>Generate or upload 1–2 reference images, name the Flow character <strong>{characterName}</strong>, optionally add a voice, then select <strong>Done</strong>.</li>
          <li>For later views, prepare a job below and select the saved <code>@{characterName}</code> character from Flow's mention picker before confirming generation.</li>
        </ol>
        <button type="button" className="btn btn-secondary btn-sm" onClick={handleCopyInitialPrompt}>Copy initial character setup prompt</button>
        <details>
          <summary>Preview initial character prompt</summary>
          <pre>{initialCharacterPrompt}</pre>
        </details>
        <span>Character creation in Flow remains a manual step. The worker does not handle Google login, MFA, CAPTCHA or hidden Flow APIs.</span>
      </div>

      <div className="google-flow-fields">
        <label>
          Local worker URL
          <input
            value={workerUrl}
            onChange={(event) => setWorkerUrl(event.target.value)}
            spellCheck={false}
            placeholder="http://127.0.0.1:4177"
          />
        </label>
        <label>
          Worker token
          <input
            type="password"
            value={workerToken}
            onChange={(event) => setWorkerToken(event.target.value)}
            autoComplete="off"
            placeholder="Paste token printed by the worker terminal"
          />
        </label>
        <label className="google-flow-project-field">
          Google Flow project URL (optional)
          <input
            value={projectUrl}
            onChange={(event) => setProjectUrl(event.target.value)}
            spellCheck={false}
            placeholder="https://labs.google/fx/tools/flow"
          />
        </label>
      </div>

      <div className="google-flow-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={handleOpenSession} disabled={busy || !workerToken.trim()}>
          {busy ? 'Working…' : 'Open Flow browser'}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={handleRefreshSession} disabled={busy || !workerToken.trim()}>
          Refresh session
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={handleCloseSession} disabled={busy || !session?.connected}>
          Close browser
        </button>
      </div>

      {session && (
        <div className="google-flow-status">
          <strong>Browser: {session.state}</strong>
          <span>{session.message}</span>
        </div>
      )}

      <div className="google-flow-job-form">
        <label>
          Artwork view
          <select value={view} onChange={(event) => setView(event.target.value)} disabled={Boolean(activeJob)}>
            {VIEW_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          Additional instructions (optional)
          <input
            value={additionalInstructions}
            onChange={(event) => setAdditionalInstructions(event.target.value)}
            disabled={Boolean(activeJob)}
            placeholder="e.g. Preserve the scarf and show both feet"
          />
        </label>
        {view === 'front' && (
          <label className="google-flow-checkbox">
            <input
              type="checkbox"
              checked={isMasterReference}
              onChange={(event) => setIsMasterReference(event.target.checked)}
              disabled={Boolean(activeJob)}
            />
            Set this imported front view as the character's master reference
          </label>
        )}
        <button type="button" className="btn btn-primary" onClick={handlePrepare} disabled={!canPrepare || !characterId}>
          Prepare {VIEW_OPTIONS.find((option) => option.value === view)?.label} prompt in Flow
        </button>
        {!characterId && <span className="google-flow-hint">Save the character before using Flow import.</span>}
      </div>

      {job && (
        <div className="google-flow-job-card">
          <div className="google-flow-job-title">
            <strong>Job: {job.status.replaceAll('_', ' ')}</strong>
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleRefreshJob} disabled={busy}>Refresh</button>
          </div>
          <p>{job.message}</p>
          {jobBelongsToCurrentCharacter === false && (
            <div className="google-flow-hint">This active job belongs to another character. Finish it before preparing another character view.</div>
          )}
          {job.status === 'awaiting_manual_login' && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleRetryPrepare} disabled={busy}>I have signed in — retry prompt preparation</button>
          )}
          {job.status === 'awaiting_project_selection' && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleRetryPrepare} disabled={busy}>I have opened the project — retry</button>
          )}
          {job.status === 'prompt_editor_not_found' && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleRetryPrepare} disabled={busy}>Retry after checking Flow prompt editor</button>
          )}
          {job.status === 'prompt_ready' && (
            <div className="google-flow-confirmations">
              <label className="google-flow-checkbox">
                <input type="checkbox" checked={referenceConfirmed} onChange={(event) => setReferenceConfirmed(event.target.checked)} />
                I selected the correct saved @character reference in the visible Flow browser.
              </label>
              <label className="google-flow-checkbox">
                <input type="checkbox" checked={generationConfirmed} onChange={(event) => setGenerationConfirmed(event.target.checked)} />
                I approve this generation; it may consume my Google Flow allowance.
              </label>
              <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={!canGenerate}>
                Confirm and generate in Flow
              </button>
            </div>
          )}
          {job.status === 'awaiting_manual_generate' && (
            <div className="google-flow-status">
              The worker could not safely identify the Generate Image button. Click it manually in the visible Flow browser, then use Flow's Download action when the image is ready.
            </div>
          )}
          {job.status === 'awaiting_download' && (
            <div className="google-flow-status">Generation was submitted. Download the resulting image using Flow's normal Download control in the visible browser.</div>
          )}
          {job.status === 'import_metadata_failed' && (
            <div className="google-flow-status google-flow-error">
              The image file is already saved. Retry registering it with this character; do not generate or download it again.
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleRetryImport} disabled={busy}>Retry asset registration</button>
            </div>
          )}
          {job.status === 'completed' && job.asset?.url && (
            <div className="google-flow-imported">
              <img src={job.asset.url} alt={job.view + ' character view'} />
              <div><strong>Imported and saved</strong><span>{job.view} view is now registered in this character's asset library.</span></div>
            </div>
          )}
          {job.error && <div className="google-flow-error">{job.error}</div>}
          {job.prompt && (
            <details>
              <summary>Review prepared prompt</summary>
              <pre>{job.prompt}</pre>
            </details>
          )}
        </div>
      )}

      {error && <div className="google-flow-error" role="alert">{error}</div>}
    </section>
  );
}
