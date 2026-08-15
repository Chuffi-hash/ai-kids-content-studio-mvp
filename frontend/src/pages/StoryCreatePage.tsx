import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import StoryBuilder from "../components/story/StoryBuilder";
import GeneratedStory from "../components/story/GeneratedStory";
import { PageHeader } from "../components/common/PageHeader";
import { getAllCharacters, Character } from "../services/character.service";
import { Story, Scene } from "../types/story";
import { ProductionState, ProductionScene } from "../types/production";
import { generateScenes } from "../services/content.service";
import { getApiUrl } from "../utils/urlHelper";
import { fetchStory } from "../services/storybook.service";

export default function StoryCreatePage() {
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [story, setStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(false);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [generatingScenes, setGeneratingScenes] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

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

  async function generateStory(data: {
    topic: string;
    audience: string;
    genre: string;
    visualStyle: string;
    lesson: string;
    characterIds: string[];
  }) {
    setLoading(true);
    setApiError(null);

    try {
      const API_URL = getApiUrl();
      const response = await fetch(`${API_URL}/api/content/story/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topic: data.topic,
          lesson: data.lesson,
          audience: data.audience,
          genre: data.genre,
          visualStyle: data.visualStyle,
          characterIds: data.characterIds,
        }),
      });

      if (!response.ok) {
        throw new Error("Request failed");
      }

      const result = await response.json();

      // Navigate to story detail page after successful generation
      navigate(`/stories/${result.storyId}`);
    } catch (error) {
      console.error(error);
      setApiError("Failed to generate story. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateScenes() {
    if (!story) return;

    setGeneratingScenes(true);
    setApiError(null);

    try {
      const generatedScenes = await generateScenes(
        story.id,
        {
          title: story.title,
          logline: story.logline,
          lesson: story.lesson,
        },
        story.characters,
      );

      setScenes(generatedScenes);
    } catch (error) {
      console.error(error);
      setApiError("Failed to generate scenes. Please try again.");
    } finally {
      setGeneratingScenes(false);
    }
  }

  async function goToProduction() {
    if (!story || scenes.length === 0) return;

    let savedImageUrls = new Map<string, string>();
    try {
      const savedStory = await fetchStory(story.id);
      savedImageUrls = new Map(
        savedStory.scenes
          .filter(
            (scene) =>
              scene.image?.status === "completed" && scene.image.imageUrl,
          )
          .map((scene) => [scene.sceneId, scene.image!.imageUrl]),
      );
    } catch (error) {
      console.info("No saved scene images found for this story yet.", error);
    }

    const productionScenes: ProductionScene[] = scenes.map((scene) => {
      const sceneId = `scene-${scene.sceneNumber}`;
      const savedImageUrl = savedImageUrls.get(sceneId);

      return {
        sceneId,
        sceneNumber: scene.sceneNumber,
        title: scene.description.split(".")[0] || `Scene ${scene.sceneNumber}`,
        description: scene.description,
        narration: scene.narration,
        image: savedImageUrl
          ? { status: "completed", url: savedImageUrl }
          : { status: "pending" },
        voice: { status: "pending" },
        animation: { status: "pending" },
        video: { status: "pending" },
      };
    });

    const productionState: ProductionState = {
      storyId: story.id,
      storyTitle: story.title,
      storyLogline: story.logline,
      storyLesson: story.lesson,
      currentStage: "scenes",
      scenes: productionScenes,
    };

    navigate("/production", {
      state: { productionState },
    });
  }

  function goToStorybook() {
    if (story) {
      navigate(`/story/${story.id}/read`);
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Create Story"
        subtitle="Configure your story settings and generate content"
      />
      {apiError && (
        <div className="api-error">
          {apiError}
          <button onClick={() => setApiError(null)} className="error-close">✕</button>
        </div>
      )}
      <StoryBuilder
        characters={characters}
        loading={loading}
        onGenerate={generateStory}
      />
    </div>
  );
}
