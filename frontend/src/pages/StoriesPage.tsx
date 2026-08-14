import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import StoryCard from '../components/story/StoryCard';
import StoryFilters from '../components/story/StoryFilters';
import { getAllStories, Story } from '../services/story.service';

export default function StoriesPage() {
  const navigate = useNavigate();
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [audienceFilter, setAudienceFilter] = useState('');
  const [genreFilter, setGenreFilter] = useState('');
  const [visualStyleFilter, setVisualStyleFilter] = useState('');

  useEffect(() => {
    loadStories();
  }, []);

  async function loadStories() {
    try {
      setLoading(true);
      const data = await getAllStories();
      setStories(data);
    } catch (error) {
      console.error('Failed to load stories:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenStory(storyId: string) {
    navigate(`/story/${storyId}/read`);
  }

  function handleClearFilters() {
    setAudienceFilter('');
    setGenreFilter('');
    setVisualStyleFilter('');
    setSearchQuery('');
  }

  const hasActiveFilters = Boolean(searchQuery || audienceFilter || genreFilter || visualStyleFilter);

  const filteredStories = stories.filter(story => {
    const matchesSearch = 
      story.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      story.logline.toLowerCase().includes(searchQuery.toLowerCase()) ||
      story.lesson.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesAudience = !audienceFilter || 
      story.audience?.toLowerCase() === audienceFilter.toLowerCase();

    const matchesGenre = !genreFilter || 
      story.genre?.toLowerCase() === genreFilter.toLowerCase();

    const matchesVisualStyle = !visualStyleFilter || 
      story.visualStyle?.toLowerCase() === visualStyleFilter.toLowerCase();

    return matchesSearch && matchesAudience && matchesGenre && matchesVisualStyle;
  });

  return (
    <div className="stories-page">
      <div className="stories-page-header">
        <div className="stories-page-title">
          <h1>Stories</h1>
          <p className="muted">Manage your generated stories</p>
        </div>
      </div>

      <div className="stories-toolbar">
        <input
          type="text"
          className="stories-search"
          placeholder="Search stories..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <StoryFilters
        audienceFilter={audienceFilter}
        genreFilter={genreFilter}
        visualStyleFilter={visualStyleFilter}
        onAudienceChange={setAudienceFilter}
        onGenreChange={setGenreFilter}
        onVisualStyleChange={setVisualStyleFilter}
        onClearFilters={handleClearFilters}
        hasActiveFilters={hasActiveFilters}
      />

      {loading ? (
        <div className="stories-loading">Loading stories...</div>
      ) : filteredStories.length === 0 ? (
        <div className="stories-empty-state">
          <div className="stories-empty-icon">📖</div>
          <h3>No stories yet</h3>
          <p className="muted">Generate your first story to get started.</p>
        </div>
      ) : (
        <div className="stories-grid">
          {filteredStories.map((story) => (
            <StoryCard
              key={story.id}
              story={story}
              onOpen={handleOpenStory}
            />
          ))}
        </div>
      )}
    </div>
  );
}
