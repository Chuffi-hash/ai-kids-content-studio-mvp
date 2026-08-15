import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import StoryCard from "../components/story/StoryCard";
import { getAllStories, deleteStory, Story } from "../services/story.service";
import { ConfirmModal } from "../components/common/ConfirmModal";
import "../components/story/stories-library.css";

export default function StoriesPage() {
  const navigate = useNavigate();
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [audienceFilter, setAudienceFilter] = useState("");
  const [genreFilter, setGenreFilter] = useState("");
  const [visualStyleFilter, setVisualStyleFilter] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ storyId: string; title: string } | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    loadStories();
  }, []);

  async function loadStories() {
    try {
      setLoading(true);
      const data = await getAllStories();
      setStories(data);
    } catch (error) {
      console.error("Failed to load stories:", error);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenStory(storyId: string) {
    navigate(`/stories/${storyId}`);
  }

  function handleDeleteStory(storyId: string, title: string) {
    setDeleteConfirm({ storyId, title });
  }

  async function confirmDeleteStory() {
    if (!deleteConfirm) return;

    try {
      setApiError(null);
      await deleteStory(deleteConfirm.storyId);
      setDeleteConfirm(null);
      setStories((prev) => prev.filter((s) => s.storyId !== deleteConfirm.storyId));
    } catch (error) {
      console.error("Failed to delete story:", error);
      setApiError("Failed to delete story. Please try again.");
    }
  }

  function handleClearFilters() {
    setAudienceFilter("");
    setGenreFilter("");
    setVisualStyleFilter("");
    setSearchQuery("");
  }

  const hasActiveFilters = Boolean(
    searchQuery || audienceFilter || genreFilter || visualStyleFilter,
  );

  const filteredStories = stories.filter((story) => {
    const matchesSearch =
      story.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      story.logline.toLowerCase().includes(searchQuery.toLowerCase()) ||
      story.lesson.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesAudience =
      !audienceFilter ||
      story.audience?.toLowerCase() === audienceFilter.toLowerCase();

    const matchesGenre =
      !genreFilter || story.genre?.toLowerCase() === genreFilter.toLowerCase();

    const matchesVisualStyle =
      !visualStyleFilter ||
      story.visualStyle?.toLowerCase() === visualStyleFilter.toLowerCase();

    return (
      matchesSearch && matchesAudience && matchesGenre && matchesVisualStyle
    );
  });

  return (
    <div className="stories-page">
      <div className="page-header">
        <div>
          <h1>Stories</h1>
          <p className="muted">Your generated stories</p>
        </div>
      </div>

      {apiError && (
        <div className="api-error">
          {apiError}
          <button onClick={() => setApiError(null)} className="error-close">✕</button>
        </div>
      )}

      <div className="stories-toolbar">
        <div className="toolbar-search">
          <input
            type="text"
            placeholder="Search stories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <select
          className="toolbar-select"
          value={audienceFilter}
          onChange={(e) => setAudienceFilter(e.target.value)}
          aria-label="Filter by audience"
        >
          <option value="">All audiences</option>
          <option>Children</option>
          <option>Teen</option>
          <option>Adult</option>
          <option>General</option>
        </select>

        <select
          className="toolbar-select"
          value={genreFilter}
          onChange={(e) => setGenreFilter(e.target.value)}
          aria-label="Filter by genre"
        >
          <option value="">All genres</option>
          <option>Adventure</option>
          <option>Fantasy</option>
          <option>Sci-Fi</option>
          <option>Mystery</option>
          <option>Romance</option>
          <option>Horror</option>
          <option>Comedy</option>
          <option>Drama</option>
          <option>Educational</option>
        </select>

        <select
          className="toolbar-select"
          value={visualStyleFilter}
          onChange={(e) => setVisualStyleFilter(e.target.value)}
          aria-label="Filter by visual style"
        >
          <option value="">All visual styles</option>
          <option>Anime</option>
          <option>Cartoon</option>
          <option>Storybook</option>
          <option>Realistic</option>
          <option>Cinematic</option>
          <option>Watercolor</option>
          <option>Manga</option>
          <option>Comic</option>
          <option>3D</option>
        </select>

        {hasActiveFilters && (
          <div className="toolbar-actions">
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleClearFilters}
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="stories-loading">Loading stories...</div>
      ) : filteredStories.length === 0 ? (
        <div className="stories-empty-state">
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
              onDelete={handleDeleteStory}
            />
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={deleteConfirm !== null}
        title="Delete Story"
        message={`Are you sure you want to delete "${deleteConfirm?.title}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDeleteStory}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
