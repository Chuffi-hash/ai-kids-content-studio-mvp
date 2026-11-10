import {
  ShotType,
  CameraMovementType,
  StructuredSceneDirection,
  DirectedCharacterPlacement,
} from './scene-director.types.js';

export class SceneDirectorService {
  /**
   * Computes intelligent, varied cinematic staging for a scene.
   */
  public directScene(options: {
    sceneId: string;
    sceneNumber: number;
    totalScenes?: number;
    format?: '16:9' | '9:16' | '1:1' | '4:5';
    characters: Array<{ id: string; name: string; visualDescription?: string }>;
    dialogueLines?: Array<{ characterId?: string; characterName?: string; text?: string; emotion?: string }>;
    narration?: string;
    existingBackgroundUrl?: string;
  }): StructuredSceneDirection {
    const {
      sceneId,
      sceneNumber,
      totalScenes = 3,
      format = '16:9',
      characters,
      dialogueLines = [],
      existingBackgroundUrl,
    } = options;

    const isPortrait = format === '9:16';
    const isFirstScene = sceneNumber === 1;
    const isFinalScene = sceneNumber === totalScenes;
    const activeSpeakers = new Set(
      dialogueLines.map((d) => d.characterId || d.characterName?.toLowerCase()).filter(Boolean)
    );

    // 1. Determine Shot Type
    let shotType: ShotType;
    if (isFirstScene) {
      shotType = 'wide_establishing';
    } else if (characters.length >= 2) {
      // Alternate between two-shot and speaker close-up for dynamic visual interest
      shotType = sceneNumber % 2 === 0 ? 'medium_twoshot' : 'closeup_speaker';
    } else if (activeSpeakers.size > 0) {
      shotType = 'closeup_speaker';
    } else {
      shotType = 'character_focus';
    }

    // 2. Camera movement for cinematic interest
    let cameraMovement: CameraMovementType = 'static';
    if (shotType === 'wide_establishing') {
      cameraMovement = 'slow_zoom_in';
    } else if (shotType === 'closeup_speaker') {
      cameraMovement = 'zoom_in';
    } else if (sceneNumber % 2 === 0) {
      cameraMovement = 'pan_right';
    } else {
      cameraMovement = 'static';
    }

    // 3. Staging and Character Placements
    const placements: DirectedCharacterPlacement[] = [];

    if (characters.length === 1) {
      // Single Character Framing
      const char = characters[0];
      const isSpeaking = activeSpeakers.has(char.id) || activeSpeakers.has(char.name.toLowerCase());
      const baseScale = isPortrait
        ? (shotType === 'closeup_speaker' ? 2.65 : 2.25)
        : (shotType === 'closeup_speaker' ? 1.70 : 1.40);

      placements.push({
        instanceId: `inst-${char.id}-1`,
        characterId: char.id,
        name: char.name,
        x: isPortrait ? 360 : 640,
        y: isPortrait ? 800 : 430,
        scale: baseScale,
        flipX: false,
        zIndex: 10,
        action: isSpeaking ? 'talk' : (isFirstScene ? 'wave' : 'idle'),
        expression: isSpeaking ? 'excited' : 'happy',
        isSpeaker: isSpeaking,
      });
    } else if (characters.length >= 2) {
      // Two-Character Conversational Framing
      const charLeft = characters[0];
      const charRight = characters[1];

      const leftSpeaks = activeSpeakers.has(charLeft.id) || activeSpeakers.has(charLeft.name.toLowerCase());
      const rightSpeaks = activeSpeakers.has(charRight.id) || activeSpeakers.has(charRight.name.toLowerCase());

      const baseScale = isPortrait
        ? (shotType === 'closeup_speaker' ? 2.50 : 2.20)
        : (shotType === 'closeup_speaker' ? 1.55 : 1.38);

      // Left Character: stands at ~32% width, faces right (flipX: false)
      placements.push({
        instanceId: `inst-${charLeft.id}-1`,
        characterId: charLeft.id,
        name: charLeft.name,
        x: isPortrait ? 230 : 410,
        y: isPortrait ? 810 : 430,
        scale: leftSpeaks ? baseScale * 1.05 : baseScale,
        flipX: false, // Facing partner on right
        zIndex: leftSpeaks ? 15 : 10,
        action: leftSpeaks ? 'talk' : 'idle',
        expression: leftSpeaks ? 'excited' : (rightSpeaks ? 'curious' : 'happy'),
        isSpeaker: leftSpeaks,
      });

      // Right Character: stands at ~68% width, faces left toward partner (flipX: true)
      placements.push({
        instanceId: `inst-${charRight.id}-2`,
        characterId: charRight.id,
        name: charRight.name,
        x: isPortrait ? 490 : 870,
        y: isPortrait ? 810 : 430,
        scale: rightSpeaks ? baseScale * 1.05 : baseScale,
        flipX: true, // Facing partner on left!
        zIndex: rightSpeaks ? 15 : 10,
        action: rightSpeaks ? 'talk' : 'idle',
        expression: rightSpeaks ? 'excited' : (leftSpeaks ? 'curious' : 'happy'),
        isSpeaker: rightSpeaks,
      });
    }

    return {
      sceneId,
      sceneNumber,
      shotType,
      backgroundImageUrl: existingBackgroundUrl,
      cameraMovement,
      cameraZoom: shotType === 'closeup_speaker' ? 1.15 : 1.0,
      transition: {
        type: 'fade',
        durationMs: 250,
      },
      characterPlacements: placements,
    };
  }

  /**
   * Applies structured scene direction to existing scene animation data.
   */
  public applyDirectionToAnimationData(
    direction: StructuredSceneDirection,
    existingAnimationData: any = {}
  ): any {
    const instances = direction.characterPlacements.map((p) => ({
      instanceId: p.instanceId,
      characterId: p.characterId,
      name: p.name,
      x: p.x,
      y: p.y,
      scale: p.scale,
      flipX: p.flipX,
      rotation: 0,
      zIndex: p.zIndex,
      expression: p.expression,
    }));

    const clips = direction.characterPlacements.map((p) => ({
      clipId: `clip-${p.action}-${p.instanceId}`,
      instanceId: p.instanceId,
      action: p.action,
      startMs: 0,
      durationMs: 5000,
      loop: true,
      speedMultiplier: 1.0,
      motionMode: 'in_place' as const,
    }));

    const expressions = direction.characterPlacements.map((p) => ({
      id: `exp-${p.expression}-${p.instanceId}`,
      instanceId: p.instanceId,
      characterInstanceId: p.instanceId,
      characterId: p.characterId,
      expression: p.expression,
      startMs: 0,
      durationMs: 5000,
    }));

    return {
      ...existingAnimationData,
      shotType: direction.shotType,
      cameraMovement: direction.cameraMovement,
      transition: direction.transition,
      characterInstances: instances,
      animationClips: clips,
      expressionCues: expressions,
      background: existingAnimationData.background || {
        imageUrl: direction.backgroundImageUrl,
        fit: 'cover',
      },
    };
  }
}
