import React, { useState, useEffect } from 'react';
import { useGoogleFlowProject } from '../../hooks/useGoogleFlowProject';
import { SparklesIcon, CheckIcon, AlertTriangleIcon } from './Icons';
import './GoogleFlowProjectModal.css';

interface GoogleFlowProjectModalProps {
  storyId: string;
  isOpen: boolean;
  onClose: () => void;
  storyTitle?: string;
  onConnectionChange?: (connected: boolean, projectId: string | null) => void;
}

export const GoogleFlowProjectModal: React.FC<GoogleFlowProjectModalProps> = ({
  storyId,
  isOpen,
  onClose,
  storyTitle,
  onConnectionChange,
}) => {
  const {
    flowProjectId,
    projectUrl,
    isConnected,
    loading,
    error: hookError,
    connect,
    disconnect,
    openFlowProject,
  } = useGoogleFlowProject(storyId);

  const [inputUrl, setInputUrl] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (projectUrl) {
      setInputUrl(projectUrl);
      setIsEditing(false);
    } else {
      setInputUrl('');
      setIsEditing(true);
    }
  }, [projectUrl, isOpen]);

  if (!isOpen) return null;

  const handleConnect = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLocalError(null);
    setSuccessMessage(null);

    const trimmed = inputUrl.trim();
    if (!trimmed) {
      setLocalError('Please enter a Google Flow project URL or project ID.');
      return;
    }

    try {
      const result = await connect(trimmed);
      setSuccessMessage('Google Flow project connected successfully!');
      setIsEditing(false);
      onConnectionChange?.(true, result.flowProjectId);
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: any) {
      setLocalError(err.message || 'Failed to connect Google Flow project');
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect this Google Flow project from this story?')) {
      return;
    }
    setLocalError(null);
    setSuccessMessage(null);
    try {
      await disconnect();
      setInputUrl('');
      setIsEditing(true);
      setSuccessMessage('Project disconnected.');
      onConnectionChange?.(false, null);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setLocalError(err.message || 'Failed to disconnect Google Flow project');
    }
  };

  const handleOpenFlow = () => {
    const res = openFlowProject();
    if (!res.success) {
      setLocalError('No Google Flow project is connected yet. Please connect one first.');
      setIsEditing(true);
    }
  };

  return (
    <div className="gf-modal-overlay" onClick={onClose}>
      <div className="gf-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="gf-modal-header">
          <div className="gf-modal-title-row">
            <div className="gf-modal-icon-badge">
              <SparklesIcon size={18} color="#8b5cf6" />
            </div>
            <div>
              <h3 className="gf-modal-title">Google Flow Project</h3>
              <p className="gf-modal-subtitle">
                {storyTitle ? `Associate "${storyTitle}" with its Google Flow creative project.` : 'Associate this story with its dedicated Google Flow workspace.'}
              </p>
            </div>
          </div>
          <button type="button" className="gf-modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="gf-modal-body">
          {/* Status Badge */}
          <div className="gf-status-strip">
            <span className="gf-status-label">Status:</span>
            {isConnected ? (
              <span className="gf-badge connected">
                <CheckIcon size={12} />
                <span>Connected</span>
              </span>
            ) : (
              <span className="gf-badge disconnected">
                <span>Not Connected</span>
              </span>
            )}
            {flowProjectId && (
              <span className="gf-project-id-chip" title="Google Flow Project ID">
                ID: {flowProjectId}
              </span>
            )}
          </div>

          {/* Alerts */}
          {(localError || hookError) && (
            <div className="gf-alert error">
              <AlertTriangleIcon size={14} />
              <span>{localError || hookError}</span>
            </div>
          )}

          {successMessage && (
            <div className="gf-alert success">
              <CheckIcon size={14} />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Form / Connected View */}
          {isConnected && !isEditing ? (
            <div className="gf-connected-box">
              <div className="gf-connected-info">
                <div className="gf-info-label">Active Flow Workspace:</div>
                <a
                  href={projectUrl || `https://flow.google.com/project/${flowProjectId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gf-flow-link"
                  title="Open in Google Flow"
                >
                  {projectUrl || `https://flow.google.com/project/${flowProjectId}`}
                  <span className="gf-link-icon">↗</span>
                </a>
              </div>

              <div className="gf-connected-actions">
                <button
                  type="button"
                  className="gf-btn primary"
                  onClick={handleOpenFlow}
                  title="Open this story's Google Flow project in a new tab"
                >
                  <span>Open Google Flow</span>
                  <span>↗</span>
                </button>
                <button
                  type="button"
                  className="gf-btn secondary"
                  onClick={() => setIsEditing(true)}
                  disabled={loading}
                >
                  Update Project
                </button>
                <button
                  type="button"
                  className="gf-btn danger"
                  onClick={handleDisconnect}
                  disabled={loading}
                >
                  Disconnect Project
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleConnect} className="gf-connect-form">
              <div className="gf-form-group">
                <label className="gf-label" htmlFor="gf-url-input">
                  Google Flow Project URL
                </label>
                <div className="gf-input-wrapper">
                  <input
                    id="gf-url-input"
                    type="text"
                    className="gf-input"
                    placeholder="https://flow.google.com/project/1d08d0de-5b98-40fa-b592-632130b536c5"
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    disabled={loading}
                    autoFocus
                  />
                </div>
                <p className="gf-help-text">
                  Paste the full project URL from your browser's address bar when inside Google Flow.
                </p>
              </div>

              <div className="gf-form-actions">
                <button
                  type="submit"
                  className="gf-btn primary"
                  disabled={loading || !inputUrl.trim()}
                >
                  {loading ? 'Validating…' : isConnected ? 'Update Project' : 'Connect Project'}
                </button>
                {isConnected && (
                  <button
                    type="button"
                    className="gf-btn secondary"
                    onClick={() => {
                      setIsEditing(false);
                      setInputUrl(projectUrl || '');
                      setLocalError(null);
                    }}
                    disabled={loading}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          )}

          {/* Informational Guidance */}
          <div className="gf-info-footer">
            <div className="gf-info-item">
              <strong>Workflow Tip:</strong> Generating characters and scene backgrounds in Google Flow? Connect your project here, then use <em>Import from Google Flow</em> to seamlessly bring your assets into this story without manual file sorting.
            </div>
          </div>
        </div>

        <div className="gf-modal-footer">
          <button type="button" className="gf-btn secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default GoogleFlowProjectModal;
