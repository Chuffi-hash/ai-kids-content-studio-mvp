import {
  VisualStyleId,
  VisualStylePreset,
  StyleCompatibilityResult,
} from './visual-styles.types.js';

export const VISUAL_STYLE_PRESETS: Record<VisualStyleId, VisualStylePreset> = {
  '2d_cartoon': {
    id: '2d_cartoon',
    name: '2D Cartoon',
    description: 'Clean, bold, modern 2D animation style with expressive shapes and dynamic line work.',
    rendering: 'Crisp vector-inspired outlines, vibrant solid fills, subtle cel-shading, appealing silhouettes',
    lighting: 'Bright, cheerful, high-key ambient illumination with minimal harsh shadows',
    texture: 'Smooth clean surfaces, graphic flat styling with micro-details on focal elements',
    colorPalette: 'Saturated joyful primaries, friendly pastels, high-contrast accents, welcoming harmony',
    negativePrompt: 'photorealistic, 3D render, dark gritty shadows, noise, film grain, complex gradients, blurry',
    composition: 'Clear focal center, staged foreground-middleground-background depth planes, open character staging',
    tags: ['2D', 'Cartoon', 'Animation', 'Friendly', 'Modern'],
  },
  'storybook_illustrated': {
    id: 'storybook_illustrated',
    name: '2D Storybook Illustration',
    description: 'Classic picture-book gouache and watercolor illustration with warmth and nostalgic charm.',
    rendering: 'Hand-painted storybook plate, delicate brush strokes, soft edges, tactile illustrated depth',
    lighting: 'Warm golden volumetric sunlight, gentle dappled illumination through foliage, soft ambient rim',
    texture: 'Rich gouache texture, cold-press paper grain, organic wood and leaf textures, soft pigments',
    colorPalette: 'Warm golden ambers, moss greens, earth ochres, dusty rose, cozy inviting hues',
    negativePrompt: 'harsh neon, plastic CGI, dark macabre tones, photographic realism, low quality, oversaturated modern look',
    composition: 'Whimsical storybook framing, gentle natural vignettes, comfortable open staging space',
    tags: ['Storybook', 'Hand-Painted', 'Classic', 'Gouache', 'Warm'],
  },
  '3d_animated': {
    id: '3d_animated',
    name: '3D Animated',
    description: 'Polished CGI animated feature style with smooth geometry and friendly character appeal.',
    rendering: 'High-end 3D CGI animation render, clean subsurface scattering, smooth bevelled geometries',
    lighting: 'Soft three-point studio lighting, gentle colored fill, cinematic key light with soft falloff',
    texture: 'Smooth satin cloth, clean wood finishes, tactile soft fur and stylized physical surfaces',
    colorPalette: 'Lively balanced color palette, rich midtones, soft highlights, clean ambient bounce light',
    negativePrompt: 'flat 2D, photo uncanny valley, raw noise, gritty horror lighting, pixelated, glitch',
    composition: 'Cinematic depth of field, balanced perspective, distinct depth layering with clear stage',
    tags: ['3D', 'CGI', 'Animated', 'Smooth', 'Feature'],
  },
  '3d_pixar': {
    id: '3d_pixar',
    name: '3D Pixar-like Stylized',
    description: 'World-class stylized 3D animation with expressive exaggeration, rich warmth, and tactile detail.',
    rendering: 'Pixar/Disney stylized 3D CGI, hyper-polished shaders, rich depth and tactile charm',
    lighting: 'Warm golden hour cinematic bounce lighting, soft rim light, glowing specular highlights, volumetric sunbeams',
    texture: 'Tactile woven fabrics, hyper-appealing stylized textures, soft peach-fuzz, painted wood, gentle reflections',
    colorPalette: 'Rich warm color palette with emotional resonance, golden ambers, sky blues, emerald greens',
    negativePrompt: 'flat illustration, dull lighting, uncanny photorealism, gritty, creepy, dark desaturated',
    composition: 'Expressive camera angle, layered depth staging with ample breathing room for characters',
    tags: ['Pixar', 'Stylized 3D', 'Cinematic', 'Emotional', 'High Quality'],
  },
  'photorealistic': {
    id: 'photorealistic',
    name: 'Realistic / Photorealistic',
    description: 'Hyper-detailed photographic natural environment with realistic optics and natural physical light.',
    rendering: 'Photographic capture, 35mm optical lens quality, realistic physical light transport, natural depth of field',
    lighting: 'Natural sunlight, realistic atmospheric diffusion, true-to-life environmental bounce and soft shadows',
    texture: 'Photographic natural bark, real leaf veins, organic ground soil, authentic stone and water reflections',
    colorPalette: 'True-to-life organic tones, nuanced earthy gradients, natural sky illumination, accurate color temperature',
    negativePrompt: 'cartoon, drawing, anime, vector, 3D toy render, oversaturated plastic, watermark, text',
    composition: 'Rule of thirds natural framing, expansive scenic depth, authentic horizon line and perspective',
    tags: ['Photorealistic', 'Natural', 'Realistic', 'Cinematic Photo', 'Detailed'],
  },
  'cinematic': {
    id: 'cinematic',
    name: 'Cinematic',
    description: 'Dramatic theatrical widescreen visual with anamorphic depth, rich lighting, and atmospheric mood.',
    rendering: 'Wide-angle theatrical cinematography, soft anamorphic lens bokeh, subtle color grading, atmospheric haze',
    lighting: 'Volumetric god rays, dramatic directional backlighting, cinematic rim lights, luminous atmospheric glow',
    texture: 'Film emulsion nuance, atmospheric particulate mist, deep environmental textures, tactile richness',
    colorPalette: 'Cohesive cinematic grade (teal-amber or warm sunrise), evocative deep values, rich focal highlights',
    negativePrompt: 'flat cartoon, amateur snapshot, oversaturated garish tones, washed out, muddy, low dynamic range',
    composition: 'Grand cinematic scale, strong leading lines, deep theatrical staging, epic landscape framing',
    tags: ['Cinematic', 'Theatrical', 'Widescreen', 'Atmospheric', 'Dramatic'],
  },
  'anime': {
    id: 'anime',
    name: 'Anime',
    description: 'Japanese animation scenic background style with painterly clouds, clean lines, and emotional vibrancy.',
    rendering: 'Ghibli-inspired painterly anime scenery, beautiful cloud formations, fine architectural linework',
    lighting: 'Radiant sparkling daylight, soft pastel rim illumination, luminous blue sky bounce light',
    texture: 'Hand-painted watercolor-acrylic scenic textures, detailed grassy banks, sparkling water ripples',
    colorPalette: 'Luminous sky blues, emerald greens, cherry blossom pinks, vibrant joyful atmospheric tones',
    negativePrompt: 'Western 3D CGI, dark gritty realism, muddy colors, photo grain, blurry linework',
    composition: 'Expansive open sky, poetic horizon line, gentle slope framing, peaceful expansive mood',
    tags: ['Anime', 'Ghibli Style', 'Scenic', 'Painterly', 'Luminous'],
  },
  'watercolor': {
    id: 'watercolor',
    name: 'Watercolor',
    description: 'Delicate wet-on-dry watercolor painting with translucent washes, soft blooms, and paper texture.',
    rendering: 'Fluid watercolor washes, expressive pigment granulation, soft bleeding edges, airy white space',
    lighting: 'Diffused ethereal morning light, soft transparent shadows, luminous paper glow',
    texture: 'Heavyweight cold-press watercolor paper, visible wet pigment blooms, dry-brush accents',
    colorPalette: 'Translucent soft pastels, lilac, mint, soft peach, watery sky blues, gentle earth tones',
    negativePrompt: 'sharp CGI, harsh black outlines, heavy 3D rendering, dark sludge, neon, plastic',
    composition: 'Airy breathing space, gentle vignetted borders, loose artistic framing, poetic depth',
    tags: ['Watercolor', 'Painterly', 'Soft', 'Translucent', 'Artistic'],
  },
  'claymation': {
    id: 'claymation',
    name: 'Clay Animation',
    description: 'Handcrafted stop-motion claymation aesthetic with tangible clay surfaces and tactile thumbprints.',
    rendering: 'Hand-sculpted plasticine stop-motion model, tactile tangible form, miniature depth of field',
    lighting: 'Warm tabletop studio spotlight, soft miniature shadows, tactile directional key light',
    texture: 'Subtle clay thumbprints, smoothed plasticine sheen, felt and cardboard miniature elements',
    colorPalette: 'Rich earthy modeling clay colors, primary playfulness, warm friendly tones, nostalgic craft charm',
    negativePrompt: 'sleek digital CGI, 2D flat, vector, photorealistic landscape, harsh digital glare',
    composition: 'Diorama miniature stage, macro camera perspective, shallow depth of field, handcrafted charm',
    tags: ['Claymation', 'Stop-Motion', 'Tactile', 'Plasticine', 'Handcrafted'],
  },
  'fantasy_illustration': {
    id: 'fantasy_illustration',
    name: 'Fantasy Illustration',
    description: 'Enchanting magical storybook fantasy with glowing elements, wonder-filled nature, and whimsical scale.',
    rendering: 'Rich digital fantasy painting, bioluminescent glows, ethereal sparkles, majestic organic architecture',
    lighting: 'Magical ambient twilight or enchanted sunbeams, soft glowing flora, mystical rim luminescence',
    texture: 'Luminescent crystals, ancient mossy bark, sparkling starlight, swirling mystical mists',
    colorPalette: 'Deep sapphire blues, glowing amethyst purples, emerald greens, warm gold highlights',
    negativePrompt: 'mundane contemporary office, industrial grit, dull grey, low resolution, ugly, terrifying dark horror',
    composition: 'Wonder-filled framing, majestic towering scale, clear path for hero staging, enchanting depth',
    tags: ['Fantasy', 'Magical', 'Enchanting', 'Whimsical', 'Glowing'],
  },
  'custom': {
    id: 'custom',
    name: 'Custom',
    description: 'User-specified custom art direction and prompt instructions.',
    rendering: 'Flexible user-specified rendering instructions',
    lighting: 'Custom user-specified lighting parameters',
    texture: 'Custom user-specified texture details',
    colorPalette: 'Custom user-specified color palette',
    negativePrompt: 'watermark, text, blurry, low quality',
    composition: 'Open composition tailored to custom prompt',
    tags: ['Custom', 'User-Defined', 'Flexible'],
  },
};

export class VisualStylesService {
  /**
   * Retrieves all visual style presets.
   */
  public static getAllPresets(): VisualStylePreset[] {
    return Object.values(VISUAL_STYLE_PRESETS);
  }

  /**
   * Retrieves a specific visual style preset by ID with safe fallback.
   */
  public static getPreset(styleId?: string): VisualStylePreset {
    if (!styleId) return VISUAL_STYLE_PRESETS.storybook_illustrated;
    const key = styleId.toLowerCase().replace(/[-\s]/g, '_') as VisualStyleId;
    return VISUAL_STYLE_PRESETS[key] || VISUAL_STYLE_PRESETS.storybook_illustrated;
  }

  /**
   * Evaluates compatibility between background and character styles.
   * Scenarios supported:
   * - Photo bg + 3D animated character -> Contrast / Hybrid ("Stylized character in realistic world, similar to Paddington / Space Jam")
   * - 2D cartoon bg + Vector rig -> Perfect match ("Classic unified 2D animation aesthetic")
   * - Cinematic fantasy bg + 3D stylized character -> Harmonious match ("Rich theatrical immersion")
   * - Watercolor bg + Illustrated character -> Harmonious match ("Whimsical unified storybook illustration")
   * Never forces or silently overrides choices; informs and guides the user.
   */
  public static evaluateStyleCompatibility(
    backgroundStyle: string,
    characterStyle: string
  ): StyleCompatibilityResult {
    const bg = this.getPreset(backgroundStyle);
    const char = this.getPreset(characterStyle);

    // Exact match
    if (bg.id === char.id) {
      return {
        backgroundStyle: bg.name,
        characterStyle: char.name,
        matchLevel: 'perfect',
        compatible: true,
        title: 'Perfect Style Harmony',
        advice: `Both background and character share the ${bg.name} visual style, producing a cohesive unified storybook aesthetic.`,
        suggestedAdjustments: [],
      };
    }

    // Scenario A: Photorealistic Background + 3D Animated Character
    if (
      (bg.id === 'photorealistic' || bg.id === 'cinematic') &&
      (char.id === '3d_animated' || char.id === '3d_pixar')
    ) {
      return {
        backgroundStyle: bg.name,
        characterStyle: char.name,
        matchLevel: 'contrast',
        compatible: true,
        title: 'Deliberate Hybrid Contrast (Live-Action / CGI Mix)',
        advice:
          'Pairing a photorealistic natural environment with a stylized 3D character creates an engaging live-action/animation hybrid (like Paddington or Peter Rabbit).',
        suggestedAdjustments: [
          'Ensure the character has a soft contact shadow on the ground plane to ground them in reality.',
          'Consider matching the warm directional lighting angle of the background.',
        ],
      };
    }

    // Scenario B: 2D Cartoon Background + Vector Character Rig
    if (
      (bg.id === '2d_cartoon' || bg.id === 'storybook_illustrated') &&
      (char.id === '2d_cartoon' || char.id === 'custom' || char.id === 'storybook_illustrated')
    ) {
      return {
        backgroundStyle: bg.name,
        characterStyle: char.name,
        matchLevel: 'harmonious',
        compatible: true,
        title: 'Classic Illustrated Story Harmony',
        advice:
          '2D illustrated backdrops pair seamlessly with editable vector character rigs, ensuring crisp rendering across resolutions.',
        suggestedAdjustments: [
          'Keep outline thickness and color saturation in balance between characters and background.',
        ],
      };
    }

    // Scenario C: Cinematic Fantasy Background + 3D Stylized Character
    if (
      (bg.id === 'fantasy_illustration' || bg.id === 'cinematic') &&
      (char.id === '3d_pixar' || char.id === '3d_animated')
    ) {
      return {
        backgroundStyle: bg.name,
        characterStyle: char.name,
        matchLevel: 'harmonious',
        compatible: true,
        title: 'Cinematic Fantasy World Harmony',
        advice:
          'Cinematic magical backgrounds complement stylized 3D characters, giving the video a feature-film storybook presence.',
        suggestedAdjustments: [
          'Add subtle atmospheric sparkles or glowing particles in foreground overlays to bind the scene layers together.',
        ],
      };
    }

    // Scenario D: Watercolor Background + Illustrated Character
    if (
      bg.id === 'watercolor' &&
      (char.id === 'storybook_illustrated' || char.id === 'watercolor')
    ) {
      return {
        backgroundStyle: bg.name,
        characterStyle: char.name,
        matchLevel: 'harmonious',
        compatible: true,
        title: 'Gentle Painterly Harmony',
        advice:
          'Watercolor environments provide a soft, dreamy backdrop that complements illustrated children’s book characters.',
        suggestedAdjustments: [
          'Soft lighting and gentle character drop shadows preserve the delicate painted feel.',
        ],
      };
    }

    // Claymation + 3D / Claymation
    if (bg.id === 'claymation' && char.id === 'claymation') {
      return {
        backgroundStyle: bg.name,
        characterStyle: char.name,
        matchLevel: 'perfect',
        compatible: true,
        title: 'Stop-Motion Craft Aesthetic',
        advice: 'Handcrafted plasticine styling creates a tactile, nostalgic stop-motion atmosphere.',
      };
    }

    // Potential clash detection (e.g. Claymation with Anime, or Photorealistic with heavy Clay)
    if (
      (bg.id === 'claymation' && char.id === 'anime') ||
      (bg.id === 'anime' && char.id === 'claymation')
    ) {
      return {
        backgroundStyle: bg.name,
        characterStyle: char.name,
        matchLevel: 'clashing',
        compatible: true, // Never blocks user choice
        title: 'Unconventional Artistic Blend',
        advice: 'Claymation and Anime feature very distinct rendering conventions.',
        warning:
          'The tactile stop-motion aesthetic of claymation may visually clash with fine anime cel-shading. Consider harmonizing styles or using a 2D/3D hybrid.',
        suggestedAdjustments: [
          'Try 2D Storybook Illustration or 3D Pixar-like Stylized for a more unified look.',
        ],
      };
    }

    // Photorealistic Background with flat 2D sketch
    if (bg.id === 'photorealistic' && char.id === '2d_cartoon') {
      return {
        backgroundStyle: bg.name,
        characterStyle: char.name,
        matchLevel: 'contrast',
        compatible: true,
        title: 'Stylized 2D over Real-World Background (Roger Rabbit Style)',
        advice:
          'Distinct contrast between photorealistic backdrop and 2D cartoon characters creates a playful hybrid world.',
        suggestedAdjustments: [
          'Add a noticeable contact shadow under the character so they appear seated on the actual ground.',
        ],
      };
    }

    // Default friendly pairing
    return {
      backgroundStyle: bg.name,
      characterStyle: char.name,
      matchLevel: 'harmonious',
      compatible: true,
      title: 'Stylistically Distinct Pairing',
      advice: `Pairing ${bg.name} scenery with ${char.name} character artwork gives your production a unique, distinctive look.`,
      suggestedAdjustments: [
        'Ensure lighting direction on the character aligns roughly with the background scenery.',
      ],
    };
  }
}
