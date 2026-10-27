import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import StoryBuilder, { StoryFormState } from "../components/story/StoryBuilder";
import { StoryboardReviewScreen } from "../components/story/StoryboardReviewScreen";
import { CloseIcon, SparklesIcon } from "../components/common/Icons";
import { getAllCharacters, Character } from "../services/character.service";
import { DraftStoryboardResult } from "../types/editor";
import {
  generateDraftStory,
  parseScriptForDraft,
  createStoryFromDraft,
} from "../services/editor.service";

export default function StoryCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialModeParam = searchParams.get("mode");
  const initialWorkflowMode = initialModeParam === "import" ? "import" : "generate";

  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // Storyboard Review state
  const [step, setStep] = useState<"input" | "review">("input");
  const [reviewMode, setReviewMode] = useState<"ai" | "import">("ai");
  const [draftResult, setDraftResult] = useState<DraftStoryboardResult | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [lastAiInput, setLastAiInput] = useState<StoryFormState | null>(null);

  useEffect(() => {
    loadCharacters();
  }, []);

  async function loadCharacters() {
    try {
      const data = await getAllCharacters();
      setCharacters(data);
    } catch (error) {
      console.error("Failed to load characters:", error);
    }
  }

  /**
   * Generates a draft storyboard using AI and transitions to the review screen.
   */
  async function handleGenerateDraft(data: StoryFormState) {
    setLoading(true);
    setLoadingMessage("Drafting structured storyboard scenes with AI...");
    setApiError(null);
    setLastAiInput(data);
    setReviewMode("ai");

    try {
      const draft = await generateDraftStory({
        topic: data.topic,
        ageGroup: data.ageGroup,
        desiredDurationSeconds: data.desiredDurationSeconds,
        language: data.language || "Hindi",
        title: data.title || undefined,
        genre: data.genre,
        visualStyle: data.visualStyle,
        lesson: data.lesson || undefined,
        sceneCount: data.sceneCount || undefined,
        tone: data.tone || undefined,
        contentRestrictions: data.contentRestrictions || undefined,
        characterIds: data.characterIds,
      });

      setDraftResult(draft);
      setStep("review");
    } catch (error: any) {
      console.error("Failed to generate draft story:", error);
      setApiError(error?.message || "Failed to generate story draft. Please try again.");
    } finally {
      setLoading(false);
      setLoadingMessage(null);
    }
  }

  /**
   * Parses an unstructured or markdown script into structured draft scenes and transitions to the review screen.
   */
  async function handleImportScript(data: {
    rawText: string;
    title?: string;
    language?: string;
    format?: string;
    genre?: string;
    targetDurationSeconds?: number;
  }) {
    setLoading(true);
    setLoadingMessage("Parsing script and detecting storyboard scenes...");
    setApiError(null);
    setReviewMode("import");

    try {
      const draft = await parseScriptForDraft({
        rawText: data.rawText,
        title: data.title,
        language: data.language || "Hindi",
        targetDuration: data.targetDurationSeconds || 60,
      });

      setDraftResult(draft);
      setStep("review");
    } catch (error: any) {
      console.error("Failed to parse script:", error);
      setApiError(error?.message || "Failed to parse script. Please check your text format.");
    } finally {
      setLoading(false);
      setLoadingMessage(null);
    }
  }

  /**
   * Re-generates story draft from the review screen if the user requests another take.
   */
  async function handleRegenerateStory() {
    if (!lastAiInput) return;
    setIsRegenerating(true);
    setApiError(null);

    try {
      const draft = await generateDraftStory({
        topic: lastAiInput.topic,
        ageGroup: lastAiInput.ageGroup,
        desiredDurationSeconds: lastAiInput.desiredDurationSeconds,
        language: lastAiInput.language || "Hindi",
        title: lastAiInput.title || undefined,
        genre: lastAiInput.genre,
        visualStyle: lastAiInput.visualStyle,
        lesson: lastAiInput.lesson || undefined,
        sceneCount: lastAiInput.sceneCount || undefined,
        tone: lastAiInput.tone || undefined,
        contentRestrictions: lastAiInput.contentRestrictions || undefined,
        characterIds: lastAiInput.characterIds,
      });

      setDraftResult(draft);
    } catch (error: any) {
      console.error("Failed to regenerate story:", error);
      setApiError(error?.message || "Failed to regenerate storyboard.");
    } finally {
      setIsRegenerating(false);
    }
  }

  /**
   * Atomically saves the finalized draft storyboard as a new draft story project and opens it in the editor.
   */
  async function handleCreateStoryFromDraft() {
    if (!draftResult) return;
    setIsCreating(true);
    setApiError(null);

    try {
      const res = await createStoryFromDraft({
        title: draftResult.title,
        targetDurationSeconds: draftResult.targetDurationSeconds,
        language: draftResult.language || "Hindi",
        topic: draftResult.metadata?.topic || lastAiInput?.topic,
        audience: draftResult.metadata?.audience || draftResult.metadata?.ageGroup || lastAiInput?.ageGroup,
        genre: draftResult.metadata?.genre || lastAiInput?.genre,
        visualStyle: draftResult.metadata?.visualStyle || lastAiInput?.visualStyle,
        lesson: draftResult.lesson || draftResult.metadata?.lesson || lastAiInput?.lesson,
        logline: draftResult.logline,
        characters: draftResult.characters,
        scenes: draftResult.scenes,
      });

      // Open the story in the studio editor
      navigate(`/stories/${res.storyId}`);
    } catch (error: any) {
      console.error("Failed to create story from draft:", error);
      setApiError(error?.message || "Failed to create story project. Please try again.");
      setIsCreating(false);
    }
  }

  return (
    <div className="page story-studio-page">
      <div className="studio-hero-header">
        <div className="studio-hero-badge">
          <SparklesIcon size={12} />
          <span>AI Story Studio</span>
        </div>
        <h1 className="studio-hero-title">
          {step === "review" ? "Review & Fine-Tune Storyboard" : "Create Children's Story"}
        </h1>
        <p className="studio-hero-subtitle">
          {step === "review"
            ? "Inspect each scene, adjust narration, tune character emotions, and add atmospheric overlays before entering the editor."
            : "Spark an imaginative idea or import an existing script to generate a full editable storyboard in seconds."}
        </p>
      </div>

      {apiError && (
        <div className="api-error studio-api-error">
          <span className="error-message">⚠️ {apiError}</span>
          <button onClick={() => setApiError(null)} className="error-close" aria-label="Dismiss error">
            <CloseIcon size={12} />
          </button>
        </div>
      )}

      {loading && (
        <div
          style={{
            maxWidth: "700px",
            margin: "40px auto",
            padding: "36px 24px",
            background: "var(--ed-surface, #111827)",
            border: "1px solid var(--ed-border, #1f293d)",
            borderRadius: "16px",
            textAlign: "center",
            boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              border: "4px solid rgba(139, 92, 246, 0.2)",
              borderTopColor: "var(--ed-accent, #8b5cf6)",
              borderRadius: "50%",
              margin: "0 auto 20px",
              animation: "spin 1s linear infinite",
            }}
          />
          <h3 style={{ fontSize: "18px", fontWeight: 600, color: "var(--ed-text, #f8fafc)", marginBottom: "8px" }}>
            {loadingMessage || "Processing..."}
          </h3>
          <p style={{ fontSize: "14px", color: "var(--ed-text-muted, #94a3b8)" }}>
            Structuring scene descriptions, setting Hindi audio narration, assigning Earth voice tags, and preparing storyboard...
          </p>
        </div>
      )}

      {!loading && step === "review" && draftResult && (
        <StoryboardReviewScreen
          draft={draftResult}
          onChange={setDraftResult}
          onCreateStory={handleCreateStoryFromDraft}
          isCreating={isCreating}
          onBackToInput={() => setStep("input")}
          onRegenerate={reviewMode === "ai" ? handleRegenerateStory : undefined}
          isRegenerating={isRegenerating}
          mode={reviewMode}
        />
      )}

      {!loading && step === "input" && (
        <StoryBuilder
          characters={characters}
          initialMode={initialWorkflowMode}
          loading={loading}
          onGenerate={handleGenerateDraft}
          onImport={handleImportScript}
        />
      )}
    </div>
  );
}
