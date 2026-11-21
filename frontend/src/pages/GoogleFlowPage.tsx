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
  fetchStoryFlowContext,
  fetchGenerationProvidersStatus,
  generateBackgroundDirect,
  generateCharacterAssetDirect,
  generateAllMissingBackgroundsDirect,
  generateAllMissingCharacterReferencesDirect,
  syncCharacterToGoogleFlowDirect,
  fetchGenerationJob,
  fetchStoryCharacterMappings,
  cancelActiveFlowJob,
  StoryFlowContextResponse,
  StoryFlowSceneItem,
  StoryFlowCharacterItem,
  ProvidersStatusResponse,
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
import { useGoogleFlowConnection } from "../context/useGoogleFlowConnection";
import { CollapsibleSection } from "../components/editor/CollapsibleSection";
import GoogleFlowCharacterPanel from "../components/characters/GoogleFlowCharacterPanel";
import "./GoogleFlowPage.css";

type ActiveTab =
  | "setup"
  | "connection"
  | "project"
  | "background"
  | "character";

function cleanScriptText(text?: string): string {
  if (!text) return "";
  let clean = text;
  // First strip leading and trailing quotes, backticks, asterisks, hashes
  clean = clean.replace(/^[*_~`#\s"“”'«»]+/, "");
  // Aggressively strip known script/fountain labels and markdown markers
  clean = clean.replace(
    /^(?:Visual Direction|Visual Style|Environment|Camera Angle|Lighting|Narration|Action|Scene Description|Shot Instruction)\s*:?[\s*_#:"“”'«»]*\s*/gi,
    "",
  );
  clean = clean.replace(/^[*_~`#\s"“”'«»]+|[*_~`#\s"“”'«»]+$/g, "");
  clean = clean.replace(
    /^(?:Visual Direction|Visual Style|Environment|Camera Angle|Lighting|Narration|Action|Scene Description|Shot Instruction)\s*:?[\s*_#:"“”'«»]*\s*/gi,
    "",
  );
  clean = clean.replace(/^[*_~`#\s"“”'«»]+|[*_~`#\s"“”'«»]+$/g, "");
  return clean.trim();
}

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
    queryCharacterId || "",
  );
  const setSelectedCharacterId = (id: string) => {
    setSelectedCharacterIdState(id);
    if (id) {
      setLastSelectedCharacterId(id);
    }
  };

  // ----------------------------------------------------
  // Story-Aware Production Studio State & Context
  // ----------------------------------------------------
  const [storyContext, setStoryContext] =
    useState<StoryFlowContextResponse | null>(null);
  const [isLoadingStoryContext, setIsLoadingStoryContext] = useState(false);
  const [storyContextError, setStoryContextError] = useState<string | null>(
    null,
  );
  const [generationProvider, setGenerationProvider] = useState<
    "gemini_api" | "google_flow"
  >("google_flow");
  const [providersStatus, setProvidersStatus] =
    useState<ProvidersStatusResponse | null>(null);

  // Background Studio specific state
  const [generatingSceneIds, setGeneratingSceneIds] = useState<
    Record<string, boolean>
  >({});
  const [sceneErrors, setSceneErrors] = useState<Record<string, string>>({});
  const [isBatchBgRunning, setIsBatchBgRunning] = useState(false);
  const [batchBgSummary, setBatchBgSummary] = useState<string | null>(null);
  const [bgFilter, setBgFilter] = useState<"all" | "ready" | "missing">("all");
  const [selectedSceneIdsForBatch, setSelectedSceneIdsForBatch] = useState<
    string[]
  >([]);
  const [expandedSceneSettings, setExpandedSceneSettings] = useState<
    Record<string, boolean>
  >({});
  const [sceneCustomPrompts, setSceneCustomPrompts] = useState<
    Record<string, string>
  >({});
  const [activeDirectivesSceneId, setActiveDirectivesSceneId] = useState<
    string | null
  >(null);
  const [copiedPromptSceneId, setCopiedPromptSceneId] = useState<string | null>(
    null,
  );

  // Character Studio specific state
  const [generatingCharIds, setGeneratingCharIds] = useState<
    Record<string, boolean>
  >({});
  const [syncingCharIds, setSyncingCharIds] = useState<Record<string, boolean>>(
    {},
  );
  const [charErrors, setCharErrors] = useState<Record<string, string>>({});
  const [isBatchCharRunning, setIsBatchCharRunning] = useState(false);
  const [batchCharSummary, setBatchCharSummary] = useState<string | null>(null);
  const [charFilter, setCharFilter] = useState<"all" | "ready" | "missing">(
    "all",
  );

  // Lightbox Preview Modal
  interface PreviewAssetModalData {
    url: string;
    title: string;
    subtitle?: string;
    aspectRatio?: string;
    sceneId?: string;
    characterId?: string;
    type: "background" | "character";
  }
  const [previewAsset, setPreviewAsset] =
    useState<PreviewAssetModalData | null>(null);
  const setPreviewModalUrl = (url: string | null) =>
    setPreviewAsset(
      url ? { url, title: "Asset Preview", type: "background" } : null,
    );

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
        setStoryContext(null);
        return;
      }

      setIsLoadingStoryContext(true);
      setStoryContextError(null);
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

        // 3. Fetch comprehensive story context (characters, environmental cues, missing counts)
        const flowCtx = await fetchStoryFlowContext(storyId);
        setStoryContext(flowCtx);

        // Ensure active character selection belongs strictly to this story's character roster
        const storyCharIds = (flowCtx.characters || []).map((c: any) => c.id);
        setSelectedCharacterIdState((current) => {
          if (!current || !storyCharIds.includes(current)) {
            return storyCharIds[0] || "";
          }
          return current;
        });
      } catch (err: any) {
        console.warn("Could not load story context:", err);
        setStoryContextError(err.message || "Failed to load story context.");
      } finally {
        setIsLoadingStoryContext(false);
      }
    },
    [selectedSceneId],
  );

  useEffect(() => {
    fetchGenerationProvidersStatus()
      .then((status) => {
        setProvidersStatus(status);
        if (status.google_flow?.available) {
          setGenerationProvider("google_flow");
        } else if (status.gemini_api?.available) {
          setGenerationProvider("gemini_api");
        }
      })
      .catch((err) => console.warn("Failed to fetch provider status:", err));
  }, []);

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
      setConnectionSuccess(
        "Credential safely recovered and re-encrypted with active master key.",
      );
    } catch (err: any) {
      setConnectionError(err.message || "Failed to recover credential.");
    }
  };

  const handleResetProfile = async () => {
    setShowResetConfirm(false);
    try {
      await resetProfile();
      setConnectionSuccess(
        "Dedicated Google Flow browser profile reset. Sign in again via Open Browser.",
      );
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
        setConnectionSuccess(
          "Verification checks complete. Worker and browser session are responsive.",
        );
      } else {
        setConnectionError(
          "Worker is offline on loopback (http://127.0.0.1:4177). Please start the worker.",
        );
      }
    } catch (err: any) {
      setConnectionError(err.message || "Verification check failed.");
    } finally {
      setIsVerifyingWizard(false);
    }
  };

  const handleCopyStartupCommand = async () => {
    try {
      await navigator.clipboard.writeText(
        "cd flow-worker\nnpm install\nnpm start",
      );
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
  // Direct Generation & Batch Production Studio Handlers
  // ----------------------------------------------------
  const handleGenerateSceneBackground = async (sceneId: string) => {
    if (!selectedStoryId) return;
    setGeneratingSceneIds((prev) => ({ ...prev, [sceneId]: true }));
    setSceneErrors((prev) => {
      const next = { ...prev };
      delete next[sceneId];
      return next;
    });
    try {
      const customPrompt = sceneCustomPrompts[sceneId];
      const res = await generateBackgroundDirect({
        storyId: selectedStoryId,
        sceneId,
        provider: generationProvider,
        promptOverride: customPrompt?.trim() || undefined,
        aspectRatio: storyContext?.story?.aspectRatio || "16:9",
      });

      // Poll if job is processing asynchronously in Flow Worker
      if (res?.jobId && res?.status === "generating") {
        let completed = false;
        const timeoutMs = 90000;
        const pollStart = Date.now();

        while (!completed) {
          if (Date.now() - pollStart > timeoutMs) {
            console.warn(
              "UI timeout reached while generation job is still active on server.",
            );
            break;
          }

          const job = await fetchGenerationJob(res.jobId);
          switch (job?.status) {
            case "completed":
              completed = true;
              break;
            case "failed":
              throw new Error(
                job?.error || "Google Flow background generation failed.",
              );
            case "cancelled":
              throw new Error("Google Flow generation was cancelled.");
            default:
              await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }
      }

      await loadStoryContext(selectedStoryId);
    } catch (err: any) {
      setSceneErrors((prev) => ({
        ...prev,
        [sceneId]: err.message || "Background generation failed.",
      }));
    } finally {
      setGeneratingSceneIds((prev) => ({ ...prev, [sceneId]: false }));
    }
  };

  const handleSyncCharacterToFlow = async (characterId: string) => {
    if (!selectedStoryId) return;
    setSyncingCharIds((prev) => ({ ...prev, [characterId]: true }));
    setCharErrors((prev) => {
      const next = { ...prev };
      delete next[characterId];
      return next;
    });
    try {
      const res = await syncCharacterToGoogleFlowDirect(
        selectedStoryId,
        characterId,
      );
      await loadStoryContext(selectedStoryId);
      setBatchCharSummary(
        res.message || "Character synchronized with Google Flow.",
      );
      setTimeout(() => setBatchCharSummary(null), 5000);
    } catch (err: any) {
      setCharErrors((prev) => ({
        ...prev,
        [characterId]: err.message || "Character synchronization failed.",
      }));
    } finally {
      setSyncingCharIds((prev) => ({ ...prev, [characterId]: false }));
    }
  };

  const handleBatchGenerateMissingBackgrounds = async () => {
    if (!selectedStoryId) return;
    setIsBatchBgRunning(true);
    setBatchBgSummary(null);
    try {
      const res = await generateAllMissingBackgroundsDirect(
        selectedStoryId,
        generationProvider,
      );
      setBatchBgSummary(
        `Batch generation finished: ${res.generated} created, ${res.failed} failed out of ${res.total} missing scenes.`,
      );
      await loadStoryContext(selectedStoryId);
    } catch (err: any) {
      setBatchBgSummary(`Batch generation failed: ${err.message}`);
    } finally {
      setIsBatchBgRunning(false);
    }
  };

  const handleGenerateSelectedBackgrounds = async () => {
    if (!selectedStoryId || selectedSceneIdsForBatch.length === 0) return;
    setIsBatchBgRunning(true);
    setBatchBgSummary(null);
    let succ = 0;
    let fail = 0;
    for (const scId of selectedSceneIdsForBatch) {
      try {
        await generateBackgroundDirect({
          storyId: selectedStoryId,
          sceneId: scId,
          provider: generationProvider,
          promptOverride: sceneCustomPrompts[scId]?.trim() || undefined,
          aspectRatio: storyContext?.story?.aspectRatio || "16:9",
        });
        succ++;
      } catch {
        fail++;
      }
    }
    setBatchBgSummary(
      `Batch selected finished: ${succ} generated, ${fail} failed.`,
    );
    setSelectedSceneIdsForBatch([]);
    await loadStoryContext(selectedStoryId);
    setIsBatchBgRunning(false);
  };

  const handleGenerateCharacterAsset = async (
    characterId: string,
    assetType:
      | "master_reference"
      | "turnaround"
      | "expression"
      | "pose" = "master_reference",
    variation?: string,
  ) => {
    if (!selectedStoryId) return;
    setGeneratingCharIds((prev) => ({ ...prev, [characterId]: true }));
    setCharErrors((prev) => {
      const next = { ...prev };
      delete next[characterId];
      return next;
    });
    try {
      const res = await generateCharacterAssetDirect({
        storyId: selectedStoryId,
        characterId,
        provider: generationProvider,
        assetType,
        variation,
      });

      if (res?.jobId && res?.status === "generating") {
        let completed = false;
        const timeoutMs = 90000;
        const pollStart = Date.now();

        while (!completed) {
          if (Date.now() - pollStart > timeoutMs) {
            console.warn(
              "UI timeout reached while character generation job is still active on server.",
            );
            break;
          }

          const job = await fetchGenerationJob(res.jobId);
          switch (job?.status) {
            case "completed":
              completed = true;
              break;
            case "failed":
              throw new Error(
                job?.error || "Google Flow character generation failed.",
              );
            case "cancelled":
              throw new Error("Google Flow generation was cancelled.");
            default:
              await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }
      }

      await loadStoryContext(selectedStoryId);
      getAllCharacters().then(setCharacters);
    } catch (err: any) {
      setCharErrors((prev) => ({
        ...prev,
        [characterId]: err.message || "Character generation failed.",
      }));
    } finally {
      setGeneratingCharIds((prev) => ({ ...prev, [characterId]: false }));
    }
  };

  const handleBatchGenerateMissingCharacters = async () => {
    if (!selectedStoryId) return;
    setIsBatchCharRunning(true);
    setBatchCharSummary(null);
    try {
      const res = await generateAllMissingCharacterReferencesDirect(
        selectedStoryId,
        generationProvider,
      );
      setBatchCharSummary(
        `Batch generation finished: ${res.generated} master references created, ${res.failed} failed out of ${res.total} missing.`,
      );
      await loadStoryContext(selectedStoryId);
      getAllCharacters().then(setCharacters);
    } catch (err: any) {
      setBatchCharSummary(`Batch character generation failed: ${err.message}`);
    } finally {
      setIsBatchCharRunning(false);
    }
  };

  const toggleSceneSelectForBatch = (sceneId: string) => {
    setSelectedSceneIdsForBatch((prev) =>
      prev.includes(sceneId)
        ? prev.filter((id) => id !== sceneId)
        : [...prev, sceneId],
    );
  };

  const toggleSelectAllScenes = (scenesToToggle: StoryFlowSceneItem[]) => {
    if (selectedSceneIdsForBatch.length === scenesToToggle.length) {
      setSelectedSceneIdsForBatch([]);
    } else {
      setSelectedSceneIdsForBatch(scenesToToggle.map((sc) => sc.sceneId));
    }
  };

  const toggleSceneSettings = (sceneId: string) => {
    setExpandedSceneSettings((prev) => ({
      ...prev,
      [sceneId]: !prev[sceneId],
    }));
  };

  // ----------------------------------------------------
  // Selected Character for Section D
  // ----------------------------------------------------
  const selectedCharacter = selectedCharacterId
    ? (storyContext?.characters || []).find(
        (c) => c.id === selectedCharacterId,
      ) ||
      (!selectedStoryId
        ? characters.find((c) => c.id === selectedCharacterId) || null
        : null)
    : null;

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
            {activeTab === "character" &&
              selectedStoryId &&
              storyContext?.characters &&
              storyContext.characters.length > 0 && (
                <span style={{ marginLeft: "12px" }}>
                  Active Character:{" "}
                  <strong>
                    {storyContext.characters.find(
                      (c) => c.id === selectedCharacterId,
                    )?.name || storyContext.characters[0].name}
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
            <div
              className={`flow-wizard-step ${workerHealth?.online ? "completed" : "active"}`}
            >
              <div className="flow-step-header">
                <div className="flow-step-title-group">
                  <div className="flow-step-number">1</div>
                  <h3 className="flow-step-title">
                    Requirements & Loopback Networking
                  </h3>
                </div>
                <span
                  className={`flow-status-badge ${workerHealth?.online ? "online" : "neutral"}`}
                >
                  <span
                    className={`flow-status-dot ${workerHealth?.online ? "green" : "gray"}`}
                  />
                  {workerHealth?.online ? "Port 4177 Online" : "Loopback Ready"}
                </span>
              </div>
              <div className="flow-step-body">
                <p>
                  Google Flow integration communicates securely via a loopback
                  Playwright worker running locally at{" "}
                  <code>http://127.0.0.1:4177</code>. Ensure Node.js (v18+) is
                  installed on this laptop.
                </p>
                <div className="flow-checklist">
                  <div
                    className={`flow-checklist-item ${workerHealth?.online ? "pass" : "pending"}`}
                  >
                    <span>{workerHealth?.online ? "✓" : "○"}</span>
                    <span>
                      Loopback Worker (127.0.0.1:4177):{" "}
                      {workerHealth?.online
                        ? `Online (${workerHealth.latencyMs}ms)`
                        : "Offline (Start in step 4)"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2: Browser Selection */}
            <div className="flow-wizard-step completed">
              <div className="flow-step-header">
                <div className="flow-step-title-group">
                  <div className="flow-step-number">2</div>
                  <h3 className="flow-step-title">
                    Choose Browser Engine Channel
                  </h3>
                </div>
                <span className="flow-tab-badge">Configured</span>
              </div>
              <div className="flow-step-body">
                <p>
                  We recommend using your installed Google Chrome browser for
                  the highest compatibility with Google Flow.
                </p>
                <div
                  style={{
                    display: "flex",
                    gap: "12px",
                    flexWrap: "wrap",
                    marginTop: "4px",
                  }}
                >
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
                  <h3 className="flow-step-title">
                    Dedicated Persistent Chrome Profile
                  </h3>
                </div>
                <span className="flow-tab-badge">Isolated & Secure</span>
              </div>
              <div className="flow-step-body">
                <p>
                  To keep you signed in without automating passwords or
                  CAPTCHAs, Playwright runs inside a dedicated, isolated browser
                  directory:
                </p>
                <div className="flow-code-block">
                  {session?.configuredProfileDir ||
                    workerHealth?.profileDir ||
                    "C:\\Users\\...\\AppData\\Local\\AIKidsContentStudio\\GoogleFlowChromeProfile"}
                </div>
                <div
                  className="flow-callout security"
                  style={{ marginTop: "6px" }}
                >
                  <strong>🔒 Privacy Protection:</strong>
                  <span>
                    Your everyday personal Chrome profile and browsing history
                    are NEVER touched or modified. Only session cookies inside
                    this dedicated studio profile are preserved across restarts.
                  </span>
                </div>
              </div>
            </div>

            {/* Step 4: Worker Startup Command */}
            <div
              className={`flow-wizard-step ${workerHealth?.online ? "completed" : "active"}`}
            >
              <div className="flow-step-header">
                <div className="flow-step-title-group">
                  <div className="flow-step-number">4</div>
                  <h3 className="flow-step-title">
                    Start the Local Playwright Worker
                  </h3>
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
                  In a terminal window on your computer, navigate to the{" "}
                  <code>flow-worker</code> directory and run:
                </p>
                <div
                  className="flow-code-block"
                  style={{ cursor: "pointer" }}
                  onClick={handleCopyStartupCommand}
                >
                  cd flow-worker
                  <br />
                  npm install
                  <br />
                  npm start
                </div>
                <span
                  style={{
                    fontSize: "11px",
                    color: "var(--color-text-secondary, #94a3b8)",
                  }}
                >
                  💡 The worker connects automatically to PostgreSQL to
                  provision its encrypted authorization token on launch.
                </span>
              </div>
            </div>

            {/* Step 5: Manual Google Sign-In */}
            <div
              className={`flow-wizard-step ${session?.googleAuthenticated ? "completed" : "active"}`}
            >
              <div className="flow-step-header">
                <div className="flow-step-title-group">
                  <div className="flow-step-number">5</div>
                  <h3 className="flow-step-title">
                    Sign In to Google (One-Time Manual Step)
                  </h3>
                </div>
                <span
                  className={`flow-status-badge ${session?.googleAuthenticated ? "online" : "neutral"}`}
                >
                  {session?.googleAuthenticated
                    ? "Authenticated"
                    : "Sign-In Required"}
                </span>
              </div>
              <div className="flow-step-body">
                <p>
                  Google prohibits automated logins. Click below to open a
                  visible browser window where you can sign in to your Google
                  account directly.
                </p>
                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    flexWrap: "wrap",
                    marginTop: "4px",
                  }}
                >
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
                <span
                  style={{
                    fontSize: "11px",
                    color: "var(--color-text-secondary, #94a3b8)",
                  }}
                >
                  Once signed in, the session persists in your dedicated profile
                  directory so you stay logged in.
                </span>
              </div>
            </div>

            {/* Step 6: Verify Setup */}
            <div className="flow-wizard-step">
              <div className="flow-step-header">
                <div className="flow-step-title-group">
                  <div className="flow-step-number">6</div>
                  <h3 className="flow-step-title">
                    Run Integration Health Checks
                  </h3>
                </div>
                <button
                  type="button"
                  className="flow-btn primary sm"
                  disabled={isVerifyingWizard}
                  onClick={handleRunWizardVerification}
                >
                  <CheckIcon size={13} />
                  <span>
                    {isVerifyingWizard ? "Verifying..." : "Run Verification"}
                  </span>
                </button>
              </div>
              <div className="flow-step-body">
                <p>
                  Verify that the worker, database encryption, and browser
                  session are functioning properly:
                </p>
                <div className="flow-checklist">
                  <div
                    className={`flow-checklist-item ${workerHealth?.online ? "pass" : "fail"}`}
                  >
                    <span>{workerHealth?.online ? "✓" : "✕"}</span>
                    <span>
                      Local Worker Service:{" "}
                      {workerHealth?.online
                        ? `Online (${workerHealth.latencyMs}ms)`
                        : "Offline"}
                    </span>
                  </div>
                  <div
                    className={`flow-checklist-item ${credentialStatus?.configured ? "pass" : "fail"}`}
                  >
                    <span>{credentialStatus?.configured ? "✓" : "✕"}</span>
                    <span>
                      Database Credential:{" "}
                      {credentialStatus?.configured
                        ? "Configured (PostgreSQL AES-256-GCM)"
                        : "Unconfigured"}
                    </span>
                  </div>
                  <div
                    className={`flow-checklist-item ${workerHealth?.credentialDecryptable ? "pass" : workerHealth?.credentialError ? "fail" : "pending"}`}
                  >
                    <span>
                      {workerHealth?.credentialDecryptable
                        ? "✓"
                        : workerHealth?.credentialError
                          ? "✕"
                          : "○"}
                    </span>
                    <span>
                      Credential Decryption:{" "}
                      {workerHealth?.credentialDecryptable
                        ? "Verified"
                        : workerHealth?.credentialError
                          ? "Decryption failed"
                          : "Pending verification"}
                    </span>
                  </div>
                  <div
                    className={`flow-checklist-item ${session?.browserRunning ? "pass" : "pending"}`}
                  >
                    <span>{session?.browserRunning ? "✓" : "○"}</span>
                    <span>
                      Browser Session:{" "}
                      {session?.browserRunning
                        ? "Running"
                        : "Closed (Will open on demand)"}
                    </span>
                  </div>
                  <div
                    className={`flow-checklist-item ${session?.googleAuthenticated ? "pass" : "pending"}`}
                  >
                    <span>{session?.googleAuthenticated ? "✓" : "○"}</span>
                    <span>
                      Google Authentication:{" "}
                      {session?.googleAuthenticated
                        ? "Authenticated"
                        : "Sign-in needed"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 7: Ready to Generate */}
            <div
              className={`flow-wizard-step ${workerHealth?.online ? "completed" : ""}`}
            >
              <div className="flow-step-header">
                <div className="flow-step-title-group">
                  <div className="flow-step-number">7</div>
                  <h3 className="flow-step-title">Start Generating Assets</h3>
                </div>
                <span className="flow-tab-badge">Ready</span>
              </div>
              <div className="flow-step-body">
                <p>
                  You are all set! Use the navigation tabs above or the
                  shortcuts below to generate environment backgrounds or
                  character views:
                </p>
                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    flexWrap: "wrap",
                    marginTop: "4px",
                  }}
                >
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
                <p>
                  One-click tools to resolve stalled workers, mismatched
                  encryption keys, or profile locks.
                </p>
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
                  <code>accounts.google.com/v3/signin/rejected</code>. To
                  resolve this:
                  <br />
                  1. Set <code>FLOW_BROWSER_CHANNEL=chrome</code> in your
                  settings to use installed Google Chrome.
                  <br />
                  2. Alternatively, sign in manually via the "Open Persistent
                  Flow Browser" button.
                  <br />
                  3. You can also generate in Google Flow manually and import
                  assets directly via Background Studio or Character Studio.
                </p>
              </div>
            </div>
          )}

          <div className="flow-grid-2col">
            {/* Left Column: Worker Controls & Credential Management */}
            <div
              style={{ display: "flex", flexDirection: "column", gap: "20px" }}
            >
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
                    <span className="sub">
                      Must bind to loopback (127.0.0.1)
                    </span>
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
                    <span className="sub">
                      Google Chrome installed vs Bundled Chromium
                    </span>
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
                    <span className="flow-diag-label">
                      Credential Configured
                    </span>
                    <span
                      className="flow-diag-value"
                      style={{
                        color: credentialStatus?.configured
                          ? "#10b981"
                          : "#f59e0b",
                      }}
                    >
                      {credentialStatus?.configured
                        ? "Yes (PostgreSQL AES-256-GCM)"
                        : "No"}
                    </span>
                  </div>

                  <div className="flow-diag-item">
                    <span className="flow-diag-label">
                      Master Encryption Key
                    </span>
                    <span
                      className="flow-diag-value"
                      style={{
                        color:
                          workerHealth?.masterKeyAvailable !== false
                            ? "#10b981"
                            : "#ef4444",
                      }}
                    >
                      {workerHealth?.masterKeyAvailable !== false
                        ? "Healthy (Active)"
                        : "Missing / Unreadable"}
                    </span>
                  </div>

                  <div className="flow-diag-item">
                    <span className="flow-diag-label">
                      Credential Decryption
                    </span>
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
                    <span className="flow-diag-label">
                      Worker Pairing Status
                    </span>
                    <span
                      className="flow-diag-value"
                      style={{
                        color:
                          credentialStatus?.metadata?.pairingStatus === "paired"
                            ? "#10b981"
                            : credentialStatus?.metadata?.pairingStatus ===
                                "awaiting_provisioning"
                              ? "#f59e0b"
                              : "#94a3b8",
                      }}
                    >
                      {credentialStatus?.metadata?.pairingStatus === "paired"
                        ? "Paired (Active)"
                        : credentialStatus?.metadata?.pairingStatus ===
                            "awaiting_provisioning"
                          ? "Awaiting Provisioning"
                          : "Unpaired"}
                    </span>
                  </div>

                  <div className="flow-diag-item">
                    <span className="flow-diag-label">
                      Worker Authentication
                    </span>
                    <span
                      className="flow-diag-value"
                      style={{
                        color: workerHealth?.isProvisioned
                          ? "#10b981"
                          : "#f59e0b",
                      }}
                    >
                      {workerHealth?.isProvisioned
                        ? "Verified"
                        : "Offline / Awaiting Provisioning"}
                    </span>
                  </div>
                </div>

                {workerHealth?.credentialDecryptable === false &&
                  workerHealth?.credentialError && (
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
                        <strong style={{ color: "#f87171" }}>
                          Decryption Recovery Required
                        </strong>
                        <p style={{ margin: "4px 0 8px 0", fontSize: "12px" }}>
                          The active master key cannot decrypt the existing
                          credential token ({workerHealth.credentialError}).
                          Click below to safely re-encrypt a fresh token with
                          zero impact to your browser profile.
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
                        Regenerating credentials creates a new token in
                        PostgreSQL. Any running worker sessions must be
                        reconnected to receive the new credential.
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
                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      flexWrap: "wrap",
                      marginTop: "12px",
                    }}
                  >
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
                  <span className="flow-diag-label">
                    Configured Profile Directory
                  </span>
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
                  <span className="flow-diag-label">
                    Profile Directory Exists
                  </span>
                  <span className="flow-diag-value">
                    {session?.profileDirExists !== undefined
                      ? session.profileDirExists
                        ? "Yes"
                        : "No (Created on launch)"
                      : "Checking..."}
                  </span>
                </div>

                <div className="flow-diag-item">
                  <span className="flow-diag-label">
                    Worker Controls Active Browser
                  </span>
                  <span className="flow-diag-value">
                    {session?.ownsActiveBrowser ? "Yes" : "No"}
                  </span>
                </div>

                <div className="flow-diag-item">
                  <span className="flow-diag-label">
                    Google Sign-in Required
                  </span>
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
                  <span className="flow-diag-value">
                    PostgreSQL (AES-256-GCM)
                  </span>
                </div>
              </div>

              <div
                className="flow-callout security"
                style={{ marginTop: "16px" }}
              >
                <strong>🔒 Security & Privacy Architecture:</strong>
                <span>
                  The worker binds exclusively to loopback (
                  <code>127.0.0.1</code>) and uses automated provisioning.
                  Credentials are never exposed to the frontend browser or
                  stored in plaintext. The browser session runs in a dedicated
                  persistent profile so your Google login is remembered across
                  studio restarts without automating passwords or CAPTCHAs.
                </span>
              </div>

              <div style={{ marginTop: "16px" }}>
                <strong
                  style={{
                    fontSize: "12px",
                    display: "block",
                    marginBottom: "6px",
                  }}
                >
                  1. Start the local worker process:
                </strong>
                <div
                  className="flow-code-block"
                  style={{ cursor: "pointer" }}
                  onClick={handleCopyStartupCommand}
                >
                  cd flow-worker
                  <br />
                  npm install
                  <br />
                  npm start
                </div>
              </div>

              <div>
                <strong
                  style={{
                    fontSize: "12px",
                    display: "block",
                    marginBottom: "6px",
                  }}
                >
                  2. Install Playwright Chromium (if not already installed):
                </strong>
                <div className="flow-code-block">
                  npx playwright install chromium
                </div>
              </div>

              <div>
                <strong
                  style={{
                    fontSize: "12px",
                    display: "block",
                    marginBottom: "6px",
                  }}
                >
                  3. Automated Provisioning Handshake:
                </strong>
                <div className="flow-code-block">
                  # The worker automatically provisions its bearer token from
                  PostgreSQL at startup.
                  <br /># No manual editing of FLOW_WORKER_TOKEN in .env is
                  required.
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
      {/* TAB 3: BACKGROUND STUDIO (STORY-AWARE SCENE GRID)    */}
      {/* ==================================================== */}
      {activeTab === "background" && (
        <div className="flow-tab-content">
          {(() => {
            const allScenes = storyContext?.scenes || [];
            const filteredScenes = allScenes.filter((sc) => {
              if (bgFilter === "ready") return sc.hasBackground;
              if (bgFilter === "missing") return !sc.hasBackground;
              return true;
            });
            const isAllFilteredSelected =
              filteredScenes.length > 0 &&
              filteredScenes.every((sc) =>
                selectedSceneIdsForBatch.includes(sc.sceneId),
              );

            return (
              <>
                {/* Production Studio Toolbar */}
                <div className="flow-production-toolbar">
                  {/* Top Bar: Story & Engine Selectors */}
                  <div className="flow-production-toolbar-top">
                    <div className="flow-toolbar-left-group">
                      <div className="flow-story-selector-box">
                        <label className="flow-toolbar-label">
                          <BookOpenIcon size={13} />
                          <span>Active Story</span>
                        </label>
                        <div className="flow-select-wrapper">
                          <select
                            className="flow-select flow-story-select"
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
                      </div>

                      <div className="flow-story-stat-badge">
                        <span>
                          {storyContext?.summary?.totalScenes || 0} Scenes
                        </span>
                        <span className="dot-divider">•</span>
                        <span>
                          {storyContext?.summary?.totalCharacters || 0}{" "}
                          Characters
                        </span>
                      </div>
                    </div>

                    <div className="flow-toolbar-right-group">
                      <div className="flow-engine-selector-box">
                        <label className="flow-toolbar-label">
                          <SparklesIcon size={13} />
                          <span>Generation Engine</span>
                        </label>
                        <div className="flow-select-wrapper">
                          <select
                            className="flow-select flow-provider-select"
                            value={generationProvider}
                            onChange={(e) =>
                              setGenerationProvider(e.target.value as any)
                            }
                          >
                            <option value="gemini_api">
                              ⚡ Gemini Imagen 3 (Direct Cloud API)
                            </option>
                            <option value="google_flow">
                              🤖 Google Flow (Loopback Playwright Worker)
                            </option>
                          </select>
                        </div>
                      </div>

                      <div className="flow-engine-status-box">
                        {generationProvider === "gemini_api" ? (
                          <span
                            className={`flow-provider-pill ${
                              providersStatus?.gemini_api?.available !== false
                                ? "ready"
                                : "offline"
                            }`}
                          >
                            <span className="flow-status-dot" />
                            <span>
                              {providersStatus?.gemini_api?.available !== false
                                ? "Gemini API Ready"
                                : "API Key Needed"}
                            </span>
                          </span>
                        ) : (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              flexWrap: "wrap",
                            }}
                          >
                            <span
                              className={`flow-provider-pill ${
                                workerHealth?.isProvisioned
                                  ? "ready"
                                  : "offline"
                              }`}
                            >
                              <span className="flow-status-dot" />
                              <span>
                                {workerHealth?.isProvisioned
                                  ? "Flow Worker Paired"
                                  : "Worker Offline"}
                              </span>
                            </span>
                            <button
                              type="button"
                              className="flow-btn secondary sm flow-open-browser-btn"
                              disabled={isSessionBusy}
                              onClick={() =>
                                openBrowser(effectiveProjectUrl || undefined)
                              }
                              title="Launch or bring up visible Google Flow companion browser"
                            >
                              <span>Open Flow Browser ↗</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bottom Bar: Filters & Batch Actions */}
                  <div className="flow-production-toolbar-bottom">
                    <div className="flow-toolbar-filter-group">
                      <div className="flow-segmented-control">
                        <button
                          type="button"
                          className={`flow-segment-btn ${bgFilter === "all" ? "active" : ""}`}
                          onClick={() => setBgFilter("all")}
                        >
                          All{" "}
                          <span className="flow-segment-count">
                            ({storyContext?.summary?.totalScenes || 0})
                          </span>
                        </button>
                        <button
                          type="button"
                          className={`flow-segment-btn ${bgFilter === "ready" ? "active" : ""}`}
                          onClick={() => setBgFilter("ready")}
                        >
                          Ready{" "}
                          <span className="flow-segment-count">
                            ({storyContext?.summary?.scenesWithBackground || 0})
                          </span>
                        </button>
                        <button
                          type="button"
                          className={`flow-segment-btn ${bgFilter === "missing" ? "active" : ""}`}
                          onClick={() => setBgFilter("missing")}
                        >
                          Missing{" "}
                          <span className="flow-segment-count">
                            (
                            {storyContext?.summary?.missingBackgroundCount || 0}
                            )
                          </span>
                        </button>
                      </div>

                      {allScenes.length > 0 && (
                        <label className="flow-select-all-label">
                          <input
                            type="checkbox"
                            className="flow-standard-checkbox"
                            checked={isAllFilteredSelected}
                            onChange={() =>
                              toggleSelectAllScenes(filteredScenes)
                            }
                          />
                          <span>Select All ({filteredScenes.length})</span>
                        </label>
                      )}
                    </div>

                    <div className="flow-toolbar-actions-group">
                      {selectedSceneIdsForBatch.length > 0 && (
                        <button
                          type="button"
                          className="flow-btn secondary sm"
                          disabled={isBatchBgRunning}
                          onClick={handleGenerateSelectedBackgrounds}
                        >
                          <span>
                            ↻ Regenerate Selected (
                            {selectedSceneIdsForBatch.length})
                          </span>
                        </button>
                      )}

                      <button
                        type="button"
                        className="flow-btn primary sm flow-batch-generate-btn"
                        disabled={
                          isBatchBgRunning ||
                          (storyContext?.summary?.missingBackgroundCount ||
                            0) === 0
                        }
                        onClick={handleBatchGenerateMissingBackgrounds}
                      >
                        <SparklesIcon size={14} />
                        <span>
                          {isBatchBgRunning
                            ? "Generating..."
                            : `Generate All Missing (${storyContext?.summary?.missingBackgroundCount || 0})`}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Batch Status Message */}
                {batchBgSummary && (
                  <div
                    className="flow-callout info"
                    style={{ marginBottom: "12px" }}
                  >
                    <span>{batchBgSummary}</span>
                    <button
                      type="button"
                      className="flow-btn secondary sm"
                      style={{
                        marginLeft: "auto",
                        padding: "2px 8px",
                        fontSize: "11px",
                      }}
                      onClick={() => setBatchBgSummary(null)}
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {/* Context Loading / Error */}
                {isLoadingStoryContext && (
                  <div
                    className="flow-card"
                    style={{ textAlign: "center", padding: "30px" }}
                  >
                    <SparklesIcon size={24} color="#8b5cf6" />
                    <p style={{ marginTop: "8px" }}>
                      Loading scenes from PostgreSQL story context...
                    </p>
                  </div>
                )}

                {storyContextError && (
                  <div className="flow-callout warning">
                    <AlertTriangleIcon size={14} />
                    <span>{storyContextError}</span>
                    <button
                      type="button"
                      className="flow-btn secondary sm"
                      onClick={() =>
                        selectedStoryId && loadStoryContext(selectedStoryId)
                      }
                    >
                      Retry
                    </button>
                  </div>
                )}

                {/* Scene Cards Grid */}
                {!isLoadingStoryContext && filteredScenes.length === 0 ? (
                  <div
                    className="flow-card"
                    style={{ textAlign: "center", padding: "40px" }}
                  >
                    <ImageIcon size={32} color="#64748b" />
                    <h4
                      style={{ marginTop: "10px", color: "var(--color-text)" }}
                    >
                      No scenes found
                    </h4>
                    <p
                      style={{
                        fontSize: "13px",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      {bgFilter !== "all"
                        ? `No scenes match the "${bgFilter}" filter.`
                        : "This story has no scenes created yet. Add scenes in the Story Editor to generate backgrounds."}
                    </p>
                    {bgFilter !== "all" ? (
                      <button
                        type="button"
                        className="flow-btn secondary sm"
                        style={{ marginTop: "12px" }}
                        onClick={() => setBgFilter("all")}
                      >
                        Show All Scenes
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="flow-btn primary sm"
                        style={{ marginTop: "12px" }}
                        onClick={() => navigate(`/editor/${selectedStoryId}`)}
                      >
                        Open Story Editor ↗
                      </button>
                    )}
                  </div>
                ) : (
                  !isLoadingStoryContext && (
                    <div className="flow-scene-grid">
                      {filteredScenes.map((sc) => {
                        const isGenerating = Boolean(
                          generatingSceneIds[sc.sceneId],
                        );
                        const isSelected = selectedSceneIdsForBatch.includes(
                          sc.sceneId,
                        );
                        const isSettingsOpen = Boolean(
                          expandedSceneSettings[sc.sceneId],
                        );
                        const error = sceneErrors[sc.sceneId];
                        const cleanDirection = cleanScriptText(
                          sc.visualPrompt ||
                            sc.narration ||
                            sc.environmentDescription,
                        );

                        return (
                          <div
                            key={sc.sceneId}
                            className={`flow-scene-card ${isSelected ? "selected" : ""} ${
                              isGenerating ? "generating" : ""
                            }`}
                          >
                            {/* Card Header */}
                            <div className="flow-scene-card-header">
                              <div className="flow-scene-header-left">
                                <input
                                  type="checkbox"
                                  className="flow-standard-checkbox"
                                  checked={isSelected}
                                  onChange={() =>
                                    toggleSceneSelectForBatch(sc.sceneId)
                                  }
                                  title="Select for batch regeneration"
                                />
                                <span className="flow-scene-num-badge">
                                  Scene {sc.number}
                                </span>
                                <span
                                  className="flow-scene-title"
                                  title={sc.title || "Untitled"}
                                >
                                  {sc.title || "Untitled"}
                                </span>
                              </div>
                              <span
                                className={`flow-status-badge ${sc.hasBackground ? "ready" : "missing"}`}
                              >
                                {sc.hasBackground
                                  ? "✓ Plate Ready"
                                  : "● Missing Plate"}
                              </span>
                            </div>

                            {/* Thumbnail Area */}
                            <div className="flow-scene-thumb">
                              {isGenerating ? (
                                <div className="flow-scene-generating-thumb">
                                  <div className="flow-generating-spinner" />
                                  <span className="flow-generating-title">
                                    Synthesizing Plate...
                                  </span>
                                  <small className="flow-generating-sub">
                                    {generationProvider === "gemini_api"
                                      ? "Rendering Imagen 3 backdrop"
                                      : "Automating Google Flow canvas"}
                                  </small>
                                </div>
                              ) : sc.backgroundUrl ? (
                                <div
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    position: "relative",
                                    cursor: "pointer",
                                  }}
                                  onClick={() =>
                                    setPreviewAsset({
                                      url: sc.backgroundUrl!,
                                      title: `Scene ${sc.number}: ${sc.title || "Untitled Scene"}`,
                                      subtitle: `${sc.location} • ${sc.timeOfDay} • ${sc.lighting}`,
                                      aspectRatio: sc.aspectRatio,
                                      sceneId: sc.sceneId,
                                      type: "background",
                                    })
                                  }
                                  title="Click to view enlarged high-resolution preview"
                                >
                                  <img
                                    src={sc.backgroundUrl}
                                    alt={sc.title || `Scene ${sc.number}`}
                                    onError={(e) => {
                                      (e.target as HTMLElement).style.display =
                                        "none";
                                      const parent = (e.target as HTMLElement)
                                        .parentElement;
                                      const fallback = parent?.querySelector(
                                        ".flow-thumb-fallback",
                                      ) as HTMLElement;
                                      if (fallback)
                                        fallback.style.display = "flex";
                                    }}
                                  />
                                  <div
                                    className="flow-thumb-fallback"
                                    style={{ display: "none" }}
                                  >
                                    <ImageIcon size={22} color="#f59e0b" />
                                    <span
                                      style={{
                                        fontSize: "11px",
                                        fontWeight: 600,
                                      }}
                                    >
                                      Image Load Failed
                                    </span>
                                    <small
                                      style={{
                                        fontSize: "10px",
                                        color: "var(--color-text-secondary)",
                                      }}
                                    >
                                      Click to view or regenerate
                                    </small>
                                  </div>
                                  <div className="flow-thumb-hover-overlay">
                                    <span>🔍 Enlarge Preview</span>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  className="flow-scene-empty-thumb"
                                  onClick={() =>
                                    handleGenerateSceneBackground(sc.sceneId)
                                  }
                                  title="Click to generate this background plate"
                                >
                                  <div className="flow-empty-plate-icon-wrap">
                                    <svg
                                      width="30"
                                      height="30"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="1.6"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
                                      <circle cx="17.5" cy="6.5" r="2.5" />
                                    </svg>
                                  </div>
                                  <span className="flow-empty-plate-badge">
                                    No Background Plate
                                  </span>
                                  <small className="flow-empty-plate-desc">
                                    Character-free environment backdrop
                                  </small>
                                  <span className="flow-empty-plate-action">
                                    Click to Generate Plate ⚡
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Card Body */}
                            <div className="flow-scene-body">
                              {/* Metadata Chips */}
                              <div className="flow-scene-tags">
                                <span className="flow-tag" title="Location">
                                  📍 {sc.location}
                                </span>
                                <span className="flow-tag" title="Time of Day">
                                  ☀️ {sc.timeOfDay}
                                </span>
                                <span className="flow-tag" title="Lighting">
                                  💡 {sc.lighting}
                                </span>
                                <span className="flow-tag" title="Weather">
                                  🌧️ {sc.weather}
                                </span>
                                <span className="flow-tag" title="Aspect Ratio">
                                  📐 {sc.aspectRatio}
                                </span>
                              </div>

                              {/* Direction / Narration Preview */}
                              <div
                                className="flow-scene-direction"
                                title={cleanDirection}
                              >
                                <span className="flow-direction-label">
                                  🎬 Visual Direction:
                                </span>
                                <p className="flow-direction-text">
                                  "
                                  {cleanDirection ||
                                    "Atmospheric scenery matching visual look."}
                                  "
                                </p>
                              </div>

                              {/* Characters in Scene */}
                              <div className="flow-scene-characters">
                                <UsersIcon size={12} />
                                <span className="flow-char-label">Cast:</span>
                                {sc.charactersInScene.length > 0 ? (
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: "5px",
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    {sc.charactersInScene.map((c) => (
                                      <span
                                        key={c.id}
                                        className="flow-char-pill"
                                      >
                                        👤 {c.name}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="flow-char-empty-tag">
                                    🎙️ Voice-Over Narration • Zero Characters on
                                    Plate
                                  </span>
                                )}
                              </div>

                              {/* Error Banner */}
                              {error && (
                                <div className="flow-scene-error">
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "6px",
                                      minWidth: 0,
                                    }}
                                  >
                                    <span>⚠️</span>
                                    <span
                                      className="flow-error-text"
                                      title={error}
                                    >
                                      {error}
                                    </span>
                                  </div>
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: "6px",
                                      flexShrink: 0,
                                    }}
                                  >
                                    <button
                                      type="button"
                                      className="flow-btn danger sm"
                                      onClick={async () => {
                                        if (
                                          error
                                            ?.toLowerCase()
                                            .includes("flow worker") ||
                                          error
                                            ?.toLowerCase()
                                            .includes("bearer token")
                                        ) {
                                          try {
                                            await reconnectWorker();
                                          } catch {}
                                        }
                                        await handleGenerateSceneBackground(
                                          sc.sceneId,
                                        );
                                      }}
                                    >
                                      Retry
                                    </button>
                                    {(error?.includes("active") ||
                                      error?.includes("stuck") ||
                                      error?.includes("lock")) && (
                                      <button
                                        type="button"
                                        className="flow-btn secondary sm"
                                        onClick={async () => {
                                          try {
                                            await cancelActiveFlowJob();
                                            if (selectedStoryId)
                                              await loadStoryContext(
                                                selectedStoryId,
                                              );
                                            setSceneErrors((prev) => {
                                              const next = { ...prev };
                                              delete next[sc.sceneId];
                                              return next;
                                            });
                                          } catch {}
                                        }}
                                        title="Cancel stuck job and release worker lock"
                                      >
                                        Clear Lock
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Card Footer Actions */}
                            <div className="flow-scene-card-footer">
                              <button
                                type="button"
                                className="flow-btn primary sm"
                                disabled={isGenerating || isBatchBgRunning}
                                onClick={() =>
                                  handleGenerateSceneBackground(sc.sceneId)
                                }
                                title={`Generate character-free plate using ${
                                  generationProvider === "gemini_api"
                                    ? "Gemini Imagen 3"
                                    : "Google Flow"
                                }`}
                              >
                                <SparklesIcon size={13} />
                                <span>
                                  {isGenerating
                                    ? "Generating..."
                                    : sc.hasBackground
                                      ? "↻ Regenerate"
                                      : "✨ Generate Plate"}
                                </span>
                              </button>

                              <div style={{ display: "flex", gap: "6px" }}>
                                <button
                                  type="button"
                                  className={`flow-btn secondary sm ${sceneCustomPrompts[sc.sceneId]?.trim() ? "active" : ""}`}
                                  onClick={() =>
                                    setActiveDirectivesSceneId(sc.sceneId)
                                  }
                                  title="View / Customize prompt directives in dedicated modal"
                                >
                                  <SettingsIcon size={13} />
                                  <span>Directives</span>
                                  {sceneCustomPrompts[sc.sceneId]?.trim() && (
                                    <span
                                      className="flow-active-dot"
                                      title="Custom override active"
                                    />
                                  )}
                                </button>

                                <button
                                  type="button"
                                  className="flow-btn secondary sm"
                                  onClick={() =>
                                    navigate(
                                      `/editor/${selectedStoryId}?sceneId=${sc.sceneId}`,
                                    )
                                  }
                                  title="Open scene in Story Editor"
                                >
                                  <span>Editor ↗</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 4: CHARACTER STUDIO (STORY-AWARE CHARACTER VIEWS) */}
      {/* ==================================================== */}
      {activeTab === "character" && (
        <div className="flow-tab-content">
          {(() => {
            const allCharacters = storyContext?.characters || [];
            const filteredCharacters = allCharacters.filter((ch) => {
              if (charFilter === "ready") return ch.hasMasterReference;
              if (charFilter === "missing") return !ch.hasMasterReference;
              return true;
            });

            return (
              <>
                {/* Production Toolbar */}
                <div className="flow-production-toolbar">
                  {/* Top Bar */}
                  <div className="flow-production-toolbar-top">
                    <div className="flow-toolbar-left-group">
                      <div className="flow-story-selector-box">
                        <label className="flow-toolbar-label">
                          <BookOpenIcon size={13} />
                          <span>Active Story</span>
                        </label>
                        <div className="flow-select-wrapper">
                          <select
                            className="flow-select flow-story-select"
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
                      </div>

                      <div className="flow-story-stat-badge">
                        <span>{allCharacters.length} Characters</span>
                        <span className="dot-divider">•</span>
                        <span>
                          {storyContext?.summary
                            ?.charactersWithMasterReference || 0}{" "}
                          Canonical References
                        </span>
                      </div>
                    </div>

                    <div className="flow-toolbar-right-group">
                      <div className="flow-engine-selector-box">
                        <label className="flow-toolbar-label">
                          <SparklesIcon size={13} />
                          <span>Generation Engine</span>
                        </label>
                        <div className="flow-select-wrapper">
                          <select
                            className="flow-select flow-provider-select"
                            value={generationProvider}
                            onChange={(e) =>
                              setGenerationProvider(e.target.value as any)
                            }
                          >
                            <option value="gemini_api">
                              ⚡ Gemini Imagen 3 (Direct Cloud API)
                            </option>
                            <option value="google_flow">
                              🤖 Google Flow (Loopback Playwright Worker)
                            </option>
                          </select>
                        </div>
                      </div>

                      <div className="flow-engine-status-box">
                        {generationProvider === "gemini_api" ? (
                          <span
                            className={`flow-provider-pill ${
                              providersStatus?.gemini_api?.available !== false
                                ? "ready"
                                : "offline"
                            }`}
                          >
                            <span className="flow-status-dot" />
                            <span>
                              {providersStatus?.gemini_api?.available !== false
                                ? "Gemini API Ready"
                                : "API Key Needed"}
                            </span>
                          </span>
                        ) : (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              flexWrap: "wrap",
                            }}
                          >
                            <span
                              className={`flow-provider-pill ${
                                workerHealth?.isProvisioned
                                  ? "ready"
                                  : "offline"
                              }`}
                            >
                              <span className="flow-status-dot" />
                              <span>
                                {workerHealth?.isProvisioned
                                  ? "Flow Worker Paired"
                                  : "Worker Offline"}
                              </span>
                            </span>
                            <button
                              type="button"
                              className="flow-btn secondary sm flow-open-browser-btn"
                              disabled={isSessionBusy}
                              onClick={() =>
                                openBrowser(effectiveProjectUrl || undefined)
                              }
                              title="Launch or bring up visible Google Flow companion browser"
                            >
                              <span>Open Flow Browser ↗</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bottom Bar: Filters & Batch Action */}
                  <div className="flow-production-toolbar-bottom">
                    <div className="flow-toolbar-filter-group">
                      <div className="flow-segmented-control">
                        <button
                          type="button"
                          className={`flow-segment-btn ${charFilter === "all" ? "active" : ""}`}
                          onClick={() => setCharFilter("all")}
                        >
                          All{" "}
                          <span className="flow-segment-count">
                            ({allCharacters.length})
                          </span>
                        </button>
                        <button
                          type="button"
                          className={`flow-segment-btn ${charFilter === "ready" ? "active" : ""}`}
                          onClick={() => setCharFilter("ready")}
                        >
                          Master Ready{" "}
                          <span className="flow-segment-count">
                            (
                            {storyContext?.summary
                              ?.charactersWithMasterReference || 0}
                            )
                          </span>
                        </button>
                        <button
                          type="button"
                          className={`flow-segment-btn ${charFilter === "missing" ? "active" : ""}`}
                          onClick={() => setCharFilter("missing")}
                        >
                          Missing Ref{" "}
                          <span className="flow-segment-count">
                            ({storyContext?.summary?.missingReferenceCount || 0}
                            )
                          </span>
                        </button>
                      </div>
                    </div>

                    <div className="flow-toolbar-actions-group">
                      <button
                        type="button"
                        className="flow-btn primary sm flow-batch-generate-btn"
                        disabled={
                          isBatchCharRunning ||
                          (storyContext?.summary?.missingReferenceCount ||
                            0) === 0
                        }
                        onClick={handleBatchGenerateMissingCharacters}
                      >
                        <SparklesIcon size={14} />
                        <span>
                          {isBatchCharRunning
                            ? "Generating..."
                            : `Generate All Missing References (${storyContext?.summary?.missingReferenceCount || 0})`}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Batch Status Message */}
                {batchCharSummary && (
                  <div
                    className="flow-callout info"
                    style={{ marginBottom: "12px" }}
                  >
                    <span>{batchCharSummary}</span>
                    <button
                      type="button"
                      className="flow-btn secondary sm"
                      style={{
                        marginLeft: "auto",
                        padding: "2px 8px",
                        fontSize: "11px",
                      }}
                      onClick={() => setBatchCharSummary(null)}
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {/* Context Loading / Error */}
                {isLoadingStoryContext && (
                  <div
                    className="flow-card"
                    style={{ textAlign: "center", padding: "30px" }}
                  >
                    <SparklesIcon size={24} color="#8b5cf6" />
                    <p style={{ marginTop: "8px" }}>
                      Loading characters from PostgreSQL story context...
                    </p>
                  </div>
                )}

                {/* Character Gallery Grid */}
                {!isLoadingStoryContext && allCharacters.length === 0 ? (
                  <div
                    className="flow-card"
                    style={{ textAlign: "center", padding: "40px" }}
                  >
                    <UsersIcon size={32} color="#64748b" />
                    <h4
                      style={{ marginTop: "10px", color: "var(--color-text)" }}
                    >
                      No characters found in this story
                    </h4>
                    <p
                      style={{
                        fontSize: "13px",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      Add or link characters to this story in Character Studio
                      or the Story Editor.
                    </p>
                    <button
                      type="button"
                      className="flow-btn primary sm"
                      style={{ marginTop: "12px" }}
                      onClick={() => navigate("/characters")}
                    >
                      Open Character Studio ↗
                    </button>
                  </div>
                ) : (
                  !isLoadingStoryContext && (
                    <div className="flow-char-grid">
                      {filteredCharacters.map((ch) => {
                        const isGenerating = Boolean(generatingCharIds[ch.id]);
                        const error = charErrors[ch.id];

                        return (
                          <div key={ch.id} className="flow-char-card">
                            {/* Top Row: Portrait + Details */}
                            <div className="flow-char-card-top">
                              <div className="flow-char-portrait">
                                {isGenerating ? (
                                  <div
                                    className="flow-scene-generating-thumb"
                                    style={{ borderRadius: "10px" }}
                                  >
                                    <div
                                      className="flow-generating-spinner"
                                      style={{
                                        width: "22px",
                                        height: "22px",
                                        borderWidth: "2px",
                                      }}
                                    />
                                    <small
                                      style={{
                                        fontSize: "9px",
                                        color: "#cbd5e1",
                                      }}
                                    >
                                      Rendering...
                                    </small>
                                  </div>
                                ) : ch.referenceImageUrl ? (
                                  <div
                                    style={{
                                      width: "100%",
                                      height: "100%",
                                      position: "relative",
                                      cursor: "pointer",
                                    }}
                                    onClick={() =>
                                      setPreviewAsset({
                                        url: ch.referenceImageUrl!,
                                        title: ch.name,
                                        subtitle: `${ch.species || "Character"} • Canonical Master Reference`,
                                        characterId: ch.id,
                                        type: "character",
                                      })
                                    }
                                    title="Click to view enlarged master reference"
                                  >
                                    <img
                                      src={ch.referenceImageUrl}
                                      alt={ch.name}
                                      onError={(e) => {
                                        (
                                          e.target as HTMLElement
                                        ).style.display = "none";
                                        const parent = (e.target as HTMLElement)
                                          .parentElement;
                                        const fallback = parent?.querySelector(
                                          ".flow-thumb-fallback",
                                        ) as HTMLElement;
                                        if (fallback)
                                          fallback.style.display = "flex";
                                      }}
                                    />
                                    <div
                                      className="flow-thumb-fallback"
                                      style={{ display: "none" }}
                                    >
                                      <UsersIcon size={18} color="#f59e0b" />
                                      <small style={{ fontSize: "8px" }}>
                                        Load Error
                                      </small>
                                    </div>
                                    <div className="flow-thumb-hover-overlay">
                                      <span>🔍</span>
                                    </div>
                                  </div>
                                ) : (
                                  <div
                                    className="flow-char-empty-portrait"
                                    onClick={() =>
                                      handleGenerateCharacterAsset(
                                        ch.id,
                                        "master_reference",
                                      )
                                    }
                                    title="Click to generate master reference"
                                  >
                                    <UsersIcon size={24} color="#818cf8" />
                                    <small>No Ref</small>
                                    <span
                                      style={{
                                        fontSize: "8.5px",
                                        color: "#a78bfa",
                                        fontWeight: 700,
                                      }}
                                    >
                                      Generate ⚡
                                    </span>
                                  </div>
                                )}
                              </div>

                              <div className="flow-char-info">
                                <div className="flow-char-name-row">
                                  <h4 className="flow-char-name">{ch.name}</h4>
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: "6px",
                                      alignItems: "center",
                                    }}
                                  >
                                    <span
                                      className={`flow-status-badge ${ch.hasMasterReference ? "ready" : "missing"}`}
                                    >
                                      {ch.hasMasterReference
                                        ? "✓ Master Ready"
                                        : "● Missing Ref"}
                                    </span>
                                    {ch.flowMapping?.syncStatus === "synced" ? (
                                      <span
                                        className="flow-status-badge ready"
                                        title={`Synced in Google Flow project as @${ch.flowMapping.flowCharacterName}`}
                                      >
                                        ✓ Flow: @
                                        {ch.flowMapping.flowCharacterName}
                                      </span>
                                    ) : ch.flowMapping?.syncStatus ===
                                      "failed" ? (
                                      <span
                                        className="flow-status-badge missing"
                                        title="Synchronization to Google Flow failed"
                                      >
                                        ⚠️ Sync Failed
                                      </span>
                                    ) : (
                                      <span
                                        className="flow-status-badge neutral"
                                        title="Not yet synchronized to Google Flow project"
                                      >
                                        ● Not in Flow
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flow-char-tags-row">
                                  <span className="flow-tag">
                                    👤 {ch.species || "Character"}
                                  </span>
                                  <span className="flow-tag">
                                    ✨ {ch.personality || "Friendly"}
                                  </span>
                                </div>

                                <div className="flow-char-description">
                                  <span
                                    style={{
                                      fontWeight: 600,
                                      color: "var(--color-text)",
                                    }}
                                  >
                                    Look:{" "}
                                  </span>
                                  {cleanScriptText(
                                    ch.visualDescription ||
                                      ch.distinctiveFeatures,
                                  ) || "Canonical cartoon look."}
                                </div>
                              </div>
                            </div>

                            {/* Database Scene Appearances */}
                            <div className="flow-char-scenes-list">
                              <span className="flow-char-scenes-header">
                                Appears in {ch.scenesCount} scene
                                {ch.scenesCount === 1 ? "" : "s"}:
                              </span>
                              {ch.scenesAppearedIn.length > 0 ? (
                                <div
                                  style={{
                                    display: "flex",
                                    gap: "6px",
                                    flexWrap: "wrap",
                                    marginTop: "2px",
                                  }}
                                >
                                  {ch.scenesAppearedIn.map((sc) => (
                                    <span
                                      key={sc.sceneId}
                                      className="flow-char-scene-chip"
                                      onClick={() =>
                                        navigate(
                                          `/editor/${selectedStoryId}?sceneId=${sc.sceneId}`,
                                        )
                                      }
                                      title="Click to jump to this scene in Story Editor"
                                    >
                                      Scene {sc.number}: {sc.title}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span
                                  style={{
                                    fontStyle: "italic",
                                    opacity: 0.75,
                                    fontSize: "11px",
                                  }}
                                >
                                  Not placed in any scene yet
                                </span>
                              )}
                            </div>

                            {/* Error Banner */}
                            {error && (
                              <div className="flow-char-error">
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    minWidth: 0,
                                  }}
                                >
                                  <span>⚠️</span>
                                  <span
                                    className="flow-error-text"
                                    title={error}
                                  >
                                    {error}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className="flow-btn danger sm"
                                  onClick={async () => {
                                    if (
                                      error
                                        ?.toLowerCase()
                                        .includes("flow worker") ||
                                      error
                                        ?.toLowerCase()
                                        .includes("bearer token")
                                    ) {
                                      try {
                                        await reconnectWorker();
                                      } catch {}
                                    }
                                    await handleGenerateCharacterAsset(
                                      ch.id,
                                      "master_reference",
                                    );
                                  }}
                                  style={{ flexShrink: 0 }}
                                >
                                  Retry
                                </button>
                              </div>
                            )}

                            {/* Actions Row */}
                            <div className="flow-char-actions">
                              <button
                                type="button"
                                className="flow-btn primary sm"
                                disabled={syncingCharIds[ch.id] || isGenerating}
                                onClick={() => handleSyncCharacterToFlow(ch.id)}
                                title="Synchronize this character and master reference into the connected Google Flow project"
                              >
                                <span>
                                  {syncingCharIds[ch.id]
                                    ? "Syncing..."
                                    : ch.flowMapping?.syncStatus === "synced"
                                      ? "↻ Resync Flow"
                                      : "⚡ Sync to Flow"}
                                </span>
                              </button>

                              <button
                                type="button"
                                className="flow-btn secondary sm"
                                disabled={isGenerating || isBatchCharRunning}
                                onClick={() =>
                                  handleGenerateCharacterAsset(
                                    ch.id,
                                    "master_reference",
                                  )
                                }
                                title="Generate canonical master reference portrait"
                              >
                                <SparklesIcon size={13} />
                                <span>
                                  {isGenerating
                                    ? "Generating..."
                                    : ch.hasMasterReference
                                      ? "↻ Redo Ref"
                                      : "✨ Generate Ref"}
                                </span>
                              </button>

                              <button
                                type="button"
                                className="flow-btn secondary sm"
                                disabled={
                                  !ch.hasMasterReference || isGenerating
                                }
                                onClick={() =>
                                  handleGenerateCharacterAsset(
                                    ch.id,
                                    "turnaround",
                                  )
                                }
                                title="Generate 8-way directional turnaround sheet"
                              >
                                <span>🔄 Turnaround</span>
                              </button>

                              <button
                                type="button"
                                className="flow-btn secondary sm"
                                onClick={() =>
                                  navigate(`/characters?characterId=${ch.id}`)
                                }
                                title="Open in Character Studio"
                              >
                                <span>Studio ↗</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                )}
              </>
            );
          })()}
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
              This action will close any active Google Flow browser instance and
              completely clear the dedicated profile directory:
            </p>
            <div className="flow-code-block">
              {session?.configuredProfileDir ||
                workerHealth?.profileDir ||
                "C:\\Users\\...\\AppData\\Local\\AIKidsContentStudio\\GoogleFlowChromeProfile"}
            </div>
            <p style={{ fontSize: "12px", color: "#f59e0b" }}>
              ⚠️ You will be signed out of your Google account inside this
              dedicated profile and will need to log in again via "Open
              Persistent Flow Browser".
            </p>
            <div className="flow-callout security" style={{ margin: 0 }}>
              <strong>🔒 Safe Guarantee:</strong>
              <span>
                Your everyday personal Google Chrome browser and personal data
                are completely unaffected.
              </span>
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

      {/* Lightbox / Enlarged Asset Preview Modal */}
      {previewAsset && (
        <div
          className="flow-lightbox-backdrop"
          onClick={() => setPreviewAsset(null)}
        >
          <div
            className="flow-lightbox-content"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flow-lightbox-header">
              <div className="flow-lightbox-title-box">
                <h3 className="flow-lightbox-title">{previewAsset.title}</h3>
                {previewAsset.subtitle && (
                  <p className="flow-lightbox-subtitle">
                    {previewAsset.subtitle}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="flow-lightbox-close"
                onClick={() => setPreviewAsset(null)}
                title="Close Preview (Esc)"
              >
                ✕
              </button>
            </div>

            {/* Viewing Canvas */}
            <div className="flow-lightbox-stage">
              <img
                src={previewAsset.url}
                alt={previewAsset.title}
                className="flow-lightbox-image"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                  const parent = (e.target as HTMLElement).parentElement;
                  const errorBox = parent?.querySelector(
                    ".flow-lightbox-error-box",
                  ) as HTMLElement;
                  if (errorBox) errorBox.style.display = "flex";
                }}
              />
              <div
                className="flow-lightbox-error-box"
                style={{ display: "none" }}
              >
                <AlertTriangleIcon size={32} color="#f59e0b" />
                <h4>Image Plate Not Accessible</h4>
                <p>
                  The image could not be loaded from storage or is incomplete.
                  Click below to regenerate this asset plate.
                </p>
                {previewAsset.type === "background" && previewAsset.sceneId && (
                  <button
                    type="button"
                    className="flow-btn primary sm"
                    onClick={() => {
                      const scId = previewAsset.sceneId!;
                      setPreviewAsset(null);
                      handleGenerateSceneBackground(scId);
                    }}
                  >
                    ⚡ Regenerate Background Plate
                  </button>
                )}
              </div>
            </div>

            {/* Footer with Metadata & Actions */}
            <div className="flow-lightbox-footer">
              <div className="flow-lightbox-meta">
                <span className="flow-status-badge ready">
                  {previewAsset.type === "background"
                    ? "✓ Scene Environment Plate"
                    : "✓ Master Character Reference"}
                </span>
                {previewAsset.aspectRatio && (
                  <span className="flow-tag" style={{ margin: 0 }}>
                    📐 {previewAsset.aspectRatio}
                  </span>
                )}
              </div>

              <div className="flow-lightbox-actions">
                <a
                  href={previewAsset.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flow-btn secondary sm"
                >
                  Open Full Image ↗
                </a>
                {previewAsset.type === "background" && previewAsset.sceneId && (
                  <button
                    type="button"
                    className="flow-btn primary sm"
                    onClick={() => {
                      const scId = previewAsset.sceneId!;
                      setPreviewAsset(null);
                      handleGenerateSceneBackground(scId);
                    }}
                  >
                    ↻ Regenerate Plate
                  </button>
                )}
                {previewAsset.type === "character" &&
                  previewAsset.characterId && (
                    <button
                      type="button"
                      className="flow-btn primary sm"
                      onClick={() => {
                        const cId = previewAsset.characterId!;
                        setPreviewAsset(null);
                        handleGenerateCharacterAsset(cId, "master_reference");
                      }}
                    >
                      ↻ Regenerate Reference
                    </button>
                  )}
                <button
                  type="button"
                  className="flow-btn secondary sm"
                  onClick={() => setPreviewAsset(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scene Directives & Prompt Studio Modal */}
      {activeDirectivesSceneId &&
        (() => {
          const activeScene = (storyContext?.scenes || []).find(
            (s) => s.sceneId === activeDirectivesSceneId,
          );
          if (!activeScene) return null;
          const cleanDirection = cleanScriptText(
            activeScene.visualPrompt ||
              activeScene.narration ||
              activeScene.environmentDescription,
          );
          const synthPrompt = `Create a cinematic 3D storybook illustration of ${activeScene.location}, ${activeScene.timeOfDay}. Storybook animation style, rich natural colors, soft ambient depth of field. ${activeScene.aspectRatio} composition, open central foreground for character animation. Environment backdrop only. No characters, people, figures, text, captions, subtitles, logos or watermarks.`;

          return (
            <div
              className="flow-modal-overlay"
              onClick={() => setActiveDirectivesSceneId(null)}
            >
              <div
                className="flow-modal flow-directives-modal"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flow-directives-modal-header">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <span className="flow-scene-num-badge">
                      Scene {activeScene.number}
                    </span>
                    <h3
                      style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}
                    >
                      {activeScene.title || "Untitled Scene"} — Directives
                    </h3>
                  </div>
                  <button
                    type="button"
                    className="flow-btn-ghost sm"
                    onClick={() => setActiveDirectivesSceneId(null)}
                    style={{ fontSize: "14px", padding: "4px 8px" }}
                  >
                    ✕
                  </button>
                </div>

                {/* Story Context summary pill */}
                <div className="flow-directives-meta-bar">
                  <span className="flow-tag">📍 {activeScene.location}</span>
                  <span className="flow-tag">☀️ {activeScene.timeOfDay}</span>
                  <span className="flow-tag">💡 {activeScene.lighting}</span>
                  <span className="flow-tag">🌧️ {activeScene.weather}</span>
                  <span className="flow-tag">📐 {activeScene.aspectRatio}</span>
                </div>

                {/* Visual Direction Narrative */}
                <div className="flow-directives-section">
                  <label className="flow-toolbar-label">
                    <span>🎬 Script Visual Direction</span>
                  </label>
                  <div className="flow-scene-direction" style={{ margin: 0 }}>
                    <p
                      className="flow-direction-text"
                      style={{
                        WebkitLineClamp: "unset",
                        maxHeight: "80px",
                        overflowY: "auto",
                      }}
                    >
                      "
                      {cleanDirection ||
                        "Atmospheric scenery matching story visual style."}
                      "
                    </p>
                  </div>
                </div>

                {/* Synthesized Prompt Preview */}
                <div className="flow-directives-section">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "4px",
                    }}
                  >
                    <label className="flow-toolbar-label" style={{ margin: 0 }}>
                      <span>
                        Synthesized Environment Prompt (Characters Strictly
                        Excluded)
                      </span>
                    </label>
                    <button
                      type="button"
                      className="flow-btn secondary sm"
                      style={{ fontSize: "10.5px", padding: "2px 8px" }}
                      onClick={() => {
                        navigator.clipboard?.writeText(synthPrompt);
                        setCopiedPromptSceneId(activeScene.sceneId);
                        setTimeout(() => setCopiedPromptSceneId(null), 2000);
                      }}
                    >
                      {copiedPromptSceneId === activeScene.sceneId
                        ? "✓ Copied"
                        : "📋 Copy Prompt"}
                    </button>
                  </div>
                  <div
                    className="flow-code-block"
                    style={{
                      fontSize: "11px",
                      maxHeight: "90px",
                      overflowY: "auto",
                      margin: 0,
                    }}
                  >
                    {synthPrompt}
                  </div>
                </div>

                {/* Custom Prompt Override */}
                <div className="flow-directives-section">
                  <label className="flow-toolbar-label">
                    <span>
                      Custom Prompt Override (Add landscape, architecture, or
                      mood details)
                    </span>
                  </label>
                  <textarea
                    className="flow-textarea"
                    rows={3}
                    placeholder="e.g. Glowing blue mushrooms on mossy tree trunks, fireflies hovering over quiet stream..."
                    value={sceneCustomPrompts[activeScene.sceneId] || ""}
                    onChange={(e) =>
                      setSceneCustomPrompts((prev) => ({
                        ...prev,
                        [activeScene.sceneId]: e.target.value,
                      }))
                    }
                    style={{
                      width: "100%",
                      fontSize: "12px",
                      resize: "vertical",
                    }}
                  />
                  <small
                    style={{
                      fontSize: "10.5px",
                      color: "var(--color-text-secondary)",
                      marginTop: "4px",
                      display: "block",
                    }}
                  >
                    Characters and living figures are automatically excluded
                    from plate generation.
                  </small>
                </div>

                {/* Modal Actions */}
                <div
                  className="flow-modal-actions"
                  style={{
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <button
                    type="button"
                    className="flow-btn secondary sm"
                    onClick={() => setActiveDirectivesSceneId(null)}
                  >
                    Close
                  </button>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      type="button"
                      className="flow-btn primary sm"
                      disabled={generatingSceneIds[activeScene.sceneId]}
                      onClick={async () => {
                        const scId = activeScene.sceneId;
                        setActiveDirectivesSceneId(null);
                        await handleGenerateSceneBackground(scId);
                      }}
                    >
                      <SparklesIcon size={13} />
                      <span>
                        {generatingSceneIds[activeScene.sceneId]
                          ? "Generating..."
                          : activeScene.hasBackground
                            ? "↻ Regenerate Plate"
                            : "✨ Generate Plate Now"}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
