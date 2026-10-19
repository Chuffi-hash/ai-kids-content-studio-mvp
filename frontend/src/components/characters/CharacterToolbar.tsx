import React from 'react';
import { SearchIcon } from '../common/Icons';

interface CharacterToolbarProps {
  searchQuery: string;
  speciesFilter: string;
  personalityFilter: string;
  onSearchChange: (value: string) => void;
  onSpeciesChange: (value: string) => void;
  onPersonalityChange: (value: string) => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
  speciesOptions?: string[];
  personalityOptions?: string[];
}

const DEFAULT_SPECIES = [
  'Human',
  'Bear',
  'Animal',
  'Fantasy Creature',
  'Robot',
  'Alien',
  'Plant',
  'Object',
  'Other',
];

const DEFAULT_CHARACTERISTICS = [
  'Brave',
  'Cheerful',
  'Helpful',
  'Loyal',
  'Curious',
  'Kind',
  'Wise',
  'Playful',
  'Shy',
  'Adventurous',
  'Smart',
  'Funny',
  'Strong',
  'Gentle',
  'Creative',
  'Energetic',
  'Other',
];

export default function CharacterToolbar({
  searchQuery,
  speciesFilter,
  personalityFilter,
  onSearchChange,
  onSpeciesChange,
  onPersonalityChange,
  onClearFilters,
  hasActiveFilters,
  speciesOptions = DEFAULT_SPECIES,
  personalityOptions = DEFAULT_CHARACTERISTICS,
}: CharacterToolbarProps) {
  // Combine defaults with passed options, keeping unique capitalized entries
  const allSpecies = Array.from(new Set([...DEFAULT_SPECIES, ...speciesOptions]));
  const allCharacteristics = Array.from(new Set([...DEFAULT_CHARACTERISTICS, ...personalityOptions]));

  return (
    <div className="character-toolbar">
      <div className="toolbar-search">
        <SearchIcon className="search-icon" size={15} />
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
        {allSpecies.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <select
        className="toolbar-select"
        value={personalityFilter}
        onChange={(e) => onPersonalityChange(e.target.value)}
        aria-label="Filter by characteristic"
      >
        <option value="">All characteristics</option>
        {allCharacteristics.map((trait) => (
          <option key={trait} value={trait}>
            {trait}
          </option>
        ))}
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
