interface CharacterFiltersProps {
  speciesFilter: string;
  personalityFilter: string;
  onSpeciesChange: (value: string) => void;
  onPersonalityChange: (value: string) => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
}

export default function CharacterFilters({
  speciesFilter,
  personalityFilter,
  onSpeciesChange,
  onPersonalityChange,
  onClearFilters,
  hasActiveFilters,
}: CharacterFiltersProps) {
  return (
    <div className="character-filters">
      <div className="character-filter-group">
        <label>
          Species
          <select value={speciesFilter} onChange={(e) => onSpeciesChange(e.target.value)}>
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
        </label>

        <label>
          Characteristics
          <select value={personalityFilter} onChange={(e) => onPersonalityChange(e.target.value)}>
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
        </label>

        {hasActiveFilters && (
          <button className="character-clear-filters" onClick={onClearFilters}>
            Clear Filters
          </button>
        )}
      </div>
    </div>
  );
}
