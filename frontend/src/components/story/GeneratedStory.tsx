import { Story, Scene } from '../../types/story';
import CharacterCard from './CharacterCard';
import SceneCard from './SceneCard';
import LessonCard from './LessonCard';
import './generated-story.css';

interface GeneratedStoryProps {
  story: Story;
  scenes?: Scene[];
  onGenerateScenes: () => void;
  isGeneratingScenes?: boolean;
}

export default function GeneratedStory({ story, scenes, onGenerateScenes, isGeneratingScenes = false }: GeneratedStoryProps) {
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
              className="primary story-generate-scenes-btn"
              onClick={onGenerateScenes}
              disabled={isGeneratingScenes}
            >
              {isGeneratingScenes ? 'Generating Scenes...' : 'Generate Scenes'}
            </button>
          ) : (
            <div className="story-status">
              <span className="story-status-dot"></span>
              {scenes.length} scenes generated
            </div>
          )}
        </div>
      </div>

      <div className="story-workspace-content">
        <div className="story-workspace-section">
          <h3>Story Summary</h3>
          <div className="story-summary">
            <LessonCard lesson={story.lesson} />
          </div>
        </div>

        <div className="story-workspace-section">
          <h3>Characters</h3>
          <div className="story-characters">
            {story.characters.map((character) => (
              <CharacterCard
                key={character.name}
                character={character}
              />
            ))}
          </div>
        </div>

        {scenes && scenes.length > 0 && (
          <div className="story-workspace-section">
            <h3>Scenes</h3>
            <div className="story-scenes">
              {scenes.map((scene) => (
                <SceneCard
                  key={scene.sceneNumber}
                  scene={scene}
                  storyId={story.id}
                  characters={story.characters}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}