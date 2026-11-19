import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  SparklesIcon,
  LayersIcon,
  CopyIcon,
  CheckIcon,
  UploadIcon,
  ImageIcon,
  ArrowRightIcon,
  AlertTriangleIcon,
  BookOpenIcon,
  UsersIcon,
  SettingsIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "../components/common/Icons";
import {
  checkFlowWorkerHealth,
  getFlowWorkerSession,
  openFlowWorkerSession,
  closeFlowWorkerSession,
  FlowWorkerSession,
  FlowWorkerHealthStatus,
} from "../services/googleFlowWorker.service";
import {
  getAllStories,
  getStoryFlowProject,
  connectStoryFlowProject,
  disconnectStoryFlowProject,
  Story,
  FlowProjectDetails,
} from "../services/story.service";
import {
  fetchEditorStory,
  generateSceneBackgroundPrompt,
  saveScenePrompt,
  getScenePromptHistory,
  uploadSceneBackground,
  PromptHistoryEntry,
} from "../services/editor.service";
import { getAllCharacters, Character } from "../services/character.service";
import { EditorStory, EditorScene } from "../types/editor";
import { useGoogleFlowConnection } from "../context/GoogleFlowConnectionContext";
import { CollapsibleSection } from "../components/editor/CollapsibleSection";
import GoogleFlowCharacterPanel from "../components/characters/GoogleFlowCharacterPanel";
import "./GoogleFlowPage.css";

type ActiveTab = "setup" | "connection" | "project" | "background" | "character";

const ASPECT_RATIOS = [
  { value: "16:9", label: "16:9 (Landscape - YouTube/TV)" },
  { value: "9:16", label: "9:16 (Portrait - Shorts/Reels)" },
  { value: "1:1", label: "1:1 (Square - Feed/Instagram)" },
  { value: "4:5", label: "4:5 (Social - Portrait)" },
];

const CAMERA_PERSPECTIVES = [
  "Eye-level wide shot",
  "Medium shot",
  "Close-up",
  "High angle / Bird's eye view",
  "Bird's-eye view",
  "Low-angle shot",
  "Wide establishing shot",
];

export default function GoogleFlowPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Query parameters for context propagation
  const queryStoryId = searchParams.get("storyId");
  const querySceneId = searchParams.get("sceneId");
  const queryCharacterId = searchParams.get("characterId");
  const queryTab = searchParams.get("tab") as ActiveTab | null;

  // Active Tab state
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    if (
      queryTab &&
      ["connection", "project", "background", "character"].includes(queryTab)
    ) {
      return queryTab;
    }
    if (querySceneId) return "background";
    if (queryCharacterId) return "character";
    if (queryStoryId) return "project";
    return "connection";
  });

  // ----------------------------------------------------
  // Section A: Connection & Diagnostics State (App-Wide Context)
  // ----------------------------------------------------
  const {
    workerUrl,
    setWorkerUrl,
    browserChannel,
    setBrowserChannel,
    selectedProjectUrl: standaloneProjectUrl,
    setSelectedProjectUrl: setStandaloneProjectUrl,
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
    error: connectionError,
    success: connectionSuccess,
    setError: setConnectionError,
    setSuccess: setConnectionSuccess,
    checkHealth,
    openBrowser,
    refreshSession,
    closeBrowser,
    verifyAuthentication,
    regenerateCredential,
    recoverCredential,
    reconnectWorker,
    resetProfile,
    importAsset,
    saveConfig,
  } = useGoogleFlowConnection();

  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isVerifyingWizard, setIsVerifyingWizard] = useState(false);
  const [copiedCmdToast, setCopiedCmdToast] = useState(false);

  // ----------------------------------------------------
  // Section B: Project Management State
  // ----------------------------------------------------
  const [stories, setStories] = useState<Story[]>([]);
  const [selectedStoryId, setSelectedStoryIdState] = useState<string>(
    queryStoryId || lastSelectedStoryId || "",
  );
  const setSelectedStoryId = (id: string) => {
    setSelectedStoryIdState(id);
    setLastSelectedStoryId(id);
  };

  const [editorStory, setEditorStory] = useState<EditorStory | null>(null);
  const [flowProjectDetails, setFlowProjectDetails] =
    useState<FlowProjectDetails | null>(null);
  const [projectInputUrl, setProjectInputUrl] = useState("");
  const [isProjectBusy, setIsProjectBusy] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [projectSuccess, setProjectSuccess] = useState<string | null>(null);

  // ----------------------------------------------------
  // Section C: Background Generation Workflow State
  // ----------------------------------------------------
  const [selectedSceneId, setSelectedSceneId] = useState<string>(
    querySceneId || "",
  );
  const [bgCamera, setBgCamera] = useState("Eye-level wide shot");
  const [bgAspectRatio, setBgAspectRatio] = useState("16:9");
  const [bgPrompt, setBgPrompt] = useState("");
  const [isGeneratingBgPrompt, setIsGeneratingBgPrompt] = useState(false);
  const [copiedBgToast, setCopiedBgToast] = useState(false);
  const [isSavingBgPrompt, setIsSavingBgPrompt] = useState(false);
  const [bgPromptHistory, setBgPromptHistory] = useState<PromptHistoryEntry[]>(
    [],
  );
  const [showBgHistory, setShowBgHistory] = useState(false);
  const [isUploadingBg, setIsUploadingBg] = useState(false);
  const [bgUploadError, setBgUploadError] = useState<string | null>(null);
  const [bgUploadSuccess, setBgUploadSuccess] = useState<string | null>(null);
  const [uploadedBgPreview, setUploadedBgPreview] = useState<string | null>(
    null,
  );
  const bgFileInputRef = useRef<HTMLInputElement | null>(null);

  // ----------------------------------------------------
  // Section D: Character Generation Workflow State
  // ----------------------------------------------------
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacterId, setSelectedCharacterIdState] = useState<string>(
    queryCharacterId || lastSelectedCharacterId || "",
  );
  const setSelectedCharacterId = (id: string) => {
    setSelectedCharacterIdState(id);
    setLastSelectedCharacterId(id);
  };

  // ----------------------------------------------------
  // Unified Flow Project Resolution
  // ----------------------------------------------------
  const effectiveProjectUrl = flowProjectDetails?.projectUrl
    ? flowProjectDetails.projectUrl
    : standaloneProjectUrl.trim();

  // ----------------------------------------------------
  // Initial Data Fetching
  // ----------------------------------------------------
  useEffect(() => {
    // Check worker health immediately on mount
    handleCheckHealth();

    // Fetch stories
    getAllStories()
      .then((data) => {
        setStories(data || []);
        if (!selectedStoryId && data && data.length > 0 && !queryStoryId) {
          setSelectedStoryId(data[0].storyId);
        }
      })
      .catch((err) =>
        console.warn("Could not fetch stories for Flow integration", err),
      );

    // Fetch characters
    getAllCharacters()
      .then((data) => {
        setCharacters(data || []);
        if (
          !selectedCharacterId &&
          data &&
          data.length > 0 &&
          !queryCharacterId
        ) {
          setSelectedCharacterId(data[0].id);
        }
      })
      .catch((err) =>
        console.warn("Could not fetch characters for Flow integration", err),
      );
  }, []);

  // Update selected story when query param changes
  useEffect(() => {
    if (queryStoryId && queryStoryId !== selectedStoryId) {
      setSelectedStoryId(queryStoryId);
    }
  }, [queryStoryId]);

  // Update selected scene when query param changes
  useEffect(() => {
    if (querySceneId && querySceneId !== selectedSceneId) {
      setSelectedSceneId(querySceneId);
      setActiveTab("background");
    }
  }, [querySceneId]);

  // Update selected character when query param changes
  useEffect(() => {
    if (queryCharacterId && queryCharacterId !== selectedCharacterId) {
      setSelectedCharacterId(queryCharacterId);
      setActiveTab("character");
    }
  }, [queryCharacterId]);

  // ----------------------------------------------------
  // Story details & Flow Project Synchronization
  // ----------------------------------------------------
  const loadStoryContext = useCallback(
    async (storyId: string) => {
      if (!storyId) {
        setEditorStory(null);
        setFlowProjectDetails(null);
        return;
      }

      try {
        // 1. Fetch story details with scenes
        const storyData = await fetchEditorStory(storyId);
        setEditorStory(storyData);

        // Select first scene if none selected or not in current story
        if (storyData.scenes && storyData.scenes.length > 0) {
          const hasCurrent = storyData.scenes.some(
            (s) => s.sceneId === selectedSceneId,
          );
          if (!hasCurrent) {
            setSelectedSceneId(storyData.scenes[0].sceneId);
          }
        }

        // 2. Fetch story Flow project association
        const projData = await getStoryFlowProject(storyId);
        setFlowProjectDetails(projData);
        if (projData.projectUrl) {
          setProjectInputUrl(projData.projectUrl);
        }
      } catch (err: any) {
        console.warn("Could not load story context:", err);
      }
    },
    [selectedSceneId],
  );

  useEffect(() => {
    if (selectedStoryId) {
      loadStoryContext(selectedStoryId);
    } else {
      setEditorStory(null);
      setFlowProjectDetails(null);
    }
  }, [selectedStoryId, loadStoryContext]);

  // Scene selection change handler: update background prompt state
  const selectedScene: EditorScene | null =
    editorStory?.scenes?.find((s) => s.sceneId === selectedSceneId) || null;

  useEffect(() => {
    if (selectedScene) {
      if (selectedScene.visualPrompt) {
        setBgPrompt(selectedScene.visualPrompt);
      }
      if (selectedScene.cameraDirection) {
        setBgCamera(selectedScene.cameraDirection);
      }
      if (selectedScene.imageUrl) {
        setUploadedBgPreview(selectedScene.imageUrl);
      }

      // Fetch prompt history
      getScenePromptHistory(selectedScene.sceneId)
        .then((hist) => setBgPromptHistory(hist || []))
        .catch(() => setBgPromptHistory([]));
    }
  }, [selectedScene?.sceneId]);

  // ----------------------------------------------------
  // Section A Actions: Worker Connection & Diagnostics
  // ----------------------------------------------------
  const handleCheckHealth = async () => {
    try {
      const status = await checkHealth();
      if (status.online) {
        setConnectionSuccess(
          `Worker online via backend proxy (${status.latencyMs}ms)`,
        );
        await refreshSession();
      } else {
        setConnectionError(status.error || "Flow worker unreachable.");
      }
    } catch (err: any) {
      setConnectionError(err.message || "Worker health check failed.");
    }
  };

  const handleOpenBrowser = async () => {
    try {
      await openBrowser(effectiveProjectUrl || undefined);
    } catch {
      // Error handled by context
    }
  };

  const handleRefreshSession = async () => {
    const sess = await refreshSession();
    if (sess) {
      setConnectionSuccess("Browser session status updated.");
    }
  };

  const handleCloseBrowser = async () => {
    await closeBrowser();
  };

  const handleVerifyAuth = async () => {
    await verifyAuthentication();
  };

  const handleReconnectWorker = async () => {
    await reconnectWorker();
  };

  const handleRecoverCredential = async () => {
    try {
      await recoverCredential();
      setConnectionSuccess("Credential safely recovered and re-encrypted with active master key.");
    } catch (err: any) {
      setConnectionError(err.message || "Failed to recover credential.");
    }
  };

  const handleResetProfile = async () => {
    setShowResetConfirm(false);
    try {
      await resetProfile();
      setConnectionSuccess("Dedicated Google Flow browser profile reset. Sign in again via Open Browser.");
    } catch (err: any) {
      setConnectionError(err.message || "Failed to reset profile.");
    }
  };

  const handleRunWizardVerification = async () => {
    setIsVerifyingWizard(true);
    setConnectionError(null);
    setConnectionSuccess(null);
    try {
      const health = await checkHealth();
      if (health.online) {
        await verifyAuthentication();
        await refreshSession();
        setConnectionSuccess("Verification checks complete. Worker and browser session are responsive.");
      } else {
        setConnectionError("Worker is offline on loopback (http://127.0.0.1:4177). Please start the worker.");
      }
    } catch (err: any) {
      setConnectionError(err.message || "Verification check failed.");
    } finally {
      setIsVerifyingWizard(false);
    }
  };

  const handleCopyStartupCommand = async () => {
    try {
      await navigator.clipboard.writeText("cd flow-worker\nnpm install\nnpm start");
      setCopiedCmdToast(true);
      setTimeout(() => setCopiedCmdToast(false), 2500);
    } catch {}
  };

  const handleConfirmRegenerate = async () => {
    setShowRegenConfirm(false);
    await regenerateCredential();
  };

  const handleSaveConfig = async () => {
    await saveConfig();
  };

  // ----------------------------------------------------
  // Section B Actions: Project Management
  // ----------------------------------------------------
  const handleConnectProject = async () => {
    if (!selectedStoryId) {
      setProjectError("Select a story before connecting a project.");
      return;
    }
    if (!projectInputUrl.trim()) {
      setProjectError("Please enter a Google Flow project URL or ID.");
      return;
    }

    setIsProjectBusy(true);
    setProjectError(null);
    setProjectSuccess(null);
    try {
      const res = await connectStoryFlowProject(
        selectedStoryId,
        projectInputUrl.trim(),
      );
      setFlowProjectDetails(res);
      setProjectSuccess(
        `Connected to Google Flow project: ${res.flowProjectId}`,
      );
    } catch (err: any) {
      setProjectError(err.message || "Failed to connect Google Flow project.");
    } finally {
      setIsProjectBusy(false);
    }
  };

  const handleDisconnectProject = async () => {
    if (!selectedStoryId) return;
    setIsProjectBusy(true);
    setProjectError(null);
    setProjectSuccess(null);
    try {
      const res = await disconnectStoryFlowProject(selectedStoryId);
      setFlowProjectDetails(res);
      setProjectInputUrl("");
      setProjectSuccess("Google Flow project disconnected from story.");
    } catch (err: any) {
      setProjectError(
        err.message || "Failed to disconnect Google Flow project.",
      );
    } finally {
      setIsProjectBusy(false);
    }
  };

  const handleOpenProjectInExternalTab = () => {
    if (effectiveProjectUrl) {
      window.open(effectiveProjectUrl, "_blank", "noopener,noreferrer");
    } else {
      window.open(
        "https://labs.google/fx/tools/flow",
        "_blank",
        "noopener,noreferrer",
      );
    }
  };

  // ----------------------------------------------------
  // Section C Actions: Background Generation Workflow
  // ----------------------------------------------------
  const handleGenerateBgPrompt = async () => {
    if (!selectedSceneId) {
      setBgUploadError(
        "Select a scene first to generate an environment prompt.",
      );
      return;
    }

    setIsGeneratingBgPrompt(true);
    setBgUploadError(null);
    try {
      const result = await generateSceneBackgroundPrompt(selectedSceneId, {
        aspectRatio: bgAspectRatio,
        cameraDirection: bgCamera,
      });

      if (result.prompt) {
        setBgPrompt(result.prompt);
        // Save prompt automatically
        await saveScenePrompt(selectedSceneId, {
          prompt: result.prompt,
          cameraPerspective: bgCamera,
          aspectRatio: bgAspectRatio,
        });
        // Refresh prompt history
        const hist = await getScenePromptHistory(selectedSceneId);
        setBgPromptHistory(hist || []);
      }
    } catch (err: any) {
      setBgUploadError(
        err.message || "Failed to generate scene background prompt.",
      );
    } finally {
      setIsGeneratingBgPrompt(false);
    }
  };

  const handleCopyBgPrompt = async () => {
    if (!bgPrompt) return;
    try {
      await navigator.clipboard.writeText(bgPrompt);
      setCopiedBgToast(true);
      setTimeout(() => setCopiedBgToast(false), 2500);
    } catch {
      setBgUploadError("Could not write to clipboard. Please copy manually.");
    }
  };

  const handleSaveBgPrompt = async () => {
    if (!selectedSceneId || !bgPrompt) return;
    setIsSavingBgPrompt(true);
    setBgUploadError(null);
    try {
      await saveScenePrompt(selectedSceneId, {
        prompt: bgPrompt,
        cameraPerspective: bgCamera,
        aspectRatio: bgAspectRatio,
      });
      const hist = await getScenePromptHistory(selectedSceneId);
      setBgPromptHistory(hist || []);
      setBgUploadSuccess("Prompt saved to scene.");
      setTimeout(() => setBgUploadSuccess(null), 3000);
    } catch (err: any) {
      setBgUploadError(err.message || "Failed to save prompt.");
    } finally {
      setIsSavingBgPrompt(false);
    }
  };

  const handleBgFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedSceneId) return;

    setBgUploadError(null);
    setBgUploadSuccess(null);
    setIsUploadingBg(true);

    try {
      const res = await uploadSceneBackground(
        selectedSceneId,
        file,
        "cover",
        "google_flow_manual",
        bgPrompt,
      );
      const importedUrl =
        res.background?.imageUrl || res.scene?.imageUrl || null;
      setUploadedBgPreview(importedUrl);
      setBgUploadSuccess(`Background imported successfully! Applied to Scene.`);
      if (editorStory) {
        // Refresh story
        loadStoryContext(editorStory.storyId);
      }
    } catch (err: any) {
      setBgUploadError(err.message || "Failed to import background image.");
    } finally {
      setIsUploadingBg(false);
      if (bgFileInputRef.current) {
        bgFileInputRef.current.value = "";
      }
    }
  };

  // ----------------------------------------------------
  // Selected Character for Section D
  // ----------------------------------------------------
  const selectedCharacter =
    characters.find((c) => c.id === selectedCharacterId) ||
    characters[0] ||
    null;

  return (
    <div className="flow-page-container">
      {/* 1. Page Header */}
      <div className="flow-page-header">
        <div className="flow-header-title-group">
          <h1>
            <span>🌊</span> Google Flow Integration Studio
          </h1>
          <p>
            Local Playwright browser companion for human-in-the-loop Google Flow
            generation. Synthesize character-free environment plates and 8-way
            directional character references with zero cloud lock-in.
          </p>
        </div>

        {/* Live Status Badges */}
        <div className="flow-status-strip">
          <div
            className={`flow-status-badge ${
              workerHealth?.online ? "online" : "offline"
            }`}
            title={
              workerHealth?.online
                ? `Online (${workerHealth.latencyMs}ms)`
                : "Offline"
            }
          >
            <span
              className={`flow-status-dot ${
                workerHealth?.online ? "green" : "red"
              }`}
            />
            Worker:{" "}
            {workerHealth?.online
              ? `Online (${workerHealth.latencyMs}ms)`
              : "Offline"}
          </div>

          <div
            className={`flow-status-badge ${
              session?.browserRunning ? "connected" : "neutral"
            }`}
          >
            <span
              className={`flow-status-dot ${
                session?.browserRunning ? "blue" : "gray"
              }`}
            />
            Browser: {session?.browserRunning ? "Running" : "Closed"}
          </div>

          {(() => {
            if (
              session?.googleAuthenticated ||
              session?.authenticationStatus === "authenticated"
            ) {
              return (
                <div
                  className="flow-status-badge authenticated"
                  title="Google account authenticated in browser"
                >
                  <span className="flow-status-dot green" />
                  Google: Authenticated
                </div>
              );
            }
            if (
              session?.googleSigninBlocked ||
              session?.authenticationStatus === "blocked"
            ) {
              return (
                <div
                  className="flow-status-badge blocked"
                  title="Google sign-in blocked by Google"
                >
                  <span className="flow-status-dot red" />
                  Google: Blocked
                </div>
              );
            }
            if (
              session?.manualLoginRequired ||
              session?.authenticationStatus === "login_required"
            ) {
              return (
                <div
                  className="flow-status-badge login_required"
                  title="Sign-in required in open browser"
                >
                  <span className="flow-status-dot yellow" />
                  Google: Login Required
                </div>
              );
            }
            return (
              <div
                className="flow-status-badge neutral"
                title="Authentication status unknown"
              >
                <span className="flow-status-dot gray" />
                Google: Unknown
              </div>
            );
          })()}

          <div
            className={`flow-status-badge ${flowProjectDetails?.isConnected || standaloneProjectUrl ? "selected" : "neutral"}`}
            title={
              flowProjectDetails?.flowProjectId
                ? `Flow Project: ${flowProjectDetails.flowProjectId}`
                : standaloneProjectUrl
                  ? `Standalone Flow Project: ${standaloneProjectUrl}`
                  : "No Google Flow project linked"
            }
          >
            <span
              className={`flow-status-dot ${flowProjectDetails?.isConnected || standaloneProjectUrl ? "purple" : "gray"}`}
            />
            Project:{" "}
            {flowProjectDetails?.flowProjectId
              ? flowProjectDetails.flowProjectId
              : flowProjectDetails?.isConnected
                ? "Linked"
                : standaloneProjectUrl
                  ? "Standalone"
                  : "Not Selected"}
          </div>
        </div>
      </div>

      {/* Context Banner if navigated from Story/Scene/Character */}
      {(selectedStoryId || selectedCharacterId) && (
        <div className="flow-context-banner">
          <div>
            {selectedStoryId && (
              <span>
                Active Story:{" "}
                <strong>{editorStory?.title || selectedStoryId}</strong>
                {flowProjectDetails?.isConnected && (
                  <span>
                    {" "}
                    &bull; Flow Project:{" "}
                    <strong>{flowProjectDetails.flowProjectId}</strong>
                  </span>
                )}
              </span>
            )}
            {selectedCharacterId && (
              <span style={{ marginLeft: selectedStoryId ? "12px" : 0 }}>
                Active Character:{" "}
                <strong>
                  {selectedCharacter?.name || selectedCharacterId}
                </strong>
              </span>
            )}
          </div>
          {editorStory && (
            <button
              type="button"
              className="flow-btn secondary sm"
              onClick={() => navigate(`/stories/${editorStory.storyId}`)}
            >
              Back to Story Editor <ArrowRightIcon size={12} />
            </button>
          )}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flow-tabs-nav">
        <button
          type="button"
          className={`flow-tab-button ${activeTab === "setup" ? "active" : ""}`}
          onClick={() => setActiveTab("setup")}
        >
          <SparklesIcon size={15} />
          <span>Setup Guide</span>
        </button>

        <button
          type="button"
          className={`flow-tab-button ${activeTab === "connection" ? "active" : ""}`}
          onClick={() => setActiveTab("connection")}
        >
          <SettingsIcon size={15} />
          <span>Connection & Diagnostics</span>
        </button>

        <button
          type="button"
          className={`flow-tab-button ${activeTab === "project" ? "active" : ""}`}
          onClick={() => setActiveTab("project")}
        >
          <BookOpenIcon size={15} />
          <span>Project Management</span>
          {flowProjectDetails?.isConnected && (
            <span className="flow-tab-badge">Linked</span>
          )}
        </button>

        <button
          type="button"
          className={`flow-tab-button ${activeTab === "background" ? "active" : ""}`}
          onClick={() => setActiveTab("background")}
        >
          <ImageIcon size={15} />
          <span>Background Studio (Workflow A)</span>
        </button>

        <button
          type="button"
          className={`flow-tab-button ${activeTab === "character" ? "active" : ""}`}
          onClick={() => setActiveTab("character")}
        >
          <UsersIcon size={15} />
          <span>Character Studio (Flow Views)</span>
        </button>
      </div>

      {/* ==================================================== */}
      {/* TAB 0: SETUP GUIDE WIZARD                            */}
      {/* ==================================================== */}
      {activeTab === "setup" && (
        <div className="flow-tab-content">
          <div className="flow-wizard-container">
            {/* Step 1: Requirements Check */}
            <div className={`flow-wizard-step ${workerHealth?.online ? "completed" : "active"}`}>
              <div className="flow-step-header">
                <div className="flow-step-title-group">
                  <div className="flow-step-number">1</div>
                  <h3 className="flow-step-title">Requirements & Loopback Networking</h3>
                </div>
                <span className={`flow-status-badge ${workerHealth?.online ? "online" : "neutral"}`}>
                  <span className={`flow-status-dot ${workerHealth?.online ? "green" : "gray"}`} />
                  {workerHealth?.online ? "Port 4177 Online" : "Loopback Ready"}
                </span>
              </div>
              <div className="flow-step-body">
                <p>
                  Google Flow integration communicates securely via a loopback Playwright worker running locally at{" "}
                  <code>http://127.0.0.1:4177</code>. Ensure Node.js (v18+) is installed on this laptop.
                </p>
                <div className="flow-checklist">
                  <div className={`flow-checklist-item ${workerHealth?.online ? "pass" : "pending"}`}>
                    <span>{workerHealth?.online ? "✓" : "○"}</span>
                    <span>Loopback Worker (127.0.0.1:4177): {workerHealth?.online ? `Online (${workerHealth.latencyMs}ms)` : "Offline (Start in step 4)"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2: Browser Selection */}
            <div className="flow-wizard-step completed">
              <div className="flow-step-header">
                <div className="flow-step-title-group">
                  <div className="flow-step-number">2</div>
                  <h3 className="flow-step-title">Choose Browser Engine Channel</h3>
                </div>
                <span className="flow-tab-badge">Configured</span>
              </div>
              <div className="flow-step-body">
                <p>
                  We recommend using your installed Google Chrome browser for the highest compatibility with Google Flow.
                </p>
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "4px" }}>
                  <button
                    type="button"
                    className={`flow-btn ${browserChannel === "chrome" ? "primary" : "secondary"}`}
                    onClick={() => {
                      setBrowserChannel("chrome");
                      saveConfig();
                    }}
                  >
                    Google Chrome (System Installed — Recommended)
                  </button>
                  <button
                    type="button"
                    className={`flow-btn ${browserChannel === "bundled-chromium" ? "primary" : "secondary"}`}
                    onClick={() => {
                      setBrowserChannel("bundled-chromium");
                      saveConfig();
                    }}
                  >
                    Bundled Playwright Chromium
                  </button>
                </div>
              </div>
            </div>

            {/* Step 3: Dedicated Persistent Profile */}
            <div className="flow-wizard-step completed">
              <div className="flow-step-header">
                <div className="flow-step-title-group">
                  <div className="flow-step-number">3</div>
                  <h3 className="flow-step-title">Dedicated Persistent Chrome Profile</h3>
                </div>
                <span className="flow-tab-badge">Isolated & Secure</span>
              </div>
              <div className="flow-step-body">
                <p>
                  To keep you signed in without automating passwords or CAPTCHAs, Playwright runs inside a dedicated, isolated browser directory:
                </p>
                <div className="flow-code-block">
                  {session?.configuredProfileDir || workerHealth?.profileDir || "C:\\Users\\...\\AppData\\Local\\AIKidsContentStudio\\GoogleFlowChromeProfile"}
                </div>
                <div className="flow-callout security" style={{ marginTop: "6px" }}>
                  <strong>🔒 Privacy Protection:</strong>
                  <span>
                    Your everyday personal Chrome profile and browsing history are NEVER touched or modified. Only session cookies inside this dedicated studio profile are preserved across restarts.
                  </span>
                </div>
              </div>
            </div>

            {/* Step 4: Worker Startup Command */}
            <div className={`flow-wizard-step ${workerHealth?.online ? "completed" : "active"}`}>
              <div className="flow-step-header">
                <div className="flow-step-title-group">
                  <div className="flow-step-number">4</div>
                  <h3 className="flow-step-title">Start the Local Playwright Worker</h3>
                </div>
                <button
                  type="button"
                  className="flow-btn secondary sm"
                  onClick={handleCopyStartupCommand}
                >
                  <CopyIcon size={12} />
                  <span>{copiedCmdToast ? "Copied!" : "Copy Command"}</span>
                </button>
              </div>
              <div className="flow-step-body">
                <p>
                  In a terminal window on your computer, navigate to the <code>flow-worker</code> directory and run:
                </p>
                <div className="flow-code-block" style={{ cursor: "pointer" }} onClick={handleCopyStartupCommand}>
                  cd flow-worker<br />
                  npm install<br />
                  npm start
                </div>
                <span style={{ fontSize: "11px", color: "var(--color-text-secondary, #94a3b8)" }}>
                  💡 The worker connects automatically to PostgreSQL to provision its encrypted authorization token on launch.
                </span>
              </div>
            </div>

            {/* Step 5: Manual Google Sign-In */}
            <div className={`flow-wizard-step ${session?.googleAuthenticated ? "completed" : "active"}`}>
              <div className="flow-step-header">
                <div className="flow-step-title-group">
                  <div className="flow-step-number">5</div>
                  <h3 className="flow-step-title">Sign In to Google (One-Time Manual Step)</h3>
                </div>
                <span className={`flow-status-badge ${session?.googleAuthenticated ? "online" : "neutral"}`}>
                  {session?.googleAuthenticated ? "Authenticated" : "Sign-In Required"}
                </span>
              </div>
              <div className="flow-step-body">
                <p>
                  Google prohibits automated logins. Click below to open a visible browser window where you can sign in to your Google account directly.
                </p>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "4px" }}>
                  <button
                    type="button"
                    className="flow-btn primary"
                    disabled={isSessionBusy}
                    onClick={handleOpenBrowser}
                  >
                    <SparklesIcon size={14} />
                    <span>Open Flow Browser for Sign-In</span>
                  </button>
                  {session?.browserRunning && (
                    <button
                      type="button"
                      className="flow-btn secondary"
                      disabled={isSessionBusy}
                      onClick={handleRefreshSession}
                    >
                      Check Sign-In Status
                    </button>
                  )}
                </div>
                <span style={{ fontSize: "11px", color: "var(--color-text-secondary, #94a3b8)" }}>
                  Once signed in, the session persists in your dedicated profile directory so you stay logged in.
                </span>
              </div>
            </div>

            {/* Step 6: Verify Setup */}
            <div className="flow-wizard-step">
              <div className="flow-step-header">
                <div className="flow-step-title-group">
                  <div className="flow-step-number">6</div>
                  <h3 className="flow-step-title">Run Integration Health Checks</h3>
                </div>
                <button
                  type="button"
                  className="flow-btn primary sm"
                  disabled={isVerifyingWizard}
                  onClick={handleRunWizardVerification}
                >
                  <CheckIcon size={13} />
                  <span>{isVerifyingWizard ? "Verifying..." : "Run Verification"}</span>
                </button>
              </div>
              <div className="flow-step-body">
                <p>Verify that the worker, database encryption, and browser session are functioning properly:</p>
                <div className="flow-checklist">
                  <div className={`flow-checklist-item ${workerHealth?.online ? "pass" : "fail"}`}>
                    <span>{workerHealth?.online ? "✓" : "✕"}</span>
                    <span>Local Worker Service: {workerHealth?.online ? `Online (${workerHealth.latencyMs}ms)` : "Offline"}</span>
                  </div>
                  <div className={`flow-checklist-item ${credentialStatus?.configured ? "pass" : "fail"}`}>
                    <span>{credentialStatus?.configured ? "✓" : "✕"}</span>
                    <span>Database Credential: {credentialStatus?.configured ? "Configured (PostgreSQL AES-256-GCM)" : "Unconfigured"}</span>
                  </div>
                  <div className={`flow-checklist-item ${workerHealth?.credentialDecryptable ? "pass" : workerHealth?.credentialError ? "fail" : "pending"}`}>
                    <span>{workerHealth?.credentialDecryptable ? "✓" : workerHealth?.credentialError ? "✕" : "○"}</span>
                    <span>Credential Decryption: {workerHealth?.credentialDecryptable ? "Verified" : (workerHealth?.credentialError ? "Decryption failed" : "Pending verification")}</span>
                  </div>
                  <div className={`flow-checklist-item ${session?.browserRunning ? "pass" : "pending"}`}>
                    <span>{session?.browserRunning ? "✓" : "○"}</span>
                    <span>Browser Session: {session?.browserRunning ? "Running" : "Closed (Will open on demand)"}</span>
                  </div>
                  <div className={`flow-checklist-item ${session?.googleAuthenticated ? "pass" : "pending"}`}>
                    <span>{session?.googleAuthenticated ? "✓" : "○"}</span>
                    <span>Google Authentication: {session?.googleAuthenticated ? "Authenticated" : "Sign-in needed"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 7: Ready to Generate */}
            <div className={`flow-wizard-step ${workerHealth?.online ? "completed" : ""}`}>
              <div className="flow-step-header">
                <div className="flow-step-title-group">
                  <div className="flow-step-number">7</div>
                  <h3 className="flow-step-title">Start Generating Assets</h3>
                </div>
                <span className="flow-tab-badge">Ready</span>
              </div>
              <div className="flow-step-body">
                <p>
                  You are all set! Use the navigation tabs above or the shortcuts below to generate environment backgrounds or character views:
                </p>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "4px" }}>
                  <button
                    type="button"
                    className="flow-btn primary"
                    onClick={() => setActiveTab("background")}
                  >
                    <ImageIcon size={14} />
                    <span>Background Studio (Workflow A)</span>
                  </button>
                  <button
                    type="button"
                    className="flow-btn secondary"
                    onClick={() => setActiveTab("character")}
                  >
                    <UsersIcon size={14} />
                    <span>Character Studio (Flow Views)</span>
                  </button>
                  <button
                    type="button"
                    className="flow-btn secondary"
                    onClick={() => setActiveTab("project")}
                  >
                    <BookOpenIcon size={14} />
                    <span>Link Story Project</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Troubleshooting & Emergency Recovery Panel */}
          <div className="flow-card" style={{ marginTop: "24px" }}>
            <div className="flow-card-header">
              <div>
                <h3>🛠️ Troubleshooting & Emergency Recovery</h3>
                <p>One-click tools to resolve stalled workers, mismatched encryption keys, or profile locks.</p>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                className="flow-btn secondary"
                disabled={isSessionBusy}
                onClick={handleRunWizardVerification}
              >
                <span>Retry Setup / Verify</span>
              </button>

              <button
                type="button"
                className="flow-btn secondary"
                disabled={isSessionBusy}
                onClick={handleRefreshSession}
              >
                <span>Refresh Diagnostics</span>
              </button>

              <button
                type="button"
                className="flow-btn secondary"
                disabled={isSessionBusy}
                onClick={handleReconnectWorker}
              >
                <span>Reconnect Worker</span>
              </button>

              <button
                type="button"
                className="flow-btn secondary"
                disabled={isSessionBusy}
                onClick={handleRecoverCredential}
              >
                <span>Recover Credential</span>
              </button>

              <button
                type="button"
                className="flow-btn danger"
                disabled={isSessionBusy}
                onClick={() => setShowResetConfirm(true)}
              >
                <span>Reset Browser Profile</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 1: CONNECTION & DIAGNOSTICS                       */}
      {/* ==================================================== */}
      {activeTab === "connection" && (
        <div className="flow-tab-content">
          {/* Blocked Sign-In Alert */}
          {(session?.googleSigninBlocked ||
            session?.authenticationStatus === "blocked") && (
            <div
              className="flow-callout warning"
              style={{
                borderColor: "rgba(239, 68, 68, 0.5)",
                background: "rgba(239, 68, 68, 0.15)",
                marginBottom: "16px",
              }}
            >
              <AlertTriangleIcon size={18} />
              <div>
                <strong style={{ color: "#f87171" }}>
                  Google Sign-In Blocked by Google
                </strong>
                <p
                  style={{
                    margin: "4px 0 0 0",
                    fontSize: "12px",
                    lineHeight: 1.5,
                  }}
                >
                  Google rejected automated sign-in on{" "}
                  <code>accounts.google.com/v3/signin/rejected</code>. To resolve this:
                  <br />
                  1. Set <code>FLOW_BROWSER_CHANNEL=chrome</code> in your settings to use installed Google Chrome.
                  <br />
                  2. Alternatively, sign in manually via the "Open Persistent Flow Browser" button.
                  <br />
                  3. You can also generate in Google Flow manually and import assets directly via Background Studio or Character Studio.
                </p>
              </div>
            </div>
          )}

          <div className="flow-grid-2col">
            {/* Left Column: Worker Controls & Credential Management */}
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Card 1: Worker & Browser Controls (Collapsible) */}
              <CollapsibleSection
                id="sec-worker-controls"
                storageKey="flow_worker_controls"
                variant="flow-card"
                title="Local Worker & Browser Controls"
                subtitle="Manage loopback communication and visible Playwright browser execution."
                icon={<SettingsIcon size={16} />}
                headerActions={
                  <button
                    type="button"
                    className="flow-btn secondary sm"
                    disabled={isCheckingHealth}
                    onClick={handleCheckHealth}
                  >
                    {isCheckingHealth ? "Testing..." : "Test Connection"}
                  </button>
                }
              >
                {connectionError && (
                  <div className="flow-callout warning">
                    <AlertTriangleIcon size={14} />
                    <span>{connectionError}</span>
                  </div>
                )}

                {connectionSuccess && (
                  <div className="flow-callout success">
                    <CheckIcon size={14} />
                    <span>{connectionSuccess}</span>
                  </div>
                )}

                <div className="flow-form-group">
                  <label className="flow-form-label">
                    Local Worker URL
                    <span className="sub">Must bind to loopback (127.0.0.1)</span>
                  </label>
                  <input
                    type="text"
                    className="flow-input"
                    value={workerUrl}
                    onChange={(e) => setWorkerUrl(e.target.value)}
                    placeholder="http://127.0.0.1:4177"
                  />
                </div>

                <div className="flow-form-group">
                  <label className="flow-form-label">
                    Browser Engine Channel
                    <span className="sub">Google Chrome installed vs Bundled Chromium</span>
                  </label>
                  <select
                    className="flow-select"
                    value={browserChannel}
                    onChange={(e) => setBrowserChannel(e.target.value)}
                  >
                    <option value="chrome">
                      Google Chrome (Installed system browser - Recommended)
                    </option>
                    <option value="bundled-chromium">
                      Bundled Playwright Chromium
                    </option>
                  </select>
                </div>

                <div className="flow-form-group">
                  <label className="flow-form-label">
                    Browser Session Controls
                  </label>
                  <div className="flow-input-row" style={{ flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="flow-btn primary"
                      disabled={isSessionBusy}
                      onClick={handleOpenBrowser}
                    >
                      <SparklesIcon size={14} />
                      <span>Open Persistent Flow Browser</span>
                    </button>

                    <button
                      type="button"
                      className="flow-btn secondary"
                      disabled={isSessionBusy}
                      onClick={handleRefreshSession}
                    >
                      <span>Refresh Session</span>
                    </button>

                    <button
                      type="button"
                      className="flow-btn danger"
                      disabled={isSessionBusy || !session?.browserRunning}
                      onClick={handleCloseBrowser}
                    >
                      <span>Close Browser</span>
                    </button>

                    <button
                      type="button"
                      className="flow-btn secondary"
                      disabled={isSessionBusy}
                      onClick={handleSaveConfig}
                    >
                      <span>Save Settings</span>
                    </button>
                  </div>
                </div>

                {session && (
                  <div className="flow-callout info">
                    <strong>Browser Session:</strong>
                    <div>
                      State: <code>{session.state}</code> &bull; Running:{" "}
                      {session.browserRunning ? "Yes" : "No"} &bull; Google:{" "}
                      {session.authenticationStatus}
                    </div>
                    {session.currentUrl && (
                      <div>Current URL: {session.currentUrl}</div>
                    )}
                    {session.message && (
                      <div style={{ marginTop: "4px" }}>{session.message}</div>
                    )}
                    {session.manualLoginRequired && (
                      <div
                        style={{
                          color: "#fbbf24",
                          fontWeight: 600,
                          marginTop: "4px",
                        }}
                      >
                        ⚠️ Google sign-in required in the open browser window.
                      </div>
                    )}
                  </div>
                )}
              </CollapsibleSection>

              {/* Card 2: Database Credential Management (Collapsible) */}
              <CollapsibleSection
                id="sec-credential-security"
                storageKey="flow_credential_security"
                variant="flow-card"
                title="🔐 Integration Credential & Security"
                subtitle="Bearer token is generated, encrypted with AES-256-GCM, and persisted in PostgreSQL."
              >
                <div className="flow-diagnostics-grid">
                  <div className="flow-diag-item">
                    <span className="flow-diag-label">Credential Configured</span>
                    <span
                      className="flow-diag-value"
                      style={{ color: credentialStatus?.configured ? "#10b981" : "#f59e0b" }}
                    >
                      {credentialStatus?.configured ? "Yes (PostgreSQL AES-256-GCM)" : "No"}
                    </span>
                  </div>

                  <div className="flow-diag-item">
                    <span className="flow-diag-label">Master Encryption Key</span>
                    <span
                      className="flow-diag-value"
                      style={{
                        color: workerHealth?.masterKeyAvailable !== false ? "#10b981" : "#ef4444",
                      }}
                    >
                      {workerHealth?.masterKeyAvailable !== false ? "Healthy (Active)" : "Missing / Unreadable"}
                    </span>
                  </div>

                  <div className="flow-diag-item">
                    <span className="flow-diag-label">Credential Decryption</span>
                    <span
                      className="flow-diag-value"
                      style={{
                        color: workerHealth?.credentialDecryptable
                          ? "#10b981"
                          : workerHealth?.credentialError
                            ? "#ef4444"
                            : "#10b981",
                      }}
                    >
                      {workerHealth?.credentialDecryptable
                        ? "Verified"
                        : workerHealth?.credentialError
                          ? "Decryption failed"
                          : "Verified"}
                    </span>
                  </div>

                  <div className="flow-diag-item">
                    <span className="flow-diag-label">Key Version</span>
                    <span className="flow-diag-value">
                      {credentialStatus?.keyVersion || "v1"}
                    </span>
                  </div>

                  <div className="flow-diag-item">
                    <span className="flow-diag-label">Worker Pairing Status</span>
                    <span
                      className="flow-diag-value"
                      style={{
                        color:
                          credentialStatus?.metadata?.pairingStatus === "paired"
                            ? "#10b981"
                            : credentialStatus?.metadata?.pairingStatus === "awaiting_provisioning"
                              ? "#f59e0b"
                              : "#94a3b8",
                      }}
                    >
                      {credentialStatus?.metadata?.pairingStatus === "paired"
                        ? "Paired (Active)"
                        : credentialStatus?.metadata?.pairingStatus === "awaiting_provisioning"
                          ? "Awaiting Provisioning"
                          : "Unpaired"}
                    </span>
                  </div>

                  <div className="flow-diag-item">
                    <span className="flow-diag-label">Worker Authentication</span>
                    <span
                      className="flow-diag-value"
                      style={{
                        color: workerHealth?.isProvisioned ? "#10b981" : "#f59e0b",
                      }}
                    >
                      {workerHealth?.isProvisioned
                        ? "Verified"
                        : "Offline / Awaiting Provisioning"}
                    </span>
                  </div>
                </div>

                {workerHealth?.credentialDecryptable === false && workerHealth?.credentialError && (
                  <div
                    className="flow-callout warning"
                    style={{
                      borderColor: "rgba(239, 68, 68, 0.5)",
                      background: "rgba(239, 68, 68, 0.12)",
                      marginTop: "12px",
                    }}
                  >
                    <AlertTriangleIcon size={16} />
                    <div>
                      <strong style={{ color: "#f87171" }}>Decryption Recovery Required</strong>
                      <p style={{ margin: "4px 0 8px 0", fontSize: "12px" }}>
                        The active master key cannot decrypt the existing credential token ({workerHealth.credentialError}). Click below to safely re-encrypt a fresh token with zero impact to your browser profile.
                      </p>
                      <button
                        type="button"
                        className="flow-btn primary sm"
                        disabled={isSessionBusy}
                        onClick={handleRecoverCredential}
                      >
                        Recover Credential Now
                      </button>
                    </div>
                  </div>
                )}

                {showRegenConfirm ? (
                  <div
                    className="flow-callout warning"
                    style={{
                      borderColor: "rgba(245, 158, 11, 0.5)",
                      background: "rgba(245, 158, 11, 0.12)",
                    }}
                  >
                    <AlertTriangleIcon size={16} />
                    <div>
                      <strong>Regenerate Integration Credential?</strong>
                      <p
                        style={{
                          margin: "4px 0 8px 0",
                          fontSize: "12px",
                          lineHeight: 1.45,
                        }}
                      >
                        Regenerating credentials creates a new token in PostgreSQL. Any running worker sessions must be reconnected to receive the new credential.
                      </p>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          type="button"
                          className="flow-btn danger sm"
                          onClick={handleConfirmRegenerate}
                        >
                          Confirm Regeneration
                        </button>
                        <button
                          type="button"
                          className="flow-btn secondary sm"
                          onClick={() => setShowRegenConfirm(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
                    <button
                      type="button"
                      className="flow-btn secondary sm"
                      disabled={isSessionBusy}
                      onClick={handleVerifyAuth}
                    >
                      Verify Worker Authentication
                    </button>

                    <button
                      type="button"
                      className="flow-btn secondary sm"
                      disabled={isSessionBusy}
                      onClick={handleReconnectWorker}
                    >
                      Reconnect / Provision Worker
                    </button>

                    <button
                      type="button"
                      className="flow-btn secondary sm"
                      disabled={isSessionBusy}
                      onClick={handleRecoverCredential}
                    >
                      Recover Credential
                    </button>

                    <button
                      type="button"
                      className="flow-btn secondary sm"
                      disabled={isSessionBusy}
                      onClick={() => setShowRegenConfirm(true)}
                    >
                      Regenerate Credential
                    </button>
                  </div>
                )}
              </CollapsibleSection>
            </div>

            {/* Right Column: Persistent Profile Diagnostics (Collapsible) */}
            <CollapsibleSection
              id="sec-profile-diagnostics"
              storageKey="flow_profile_diagnostics"
              variant="flow-card"
              title="🔍 Persistent Chrome Profile Diagnostics"
              subtitle="Stable profile path, channel, and authentication state details."
            >
              <div className="flow-diagnostics-grid">
                <div className="flow-diag-item">
                  <span className="flow-diag-label">Browser Channel</span>
                  <span className="flow-diag-value">
                    {session?.browserChannel ||
                      workerHealth?.browserChannel ||
                      browserChannel ||
                      "bundled-chromium"}
                  </span>
                </div>

                <div className="flow-diag-item">
                  <span className="flow-diag-label">Configured Profile Directory</span>
                  <span
                    className="flow-diag-value"
                    title={
                      session?.configuredProfileDir ||
                      workerHealth?.profileDir ||
                      "Default OS directory"
                    }
                  >
                    {session?.configuredProfileDir ||
                      workerHealth?.profileDir ||
                      "Default OS directory"}
                  </span>
                </div>

                <div className="flow-diag-item">
                  <span className="flow-diag-label">Profile Directory Exists</span>
                  <span className="flow-diag-value">
                    {session?.profileDirExists !== undefined
                      ? session.profileDirExists
                        ? "Yes"
                        : "No (Created on launch)"
                      : "Checking..."}
                  </span>
                </div>

                <div className="flow-diag-item">
                  <span className="flow-diag-label">Worker Controls Active Browser</span>
                  <span className="flow-diag-value">
                    {session?.ownsActiveBrowser ? "Yes" : "No"}
                  </span>
                </div>

                <div className="flow-diag-item">
                  <span className="flow-diag-label">Google Sign-in Required</span>
                  <span className="flow-diag-value">
                    {session?.manualLoginRequired ||
                    session?.authenticationStatus === "login_required"
                      ? "Yes (Manual login needed)"
                      : session?.googleAuthenticated ||
                          session?.authenticationStatus === "authenticated"
                        ? "No (Authenticated)"
                        : "Unknown"}
                  </span>
                </div>

                <div className="flow-diag-item">
                  <span className="flow-diag-label">Credential Storage</span>
                  <span className="flow-diag-value">PostgreSQL (AES-256-GCM)</span>
                </div>
              </div>

              <div className="flow-callout security" style={{ marginTop: "16px" }}>
                <strong>🔒 Security & Privacy Architecture:</strong>
                <span>
                  The worker binds exclusively to loopback (<code>127.0.0.1</code>) and uses automated provisioning. Credentials are never exposed to the frontend browser or stored in plaintext. The browser session runs in a dedicated persistent profile so your Google login is remembered across studio restarts without automating passwords or CAPTCHAs.
                </span>
              </div>

              <div style={{ marginTop: "16px" }}>
                <strong style={{ fontSize: "12px", display: "block", marginBottom: "6px" }}>
                  1. Start the local worker process:
                </strong>
                <div className="flow-code-block" style={{ cursor: "pointer" }} onClick={handleCopyStartupCommand}>
                  cd flow-worker<br />
                  npm install<br />
                  npm start
                </div>
              </div>

              <div>
                <strong style={{ fontSize: "12px", display: "block", marginBottom: "6px" }}>
                  2. Install Playwright Chromium (if not already installed):
                </strong>
                <div className="flow-code-block">
                  npx playwright install chromium
                </div>
              </div>

              <div>
                <strong style={{ fontSize: "12px", display: "block", marginBottom: "6px" }}>
                  3. Automated Provisioning Handshake:
                </strong>
                <div className="flow-code-block">
                  # The worker automatically provisions its bearer token from PostgreSQL at startup.<br />
                  # No manual editing of FLOW_WORKER_TOKEN in .env is required.
                </div>
              </div>

              <div style={{ marginTop: "12px" }}>
                <button
                  type="button"
                  className="flow-btn danger sm"
                  disabled={isSessionBusy}
                  onClick={() => setShowResetConfirm(true)}
                >
                  Reset Dedicated Profile Directory
                </button>
              </div>
            </CollapsibleSection>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 2: PROJECT MANAGEMENT                             */}
      {/* ==================================================== */}
      {activeTab === "project" && (
        <div className="flow-tab-content">
          <div className="flow-grid-2col">
            {/* Project Association Card */}
            <div className="flow-card">
              <div className="flow-card-header">
                <div>
                  <h3>
                    <BookOpenIcon size={16} /> Story Project Association
                  </h3>
                  <p>
                    Link a Google Flow project directly to a story in AI Kids
                    Content Studio.
                  </p>
                </div>
              </div>

              {projectError && (
                <div className="flow-callout warning">
                  <AlertTriangleIcon size={14} />
                  <span>{projectError}</span>
                </div>
              )}

              {projectSuccess && (
                <div className="flow-callout success">
                  <CheckIcon size={14} />
                  <span>{projectSuccess}</span>
                </div>
              )}

              <div className="flow-form-group">
                <label className="flow-form-label">Select Story Context</label>
                <select
                  className="flow-select"
                  value={selectedStoryId}
                  onChange={(e) => setSelectedStoryId(e.target.value)}
                >
                  <option value="">-- Standalone (No Story Selected) --</option>
                  {stories.map((st) => (
                    <option key={st.storyId} value={st.storyId}>
                      {st.title}{" "}
                      {st.flowProjectId ? `(Flow: ${st.flowProjectId})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {selectedStoryId ? (
                <>
                  <div className="flow-form-group">
                    <label className="flow-form-label">
                      Google Flow Project URL or ID
                      <span className="sub">
                        e.g. https://flow.google.com/project/prj_123
                      </span>
                    </label>
                    <input
                      type="text"
                      className="flow-input"
                      value={projectInputUrl}
                      onChange={(e) => setProjectInputUrl(e.target.value)}
                      placeholder="https://flow.google.com/project/<project-id>"
                    />
                  </div>

                  <div className="flow-input-row" style={{ flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="flow-btn primary"
                      disabled={isProjectBusy || !projectInputUrl.trim()}
                      onClick={handleConnectProject}
                    >
                      <CheckIcon size={14} />
                      <span>
                        {flowProjectDetails?.isConnected
                          ? "Update Story Project"
                          : "Connect to Story"}
                      </span>
                    </button>

                    {flowProjectDetails?.isConnected && (
                      <button
                        type="button"
                        className="flow-btn danger"
                        disabled={isProjectBusy}
                        onClick={handleDisconnectProject}
                      >
                        <span>Disconnect Project</span>
                      </button>
                    )}

                    <button
                      type="button"
                      className="flow-btn secondary"
                      onClick={handleOpenProjectInExternalTab}
                    >
                      <span>Open in Browser ↗</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="flow-form-group">
                  <label className="flow-form-label">
                    Standalone Flow Project URL
                    <span className="sub">
                      Used for standalone generation without binding to a story
                    </span>
                  </label>
                  <input
                    type="text"
                    className="flow-input"
                    value={standaloneProjectUrl}
                    onChange={(e) => setStandaloneProjectUrl(e.target.value)}
                    placeholder="https://flow.google.com/project/<id>"
                  />
                  <div style={{ marginTop: "8px" }}>
                    <button
                      type="button"
                      className="flow-btn secondary"
                      onClick={handleOpenProjectInExternalTab}
                    >
                      <span>Open in Browser ↗</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Project Context Summary Card */}
            <div className="flow-card">
              <div className="flow-card-header">
                <div>
                  <h3>ℹ️ Active Project Status</h3>
                  <p>Current configuration and Flow worker project target.</p>
                </div>
              </div>

              <div className="flow-callout info">
                <div>
                  <strong>Resolved Project URL:</strong>{" "}
                  <code>
                    {effectiveProjectUrl || "None (Default Flow Home)"}
                  </code>
                </div>
                {flowProjectDetails?.flowProjectId && (
                  <div>
                    <strong>Flow Project ID:</strong>{" "}
                    {flowProjectDetails.flowProjectId}
                  </div>
                )}
                <div>
                  <strong>Associated Story:</strong>{" "}
                  {editorStory ? editorStory.title : "None (Standalone mode)"}
                </div>
              </div>

              <div
                style={{
                  fontSize: "12px",
                  color: "var(--color-text-secondary)",
                  lineHeight: 1.5,
                }}
              >
                <p>
                  <strong>How Story Context Works:</strong> When a project is
                  linked to a story, any browser sessions opened from the
                  Connection Dashboard or Background/Character Studios will
                  automatically navigate to this project.
                </p>
                <p>
                  This ensures assets and prompts are stored under the correct
                  project folder in your Google Flow workspace.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 3: BACKGROUND STUDIO (WORKFLOW A)                 */}
      {/* ==================================================== */}
      {activeTab === "background" && (
        <div className="flow-tab-content">
          <div className="flow-grid-2col">
            {/* Left Column: Scene & Prompt Controls */}
            <div className="flow-card">
              <div className="flow-card-header">
                <div>
                  <h3>
                    <ImageIcon size={16} /> Background Studio (Workflow A)
                  </h3>
                  <p>
                    Character-free environment plates tailored for vector rigs
                    and animation middlegrounds.
                  </p>
                </div>
              </div>

              {bgUploadError && (
                <div className="flow-callout warning">
                  <AlertTriangleIcon size={14} />
                  <span>{bgUploadError}</span>
                </div>
              )}

              {bgUploadSuccess && (
                <div className="flow-callout success">
                  <CheckIcon size={14} />
                  <span>{bgUploadSuccess}</span>
                </div>
              )}

              {/* Story & Scene Selectors */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                }}
              >
                <div className="flow-form-group">
                  <label className="flow-form-label">Story</label>
                  <select
                    className="flow-select"
                    value={selectedStoryId}
                    onChange={(e) => setSelectedStoryId(e.target.value)}
                  >
                    {stories.map((st) => (
                      <option key={st.storyId} value={st.storyId}>
                        {st.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flow-form-group">
                  <label className="flow-form-label">Scene</label>
                  <select
                    className="flow-select"
                    value={selectedSceneId}
                    onChange={(e) => setSelectedSceneId(e.target.value)}
                    disabled={!editorStory?.scenes?.length}
                  >
                    {editorStory?.scenes?.map((sc) => (
                      <option key={sc.sceneId} value={sc.sceneId}>
                        Scene {sc.number}:{" "}
                        {sc.title || sc.narration?.slice(0, 24) || "Untitled"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedScene && (
                <div
                  style={{
                    fontSize: "11px",
                    color: "var(--color-text-secondary)",
                    padding: "8px",
                    background: "var(--color-surface-muted)",
                    borderRadius: "6px",
                  }}
                >
                  <strong>Scene Narration:</strong>{" "}
                  {selectedScene.narration || "No narration entered"}
                </div>
              )}

              {/* Camera & Aspect Ratio */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                }}
              >
                <div className="flow-form-group">
                  <label className="flow-form-label">Camera Perspective</label>
                  <select
                    className="flow-select"
                    value={bgCamera}
                    onChange={(e) => setBgCamera(e.target.value)}
                  >
                    {CAMERA_PERSPECTIVES.map((cam) => (
                      <option key={cam} value={cam}>
                        {cam}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flow-form-group">
                  <label className="flow-form-label">Aspect Ratio</label>
                  <select
                    className="flow-select"
                    value={bgAspectRatio}
                    onChange={(e) => setBgAspectRatio(e.target.value)}
                  >
                    {ASPECT_RATIOS.map((ar) => (
                      <option key={ar.value} value={ar.value}>
                        {ar.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Prompt Textarea */}
              <div className="flow-form-group">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <label className="flow-form-label" style={{ margin: 0 }}>
                    Synthesized Visual Environment Prompt
                  </label>
                  <span
                    style={{
                      fontSize: "10px",
                      color: "#10b981",
                      fontWeight: 600,
                    }}
                  >
                    ✓ Character-Free Plate
                  </span>
                </div>
                <textarea
                  className="flow-textarea"
                  rows={4}
                  value={bgPrompt}
                  onChange={(e) => setBgPrompt(e.target.value)}
                  placeholder="Click 'Synthesize Prompt' to generate a character-free prompt matching the scene narration..."
                />
              </div>

              <div className="flow-pill-group">
                <span className="flow-pill">
                  ✓ Clean Middleground for Characters
                </span>
                <span className="flow-pill">✓ Ratio: {bgAspectRatio}</span>
                <span className="flow-pill">✓ {bgCamera}</span>
              </div>

              {/* Prompt Action Buttons */}
              <div className="flow-input-row" style={{ flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="flow-btn primary"
                  disabled={isGeneratingBgPrompt || !selectedSceneId}
                  onClick={handleGenerateBgPrompt}
                >
                  <SparklesIcon size={14} />
                  <span>
                    {isGeneratingBgPrompt
                      ? "Synthesizing..."
                      : "Synthesize Prompt"}
                  </span>
                </button>

                <button
                  type="button"
                  className="flow-btn secondary"
                  disabled={!bgPrompt}
                  onClick={handleCopyBgPrompt}
                >
                  {copiedBgToast ? (
                    <CheckIcon size={14} />
                  ) : (
                    <CopyIcon size={14} />
                  )}
                  <span>
                    {copiedBgToast ? "Copied to Clipboard!" : "Copy Prompt"}
                  </span>
                </button>

                <button
                  type="button"
                  className="flow-btn secondary"
                  disabled={isSavingBgPrompt || !bgPrompt}
                  onClick={handleSaveBgPrompt}
                >
                  <span>{isSavingBgPrompt ? "Saving..." : "Save Prompt"}</span>
                </button>

                <button
                  type="button"
                  className="flow-btn secondary"
                  onClick={handleOpenProjectInExternalTab}
                >
                  <span>Open Flow Browser ↗</span>
                </button>
              </div>

              {/* Prompt History Drawer */}
              <div style={{ marginTop: "10px" }}>
                <button
                  type="button"
                  className="flow-btn secondary sm"
                  onClick={() => setShowBgHistory(!showBgHistory)}
                >
                  <span>Prompt History ({bgPromptHistory.length})</span>
                  {showBgHistory ? (
                    <ChevronUpIcon size={12} />
                  ) : (
                    <ChevronDownIcon size={12} />
                  )}
                </button>

                {showBgHistory && (
                  <div
                    style={{
                      marginTop: "8px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      maxHeight: "160px",
                      overflowY: "auto",
                    }}
                  >
                    {bgPromptHistory.map((item, idx) => (
                      <div key={item.id || idx} className="flow-history-item">
                        <div className="flow-history-meta">
                          <span>Version {item.version || idx + 1}</span>
                          <span>
                            {item.timestamp
                              ? new Date(item.timestamp).toLocaleTimeString()
                              : ""}
                          </span>
                        </div>
                        <div
                          style={{ cursor: "pointer", color: "#c084fc" }}
                          onClick={() => setBgPrompt(item.prompt)}
                        >
                          {item.prompt.slice(0, 100)}...
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Import & Preview */}
            <div className="flow-card">
              <div className="flow-card-header">
                <div>
                  <h3>
                    <UploadIcon size={16} /> Import Downloaded Background
                  </h3>
                  <p>
                    Import the image downloaded from Google Flow directly into
                    this scene.
                  </p>
                </div>
              </div>

              <input
                ref={bgFileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: "none" }}
                onChange={handleBgFileSelect}
              />

              <div
                className="flow-dropzone"
                onClick={() => bgFileInputRef.current?.click()}
              >
                <UploadIcon size={24} />
                <p>
                  <strong>
                    {isUploadingBg
                      ? "Importing image..."
                      : "Click to select or drop downloaded background"}
                  </strong>
                </p>
                <span
                  style={{
                    fontSize: "11px",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  Supports PNG, JPEG, WebP (up to 15 MB)
                </span>
              </div>

              {/* Image Preview */}
              <div>
                <strong
                  style={{
                    fontSize: "12px",
                    display: "block",
                    marginBottom: "8px",
                  }}
                >
                  Current Scene Background:
                </strong>
                <div className="flow-preview-box">
                  {uploadedBgPreview ? (
                    <img
                      src={uploadedBgPreview}
                      alt="Scene background preview"
                    />
                  ) : (
                    <div
                      style={{
                        color: "var(--color-text-secondary)",
                        fontSize: "12px",
                      }}
                    >
                      No background image imported for this scene yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 4: CHARACTER STUDIO (FLOW ALTERNATE VIEWS)        */}
      {/* ==================================================== */}
      {activeTab === "character" && (
        <div className="flow-tab-content">
          <div className="flow-grid-2col">
            {/* Character Selector & Profile Card */}
            <div className="flow-card">
              <div className="flow-card-header">
                <div>
                  <h3>
                    <UsersIcon size={16} /> Character Selection & Canonical
                    Traits
                  </h3>
                  <p>
                    Select a saved Studio character to generate alternate 8-way
                    views in Google Flow.
                  </p>
                </div>
              </div>

              <div className="flow-form-group">
                <label className="flow-form-label">Studio Character</label>
                <select
                  className="flow-select"
                  value={selectedCharacterId}
                  onChange={(e) => setSelectedCharacterId(e.target.value)}
                >
                  {characters.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.name} ({ch.species || "Character"})
                    </option>
                  ))}
                </select>
              </div>

              {selectedCharacter && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: "14px",
                      alignItems: "center",
                    }}
                  >
                    {selectedCharacter.referenceImageUrl ? (
                      <img
                        src={selectedCharacter.referenceImageUrl}
                        alt={selectedCharacter.name}
                        style={{
                          width: "80px",
                          height: "80px",
                          borderRadius: "8px",
                          objectFit: "cover",
                          border: "1px solid var(--color-border)",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "80px",
                          height: "80px",
                          borderRadius: "8px",
                          background: "var(--color-surface-muted)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "var(--color-text-secondary)",
                          fontSize: "11px",
                        }}
                      >
                        No Reference
                      </div>
                    )}

                    <div>
                      <h4 style={{ margin: 0, fontSize: "16px" }}>
                        {selectedCharacter.name}
                      </h4>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--color-text-secondary)",
                          marginTop: "4px",
                        }}
                      >
                        Species:{" "}
                        <strong>{selectedCharacter.species || "N/A"}</strong>{" "}
                        &bull; Personality:{" "}
                        <strong>
                          {selectedCharacter.personality || "Friendly"}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--color-text-secondary)",
                      lineHeight: 1.45,
                    }}
                  >
                    <strong>Canonical Visual Description:</strong>
                    <p style={{ margin: "4px 0 0" }}>
                      {selectedCharacter.visualDescription ||
                        selectedCharacter.distinctiveFeatures ||
                        "Standard children cartoon illustration style."}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Embedded Google Flow Character Panel */}
            {selectedCharacter ? (
              <GoogleFlowCharacterPanel
                characterId={selectedCharacter.id}
                characterName={selectedCharacter.name}
                characterDescription={selectedCharacter.visualDescription}
                species={selectedCharacter.species}
                clothing={selectedCharacter.distinctiveFeatures}
                artStyle="2D cartoon"
                workerUrl={workerUrl}
                onWorkerUrlChange={setWorkerUrl}
                projectUrl={effectiveProjectUrl}
                onProjectUrlChange={setStandaloneProjectUrl}
                session={session}
                onSessionChange={setSession}
                onImported={() => {
                  // Refresh characters when an asset is imported
                  getAllCharacters().then(setCharacters);
                }}
              />
            ) : (
              <div className="flow-card">
                <p>
                  No characters found. Create a character in Character Studio
                  first.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reset Dedicated Profile Confirmation Modal */}
      {showResetConfirm && (
        <div className="flow-modal-overlay">
          <div className="flow-modal">
            <h3>
              <AlertTriangleIcon size={20} color="#f87171" />
              Reset Dedicated Browser Profile?
            </h3>
            <p>
              This action will close any active Google Flow browser instance and completely clear the dedicated profile directory:
            </p>
            <div className="flow-code-block">
              {session?.configuredProfileDir || workerHealth?.profileDir || "C:\\Users\\...\\AppData\\Local\\AIKidsContentStudio\\GoogleFlowChromeProfile"}
            </div>
            <p style={{ fontSize: "12px", color: "#f59e0b" }}>
              ⚠️ You will be signed out of your Google account inside this dedicated profile and will need to log in again via "Open Persistent Flow Browser".
            </p>
            <div className="flow-callout security" style={{ margin: 0 }}>
              <strong>🔒 Safe Guarantee:</strong>
              <span>Your everyday personal Google Chrome browser and personal data are completely unaffected.</span>
            </div>
            <div className="flow-modal-actions">
              <button
                type="button"
                className="flow-btn secondary"
                onClick={() => setShowResetConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flow-btn danger"
                onClick={handleResetProfile}
              >
                Confirm Profile Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
