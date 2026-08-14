import { useState, useEffect } from 'react';
import { Character, getAllCharacters, createCharacter, deleteCharacter } from '../services/character.service';
import CharacterLibraryHeader from '../components/characters/CharacterLibraryHeader';
import CharacterToolbar from '../components/characters/CharacterToolbar';
import CharacterFilters from '../components/characters/CharacterFilters';
import CharacterGrid from '../components/characters/CharacterGrid';
import CharacterEmptyState from '../components/characters/CharacterEmptyState';
import CharacterModal from '../components/characters/CharacterModal';

export default function CharactersPage() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [speciesFilter, setSpeciesFilter] = useState('');
  const [personalityFilter, setPersonalityFilter] = useState('');

  useEffect(() => {
    loadCharacters();
  }, []);

  async function loadCharacters() {
    try {
      setLoading(true);
      const data = await getAllCharacters();
      setCharacters(data);
    } catch (error) {
      console.error('Failed to load characters:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateCharacter(data: {
    name: string;
    species: string;
    personality: string;
    visualDescription: string;
    distinctiveFeatures?: string;
  }) {
    try {
      await createCharacter(data);
      setShowModal(false);
      setEditingCharacter(null);
      loadCharacters();
    } catch (error) {
      console.error('Failed to create character:', error);
      alert('Failed to create character. Please try again.');
    }
  }

  async function handleDeleteCharacter(id: string) {
    if (!confirm('Are you sure you want to delete this character?')) {
      return;
    }

    try {
      await deleteCharacter(id);
      loadCharacters();
    } catch (error) {
      console.error('Failed to delete character:', error);
      alert('Failed to delete character. Please try again.');
    }
  }

  function handleEditCharacter(character: Character) {
    setEditingCharacter(character);
    setShowModal(true);
  }

  function handleOpenModal() {
    setEditingCharacter(null);
    setShowModal(true);
  }

  function handleCloseModal() {
    setShowModal(false);
    setEditingCharacter(null);
  }

  function handleClearFilters() {
    setSpeciesFilter('');
    setPersonalityFilter('');
    setSearchQuery('');
  }

  const hasActiveFilters = Boolean(searchQuery || speciesFilter || personalityFilter);

  const filteredCharacters = characters.filter(character => {
    const matchesSearch = 
      character.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      character.species.toLowerCase().includes(searchQuery.toLowerCase()) ||
      character.personality.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSpecies = !speciesFilter || 
      character.species.toLowerCase().includes(speciesFilter.toLowerCase()) ||
      (speciesFilter === 'Other' && !['Human', 'Animal', 'Fantasy Creature', 'Robot', 'Alien', 'Plant', 'Object'].includes(character.species));

    const matchesPersonality = !personalityFilter ||
      character.personality.toLowerCase().includes(personalityFilter.toLowerCase()) ||
      (personalityFilter === 'Other' && !['Brave', 'Curious', 'Kind', 'Wise', 'Playful', 'Shy', 'Adventurous', 'Smart', 'Funny', 'Strong', 'Gentle'].some(trait => character.personality.toLowerCase().includes(trait.toLowerCase())));

    return matchesSearch && matchesSpecies && matchesPersonality;
  });

  return (
    <div className="character-library">
      <CharacterLibraryHeader onCreateCharacter={handleOpenModal} />
      <CharacterToolbar searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      <CharacterFilters
        speciesFilter={speciesFilter}
        personalityFilter={personalityFilter}
        onSpeciesChange={setSpeciesFilter}
        onPersonalityChange={setPersonalityFilter}
        onClearFilters={handleClearFilters}
        hasActiveFilters={hasActiveFilters}
      />

      {loading ? (
        <div className="character-loading">Loading characters...</div>
      ) : filteredCharacters.length === 0 ? (
        <CharacterEmptyState onCreateCharacter={handleOpenModal} />
      ) : (
        <CharacterGrid
          characters={filteredCharacters}
          onEdit={handleEditCharacter}
          onDelete={handleDeleteCharacter}
        />
      )}

      <CharacterModal
        isOpen={showModal}
        character={editingCharacter}
        onSubmit={handleCreateCharacter}
        onCancel={handleCloseModal}
      />
    </div>
  );
}
