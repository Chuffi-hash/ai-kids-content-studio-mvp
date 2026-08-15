import { useState } from "react";
import { Story, Scene } from "../../types/story";
import CharacterCard from "./CharacterCard";
import SceneCard from "./SceneCard";
import "./generated-story.css";

interface GeneratedStoryProps {
  story: Story;
  scenes?: Scene[];
  onGenerateScenes: () => void;
  isGeneratingScenes?: boolean;
  onOpenProduction?: () => void;
  onOpenStorybook?: () => void;
}

type StoryTab = "overview" | "characters" | "scenes" | "production";

export default function GeneratedStory({
  story,
  scenes,
  onGenerateScenes,
  isGeneratingScenes = false,
  onOpenProduction,
  onOpenStorybook,
}: GeneratedStoryProps) {
  const [activeTab, setActiveTab] = useState<StoryTab>("overview");

  const tabs: Array<{ key: StoryTab; label: string; count?: number }> = [
    { key: "overview", label: "Overview" },
    { key: "characters", label: "Characters", count: story.characters.length },
    { key: "scenes", label: "Scenes", count: scenes?.length },
    { key: "production", label: "Production" },
  ];

  return (
    <div className="story-workspace">
      <div className="story-workspace-header">
        <div className="story-title-section">
          <h2>{story.title}</h2>
          <p className="story-logline">{story.logline}</p>
        </div>
        <div className="story-workspace-actions">
          {!scenes || scenes.length === 0 ? (
            <button
              className="btn btn-primary"
              onClick={onGenerateScenes}
              disabled={isGeneratingScenes}
            >
              {isGeneratingScenes ? "Generating Scenes..." : "Generate Scenes"}
            </button>
          ) : (
            <div className="story-status">
              <span className="story-status-dot"></span>
              {scenes.length} scenes generated
            </div>
          )}
        </div>
      </div>

      <div className="story-workspace-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`story-workspace-tab ${
              activeTab === tab.key ? "active" : ""
            }`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
            {typeof tab.count === "number" && tab.count > 0 && (
              <span> ({tab.count})</span>
            )}
          </button>
        ))}
      </div>

      <div className="story-workspace-content">
        {activeTab === "overview" && (
          <div>
            <div className="story-workspace-section">
              <h3>Story Summary</h3>
              <div className="story-summary">
                <strong>Lesson</strong>
                <p>{story.lesson}</p>
              </div>
            </div>
            <div className="story-workspace-section">
              <h3>Metadata</h3>
              <div className="story-workspace-meta">
                <span className="story-meta-badge">
                  {story.characters.length} characters
                </span>
                {scenes && (
                  <span className="story-meta-badge">
                    {scenes.length} scenes
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "characters" && (
          <div className="story-characters">
            {story.characters.map((character) => (
              <CharacterCard key={character.name} character={character} />
            ))}
          </div>
        )}

        {activeTab === "scenes" && (
          <div className="story-scenes">
            {!scenes || scenes.length === 0 ? (
              <div className="story-production-preview">
                <p className="muted">
                  Generate scenes to see the visual breakdown of this story.
                </p>
                <button
                  className="btn btn-primary"
                  onClick={onGenerateScenes}
                  disabled={isGeneratingScenes}
                >
                  {isGeneratingScenes
                    ? "Generating Scenes..."
                    : "Generate Scenes"}
                </button>
              </div>
            ) : (
              scenes.map((scene) => (
                <SceneCard
                  key={scene.sceneNumber}
                  scene={scene}
                  storyId={story.id}
                  characters={story.characters}
                />
              ))
            )}
          </div>
        )}

        {activeTab === "production" && (
          <div className="story-production-preview">
            {!scenes || scenes.length === 0 ? (
              <>
                <p className="muted">
                  Generate scenes first to unlock production for this story.
                </p>
                <button
                  className="btn btn-primary"
                  onClick={onGenerateScenes}
                  disabled={isGeneratingScenes}
                >
                  {isGeneratingScenes
                    ? "Generating Scenes..."
                    : "Generate Scenes"}
                </button>
              </>
            ) : (
              <>
                <p className="muted">
                  This story has {scenes.length} scenes ready for the production
                  pipeline.
                </p>
                <div className="story-result-actions">
                  {onOpenProduction && (
                    <button
                      className="btn btn-primary"
                      onClick={onOpenProduction}
                    >
                      Continue to Production
                    </button>
                  )}
                  {onOpenStorybook && (
                    <button
                      className="btn btn-secondary"
                      onClick={onOpenStorybook}
                    >
                      Read Story
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
