import {
  VisualStyleId,
  VisualStylePreset,
  StyleCompatibilityResult,
  StyleIntensity,
  ColorPalettePreset,
  SceneMoodPreset,
  LightingPreset,
  BackgroundComplexity,
  CharacterSafeArea,
  ProjectVisualSettings,
  SceneVisualOverrides,
  ResolvedVisualSettings,
} from './visual-styles.types.js';

export const VISUAL_STYLE_PRESETS: Record<string, VisualStylePreset> = {
  cinematic: {
    id: 'cinematic',
    name: 'Cinematic',
    description: 'Cinematic environmental composition, layered depth, atmospheric perspective, sophisticated lighting, film-like color grading, carefully controlled contrast, natural environmental details, and wide establishing-shot framing.',
    rendering: 'Cinematic environmental composition, 35mm theatrical lens rendering, soft anamorphic depth of field, film-like color grading',
    lighting: 'Sophisticated filmic lighting, atmospheric volumetric god rays, carefully controlled contrast, luminous rim highlights',
    colorPalette: 'Film-like color grading, rich deep values, controlled saturation, subtle warm-cool temperature contrasts',
    texture: 'Film emulsion texture, subtle atmospheric particulate mist, natural organic surface details',
    environmentDetail: 'Natural environmental details, realistic architectural structures, authentic foliage and terrain',
    shapes: 'Grounded realistic geometry, natural architectural forms, strong readable silhouettes',
    depth: 'Layered spatial depth, atmospheric perspective, deep scenic receding planes',
    atmosphere: 'Cinematic gravitas, evocative atmospheric haze, immersive sense of place',
    visualTreatment: 'Anamorphic widescreen depth, subtle highlight bloom, pristine theatrical grading',
    backgroundAesthetics: 'Epic wide establishing-shot framing, cinematic grandeur, balanced breathing room',
    negativePrompt: 'flat cartoon, amateur snapshot, oversaturated garish tones, washed out, muddy, low dynamic range, watermark, text',
    composition: 'Grand cinematic scale, strong leading lines, deep theatrical staging, epic landscape framing',
    tags: ['Cinematic', 'Theatrical', 'Widescreen', 'Atmospheric', 'Dramatic'],
  },
  cartoon: {
    id: 'cartoon',
    name: 'Cartoon',
    description: 'Colorful stylized environments, simplified readable shapes, playful forms, expressive environmental design, clean visual silhouettes, appealing colors, and cohesive animated-world aesthetics.',
    rendering: 'Clean colorful 2D animated environmental plate, crisp readable silhouettes, expressive shapes, animation-ready art',
    lighting: 'Bright cheerful high-key ambient illumination, soft playful light wraps, gentle shadows',
    colorPalette: 'Colorful stylized environment palette, saturated joyful primaries, friendly pastels, clean visual silhouettes',
    texture: 'Smooth clean surfaces, graphic flat styling with micro-details on focal elements',
    environmentDetail: 'Simplified readable environmental shapes, playful forms, expressive environmental design, clean visual silhouettes',
    shapes: 'Curved friendly geometry, rounded forms, simplified readable shapes, exaggerated appealing contours',
    depth: 'Staged foreground-middleground-background depth planes, clear planar separation',
    atmosphere: 'Welcoming, lighthearted, cheerful, energetic animated-world atmosphere',
    visualTreatment: 'High visual clarity, vector-like precision, cohesive animated-world aesthetics',
    backgroundAesthetics: 'Cohesive animated-world aesthetics, playful forms, uncluttered staging',
    negativePrompt: 'photorealistic, 3D render, dark gritty shadows, noise, film grain, complex gradients, blurry, text, watermark',
    composition: 'Clear focal center, staged foreground-middleground-background depth planes, open character staging',
    tags: ['Cartoon', '2D', 'Animation', 'Friendly', 'Playful'],
  },
  '2d_cartoon': {
    id: '2d_cartoon',
    name: '2D Cartoon',
    description: 'Colorful stylized environments, simplified readable shapes, playful forms, expressive environmental design, clean visual silhouettes, appealing colors, and cohesive animated-world aesthetics.',
    rendering: 'Clean colorful 2D animated environmental plate, crisp readable silhouettes, expressive shapes, animation-ready art',
    lighting: 'Bright cheerful high-key ambient illumination, soft playful light wraps, gentle shadows',
    colorPalette: 'Colorful stylized environment palette, saturated joyful primaries, friendly pastels, clean visual silhouettes',
    texture: 'Smooth clean surfaces, graphic flat styling with micro-details on focal elements',
    environmentDetail: 'Simplified readable environmental shapes, playful forms, expressive environmental design, clean visual silhouettes',
    shapes: 'Curved friendly geometry, rounded forms, simplified readable shapes, exaggerated appealing contours',
    depth: 'Staged foreground-middleground-background depth planes, clear planar separation',
    atmosphere: 'Welcoming, lighthearted, cheerful, energetic animated-world atmosphere',
    visualTreatment: 'High visual clarity, vector-like precision, cohesive animated-world aesthetics',
    backgroundAesthetics: 'Cohesive animated-world aesthetics, playful forms, uncluttered staging',
    negativePrompt: 'photorealistic, 3D render, dark gritty shadows, noise, film grain, complex gradients, blurry, text, watermark',
    composition: 'Clear focal center, staged foreground-middleground-background depth planes, open character staging',
    tags: ['Cartoon', '2D', 'Animation', 'Friendly', 'Modern'],
  },
  anime: {
    id: 'anime',
    name: 'Anime',
    description: 'Anime background-art characteristics, carefully painted environments, expressive sky and lighting, stylized environmental details, layered perspective, rich atmosphere, and a cohesive anime visual language.',
    rendering: 'Carefully painted anime background-art scenery, Ghibli-inspired painterly plate, fine scenic linework',
    lighting: 'Expressive sky and lighting, radiant sparkling daylight, luminous blue sky bounce, soft rim glow',
    colorPalette: 'Luminous sky blues, emerald greens, cherry blossom pinks, clean atmospheric tones',
    texture: 'Hand-painted watercolor-acrylic scenic textures, detailed grassy banks, sparkling water ripples',
    environmentDetail: 'Intricately painted cloudscapes, detailed leaves and grass blades, charming architectural details, stylized environmental details',
    shapes: 'Flowing organic contours, poetic angles, classic anime environmental shapes',
    depth: 'Layered perspective, distinct atmospheric fading toward horizon, vast expansive scale',
    atmosphere: 'Rich atmosphere, poetic emotional resonance, wonder, peaceful expansive mood',
    visualTreatment: 'Cohesive anime visual language, delicate painted aesthetic, soft sun glints',
    backgroundAesthetics: 'Anime background-art scenery, cohesive anime visual language, breathtaking vistas',
    negativePrompt: 'Western 3D CGI, dark gritty realism, muddy colors, photo grain, blurry linework, watermark, text',
    composition: 'Expansive open sky, poetic horizon line, gentle slope framing, peaceful expansive mood',
    tags: ['Anime', 'Ghibli Style', 'Scenic', 'Painterly', 'Luminous'],
  },
  '3d_animation': {
    id: '3d_animation',
    name: '3D Animation',
    description: 'Polished 3D animated-film environmental aesthetics, appealing shapes, detailed materials, soft global illumination, dimensional depth, clean surfaces, and cinematic lighting.',
    rendering: 'Polished 3D animated-film environmental aesthetics, smooth geometry, clean subsurface scattering, clean surfaces',
    lighting: 'Cinematic lighting, soft global illumination, gentle colored ambient bounce, soft specular highlights',
    colorPalette: 'Rich balanced color palette, luminous midtones, warm bounce light, appealing harmonious tones',
    texture: 'Detailed materials, smooth bevelled surfaces, stylized wood, soft foliage, clean surfaces, satin sheens',
    environmentDetail: 'Rich environmental props, stylized tactile details, charming organic and architectural elements',
    shapes: 'Appealing shapes, friendly stylized proportions, dimensional forms',
    depth: 'Dimensional depth, physical perspective, soft depth of field falloff',
    atmosphere: 'Warm, immersive, enchanting, feature-film animated world atmosphere',
    visualTreatment: 'Pixar/Disney feature animation finish, clean dimensional rendering, hyper-appealing shaders',
    backgroundAesthetics: 'Polished 3D animated-film environmental aesthetics, clean surfaces, volumetric depth',
    negativePrompt: 'flat 2D, photo uncanny valley, raw noise, gritty horror lighting, pixelated, glitch, watermark, text',
    composition: 'Cinematic depth of field, balanced perspective, distinct depth layering with clear stage',
    tags: ['3D', 'CGI', 'Animated', 'Smooth', 'Feature'],
  },
  '3d_animated': {
    id: '3d_animated',
    name: '3D Animated',
    description: 'Polished 3D animated-film environmental aesthetics, appealing shapes, detailed materials, soft global illumination, dimensional depth, clean surfaces, and cinematic lighting.',
    rendering: 'Polished 3D animated-film environmental aesthetics, smooth geometry, clean subsurface scattering, clean surfaces',
    lighting: 'Cinematic lighting, soft global illumination, gentle colored ambient bounce, soft specular highlights',
    colorPalette: 'Rich balanced color palette, luminous midtones, warm bounce light, appealing harmonious tones',
    texture: 'Detailed materials, smooth bevelled surfaces, stylized wood, soft foliage, clean surfaces, satin sheens',
    environmentDetail: 'Rich environmental props, stylized tactile details, charming organic and architectural elements',
    shapes: 'Appealing shapes, friendly stylized proportions, dimensional forms',
    depth: 'Dimensional depth, physical perspective, soft depth of field falloff',
    atmosphere: 'Warm, immersive, enchanting, feature-film animated world atmosphere',
    visualTreatment: 'Pixar/Disney feature animation finish, clean dimensional rendering, hyper-appealing shaders',
    backgroundAesthetics: 'Polished 3D animated-film environmental aesthetics, clean surfaces, volumetric depth',
    negativePrompt: 'flat 2D, photo uncanny valley, raw noise, gritty horror lighting, pixelated, glitch, watermark, text',
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
    environmentDetail: 'Charming micro-details, tactile stylized foliage, warm architectural character',
    shapes: 'Appealing rounded geometry, expressive exaggerations, fluid silhouettes',
    depth: 'Volumetric atmospheric depth, multi-plane layering, cinematic camera lens',
    atmosphere: 'Heartwarming, whimsical, emotionally resonant, feature-film quality',
    visualTreatment: 'World-class animated movie plate, high production value, pristine shaders',
    backgroundAesthetics: 'Expressive exaggeration, rich warmth, tactile detail',
    negativePrompt: 'flat illustration, dull lighting, uncanny photorealism, gritty, creepy, dark desaturated, watermark, text',
    composition: 'Expressive camera angle, layered depth staging with ample breathing room for characters',
    tags: ['Pixar', 'Stylized 3D', 'Cinematic', 'Emotional', 'High Quality'],
  },
  storybook_illustration: {
    id: 'storybook_illustration',
    name: 'Storybook Illustration',
    description: 'Beautifully illustrated storybook environments, painterly textures, expressive colors, whimsical environmental details, soft depth, and a coherent illustrated visual style.',
    rendering: 'Beautifully illustrated storybook environments, hand-painted gouache and watercolor plate, painterly textures',
    lighting: 'Warm golden volumetric ambient sunlight, gentle dappled illumination, soft depth',
    colorPalette: 'Expressive colors, warm golden ambers, moss greens, earth ochres, dusty rose, cozy inviting hues',
    texture: 'Painterly textures, rich gouache texture, cold-press paper grain, organic wood and leaf textures, soft pigments',
    environmentDetail: 'Whimsical environmental details, blooming wildflowers, mossy tree trunks, charming stone walls',
    shapes: 'Gentle natural curves, hand-drawn organic contours, whimsical storybook silhouettes',
    depth: 'Soft depth, gentle atmospheric fading, layered illustrated stage',
    atmosphere: 'Cozy, warm, heartwarming, imaginative, timeless storybook charm',
    visualTreatment: 'Delicate hand-illustrated plate, soft edges, tactile illustrated depth, coherent illustrated visual style',
    backgroundAesthetics: 'Coherent illustrated visual style, gentle natural vignettes, comfortable open staging',
    negativePrompt: 'harsh neon, plastic CGI, dark macabre tones, photographic realism, low quality, oversaturated modern look, text, watermark',
    composition: 'Whimsical storybook framing, gentle natural vignettes, comfortable open staging space',
    tags: ['Storybook', 'Hand-Painted', 'Classic', 'Gouache', 'Warm'],
  },
  storybook_illustrated: {
    id: 'storybook_illustrated',
    name: 'Storybook Illustration',
    description: 'Beautifully illustrated storybook environments, painterly textures, expressive colors, whimsical environmental details, soft depth, and a coherent illustrated visual style.',
    rendering: 'Beautifully illustrated storybook environments, hand-painted gouache and watercolor plate, painterly textures',
    lighting: 'Warm golden volumetric ambient sunlight, gentle dappled illumination, soft depth',
    colorPalette: 'Expressive colors, warm golden ambers, moss greens, earth ochres, dusty rose, cozy inviting hues',
    texture: 'Painterly textures, rich gouache texture, cold-press paper grain, organic wood and leaf textures, soft pigments',
    environmentDetail: 'Whimsical environmental details, blooming wildflowers, mossy tree trunks, charming stone walls',
    shapes: 'Gentle natural curves, hand-drawn organic contours, whimsical storybook silhouettes',
    depth: 'Soft depth, gentle atmospheric fading, layered illustrated stage',
    atmosphere: 'Cozy, warm, heartwarming, imaginative, timeless storybook charm',
    visualTreatment: 'Delicate hand-illustrated plate, soft edges, tactile illustrated depth, coherent illustrated visual style',
    backgroundAesthetics: 'Coherent illustrated visual style, gentle natural vignettes, comfortable open staging',
    negativePrompt: 'harsh neon, plastic CGI, dark macabre tones, photographic realism, low quality, oversaturated modern look, text, watermark',
    composition: 'Whimsical storybook framing, gentle natural vignettes, comfortable open staging space',
    tags: ['Storybook', 'Hand-Painted', 'Classic', 'Gouache', 'Warm'],
  },
  stylized_realism: {
    id: 'stylized_realism',
    name: 'Stylized Realism',
    description: 'Believable environmental structures and natural proportions while retaining artistic stylization, painterly surface treatment, cinematic lighting, rich but controlled color, and subtle 3D depth.',
    rendering: 'Believable environmental structures and natural proportions with artistic stylization, painterly surface treatment',
    lighting: 'Cinematic lighting, soft directional sun, rich bounce light, atmospheric diffusion',
    colorPalette: 'Rich but controlled color, nuanced earthy gradients, true-to-life sky illumination',
    texture: 'Painterly surface treatment, natural organic bark, authentic stone, fine foliage details',
    environmentDetail: 'Natural proportions, realistic terrain features, believable vegetation, architecturally sound environmental structures',
    shapes: 'Natural proportions, grounded architectural and geographical forms, refined silhouettes',
    depth: 'Subtle 3D depth, natural horizon lines, authentic perspective with artistic atmospheric depth',
    atmosphere: 'Believable, immersive, sophisticated, natural world wonder with artistic warmth',
    visualTreatment: 'Painterly realism, controlled contrast, high visual fidelity without sterile photographic sharpness',
    backgroundAesthetics: 'Believable environmental structures, natural proportions, elegant spatial composition',
    negativePrompt: 'oversaturated cartoon, plastic CGI, uncanny valley, harsh outlines, messy noise, watermark, text',
    composition: 'Balanced natural perspective, layered scenic depth, authentic horizon line, open staging ground',
    tags: ['Stylized Realism', 'Believable', 'Painterly', 'Cinematic', 'Natural'],
  },
  fantasy_illustration: {
    id: 'fantasy_illustration',
    name: 'Fantasy Illustration',
    description: 'Imaginative environmental design, magical atmosphere where appropriate, dramatic lighting, rich environmental details, and believable spatial composition.',
    rendering: 'Imaginative environmental design, digital fantasy painting, wonder-filled nature, ethereal glowing elements',
    lighting: 'Dramatic lighting, magical atmosphere, enchanted sunbeams, soft glowing flora, mystical rim luminescence',
    colorPalette: 'Deep sapphire blues, glowing amethyst purples, emerald greens, warm gold highlights',
    texture: 'Luminescent crystals, ancient mossy bark, sparkling starlight, swirling mystical mists',
    environmentDetail: 'Rich environmental details, towering ancient trees, magical floating lanterns, enchanted flora, majestic archways',
    shapes: 'Majestic towering scale, sweeping organic arches, fanciful organic architecture',
    depth: 'Believable spatial composition, epic spatial composition, dramatic vertical and horizontal scale',
    atmosphere: 'Magical atmosphere, wonder-filled, mystical, awe-inspiring, safe and enchanting for children',
    visualTreatment: 'Rich magical glow, soft starlight diffusion, ethereal fantasy illustration finish',
    backgroundAesthetics: 'Imaginative environmental design, dramatic lighting, rich environmental details, believable spatial composition',
    negativePrompt: 'mundane contemporary office, industrial grit, dull grey, low resolution, ugly, terrifying dark horror, watermark, text',
    composition: 'Wonder-filled framing, majestic towering scale, clear path for hero staging, enchanting depth',
    tags: ['Fantasy', 'Magical', 'Enchanting', 'Whimsical', 'Glowing'],
  },
  watercolor: {
    id: 'watercolor',
    name: 'Watercolor',
    description: 'Watercolor textures, pigment variation, soft edges, expressive brushwork, layered washes, and hand-painted environmental details.',
    rendering: 'Fluid watercolor washes, expressive pigment granulation, soft edges, expressive brushwork',
    lighting: 'Diffused ethereal morning daylight, soft transparent shadows, luminous paper glow',
    colorPalette: 'Translucent soft pastels, lilac, mint, soft peach, watery sky blues, gentle earth tones',
    texture: 'Watercolor textures, pigment variation, heavyweight cold-press watercolor paper, visible wet pigment blooms, dry-brush accents',
    environmentDetail: 'Hand-painted environmental details, delicate trees, loose floral accents, soft flowing streams, gentle clouds',
    shapes: 'Soft fluid forms, impressionistic silhouettes, gentle watercolor borders',
    depth: 'Airy breathing space, gentle vignetted borders, loose artistic framing, soft depth',
    atmosphere: 'Calm, poetic, dreamy, nostalgic, gentle, airy watercolor charm',
    visualTreatment: 'Wet-on-dry watercolor technique, soft edges, pigment variation, layered washes',
    backgroundAesthetics: 'Hand-painted environmental details, watercolor textures, pigment variation, soft edges, layered washes',
    negativePrompt: 'sharp CGI, harsh black outlines, heavy 3D rendering, dark sludge, neon, plastic, watermark, text',
    composition: 'Airy breathing space, gentle vignetted borders, loose artistic framing, poetic depth',
    tags: ['Watercolor', 'Painterly', 'Soft', 'Translucent', 'Artistic'],
  },
  pixel_art: {
    id: 'pixel_art',
    name: 'Pixel Art',
    description: 'Intentional pixel-art forms, controlled pixel clusters, limited coherent color palettes, pixel-based lighting, readable depth, and consistent pixel-art environment rendering.',
    rendering: 'Intentional pixel-art forms, controlled pixel clusters, consistent pixel-art environment rendering, crisp pixels',
    lighting: 'Pixel-based lighting, stepped dithered shadow gradients, bright highlight pixels',
    colorPalette: 'Limited coherent color palettes, 16-32 color retro palette, readable contrast',
    texture: 'Controlled pixel clusters, dither patterns on foliage and clouds, retro surface detailing',
    environmentDetail: 'Charming 16-bit environmental tiles, pixelated trees, retro cobblestone roads, pixel flowers',
    shapes: 'Intentional pixel-art forms, geometric readable pixel silhouettes, clean blocky structures',
    depth: 'Readable depth, layered 2D parallax planes (foreground, middle ground, distant skyline)',
    atmosphere: 'Nostalgic, playful, retro video-game charm, clean and readable gaming world',
    visualTreatment: 'Controlled pixel clusters, zero blur or muddy interpolation, crisp pixel-art environment rendering',
    backgroundAesthetics: 'Intentional pixel-art forms, controlled pixel clusters, limited coherent color palettes, readable depth',
    negativePrompt: 'anti-aliased modern blur, vector curves, 3D CGI, photorealistic textures, messy noise, watermark, text',
    composition: 'Clear horizontal grid framing, distinct multi-plane parallax depth, open stage for pixel characters',
    tags: ['Pixel Art', 'Retro', '16-bit', 'Nostalgic', 'Charming'],
  },
  photorealistic: {
    id: 'photorealistic',
    name: 'Realistic / Photorealistic',
    description: 'Hyper-detailed photographic natural environment with realistic optics and natural physical light.',
    rendering: 'Photographic capture, 35mm optical lens quality, realistic physical light transport, natural depth of field',
    lighting: 'Natural sunlight, realistic atmospheric diffusion, true-to-life environmental bounce and soft shadows',
    texture: 'Photographic natural bark, real leaf veins, organic ground soil, authentic stone and water reflections',
    colorPalette: 'True-to-life organic tones, nuanced earthy gradients, natural sky illumination, accurate color temperature',
    environmentDetail: 'Authentic physical foliage, true botanical species, natural ground erosion, geological realism',
    shapes: 'Natural uncurated organic shapes, physical geometry, authentic silhouettes',
    depth: 'True optical depth of field, real-world focal perspective, natural atmospheric horizon',
    atmosphere: 'Authentic natural world atmosphere, tangible realism, physical presence',
    visualTreatment: '35mm optical lens characteristics, raw photographic fidelity, zero artificial stylization',
    backgroundAesthetics: 'Realistic optics, natural physical light, environmental detail',
    negativePrompt: 'cartoon, drawing, anime, vector, 3D toy render, oversaturated plastic, watermark, text',
    composition: 'Rule of thirds natural framing, expansive scenic depth, authentic horizon line and perspective',
    tags: ['Photorealistic', 'Natural', 'Realistic', 'Cinematic Photo', 'Detailed'],
  },
  claymation: {
    id: 'claymation',
    name: 'Clay Animation',
    description: 'Handcrafted stop-motion claymation aesthetic with tangible clay surfaces and tactile thumbprints.',
    rendering: 'Hand-sculpted plasticine stop-motion model, tactile tangible form, miniature depth of field',
    lighting: 'Warm tabletop studio spotlight, soft miniature shadows, tactile directional key light',
    colorPalette: 'Rich earthy modeling clay colors, primary playfulness, warm friendly tones, nostalgic craft charm',
    texture: 'Subtle clay thumbprints, smoothed plasticine sheen, felt and cardboard miniature elements',
    environmentDetail: 'Handmade miniature trees, cardboard clouds, painted clay pebbles, miniature felt grass',
    shapes: 'Chunky rounded plasticine forms, handcrafted organic shapes, tactile miniature silhouettes',
    depth: 'Macro camera perspective, shallow depth of field, handcrafted diorama scale',
    atmosphere: 'Nostalgic, warm, tactile, cozy stop-motion studio atmosphere',
    visualTreatment: 'Physical stop-motion capture, tactile thumbprints, tangible studio lighting',
    backgroundAesthetics: 'Handcrafted stop-motion claymation aesthetic, tangible clay surfaces',
    negativePrompt: 'sleek digital CGI, 2D flat, vector, photorealistic landscape, harsh digital glare, watermark, text',
    composition: 'Diorama miniature stage, macro camera perspective, shallow depth of field, handcrafted charm',
    tags: ['Claymation', 'Stop-Motion', 'Tactile', 'Plasticine', 'Handcrafted'],
  },
  custom: {
    id: 'custom',
    name: 'Custom',
    description: 'User-specified custom visual style and art direction instructions.',
    rendering: 'Flexible user-specified rendering instructions',
    lighting: 'Custom user-specified lighting parameters',
    colorPalette: 'Custom user-specified color palette',
    texture: 'Custom user-specified texture details',
    environmentDetail: 'Custom environmental elements',
    shapes: 'Custom shapes and forms',
    depth: 'Custom depth staging',
    atmosphere: 'Custom atmosphere',
    visualTreatment: 'Custom visual treatment',
    backgroundAesthetics: 'Custom background aesthetics',
    negativePrompt: 'watermark, text, blurry, low quality',
    composition: 'Open composition tailored to custom prompt',
    tags: ['Custom', 'User-Defined', 'Flexible'],
  },
};

export const CANONICAL_STYLE_KEYS: VisualStyleId[] = [
  '2d_cartoon',
  'storybook_illustrated',
  '3d_animated',
  '3d_pixar',
  'photorealistic',
  'cinematic',
  'anime',
  'watercolor',
  'claymation',
  'fantasy_illustration',
  'custom',
];

export class VisualStylesService {
  /**
   * Retrieves all canonical visual style presets.
   */
  public static getAllPresets(): VisualStylePreset[] {
    return CANONICAL_STYLE_KEYS.map((id) => VISUAL_STYLE_PRESETS[id]);
  }

  /**
   * Retrieves all style presets including aliases.
   */
  public static getAllPresetsWithAliases(): VisualStylePreset[] {
    return Object.values(VISUAL_STYLE_PRESETS);
  }

  /**
   * Retrieves a specific visual style preset by ID with alias mapping and safe fallback.
   */
  public static getPreset(styleId?: string): VisualStylePreset {
    if (!styleId) return VISUAL_STYLE_PRESETS.storybook_illustration;
    const clean = styleId.toLowerCase().replace(/[-\s]/g, '_');

    // Canonical direct match
    if (VISUAL_STYLE_PRESETS[clean]) {
      return VISUAL_STYLE_PRESETS[clean];
    }

    // Friendly alias matching
    if (clean.includes('cinema') || clean.includes('film')) return VISUAL_STYLE_PRESETS.cinematic;
    if (clean.includes('pixel')) return VISUAL_STYLE_PRESETS.pixel_art;
    if (clean.includes('water')) return VISUAL_STYLE_PRESETS.watercolor;
    if (clean.includes('fantasy')) return VISUAL_STYLE_PRESETS.fantasy_illustration;
    if (clean.includes('realis') && clean.includes('styl')) return VISUAL_STYLE_PRESETS.stylized_realism;
    if (clean.includes('realis') || clean.includes('photo')) return VISUAL_STYLE_PRESETS.photorealistic;
    if (clean.includes('anime') || clean.includes('ghibli')) return VISUAL_STYLE_PRESETS.anime;
    if (clean.includes('3d') || clean.includes('pixar') || clean.includes('cgi')) return VISUAL_STYLE_PRESETS['3d_animation'];
    if (clean.includes('cartoon') || clean.includes('2d')) return VISUAL_STYLE_PRESETS.cartoon;
    if (clean.includes('story') || clean.includes('book') || clean.includes('illustrat')) return VISUAL_STYLE_PRESETS.storybook_illustration;
    if (clean.includes('clay')) return VISUAL_STYLE_PRESETS.claymation;
    if (clean.includes('custom')) return VISUAL_STYLE_PRESETS.custom;

    return VISUAL_STYLE_PRESETS.storybook_illustration;
  }

  /**
   * Formats style-specific instructions modified by intensity.
   */
  public static getIntensityInstruction(preset: VisualStylePreset, intensity: StyleIntensity = 'balanced'): string {
    if (preset.id === 'custom') {
      return '';
    }

    if (intensity === 'subtle') {
      return `Subtle ${preset.name} stylization: mostly natural environment with delicate artistic touches of ${preset.rendering}. ${preset.lighting}. Soft ${preset.texture}.`;
    }

    if (intensity === 'strong') {
      return `Strong ${preset.name} stylization: highly exaggerated, deeply pronounced ${preset.rendering}. Bold ${preset.lighting}. Rich ${preset.texture}. Prominent ${preset.shapes}. Distinct ${preset.visualTreatment}.`;
    }

    // Balanced default
    return `${preset.name} visual style: ${preset.rendering}. ${preset.lighting}. ${preset.texture}. ${preset.backgroundAesthetics}.`;
  }

  /**
   * Formats color palette instructions.
   */
  public static getColorPaletteInstruction(palette?: ColorPalettePreset, customPalette?: string): string {
    if (palette === 'custom' && customPalette && customPalette.trim().length > 0) {
      return `Color palette: ${customPalette.trim()}.`;
    }

    switch (palette) {
      case 'warm':
        return 'Color palette: warm golden hues, soft honey ambers, sun-kissed terra cottas, gentle ochres, and inviting cheerful warmth.';
      case 'cool':
        return 'Color palette: cool alpine teals, crisp sky blues, soft lavender tints, frosted mint greens, and fresh tranquil tones.';
      case 'vibrant':
        return 'Color palette: vibrant saturated primaries, playful bright secondary accents, joyful jewel tones, and high-energy lively colors.';
      case 'pastel':
        return 'Color palette: gentle soft pastels, dusty rose, butter yellow, powder blue, sage mint, and soothing delicate hues.';
      case 'natural':
        return 'Color palette: organic natural earth tones, foliage greens, bark browns, stone greys, and true-to-life sky gradients.';
      case 'muted':
        return 'Color palette: restrained muted hues, subtle desaturated tones, sophisticated neutral accents, and calm peaceful harmony.';
      case 'dark_dramatic':
        return 'Color palette: dark dramatic atmospheric values, rich midnight blues, deep forest shadows, dramatic focal contrast, and luminous highlights.';
      default:
        return '';
    }
  }

  /**
   * Formats lighting instructions.
   */
  public static getLightingInstruction(lighting?: LightingPreset, customLighting?: string): string {
    if (lighting === 'custom' && customLighting && customLighting.trim().length > 0) {
      return `Lighting: ${customLighting.trim()}.`;
    }

    switch (lighting) {
      case 'soft_daylight':
        return 'Lighting: soft diffused daylight with gentle shadow falloff and warm ambient bounce.';
      case 'bright_daytime':
        return 'Lighting: bright cheerful daytime sunlight with crisp clean light wraps and joyful illumination.';
      case 'golden_hour':
        return 'Lighting: warm golden hour sunlight with long soft shadows, glowing volumetric sunbeams, and amber rim lighting.';
      case 'sunset':
        return 'Lighting: dramatic twilight sunset illumination with coral, pink, and violet sky gradients and soft ground warmth.';
      case 'night':
        return 'Lighting: peaceful nighttime ambient illumination with soft atmospheric glow and tranquil deep tones.';
      case 'moonlight':
        return 'Lighting: luminous silver moonlight with soft cyan ambient bounce, ethereal highlights, and gentle nocturnal shadows.';
      case 'dramatic_cinematic':
        return 'Lighting: dramatic cinematic directional lighting with volumetric god rays, high focal contrast, and atmospheric rim illumination.';
      case 'diffused':
        return 'Lighting: soft diffused overcast lighting with gentle omnidirectional ambient glow and zero harsh shadows.';
      default:
        return '';
    }
  }

  /**
   * Formats scene mood instructions.
   */
  public static getMoodInstruction(mood?: SceneMoodPreset, customMood?: string): string {
    if (mood === 'custom' && customMood && customMood.trim().length > 0) {
      return `Mood and atmosphere: ${customMood.trim()}.`;
    }

    switch (mood) {
      case 'happy':
        return 'Mood and atmosphere: joyful, welcoming, cheerful, friendly, and heartwarming.';
      case 'peaceful':
        return 'Mood and atmosphere: serene, tranquil, peaceful, calm, and soothing.';
      case 'magical':
        return 'Mood and atmosphere: enchanting, wonder-filled, mystical, whimsical, and awe-inspiring.';
      case 'mysterious':
        return 'Mood and atmosphere: intriguing, curious, gently mysterious, and full of exploration.';
      case 'suspenseful':
        return 'Mood and atmosphere: visual tension, dramatic atmospheric shadows, expectant anticipation, yet child-safe.';
      case 'dramatic':
        return 'Mood and atmosphere: grand, theatrical, emotionally powerful, and visually impactful.';
      case 'emotional':
        return 'Mood and atmosphere: gentle, poignant, reflective, touching, and deeply resonant.';
      case 'adventurous':
        return 'Mood and atmosphere: exciting, dynamic, heroic, exploratory, and full of adventure.';
      default:
        return '';
    }
  }

  /**
   * Formats background complexity instructions.
   */
  public static getComplexityInstruction(complexity: BackgroundComplexity = 'balanced'): string {
    switch (complexity) {
      case 'simple':
        return 'Background complexity: simplified, clean, readable environment with broad shapes and minimal visual clutter, keeping maximum focus on characters.';
      case 'detailed':
        return 'Background complexity: rich, highly detailed environment with intricate flora, architectural textures, layered depth objects, and abundant scenic micro-details.';
      case 'balanced':
      default:
        return 'Background complexity: balanced environmental detail with rich focal landmarks, natural environmental textures, and clean readable negative space.';
    }
  }

  /**
   * Formats character-safe staging instructions.
   */
  public static getCharacterSafeAreaInstruction(stagingArea: CharacterSafeArea = 'open_center', customArea?: string): string {
    if (stagingArea === 'custom' && customArea && customArea.trim().length > 0) {
      return `Character-safe staging: ${customArea.trim()}. Strictly kept clear and unobstructed for character action.`;
    }

    switch (stagingArea) {
      case 'open_left':
        return 'Character-safe staging: open left foreground and middleground strictly kept clear and unobstructed for character action; rich environmental scenic framing positioned on the right.';
      case 'open_right':
        return 'Character-safe staging: open right foreground and middleground strictly kept clear and unobstructed for character action; rich environmental scenic framing positioned on the left.';
      case 'open_foreground':
        return 'Character-safe staging: expansive open ground plane across the foreground strictly kept clear for characters to stand and move freely.';
      case 'open_background':
        return 'Character-safe staging: open deep stage area with unobtrusive background framing.';
      case 'open_center':
      default:
        return 'Character-safe staging: open central middleground ground plane strictly kept clear, flat, and unobstructed for separately animated characters.';
    }
  }

  /**
   * Intelligently infers scene mood from narration, dialogue, description, or title.
   */
  public static inferSceneMood(text: string): SceneMoodPreset {
    if (!text || text.trim().length === 0) return 'peaceful';
    const lower = text.toLowerCase();

    if (/\b(magic\w*|enchant\w*|fairy|fairies|sparkl\w*|glow\w*|mystic\w*|wonder\w*|wizard\w*|spell\w*|miracle\w*)\b/.test(lower)) {
      return 'magical';
    }
    if (/\b(danger\w*|fear\w*|scared|careful|shadow\w*|dark\w*|creepy|hiding|whisper\w*|trap\w*|shiver\w*|sneak\w*)\b/.test(lower)) {
      return 'suspenseful';
    }
    if (/\b(adventure\w*|quest\w*|journey\w*|run\w*|climb\w*|rac\w*|chase\w*|fly\w*|explor\w*|brave\w*|discover\w*)\b/.test(lower)) {
      return 'adventurous';
    }
    if (/\b(sad\w*|cry\w*|tear\w*|miss\w*|lost|alone|hug\w*|goodbye|remember\w*|comfort\w*|heart\w*)\b/.test(lower)) {
      return 'emotional';
    }
    if (/\b(happy|happi\w*|smil\w*|laugh\w*|joy\w*|cheer\w*|danc\w*|celebrat\w*|fun|excit\w*|play\w*|friend\w*|warm\w*)\b/.test(lower)) {
      return 'happy';
    }
    if (/\b(secret\w*|riddle\w*|clue\w*|puzzle\w*|ancient|hidden|cave\w*|strange|curious\w*)\b/.test(lower)) {
      return 'mysterious';
    }
    if (/\b(fight\w*|storm\w*|battle\w*|clash\w*|loud|lightning|thunder|shout\w*|intense|powerful)\b/.test(lower)) {
      return 'dramatic';
    }
    if (/\b(sleep\w*|rest\w*|quiet|gentle|soft|breeze|calm\w*|peace\w*|dream\w*|bed|night|sunset|dawn)\b/.test(lower)) {
      return 'peaceful';
    }

    return 'peaceful';
  }

  /**
   * Resolves effective visual settings through the strict inheritance chain:
   * Scene Override -> Project Setting -> Default Configuration
   */
  public static resolveEffectiveVisualSettings(options: {
    projectSettings?: Partial<ProjectVisualSettings> | null;
    sceneOverrides?: Partial<SceneVisualOverrides> | null;
    inferredMood?: SceneMoodPreset;
    aspectRatio?: string;
  }): ResolvedVisualSettings {
    const proj = options.projectSettings || {};
    const scene = options.sceneOverrides || {};

    // 1. Visual Style
    const isStyleOverridden = Boolean(scene.visualStyle && scene.visualStyle.trim().length > 0);
    const effectiveStyleId = scene.visualStyle || proj.visualStyle || 'storybook_illustration';
    const visualStyle = this.getPreset(effectiveStyleId);

    // 2. Style Intensity
    const isIntensityOverridden = Boolean(scene.styleIntensity);
    const styleIntensity: StyleIntensity = scene.styleIntensity || proj.styleIntensity || 'balanced';

    // 3. Color Palette
    const isPaletteOverridden = Boolean(scene.colorPalette);
    const colorPalette: ColorPalettePreset = scene.colorPalette || proj.colorPalette || 'vibrant';
    const customColorPalette = scene.customColorPalette || proj.customColorPalette;

    // 4. Mood
    const isMoodAutoDetected = !scene.mood;
    const mood: SceneMoodPreset = scene.mood || options.inferredMood || 'peaceful';
    const customMood = scene.customMood;

    // 5. Lighting
    const isLightingOverridden = Boolean(scene.lighting);
    const lighting: LightingPreset = scene.lighting || proj.defaultLighting || 'soft_daylight';
    const customLighting = scene.customLighting || proj.customLighting;

    // 6. Background Complexity
    const isComplexityOverridden = Boolean(scene.backgroundComplexity);
    const backgroundComplexity: BackgroundComplexity = scene.backgroundComplexity || proj.backgroundComplexity || 'balanced';

    // 7. Character Safe Area
    const isStagingOverridden = Boolean(scene.characterSafeArea);
    const characterSafeArea: CharacterSafeArea = scene.characterSafeArea || 'open_center';
    const customStagingArea = scene.customStagingArea;

    // 8. Aspect Ratio
    const aspectRatio = scene.aspectRatio || options.aspectRatio || proj.aspectRatio || '16:9';

    // 9. Custom Instructions
    const customInstructions = [proj.customStyleInstructions, scene.customInstructions].filter(Boolean).join('. ');

    return {
      visualStyle,
      isStyleOverridden,
      styleIntensity,
      isIntensityOverridden,
      colorPalette,
      customColorPalette,
      isPaletteOverridden,
      mood,
      customMood,
      isMoodAutoDetected,
      lighting,
      customLighting,
      isLightingOverridden,
      backgroundComplexity,
      isComplexityOverridden,
      characterSafeArea,
      customStagingArea,
      isStagingOverridden,
      aspectRatio,
      customInstructions: customInstructions || undefined,
    };
  }

  /**
   * Evaluates compatibility between background and character styles.
   */
  public static evaluateStyleCompatibility(
    backgroundStyle: string,
    characterStyle: string
  ): StyleCompatibilityResult {
    const bg = this.getPreset(backgroundStyle);
    const char = this.getPreset(characterStyle);

    if (bg.id === char.id) {
      return {
        backgroundStyle: bg.name,
        characterStyle: char.name,
        matchLevel: 'perfect',
        compatible: true,
        title: 'Perfect Style Harmony',
        advice: `Both background and character share the ${bg.name} visual style, producing a cohesive unified story aesthetic.`,
        suggestedAdjustments: [],
      };
    }

    const claymationAnimeMismatch =
      (bg.id === 'claymation' && char.id === 'anime') ||
      (bg.id === 'anime' && char.id === 'claymation');
    if (claymationAnimeMismatch) {
      return {
        backgroundStyle: bg.name,
        characterStyle: char.name,
        matchLevel: 'clashing',
        compatible: true,
        title: 'Distinct Stop-Motion and Anime Styles',
        advice: 'Tactile clay-like stop-motion materials and painted anime rendering use different surface, shape, and lighting languages. They can be combined intentionally, but need deliberate integration to avoid a visually inconsistent result.',
        warning: 'This pairing may look visually disjointed. This is advisory only; your style selection is not blocked.',
        suggestedAdjustments: [
          'Choose a shared lighting direction and shadow softness for both layers.',
          'Unify the palette and texture intensity so the character and environment feel part of one world.',
        ],
      };
    }

    if (
      (bg.id === 'photorealistic' || bg.id === 'cinematic' || bg.id === 'stylized_realism') &&
      (char.id === '3d_animation' || char.id === '3d_animated' || char.id === '3d_pixar')
    ) {
      return {
        backgroundStyle: bg.name,
        characterStyle: char.name,
        matchLevel: 'contrast',
        compatible: true,
        title: 'Deliberate Hybrid Contrast (Live-Action / CGI Mix)',
        advice: 'Pairing realistic or cinematic natural environments with stylized 3D characters creates an engaging live-action/animation hybrid.',
        suggestedAdjustments: [
          'Ensure the character has a soft contact shadow on the ground plane to ground them in reality.',
          'Consider matching the warm directional lighting angle of the background.',
        ],
      };
    }

    if (
      (bg.id === 'cartoon' || bg.id === '2d_cartoon' || bg.id === 'storybook_illustration' || bg.id === 'storybook_illustrated') &&
      (char.id === 'cartoon' || char.id === '2d_cartoon' || char.id === 'storybook_illustration' || char.id === 'storybook_illustrated')
    ) {
      return {
        backgroundStyle: bg.name,
        characterStyle: char.name,
        matchLevel: 'harmonious',
        compatible: true,
        title: 'Classic Illustrated Story Harmony',
        advice: 'Illustrated backdrops pair seamlessly with vector and 2D character rigs, ensuring crisp rendering across resolutions.',
        suggestedAdjustments: [
          'Keep outline thickness and color saturation in balance between characters and background.',
        ],
      };
    }

    if (
      (bg.id === 'fantasy_illustration' || bg.id === 'cinematic') &&
      (char.id === '3d_animation' || char.id === '3d_pixar' || char.id === '3d_animated')
    ) {
      return {
        backgroundStyle: bg.name,
        characterStyle: char.name,
        matchLevel: 'harmonious',
        compatible: true,
        title: 'Cinematic Fantasy World Harmony',
        advice: 'Cinematic magical backgrounds complement stylized 3D characters, giving the video a feature-film storybook presence.',
        suggestedAdjustments: [
          'Add subtle atmospheric sparkles or glowing particles in foreground overlays to bind the scene layers together.',
        ],
      };
    }

    if (
      bg.id === 'watercolor' &&
      (char.id === 'storybook_illustration' || char.id === 'storybook_illustrated' || char.id === 'watercolor')
    ) {
      return {
        backgroundStyle: bg.name,
        characterStyle: char.name,
        matchLevel: 'harmonious',
        compatible: true,
        title: 'Gentle Painterly Harmony',
        advice: 'Watercolor environments provide a soft, dreamy backdrop that complements illustrated children’s book characters.',
        suggestedAdjustments: [
          'Soft lighting and gentle character drop shadows preserve the delicate painted feel.',
        ],
      };
    }

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
