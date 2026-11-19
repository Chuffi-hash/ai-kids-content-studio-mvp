import React, { useState } from 'react';
import {
  DraftStoryboardResult,
  DraftStoryboardScene,
  DraftDialogueLine,
  DraftOverlayItem,
  EditorScene,
} from '../../types/editor';
import { parseScriptForDraft, importDraftScenes } from '../../services/editor.service';
import {
  SparklesIcon,
  TrashIcon,
  BookOpenIcon,
  CheckIcon,
  AlertTriangleIcon,
} from '../common/Icons';

interface ImportScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  storyId: string;
  storyTitle: string;
  existingCharacters: Array<{ id: string; name: string }>;
  onImportSuccess: (importedScenes: EditorScene[], updatedTitle?: string) => void;
}

const SAMPLE_HINDI_SCRIPT = `# Title: Earth's Promise: The Four Seasons
Target Duration: 60s
Language: Hindi
Logline: Earth teaches children how the four seasons bring balance, beauty, and life to our planet.
Lesson: Every season has a special purpose in nature.

## Characters
- Earth (Protagonist): Our smiling, wise living planet with blue oceans and green continents.

## Scene 1: Golden Summer (15s)
Visual: Sun-drenched golden meadows with distant mountains, vibrant sunshine rays and heat shimmer.
Narration: ग्रीष्म ऋतु में सूरज अपनी सुनहरी किरणें बिखेरता है और प्रकृति खिल उठती है।
Earth: नमस्ते नन्हे दोस्तों! मैं तुम्हारी पृथ्वी हूँ। देखो, सूरज की धूप फसलों को पका रही है! (Emotion: happy)
Effects: sunshine_rays, heat_shimmer

## Scene 2: The Monsoon Rain (15s)
Visual: Lush green hills and valleys covered in fresh gentle monsoon rain, rolling clouds and water splashes.
Narration: वर्षा ऋतु में काले बादल गरजते हैं और ठंडी बारिश सूखी धरती को नया जीवन देती है।
Earth: आहा! बारिश की हर बूंद नदियों और झरनों में नई जान फूंक देती है। (Emotion: excited)
Effects: rain, moving_clouds, water_splashes

## Scene 3: Peaceful Winter (15s)
Visual: Serene snowy forest with pine trees covered in soft snowfall, gentle fog and mist.
Narration: शीत ऋतु में बर्फ की सफेद चादर बिछ जाती है और पेड़-पौधे विश्राम करते हैं।
Earth: सर्दी हमें सिखाती है कि नए जीवन की तैयारी के लिए विश्राम भी जरूरी है। (Emotion: calm)
Effects: snowfall, fog_mist

## Scene 4: Colorful Autumn (15s)
Visual: Forest hills with golden falling leaves swirling in the breeze and flying birds in the sky.
Narration: शरद ऋतु में पत्ते सुनहरे होकर गिरते हैं और पक्षी सुहाने मौसम में उड़ते हैं।
Earth: पतझड़ के बाद नया बसंत आता है! प्रकृति का यह चक्र हमेशा मुस्कुराता रहता है। (Emotion: cheerful)
Effects: falling_leaves, flying_birds
`;

const SAMPLE_HINDI_JSON = JSON.stringify(
  {
    schemaVersion: '1.0',
    story: {
      title: 'पृथ्वी का वादा: चार ऋतुएं',
      language: 'Hindi',
      targetDurationSeconds: 60,
      genre: 'Educational',
      logline: 'पृथ्वी बच्चों को सिखाती है कि चार ऋतुएं हमारे ग्रह पर जीवन का संतुलन कैसे बनाती हैं।',
      lesson: 'प्रकृति की हर ऋतु का एक विशेष उद्देश्य होता है।',
      visualStyle: '3D Storybook Animation',
    },
    characters: [
      {
        characterKey: 'earth',
        name: 'Earth',
        role: 'protagonist',
        species: 'earth',
        description: 'Smiling, wise living planet with blue oceans and green continents.',
      },
    ],
    scenes: [
      {
        sceneNumber: 1,
        title: 'सुनहरी गर्मियां',
        durationSeconds: 15,
        location: 'धूप से सराबोर घास का मैदान',
        charactersPresent: ['earth'],
        narration: 'ग्रीष्म ऋतु में सूरज अपनी सुनहरी किरणें बिखेरता है और प्रकृति खिल उठती है।',
        dialogue: [
          {
            speakerKey: 'earth',
            text: 'नमस्ते नन्हे दोस्तों! मैं तुम्हारी पृथ्वी हूँ। देखो, सूरज की धूप फसलों को पका रही है!',
            emotion: 'happy',
          },
        ],
        characterActions: [
          {
            characterKey: 'earth',
            action: 'wave',
            description: 'हाथ हिलाकर मुस्कुराती है',
          },
        ],
        background: {
          prompt: 'Sun-drenched golden meadows with distant mountains, vibrant sunshine rays and heat shimmer',
          style: '3D Storybook Animation',
        },
      },
      {
        sceneNumber: 2,
        title: 'मानसून की फुहारें',
        durationSeconds: 15,
        location: 'हरी-भरी वादियां और झरने',
        charactersPresent: ['earth'],
        narration: 'वर्षा ऋतु में काले बादल गरजते हैं और ठंडी बारिश सूखी धरती को नया जीवन देती है।',
        dialogue: [
          {
            speakerKey: 'earth',
            text: 'आहा! बारिश की हर बूंद नदियों और झरनों में नई जान फूंक देती है।',
            emotion: 'excited',
          },
        ],
        characterActions: [
          {
            characterKey: 'earth',
            action: 'jump',
            description: 'उछलकर खुशी मनाती है',
          },
        ],
        background: {
          prompt: 'Lush green hills and valleys covered in fresh gentle monsoon rain, rolling clouds and water splashes',
          style: '3D Storybook Animation',
        },
      },
    ],
    endScreen: {
      text: 'प्रकृति के और रोमांचक पाठों के लिए जुड़े रहें!',
    },
  },
  null,
  2
);

const SAMPLE_ENGLISH_JSON = JSON.stringify(
  {
    schemaVersion: '1.0',
    story: {
      title: "Pip & Barnaby's Great Adventure",
      language: 'English',
      targetDurationSeconds: 45,
      genre: 'Adventure',
      logline: 'Pip the little fox and Barnaby the wise owl search for the ancient golden acorn.',
      lesson: 'Patience and observation lead to great discoveries.',
      visualStyle: '3D Storybook Animation',
    },
    characters: [
      {
        characterKey: 'pip',
        name: 'Pip',
        role: 'protagonist',
        species: 'fox',
        description: 'Curious golden-furred fox cub wearing a red bandana.',
      },
      {
        characterKey: 'barnaby',
        name: 'Barnaby',
        role: 'sidekick',
        species: 'owl',
        description: 'Wise barn owl wearing round spectacles.',
      },
    ],
    scenes: [
      {
        sceneNumber: 1,
        title: 'The Whispering Glade',
        durationSeconds: 15,
        location: 'Ancient mossy forest glade',
        charactersPresent: ['pip', 'barnaby'],
        narration: 'Early in the morning, Pip and Barnaby gathered by the hollow tree.',
        dialogue: [
          {
            speakerKey: 'pip',
            text: 'Barnaby, the map says the golden acorn is near the crystalline stream!',
            emotion: 'excited',
          },
          {
            speakerKey: 'barnaby',
            text: 'Hoo! We must watch our step carefully and look for glowing moss.',
            emotion: 'calm',
          },
        ],
        characterActions: [
          {
            characterKey: 'pip',
            action: 'point',
            description: 'points towards the winding path',
          },
        ],
        background: {
          prompt: 'Enchanted ancient woodland glade with ancient mossy roots, gentle shafts of morning sunlight',
          style: '3D Storybook Animation',
        },
      },
      {
        sceneNumber: 2,
        title: 'The River Crossing',
        durationSeconds: 15,
        location: 'Sparkling forest river',
        charactersPresent: ['barnaby'],
        narration: 'Barnaby flew up to scout the riverbank from above.',
        dialogue: [
          {
            speakerKey: 'barnaby',
            text: 'The stepping stones are safe, young fox! Follow my path.',
            emotion: 'wise',
          },
        ],
        characterActions: [
          {
            characterKey: 'barnaby',
            action: 'idle',
            description: 'perches on a mossy branch observing the river',
          },
        ],
        background: 'A clear bubbling forest river with smooth stepping stones, emerald water and reeds',
      },
    ],
    endScreen: {
      text: 'Subscribe for more Pip and Barnaby adventures!',
    },
  },
  null,
  2
);

const AVAILABLE_OVERLAY_TYPES = [
  { type: 'sunshine_rays', label: 'Sunshine Rays', color: '#fef08a' },
  { type: 'heat_shimmer', label: 'Heat Shimmer', color: '#fde047' },
  { type: 'rain', label: 'Rain', color: '#38bdf8' },
  { type: 'moving_clouds', label: 'Moving Clouds', color: '#e2e8f0' },
  { type: 'water_splashes', label: 'Water Splashes', color: '#7dd3fc' },
  { type: 'snowfall', label: 'Snowfall', color: '#f8fafc' },
  { type: 'fog_mist', label: 'Fog & Mist', color: '#f1f5f9' },
  { type: 'falling_leaves', label: 'Falling Leaves', color: '#f97316' },
  { type: 'flying_birds', label: 'Flying Birds', color: '#334155' },
  { type: 'butterflies', label: 'Butterflies', color: '#f43f5e' },
];

export const ImportScriptModal: React.FC<ImportScriptModalProps> = ({
  isOpen,
  onClose,
  storyId,
  storyTitle,
  existingCharacters,
  onImportSuccess,
}) => {
  const [step, setStep] = useState<'input' | 'review'>('input');
  const [rawText, setRawText] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<'Hindi' | 'English'>('Hindi');
  const [targetDurationSeconds, setTargetDurationSeconds] = useState<number>(0);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const [showFormatGuide, setShowFormatGuide] = useState<boolean>(false);

  // Review step state
  const [draftResult, setDraftResult] = useState<DraftStoryboardResult | null>(null);
  const [reviewTitle, setReviewTitle] = useState<string>('');
  const [importMode, setImportMode] = useState<'replace' | 'append'>('replace');
  const [updateTitleOnImport, setUpdateTitleOnImport] = useState<boolean>(true);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importError, setImportError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopyAiPrompt = () => {
    const promptText = `You are an expert children's content writer and storyboard artist.
Write an engaging, educational children's story script following this exact JSON specification:
Language: ${selectedLanguage}
Target Duration: ${targetDurationSeconds > 0 ? targetDurationSeconds + ' seconds' : '60 seconds'}

Output strictly valid JSON with no markdown wrapping or additional text:
{
  "schemaVersion": "1.0",
  "story": {
    "title": "Story Title",
    "language": "${selectedLanguage}",
    "targetDurationSeconds": ${targetDurationSeconds > 0 ? targetDurationSeconds : 60},
    "genre": "Educational",
    "logline": "One clear sentence logline",
    "lesson": "Moral or educational takeaway",
    "visualStyle": "3D Storybook Animation"
  },
  "characters": [
    {
      "characterKey": "pip",
      "name": "Pip",
      "role": "protagonist",
      "species": "fox",
      "description": "Curious fox cub with a red bandana"
    }
  ],
  "scenes": [
    {
      "sceneNumber": 1,
      "title": "Scene Title",
      "durationSeconds": 15,
      "location": "Location Name",
      "charactersPresent": ["pip"],
      "narration": "Narration line",
      "dialogue": [
        { "speakerKey": "pip", "text": "Speech", "emotion": "cheerful" }
      ],
      "characterActions": [
        { "characterKey": "pip", "action": "idle", "description": "observes the surroundings" }
      ],
      "background": {
        "prompt": "Detailed cinematic environment plate without characters or text",
        "style": "3D Storybook Animation"
      }
    }
  ],
  "endScreen": {
    "text": "Subscribe for more stories!"
  }
}`;

    navigator.clipboard.writeText(promptText);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2500);
  };

  const handleDownloadTemplate = () => {
    const templateData = {
      schemaVersion: '1.0',
      story: {
        title: 'My Story Title',
        language: selectedLanguage,
        targetDurationSeconds: targetDurationSeconds > 0 ? targetDurationSeconds : 60,
        genre: 'Educational',
        logline: 'Logline here',
        lesson: 'Moral or lesson here',
        visualStyle: '3D Storybook Animation',
      },
      characters: [
        {
          characterKey: 'char_one',
          name: 'Character Name',
          role: 'protagonist',
          species: 'human',
          description: 'Visual appearance details',
        },
      ],
      scenes: [
        {
          sceneNumber: 1,
          title: 'Scene 1: Introduction',
          durationSeconds: 15,
          location: 'Location Name',
          charactersPresent: ['char_one'],
          narration: 'Narration text',
          dialogue: [
            { 'speakerKey': 'char_one', 'text': 'Dialogue line', 'emotion': 'cheerful' },
          ],
          characterActions: [
            { 'characterKey': 'char_one', 'action': 'wave', 'description': 'waves cheerfully' },
          ],
          background: {
            'prompt': 'Vibrant environment illustration without characters or text',
            'style': '3D Storybook Animation',
          },
        },
      ],
      endScreen: {
        text: 'Thanks for watching!',
      },
    };

    const blob = new Blob([JSON.stringify(templateData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'story-script-template.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRemoveCharacter = (idx: number) => {
    if (!draftResult) return;
    const removedChar = draftResult.characters[idx];
    const newChars = draftResult.characters.filter((_, i) => i !== idx);

    // Update dialogue lines referencing this character to 'Narrator'
    const newScenes = draftResult.scenes.map((sc) => ({
      ...sc,
      dialogue: sc.dialogue.map((d) =>
        d.characterName.toLowerCase() === removedChar.name.toLowerCase()
          ? { ...d, characterName: 'Narrator' }
          : d
      ),
      characterActions: sc.characterActions.filter(
        (a) => a.characterName.toLowerCase() !== removedChar.name.toLowerCase()
      ),
      charactersPresent: (sc.charactersPresent || []).filter(
        (cp: string) => cp.toLowerCase() !== removedChar.name.toLowerCase()
      ),
    }));

    setDraftResult({
      ...draftResult,
      characters: newChars,
      scenes: newScenes,
    });
  };

  const handleMapCharacter = (idx: number, targetExistingId: string) => {
    if (!draftResult) return;
    const existing = existingCharacters.find((c) => c.id === targetExistingId);
    if (!existing) return;

    const oldName = draftResult.characters[idx].name;
    const newChars = [...draftResult.characters];
    newChars[idx] = {
      ...newChars[idx],
      id: existing.id,
      name: existing.name,
    };

    const newScenes = draftResult.scenes.map((sc) => ({
      ...sc,
      dialogue: sc.dialogue.map((d) =>
        d.characterName.toLowerCase() === oldName.toLowerCase()
          ? { ...d, characterName: existing.name }
          : d
      ),
      characterActions: sc.characterActions.map((a) =>
        a.characterName.toLowerCase() === oldName.toLowerCase()
          ? { ...a, characterName: existing.name }
          : a
      ),
      charactersPresent: (sc.charactersPresent || []).map((cp: string) =>
        cp.toLowerCase() === oldName.toLowerCase() ? existing.name : cp
      ),
    }));

    setDraftResult({
      ...draftResult,
      characters: newChars,
      scenes: newScenes,
    });
  };

  if (!isOpen) return null;

  const handleParse = async () => {
    if (!rawText.trim()) {
      setParseError('Please paste your script text first.');
      return;
    }

    try {
      setIsParsing(true);
      setParseError(null);

      const parsed = await parseScriptForDraft({
        rawText: rawText.trim(),
        language: selectedLanguage,
        title: storyTitle,
        targetDuration: targetDurationSeconds > 0 ? targetDurationSeconds : undefined,
        targetDurationSeconds: targetDurationSeconds > 0 ? targetDurationSeconds : undefined,
        storyId,
        existingCharacters,
      });

      setDraftResult(parsed);
      setReviewTitle(parsed.title || storyTitle || 'Imported Story');
      setStep('review');
    } catch (err: any) {
      console.error('Failed to parse script:', err);
      setParseError(err.message || 'Failed to interpret script. Please check formatting.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleCommitImport = async () => {
    if (!draftResult || draftResult.scenes.length === 0) {
      setImportError('No scenes available to import.');
      return;
    }

    try {
      setIsImporting(true);
      setImportError(null);

      const res = await importDraftScenes(storyId, {
        scenes: draftResult.scenes,
        importMode,
        updateStoryMetadata: updateTitleOnImport,
        title: reviewTitle,
        targetDurationSeconds: draftResult.targetDurationSeconds,
        language: selectedLanguage,
      });

      onImportSuccess(res.scenes, updateTitleOnImport ? reviewTitle : undefined);
      onClose();
    } catch (err: any) {
      console.error('Failed to import draft scenes:', err);
      setImportError(err.message || 'Failed to save scenes to story.');
    } finally {
      setIsImporting(false);
    }
  };

  // Scene manipulation helpers in review step
  const handleUpdateScene = (idx: number, updates: Partial<DraftStoryboardScene>) => {
    if (!draftResult) return;
    const newScenes = [...draftResult.scenes];
    newScenes[idx] = { ...newScenes[idx], ...updates };
    setDraftResult({ ...draftResult, scenes: newScenes });
  };

  const handleDeleteScene = (idx: number) => {
    if (!draftResult) return;
    if (draftResult.scenes.length <= 1) {
      alert('You must have at least one scene.');
      return;
    }
    const newScenes = draftResult.scenes.filter((_, i) => i !== idx);
    setDraftResult({ ...draftResult, scenes: newScenes });
  };

  const handleMoveScene = (idx: number, direction: 'up' | 'down') => {
    if (!draftResult) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= draftResult.scenes.length) return;

    const newScenes = [...draftResult.scenes];
    const temp = newScenes[idx];
    newScenes[idx] = newScenes[targetIdx];
    newScenes[targetIdx] = temp;
    setDraftResult({ ...draftResult, scenes: newScenes });
  };

  // Dialogue line editing
  const handleUpdateDialogueLine = (
    sceneIdx: number,
    diagIdx: number,
    updates: Partial<DraftDialogueLine>
  ) => {
    if (!draftResult) return;
    const newScenes = [...draftResult.scenes];
    const newDialogue = [...newScenes[sceneIdx].dialogue];
    newDialogue[diagIdx] = { ...newDialogue[diagIdx], ...updates };
    newScenes[sceneIdx] = { ...newScenes[sceneIdx], dialogue: newDialogue };
    setDraftResult({ ...draftResult, scenes: newScenes });
  };

  const handleAddDialogueLine = (sceneIdx: number) => {
    if (!draftResult) return;
    const newScenes = [...draftResult.scenes];
    const defaultSpeaker =
      draftResult?.characters?.[0]?.name ||
      existingCharacters?.[0]?.name ||
      'Character';
    const newLine: DraftDialogueLine = {
      id: `diag-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      characterName: defaultSpeaker,
      text: selectedLanguage === 'Hindi' ? 'नमस्ते दोस्तों!' : 'Hello friends!',
      emotion: 'happy',
      voice: selectedLanguage === 'Hindi' ? 'hf_alpha' : 'bm_daniel',
    };
    newScenes[sceneIdx] = {
      ...newScenes[sceneIdx],
      dialogue: [...newScenes[sceneIdx].dialogue, newLine],
    };
    setDraftResult({ ...draftResult, scenes: newScenes });
  };

  const handleDeleteDialogueLine = (sceneIdx: number, diagIdx: number) => {
    if (!draftResult) return;
    const newScenes = [...draftResult.scenes];
    const newDialogue = newScenes[sceneIdx].dialogue.filter((_, i) => i !== diagIdx);
    newScenes[sceneIdx] = { ...newScenes[sceneIdx], dialogue: newDialogue };
    setDraftResult({ ...draftResult, scenes: newScenes });
  };

  // Character action editing
  const handleAddCharacterAction = (sceneIdx: number) => {
    if (!draftResult) return;
    const newScenes = [...draftResult.scenes];
    const defaultActor =
      draftResult?.characters?.[0]?.name ||
      existingCharacters?.[0]?.name ||
      newScenes[sceneIdx].dialogue?.[0]?.characterName ||
      'Character';
    const newAction = {
      characterName: defaultActor,
      action: 'idle',
      description: '',
    };
    const currentActions = newScenes[sceneIdx].characterActions || [];
    newScenes[sceneIdx] = {
      ...newScenes[sceneIdx],
      characterActions: [...currentActions, newAction],
    };
    setDraftResult({ ...draftResult, scenes: newScenes });
  };

  const handleUpdateCharacterAction = (
    sceneIdx: number,
    actIdx: number,
    updates: Partial<{ characterName: string; action: string; description?: string }>
  ) => {
    if (!draftResult) return;
    const newScenes = [...draftResult.scenes];
    const currentActions = [...(newScenes[sceneIdx].characterActions || [])];
    if (!currentActions[actIdx]) return;
    currentActions[actIdx] = { ...currentActions[actIdx], ...updates };
    newScenes[sceneIdx] = { ...newScenes[sceneIdx], characterActions: currentActions };
    setDraftResult({ ...draftResult, scenes: newScenes });
  };

  const handleDeleteCharacterAction = (sceneIdx: number, actIdx: number) => {
    if (!draftResult) return;
    const newScenes = [...draftResult.scenes];
    const currentActions = (newScenes[sceneIdx].characterActions || []).filter((_, i) => i !== actIdx);
    newScenes[sceneIdx] = { ...newScenes[sceneIdx], characterActions: currentActions };
    setDraftResult({ ...draftResult, scenes: newScenes });
  };

  // Effect overlays editing
  const handleToggleOverlay = (sceneIdx: number, overlayType: string) => {
    if (!draftResult) return;
    const sc = draftResult.scenes[sceneIdx];
    const exists = sc.suggestedOverlays.some((o) => o.type === overlayType);
    let newOverlays: DraftOverlayItem[];

    if (exists) {
      newOverlays = sc.suggestedOverlays.filter((o) => o.type !== overlayType);
    } else {
      const info = AVAILABLE_OVERLAY_TYPES.find((a) => a.type === overlayType) || {
        type: overlayType,
        label: overlayType,
        color: '#38bdf8',
      };
      newOverlays = [
        ...sc.suggestedOverlays,
        {
          id: `overlay-${overlayType}-${Date.now()}`,
          type: overlayType,
          label: info.label,
          color: info.color,
        },
      ];
    }

    handleUpdateScene(sceneIdx, { suggestedOverlays: newOverlays });
  };

  const totalCalculatedDuration = (draftResult?.scenes || []).reduce(
    (acc, s) => acc + (s.durationSeconds || 0),
    0
  );

  return (
    <div className="ed-modal-backdrop" onClick={onClose}>
      <div
        className="ed-modal-card ed-import-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: step === 'review' ? '980px' : '780px', width: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div className="ed-modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--ed-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BookOpenIcon size={20} color="#a855f7" />
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--ed-text)', margin: 0 }}>
                {step === 'input' ? 'Import Script to Storyboard' : 'Review & Customize Storyboard'}
              </h2>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--ed-text-muted)', margin: '4px 0 0' }}>
              {step === 'input'
                ? 'Paste an AI-written script from Claude, Gemini, ChatGPT or Markdown to prepare editable scenes.'
                : 'Review scene timings, narration, Earth dialogue and effects. Media is NOT auto-generated.'}
            </p>
          </div>
          <button
            type="button"
            className="ed-icon-btn"
            onClick={onClose}
            style={{ width: '28px', height: '28px', fontSize: '14px', display: 'grid', placeItems: 'center' }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {step === 'input' ? (
            <div>
              {/* Controls bar */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--ed-text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Language:
                    <select
                      className="ed-select"
                      value={selectedLanguage}
                      onChange={(e) => setSelectedLanguage(e.target.value as any)}
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                    >
                      <option value="Hindi">Hindi (हिंदी) - Female Voice (hf_alpha)</option>
                      <option value="English">English</option>
                    </select>
                  </label>

                  <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--ed-text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Target Duration:
                    <select
                      className="ed-select"
                      value={targetDurationSeconds}
                      onChange={(e) => setTargetDurationSeconds(Number(e.target.value))}
                      style={{ padding: '4px 8px', fontSize: '12px' }}
                    >
                      <option value={0}>♾️ No Limit / Script Length (Auto)</option>
                      <option value={30}>30s (~2 scenes)</option>
                      <option value={60}>60s (~4 scenes)</option>
                      <option value={90}>90s (~5 scenes)</option>
                      <option value={120}>2 min (~6 scenes)</option>
                      <option value={180}>3 min (~8 scenes)</option>
                      <option value={300}>5 min (~12 scenes)</option>
                      <option value={600}>10 min (~20 scenes)</option>
                    </select>
                  </label>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="ed-tool-btn"
                    onClick={handleCopyAiPrompt}
                    style={{ fontSize: '11px', padding: '4px 10px', color: copiedPrompt ? '#34d399' : '#818cf8', borderColor: copiedPrompt ? '#10b981' : '#6366f1' }}
                    title="Copy a structured prompt for ChatGPT, Claude, or Gemini"
                  >
                    {copiedPrompt ? '✓ Copied AI Prompt!' : '📋 Copy AI Prompt'}
                  </button>
                  <button
                    type="button"
                    className="ed-tool-btn"
                    onClick={handleDownloadTemplate}
                    style={{ fontSize: '11px', padding: '4px 10px' }}
                    title="Download canonical JSON schema template file"
                  >
                    ⬇️ Download JSON Template
                  </button>
                  <button
                    type="button"
                    className="ed-tool-btn"
                    onClick={() => {
                      setRawText(SAMPLE_HINDI_JSON);
                      setSelectedLanguage('Hindi');
                    }}
                    style={{ fontSize: '11px', padding: '4px 8px', color: '#c084fc', borderColor: '#8b5cf6' }}
                    title="Load valid Hindi Canonical JSON script"
                  >
                    Load Hindi JSON
                  </button>
                  <button
                    type="button"
                    className="ed-tool-btn"
                    onClick={() => {
                      setRawText(SAMPLE_ENGLISH_JSON);
                      setSelectedLanguage('English');
                    }}
                    style={{ fontSize: '11px', padding: '4px 8px', color: '#38bdf8', borderColor: '#0284c7' }}
                    title="Load valid English Canonical JSON script"
                  >
                    Load English JSON
                  </button>
                  <button
                    type="button"
                    className="ed-tool-btn"
                    onClick={() => {
                      setRawText(SAMPLE_HINDI_SCRIPT);
                      setSelectedLanguage('Hindi');
                    }}
                    style={{ fontSize: '11px', padding: '4px 8px' }}
                  >
                    Load Markdown Script
                  </button>
                  <button
                    type="button"
                    className="ed-tool-btn"
                    onClick={() => setShowFormatGuide(!showFormatGuide)}
                    style={{ fontSize: '11px', padding: '4px 8px', color: showFormatGuide ? '#f59e0b' : 'inherit' }}
                  >
                    {showFormatGuide ? 'Hide Format Guide' : 'Format Guide'}
                  </button>
                  {rawText && (
                    <button
                      type="button"
                      className="ed-tool-btn"
                      onClick={() => setRawText('')}
                      style={{ fontSize: '11px', padding: '4px 8px' }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Format Guide Drawer */}
              {showFormatGuide && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    background: 'var(--ed-surface-elevated)',
                    border: '1px solid #8b5cf6',
                    marginBottom: '14px',
                    fontSize: '12px',
                    lineHeight: 1.5,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <strong style={{ color: '#c084fc', fontSize: '13px' }}>📐 Standard AI Script Formats Supported:</strong>
                    <button
                      type="button"
                      onClick={() => setShowFormatGuide(false)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--ed-text-muted)', cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                    <div>
                      <strong style={{ color: 'var(--ed-text)', display: 'block', marginBottom: '4px' }}>1. Canonical JSON Schema v1.0 (Recommended)</strong>
                      <p style={{ margin: 0, color: 'var(--ed-text-secondary)', fontSize: '11.5px' }}>
                        Deterministic, structured JSON with <code>schemaVersion: "1.0"</code>, <code>story</code>, <code>characters</code>, and <code>scenes</code>. Each scene explicitly states <code>charactersPresent</code>, <code>narration</code>, <code>dialogue</code>, <code>characterActions</code>, and <code>background</code>.
                      </p>
                    </div>
                    <div>
                      <strong style={{ color: 'var(--ed-text)', display: 'block', marginBottom: '4px' }}>2. Screenplay Markdown / Fountain</strong>
                      <p style={{ margin: 0, color: 'var(--ed-text-secondary)', fontSize: '11.5px' }}>
                        Start with <code># Title: ...</code>, followed by <code>## Characters</code> (e.g. <code>- Pip: Fox</code>), and <code>## Scene 1: ...</code>. Production labels like <code>Visual: ...</code>, <code>Characters Present: ...</code>, <code>Effects: ...</code>, and <code>Character Action: ...</code> are strictly parsed.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Text Area */}
              <div style={{ position: 'relative' }}>
                <textarea
                  className="ed-textarea"
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder={`Paste your script here... Supports markdown screenplay, e.g.:

# Title: Earth's Promise: The Four Seasons
Language: Hindi
Target Duration: 60s

## Scene 1: Golden Summer (15s)
Visual: Sun-drenched golden meadows with vibrant sunshine rays.
Narration: ग्रीष्म ऋतु में सूरज अपनी सुनहरी किरणें बिखेरता है...
Earth: नमस्ते नन्हे दोस्तों! मैं तुम्हारी पृथ्वी हूँ। (Emotion: happy)
Effects: sunshine_rays

## Scene 2: The Monsoon Rain...`}
                  rows={16}
                  style={{
                    width: '100%',
                    fontFamily: 'monospace',
                    fontSize: '12.5px',
                    lineHeight: '1.5',
                    padding: '12px',
                    background: 'var(--ed-surface-elevated)',
                    color: 'var(--ed-text)',
                    borderColor: 'var(--ed-border)',
                    borderRadius: '6px',
                    resize: 'vertical',
                    minHeight: '280px',
                  }}
                />
              </div>

              {parseError && (
                <div style={{ marginTop: '12px', padding: '10px 14px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: '6px', color: '#f87171', fontSize: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <AlertTriangleIcon size={16} color="#ef4444" />
                  <span>{parseError}</span>
                </div>
              )}

              <div style={{ marginTop: '14px', padding: '10px 14px', background: 'var(--ed-surface-elevated)', borderRadius: '6px', fontSize: '11.5px', color: 'var(--ed-text-secondary)', lineHeight: '1.4' }}>
                <strong style={{ color: 'var(--ed-text)' }}>Note:</strong> We will structure this script into editable draft storyboard scenes with background prompts, narration, character dialogues, actions, and suggested overlays. <strong>No images, voice audios, or videos are generated until you choose to generate them in the editor.</strong>
              </div>
            </div>
          ) : (
            <div>
              {/* Step 2: Review & Customization */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '20px', padding: '14px', background: 'var(--ed-surface-elevated)', borderRadius: '8px', border: '1px solid var(--ed-border)', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ed-text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    Story Title:
                    <input
                      type="text"
                      className="ed-input"
                      value={reviewTitle}
                      onChange={(e) => setReviewTitle(e.target.value)}
                      style={{ width: '260px', padding: '5px 10px', fontSize: '13px' }}
                    />
                  </label>
                  <label style={{ fontSize: '12px', color: 'var(--ed-text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="checkbox"
                      checked={updateTitleOnImport}
                      onChange={(e) => setUpdateTitleOnImport(e.target.checked)}
                    />
                    Update Project Title
                  </label>
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: 'var(--ed-text-secondary)' }}>Import Mode:</span>
                  <label style={{ fontSize: '12px', color: 'var(--ed-text)', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'replace'}
                      onChange={() => setImportMode('replace')}
                    />
                    Replace Current Scenes
                  </label>
                  <label style={{ fontSize: '12px', color: 'var(--ed-text)', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'append'}
                      onChange={() => setImportMode('append')}
                    />
                    Append to End
                  </label>
                </div>
              </div>

              {/* Parser Warnings & Diagnostics */}
              {draftResult?.warnings && draftResult.warnings.length > 0 && (
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: 'rgba(234, 179, 8, 0.1)',
                    border: '1px solid rgba(234, 179, 8, 0.35)',
                    marginBottom: '16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <AlertTriangleIcon size={16} color="#eab308" />
                    <strong style={{ fontSize: '12.5px', color: '#facc15' }}>
                      Script Parser Diagnostics ({draftResult.warnings.length})
                    </strong>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {draftResult.warnings.map((w, idx) => (
                      <div
                        key={`modal-warning-${idx}`}
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: '8px',
                          fontSize: '11.5px',
                          color: w.severity === 'error' ? '#f87171' : w.severity === 'warning' ? '#fde047' : '#93c5fd',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: '4px',
                            background: w.severity === 'error' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                            border: `1px solid ${w.severity === 'error' ? '#ef4444' : '#eab308'}`,
                            textTransform: 'uppercase',
                          }}
                        >
                          {w.code}
                        </span>
                        <span>{w.message}</span>
                        {w.suggestion && (
                          <span style={{ color: 'var(--ed-text-muted)', fontStyle: 'italic' }}>
                            — {w.suggestion}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Story Overview Summary Card */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: '12px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ padding: '10px 12px', background: 'var(--ed-surface-elevated)', borderRadius: '6px', border: '1px solid var(--ed-border)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)', display: 'block' }}>Target Duration</span>
                  <strong style={{ fontSize: '14px', color: 'var(--ed-text)' }}>
                    {draftResult?.targetDurationSeconds ? `${draftResult.targetDurationSeconds}s` : 'Auto'}
                  </strong>
                </div>
                <div style={{ padding: '10px 12px', background: 'var(--ed-surface-elevated)', borderRadius: '6px', border: '1px solid var(--ed-border)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)', display: 'block' }}>Calculated Runtime</span>
                  <strong style={{ fontSize: '14px', color: '#38bdf8' }}>{totalCalculatedDuration}s</strong>
                </div>
                <div style={{ padding: '10px 12px', background: 'var(--ed-surface-elevated)', borderRadius: '6px', border: '1px solid var(--ed-border)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)', display: 'block' }}>Total Scenes</span>
                  <strong style={{ fontSize: '14px', color: 'var(--ed-text)' }}>{draftResult?.scenes.length || 0}</strong>
                </div>
                <div style={{ padding: '10px 12px', background: 'var(--ed-surface-elevated)', borderRadius: '6px', border: '1px solid var(--ed-border)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)', display: 'block' }}>Detected Cast</span>
                  <strong style={{ fontSize: '14px', color: '#c084fc' }}>{draftResult?.characters.length || 0}</strong>
                </div>
              </div>

              {/* Character Cast Review Panel */}
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: '8px',
                  background: 'var(--ed-surface-elevated)',
                  border: '1px solid var(--ed-border)',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <strong style={{ fontSize: '13px', color: 'var(--ed-text)' }}>
                      👥 Character Cast Review ({draftResult?.characters.length || 0})
                    </strong>
                    <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>
                      Verified dialogue speakers and actors. Link to existing characters or remove false detections.
                    </span>
                  </div>
                </div>

                {(draftResult?.characters || []).length === 0 ? (
                  <div style={{ fontSize: '12px', color: 'var(--ed-text-muted)', fontStyle: 'italic' }}>
                    No characters detected. This script will be imported with voice-over narration only.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
                    {draftResult?.characters.map((ch, chIdx) => {
                      const isLinkedToExisting = Boolean(ch.id);
                      return (
                        <div
                          key={`char-review-${chIdx}`}
                          style={{
                            padding: '10px 12px',
                            borderRadius: '6px',
                            background: 'var(--ed-surface)',
                            border: `1px solid ${isLinkedToExisting ? '#10b981' : 'var(--ed-border)'}`,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <strong style={{ fontSize: '13px', color: 'var(--ed-text)' }}>{ch.name}</strong>
                              <span
                                style={{
                                  fontSize: '10px',
                                  padding: '1px 5px',
                                  borderRadius: '3px',
                                  background: isLinkedToExisting ? 'rgba(16, 185, 129, 0.2)' : 'rgba(139, 92, 246, 0.2)',
                                  color: isLinkedToExisting ? '#34d399' : '#c084fc',
                                  fontWeight: 600,
                                }}
                              >
                                {isLinkedToExisting ? 'Linked' : ch.species || 'New'}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveCharacter(chIdx)}
                              title="Remove character (convert lines to narrator)"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#f87171',
                                cursor: 'pointer',
                                fontSize: '11px',
                                padding: '2px 6px',
                              }}
                            >
                              ✕ Remove
                            </button>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>Map to:</span>
                            <select
                              className="ed-select"
                              value={ch.id || ''}
                              onChange={(e) => handleMapCharacter(chIdx, e.target.value)}
                              style={{ flex: 1, padding: '2px 6px', fontSize: '11px' }}
                            >
                              <option value="">-- Create As New Character --</option>
                              {existingCharacters.map((ec) => (
                                <option key={ec.id} value={ec.id}>
                                  {ec.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Parsed Scenes List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {(draftResult?.scenes || []).map((sc, scIdx) => (
                  <div
                    key={`draft-scene-${scIdx}`}
                    style={{
                      border: '1px solid var(--ed-border)',
                      borderRadius: '8px',
                      background: 'var(--ed-surface-elevated)',
                      padding: '16px',
                    }}
                  >
                    {/* Scene Card Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', paddingBottom: '10px', borderBottom: '1px solid var(--ed-border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ background: '#8b5cf6', color: '#fff', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>
                          Scene {scIdx + 1}
                        </span>
                        <input
                          type="text"
                          className="ed-input"
                          value={sc.title}
                          onChange={(e) => handleUpdateScene(scIdx, { title: e.target.value })}
                          placeholder="Scene Title"
                          style={{ fontWeight: 600, fontSize: '14px', width: '220px', padding: '4px 8px' }}
                        />
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ fontSize: '12px', color: 'var(--ed-text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          Duration:
                          <input
                            type="number"
                            className="ed-input"
                            value={sc.durationSeconds}
                            onChange={(e) => handleUpdateScene(scIdx, { durationSeconds: Math.max(3, parseInt(e.target.value, 10) || 5) })}
                            style={{ width: '55px', padding: '3px 6px', fontSize: '12px' }}
                          />
                          s
                        </label>

                        <button
                          type="button"
                          className="ed-icon-btn"
                          onClick={() => handleMoveScene(scIdx, 'up')}
                          disabled={scIdx === 0}
                          title="Move Scene Up"
                          style={{ width: '26px', height: '26px', fontSize: '11px' }}
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          className="ed-icon-btn"
                          onClick={() => handleMoveScene(scIdx, 'down')}
                          disabled={scIdx === (draftResult?.scenes.length || 0) - 1}
                          title="Move Scene Down"
                          style={{ width: '26px', height: '26px', fontSize: '11px' }}
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          className="ed-icon-btn"
                          onClick={() => handleDeleteScene(scIdx)}
                          title="Delete Scene"
                          style={{ width: '26px', height: '26px', color: '#ef4444' }}
                        >
                          <TrashIcon size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Characters Present in Scene */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-secondary)' }}>
                        Cast in Scene:
                      </span>
                      {sc.charactersPresent && sc.charactersPresent.length > 0 ? (
                        sc.charactersPresent.map((cp: string, cpIdx: number) => (
                          <span
                            key={`scene-${scIdx}-cp-${cpIdx}`}
                            style={{
                              fontSize: '10.5px',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              background: 'rgba(139, 92, 246, 0.15)',
                              color: '#c084fc',
                              border: '1px solid rgba(139, 92, 246, 0.3)',
                              fontWeight: 600,
                            }}
                          >
                            {cp}
                          </span>
                        ))
                      ) : (
                        <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)', fontStyle: 'italic' }}>
                          Voice-over Narration only (No character on screen)
                        </span>
                      )}
                    </div>

                    {/* Scene Background Prompt */}
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--ed-text-secondary)' }}>
                          Background Image Prompt
                        </label>
                        <span style={{ fontSize: '10.5px', color: '#a855f7' }}>
                          Ready for Nano Banana / Gemini Generation
                        </span>
                      </div>
                      <textarea
                        className="ed-textarea"
                        value={sc.visualPrompt}
                        onChange={(e) => handleUpdateScene(scIdx, { visualPrompt: e.target.value })}
                        placeholder="Detailed background visual description..."
                        rows={2}
                        style={{ width: '100%', fontSize: '12px', padding: '6px 8px' }}
                      />
                    </div>

                    {/* Scene Narration */}
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--ed-text-secondary)' }}>
                          Narration Script
                        </label>
                        <span style={{ fontSize: '10.5px', color: 'var(--ed-text-muted)' }}>
                          Voice-over timing & lip-sync baseline
                        </span>
                      </div>
                      <textarea
                        className="ed-textarea"
                        value={sc.narration}
                        onChange={(e) => handleUpdateScene(scIdx, { narration: e.target.value })}
                        placeholder="Narration script text..."
                        rows={2}
                        style={{ width: '100%', fontSize: '12.5px', padding: '6px 8px' }}
                      />
                    </div>

                    {/* Character Dialogue Lines */}
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--ed-text-secondary)' }}>
                          Character Dialogue ({sc.dialogue.length})
                        </label>
                        <button
                          type="button"
                          className="ed-tool-btn"
                          onClick={() => handleAddDialogueLine(scIdx)}
                          style={{ fontSize: '10.5px', padding: '2px 8px' }}
                        >
                          + Add Line
                        </button>
                      </div>

                      {sc.dialogue.length === 0 ? (
                        <div style={{ fontSize: '11px', color: 'var(--ed-text-muted)', fontStyle: 'italic', padding: '6px' }}>
                          No character dialogue in this scene.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {sc.dialogue.map((d, dIdx) => (
                            <div
                              key={d.id || `diag-${dIdx}`}
                              style={{
                                display: 'flex',
                                gap: '8px',
                                alignItems: 'center',
                                background: 'var(--ed-surface)',
                                padding: '8px 10px',
                                borderRadius: '6px',
                                border: '1px solid var(--ed-border)',
                              }}
                            >
                              <div style={{ minWidth: '100px' }}>
                                <input
                                  type="text"
                                  className="ed-input"
                                  value={d.characterName}
                                  onChange={(e) => handleUpdateDialogueLine(scIdx, dIdx, { characterName: e.target.value })}
                                  placeholder="Speaker"
                                  style={{ width: '100%', fontSize: '11px', padding: '3px 6px', fontWeight: 600 }}
                                />
                              </div>

                              <div style={{ minWidth: '90px' }}>
                                <select
                                  className="ed-select"
                                  value={d.voice}
                                  onChange={(e) => handleUpdateDialogueLine(scIdx, dIdx, { voice: e.target.value })}
                                  style={{ width: '100%', fontSize: '11px', padding: '3px 6px' }}
                                >
                                  <option value="hf_alpha">hf_alpha (Hindi F)</option>
                                  <option value="hf_beta">hf_beta (Hindi M)</option>
                                  <option value="bm_daniel">bm_daniel (Eng M)</option>
                                  <option value="af_heart">af_heart (Eng F)</option>
                                  <option value="af_bella">af_bella (Girl)</option>
                                  <option value="bm_george">bm_george (Bear)</option>
                                </select>
                              </div>

                              <div style={{ minWidth: '85px' }}>
                                <select
                                  className="ed-select"
                                  value={d.emotion}
                                  onChange={(e) => handleUpdateDialogueLine(scIdx, dIdx, { emotion: e.target.value })}
                                  style={{ width: '100%', fontSize: '11px', padding: '3px 6px' }}
                                >
                                  <option value="happy">Happy</option>
                                  <option value="excited">Excited</option>
                                  <option value="calm">Calm</option>
                                  <option value="surprised">Surprised</option>
                                  <option value="cheerful">Cheerful</option>
                                  <option value="worried">Worried</option>
                                  <option value="sad">Sad</option>
                                </select>
                              </div>

                              <div style={{ flex: 1 }}>
                                <input
                                  type="text"
                                  className="ed-input"
                                  value={d.text}
                                  onChange={(e) => handleUpdateDialogueLine(scIdx, dIdx, { text: e.target.value })}
                                  placeholder="Character speech text..."
                                  style={{ width: '100%', fontSize: '12px', padding: '3px 8px' }}
                                />
                              </div>

                              <button
                                type="button"
                                className="ed-icon-btn"
                                onClick={() => handleDeleteDialogueLine(scIdx, dIdx)}
                                title="Remove Line"
                                style={{ width: '22px', height: '22px', color: '#ef4444' }}
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Suggested Effects / Overlays */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--ed-text-secondary)' }}>
                          Atmosphere & Visual Effects
                        </label>
                        <span style={{ fontSize: '10.5px', color: 'var(--ed-text-muted)' }}>
                          Click tags to toggle
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {AVAILABLE_OVERLAY_TYPES.map((ov) => {
                          const isSelected = sc.suggestedOverlays.some((o) => o.type === ov.type);
                          return (
                            <button
                              key={ov.type}
                              type="button"
                              onClick={() => handleToggleOverlay(scIdx, ov.type)}
                              style={{
                                fontSize: '11px',
                                padding: '3px 8px',
                                borderRadius: '12px',
                                border: `1px solid ${isSelected ? ov.color : 'var(--ed-border)'}`,
                                background: isSelected ? 'rgba(139, 92, 246, 0.2)' : 'var(--ed-surface)',
                                color: isSelected ? 'var(--ed-text)' : 'var(--ed-text-muted)',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <span>{ov.label}</span>
                              {isSelected && <span>✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {importError && (
                <div style={{ marginTop: '16px', padding: '10px 14px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: '6px', color: '#f87171', fontSize: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <AlertTriangleIcon size={16} color="#ef4444" />
                  <span>{importError}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--ed-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--ed-surface)' }}>
          {step === 'input' ? (
            <>
              <button type="button" className="ed-btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="ed-btn-export"
                onClick={handleParse}
                disabled={isParsing || !rawText.trim()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <SparklesIcon size={14} />
                <span>{isParsing ? 'Interpreting Script...' : 'Parse Script →'}</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="ed-btn-ghost"
                onClick={() => setStep('input')}
                disabled={isImporting}
              >
                ← Back to Script
              </button>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button type="button" className="ed-btn-ghost" onClick={onClose} disabled={isImporting}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="ed-btn-export"
                  onClick={handleCommitImport}
                  disabled={isImporting || !draftResult || draftResult.scenes.length === 0}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <CheckIcon size={14} />
                  <span>{isImporting ? 'Creating Scenes...' : `Confirm & Create (${draftResult?.scenes.length || 0} Scenes)`}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

