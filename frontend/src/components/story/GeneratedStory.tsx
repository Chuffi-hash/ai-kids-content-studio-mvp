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
    <>
      <div className="story-header">
        <h2>{story.title}</h2>
        <p className="story-logline">{story.logline}</p>
      </div>

      <div className="story-section">
        <p className="section-label">Characters</p>
        <div className="characters">
          {story.characters.map((character) => (
            <CharacterCard
              key={character.name}
              character={character}
            />
          ))}
        </div>
      </div>

      <div className="story-section">
        <LessonCard lesson={story.lesson} />
      </div>

      {!scenes || scenes.length === 0 ? (
        <div className="story-section">
          <button
            className="primary"
            onClick={onGenerateScenes}
            disabled={isGeneratingScenes}
          >
            {isGeneratingScenes ? 'Generating Scenes...' : '✨ Generate Scenes'}
          </button>
        </div>
      ) : (
        <div className="story-section">
          <p className="section-label">Scenes</p>
          {scenes.map((scene) => (
            <SceneCard
              key={scene.sceneNumber}
              scene={scene}
              storyId={story.id}
              characters={story.characters}
            />
          ))}
        </div>
      )}
    </>
  );
}