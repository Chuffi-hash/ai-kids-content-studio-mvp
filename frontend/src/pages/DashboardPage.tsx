import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GeneratedStory from '../components/story/GeneratedStory';
import ProductionPipeline from '../components/production/ProductionPipeline';
import StoryGeneratorForm from '../components/story/StoryGeneratorForm';
import ModuleGrid from '../components/story/ModuleGrid';
import { Story, Scene } from '../types/story';
import { ProductionState, ProductionScene } from '../types/production';
import { generateScenes } from '../services/content.service';
import { getApiUrl } from '../utils/urlHelper';
import { fetchStory } from '../services/storybook.service';

const modules = [
  { name: 'Story Generator', icon: '📖', description: 'Create an original story.' },
  { name: 'Character Manager', icon: '🧸', description: 'Manage recurring characters.' },
  { name: 'Scene Generator', icon: '🎬', description: 'Turn scenes into visual prompts.' },
  { name: 'Voice Generator', icon: '🎙️', description: 'Generate narration.' },
  { name: 'Video Generator', icon: '🎞️', description: 'Assemble the episode.' },
  { name: 'Thumbnail Generator', icon: '🖼️', description: 'Create a thumbnail concept.' },
  { name: 'YouTube Publisher', icon: '▶️', description: 'Prepare and publish videos.' }
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const [topic, setTopic] = useState('Animals');
  const [ageGroup, setAgeGroup] = useState('4-6 years');
  const [audience, setAudience] = useState('Children');
  const [genre, setGenre] = useState('Adventure');
  const [visualStyle, setVisualStyle] = useState('Anime');
  const [lesson, setLesson] = useState('Be kind and help others');
  const [story, setStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(false);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [generatingScenes, setGeneratingScenes] = useState(false);
  const [view, setView] = useState<'generator' | 'production'>('generator');
  const [productionState, setProductionState] = useState<ProductionState | null>(null);

  async function generateStory() {
    setLoading(true);

    try {
      const API_URL = getApiUrl();
      const response = await fetch(
        `${API_URL}/api/content/story/generate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            topic,
            ageGroup,
            lesson,
            audience,
            genre,
            visualStyle,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Request failed");
      }

      const data = await response.json();

      console.log("STORY API RESPONSE:", data);

      setStory(data);
      setScenes([]);
    } catch (error) {
      console.error(error);
      alert("Failed to generate story");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateScenes() {
    if (!story) return;

    setGeneratingScenes(true);

    try {
      const generatedScenes = await generateScenes(
        story.id,
        {
          title: story.title,
          logline: story.logline,
          lesson: story.lesson,
        },
        story.characters
      );

      setScenes(generatedScenes);
    } catch (error) {
      console.error(error);
      alert('Failed to generate scenes. Please try again.');
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
          .filter((scene) => scene.image?.status === 'completed' && scene.image.imageUrl)
          .map((scene) => [scene.sceneId, scene.image!.imageUrl]),
      );
    } catch (error) {
      console.info('No saved scene images found for this story yet.', error);
    }

    const productionScenes: ProductionScene[] = scenes.map((scene) => {
      const sceneId = `scene-${scene.sceneNumber}`;
      const savedImageUrl = savedImageUrls.get(sceneId);

      return {
        sceneId,
        sceneNumber: scene.sceneNumber,
        title: scene.description.split('.')[0] || `Scene ${scene.sceneNumber}`,
        description: scene.description,
        narration: scene.narration,
        image: savedImageUrl
          ? { status: 'completed', url: savedImageUrl }
          : { status: 'pending' },
        voice: { status: 'pending' },
        animation: { status: 'pending' },
        video: { status: 'pending' },
      };
    });

    setProductionState({
      storyId: story.id,
      storyTitle: story.title,
      storyLogline: story.logline,
      storyLesson: story.lesson,
      currentStage: 'scenes',
      scenes: productionScenes,
    });

    setView('production');
  }

  function goToStorybook() {
    if (story) {
      navigate(`/story/${story.id}/read`);
    }
  }

  function goToGenerator() {
    setView('generator');
  }

  function handleProductionStateChange(newState: ProductionState) {
    setProductionState(newState);
  }

  return (
    <>
      <section className="hero">
        <div>
          <h2>From idea → finished episode</h2>
          <p>
            Start with a topic. The pipeline will eventually handle the story,
            characters, scenes, voice, video, thumbnail and YouTube publishing.
          </p>
        </div>
      </section>

      {view === 'generator' ? (
        <>
          <section className="generator-grid">
            <StoryGeneratorForm
              topic={topic}
              ageGroup={ageGroup}
              audience={audience}
              genre={genre}
              visualStyle={visualStyle}
              lesson={lesson}
              loading={loading}
              onTopicChange={setTopic}
              onAgeGroupChange={setAgeGroup}
              onAudienceChange={setAudience}
              onGenreChange={setGenre}
              onVisualStyleChange={setVisualStyle}
              onLessonChange={setLesson}
              onGenerate={generateStory}
            />

            <div className="panel result">
              <div className="panel-header">
                <h3>Generated Story</h3>
                <p className="panel-description">Your AI-generated story content</p>
              </div>
              {!story ? (
                <div className="empty">Your generated story will appear here.</div>
              ) : (
                <>
                  <GeneratedStory
                    story={story}
                    scenes={scenes}
                    onGenerateScenes={handleGenerateScenes}
                    isGeneratingScenes={generatingScenes}
                  />
                  {scenes.length > 0 && (
                    <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                      <button
                        className="primary"
                        onClick={goToProduction}
                      >
                        Continue to Production Pipeline →
                      </button>
                      <button
                        className="primary"
                        onClick={goToStorybook}
                        style={{ background: '#10b981' }}
                      >
                        📖 Read Story
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          <section>
            <div className="section-heading">
              <div>
                <h2>Production pipeline</h2>
                <p className="muted">These modules will become connected services.</p>
              </div>
            </div>

            <ModuleGrid modules={modules} />
          </section>
        </>
      ) : (
        <>
          <button
            className="primary"
            onClick={goToGenerator}
            style={{ marginBottom: '24px', width: 'auto' }}
          >
            ← Back to Story Generator
          </button>
          {productionState && (
            <ProductionPipeline 
              productionState={productionState} 
              onProductionStateChange={handleProductionStateChange}
            />
          )}
        </>
      )}
    </>
  );
}
