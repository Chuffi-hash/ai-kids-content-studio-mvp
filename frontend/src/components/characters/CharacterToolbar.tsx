interface CharacterToolbarProps {
  searchQuery: string;
  speciesFilter: string;
  personalityFilter: string;
  onSearchChange: (value: string) => void;
  onSpeciesChange: (value: string) => void;
  onPersonalityChange: (value: string) => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
}

export default function CharacterToolbar({
  searchQuery,
  speciesFilter,
  personalityFilter,
  onSearchChange,
  onSpeciesChange,
  onPersonalityChange,
  onClearFilters,
  hasActiveFilters,
}: CharacterToolbarProps) {
  return (
    <div className="character-toolbar">
      <div className="toolbar-search">
        <input
          type="text"
          placeholder="Search characters..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <select
        className="toolbar-select"
        value={speciesFilter}
        onChange={(e) => onSpeciesChange(e.target.value)}
        aria-label="Filter by species"
      >
        <option value="">All species</option>
        <option>Human</option>
        <option>Animal</option>
        <option>Fantasy Creature</option>
        <option>Robot</option>
        <option>Alien</option>
        <option>Plant</option>
        <option>Object</option>
        <option>Other</option>
      </select>

      <select
        className="toolbar-select"
        value={personalityFilter}
        onChange={(e) => onPersonalityChange(e.target.value)}
        aria-label="Filter by characteristic"
      >
        <option value="">All characteristics</option>
        <option>Brave</option>
        <option>Curious</option>
        <option>Kind</option>
        <option>Wise</option>
        <option>Playful</option>
        <option>Shy</option>
        <option>Adventurous</option>
        <option>Smart</option>
        <option>Funny</option>
        <option>Strong</option>
        <option>Gentle</option>
        <option>Other</option>
      </select>

      {hasActiveFilters && (
        <div className="toolbar-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClearFilters}>
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
