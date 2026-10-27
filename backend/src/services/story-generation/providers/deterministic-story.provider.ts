import { StoryGenerationProvider } from '../story-provider.interface.js';
import { StoryGenerationInput, StructuredStory } from '../story-generation.types.js';

export class DeterministicStoryProvider implements StoryGenerationProvider {
  name = 'deterministic';

  async isAvailable(): Promise<boolean> {
    return true; // Always available offline
  }

  async generateRaw(prompt: string, input: StoryGenerationInput): Promise<string> {
    const story = this.buildStructuredStory(input);
    return JSON.stringify(story, null, 2);
  }

  public buildStructuredStory(input: StoryGenerationInput): StructuredStory {
    const topic = input.topic?.trim() || 'A magical adventure of discovery and friendship';
    const ageGroup = input.ageGroup || '4-7 years';
    const genre = input.genre || 'Adventure';
    const totalDurationSeconds = Math.max(30, Number(input.desiredDurationSeconds) || 60);

    // Determine scene count based on duration or explicit input
    let sceneCount = input.sceneCount;
    if (!sceneCount || sceneCount < 2 || sceneCount > 8) {
      if (totalDurationSeconds <= 30) sceneCount = 3;
      else if (totalDurationSeconds <= 60) sceneCount = 4;
      else if (totalDurationSeconds <= 120) sceneCount = 5;
      else sceneCount = 6;
    }

    const sceneDuration = Math.round(totalDurationSeconds / sceneCount);

    // Extract character cues from topic or characterIds
    const topicLower = topic.toLowerCase();
    const isHindi = (input.language || 'Hindi').toLowerCase().includes('hindi');
    let mainSpecies = 'human';
    let heroName = 'Milo';

    if (
      topicLower.includes('earth') ||
      topicLower.includes('पृथ्वी') ||
      (Array.isArray(input.characterIds) && input.characterIds.some((id) => id.toLowerCase().includes('earth')))
    ) {
      mainSpecies = 'earth';
      heroName = 'Earth';
    } else if (topicLower.includes('rabbit') || topicLower.includes('bunny')) {
      mainSpecies = 'rabbit';
      heroName = 'Milo';
    } else if (topicLower.includes('bear')) {
      mainSpecies = 'bear';
      heroName = 'Pip';
    } else if (topicLower.includes('robot')) {
      mainSpecies = 'robot';
      heroName = 'Sparky';
    } else if (topicLower.includes('kid') || topicLower.includes('boy') || topicLower.includes('sammy')) {
      mainSpecies = 'human';
      heroName = 'Sammy';
    } else if (topicLower.includes('girl') || topicLower.includes('maya')) {
      mainSpecies = 'human';
      heroName = 'Maya';
    } else if (topicLower.includes('fox')) {
      mainSpecies = 'fox';
      heroName = 'Finley';
    }

    // Secondary companion
    const companionName = heroName === 'Earth' ? 'Sammy' : mainSpecies === 'rabbit' ? 'Barnaby' : mainSpecies === 'bear' ? 'Sammy' : 'Pip';
    const companionSpecies = heroName === 'Earth' ? 'human' : mainSpecies === 'bear' ? 'human' : 'bear';

    // Title & Lesson derivation
    const title =
      input.title?.trim() ||
      (heroName === 'Earth'
        ? (isHindi ? "पृथ्वी की अनमोल सीख: चार ऋतुओं का सफर" : "Earth's Promise: The Four Seasons")
        : isHindi
        ? `${heroName} का अनोखा रोमांच`
        : topic.length > 5 && topic.length < 50
        ? topic.replace(/[.]+$/, '')
        : `${heroName} and the ${genre} Wonder`);

    const lesson =
      input.lesson?.trim() ||
      (heroName === 'Earth'
        ? (isHindi
          ? "हर ऋतु का प्रकृति में एक खास महत्व और जीवनदायिनी उद्देश्य होता है।"
          : "Every season has a special purpose in nature.")
        : isHindi
        ? "मित्रता, सहयोग और प्रकृति के प्रति प्रेम ही सच्चा सुख है।"
        : topicLower.includes('help')
        ? 'Helping others brings joy and makes our community stronger.'
        : topicLower.includes('kind')
        ? 'A little act of kindness can brighten anyone’s day.'
        : topicLower.includes('share')
        ? 'Sharing good things makes friendship grow.'
        : 'Curiosity, courage, and teamwork can solve any puzzle.');

    const logline =
      (heroName === 'Earth' && isHindi)
        ? "पृथ्वी नन्हे बच्चों को सिखाती है कि कैसे चारों ऋतुएँ प्रकृति में संतुलन, सुंदरता और नया जीवन लाती हैं।"
        : (heroName === 'Earth' && !isHindi)
        ? "Earth teaches children how the four seasons bring balance, beauty, and life to our planet."
        : (isHindi && topic.length > 10)
        ? topic
        : topic.length > 10 && topic.length < 150
        ? topic
        : isHindi
        ? `${heroName} और ${companionName} की एक सुंदर और प्रेरणादायक कहानी।`
        : `${heroName} embarks on an unforgettable journey to explore a wonder and learn why caring for others matters.`;

    const characters = [
      {
        name: heroName,
        role: 'protagonist',
        species: mainSpecies,
        description: heroName === 'Earth'
          ? 'Our smiling, wise living planet with blue oceans and green continents.'
          : `A brave, cheerful, and curious ${mainSpecies} who loves exploring new wonders.`,
        personality: heroName === 'Earth' ? ['wise', 'loving', 'nurturing'] : ['curious', 'brave', 'kind'],
      },
      {
        name: companionName,
        role: 'companion',
        species: companionSpecies,
        description: heroName === 'Earth'
          ? 'A curious and gentle child friend who loves learning about nature.'
          : `A gentle and loyal ${companionSpecies} friend who loves helping others.`,
        personality: ['cheerful', 'helpful', 'loyal'],
      },
    ];

    // Story Beats progression for children:
    let storyBeats: any[] = [];

    if (heroName === 'Earth') {
      if (isHindi) {
        storyBeats = [
          {
            title: 'सुनहरी ग्रीष्म ऋतु (Golden Summer)',
            summary: 'पृथ्वी नन्हे दोस्तों को सुनहरी धूप और ग्रीष्म ऋतु के जादू से परिचित कराती है।',
            visualDescription: 'Sun-drenched golden meadows with distant mountains, vibrant sunshine rays and heat shimmer.',
            location: 'Golden Meadow',
            timeOfDay: 'Morning',
            narration: 'ग्रीष्म ऋतु में सूरज अपनी सुनहरी किरणें बिखेरता है और प्रकृति खिल उठती है।',
            dialogue: [
              {
                characterName: 'Earth',
                text: 'नमस्ते नन्हे दोस्तों! मैं तुम्हारी पृथ्वी हूँ। देखो, सूरज की धूप फसलों को पका रही है!',
                emotion: 'happy',
              },
              {
                characterName: companionName,
                text: 'धूप से सारे पेड़-पौधे खिलखिला रहे हैं!',
                emotion: 'excited',
              },
            ],
            characterActions: [
              { characterName: 'Earth', action: 'wave', pose: 'happy', description: 'Earth smiles and waves gently.' },
              { characterName: companionName, action: 'jump', pose: 'cheerful', description: `${companionName} jumps in the sunlight.` },
            ],
          },
          {
            title: 'सुहानी वर्षा ऋतु (The Monsoon Rain)',
            summary: 'काले बादलों की बारिश सूखी धरती को नया जीवन और हरियाली देती है।',
            visualDescription: 'Lush green hills and valleys covered in fresh gentle monsoon rain, rolling clouds and water splashes.',
            location: 'Rainy Valley',
            timeOfDay: 'Afternoon',
            narration: 'वर्षा ऋतु में काले बादल गरजते हैं और ठंडी बारिश सूखी धरती को नया जीवन देती है।',
            dialogue: [
              {
                characterName: 'Earth',
                text: 'आहा! बारिश की हर बूंद नदियों और झरनों में नई जान फूंक देती है।',
                emotion: 'excited',
              },
              {
                characterName: companionName,
                text: 'छप-छप पानी में नई हरियाली उग रही है!',
                emotion: 'happy',
              },
            ],
            characterActions: [
              { characterName: 'Earth', action: 'idle', pose: 'calm', description: 'Earth glows happily under rainfall.' },
              { characterName: companionName, action: 'wave', pose: 'excited', description: `${companionName} waves at the rain.` },
            ],
          },
          {
            title: 'शांत शीत ऋतु (Peaceful Winter)',
            summary: 'बर्फ की सफेद चादर में ढकी प्रकृति विश्राम और शांति का आनंद लेती है।',
            visualDescription: 'Serene snowy forest with pine trees covered in soft snowfall, gentle fog and mist.',
            location: 'Snowy Forest',
            timeOfDay: 'Late Afternoon',
            narration: 'शीत ऋतु में बर्फ की सफेद चादर बिछ जाती है और पेड़-पौधे विश्राम करते हैं।',
            dialogue: [
              {
                characterName: 'Earth',
                text: 'सर्दी हमें सिखाती है कि नए जीवन की तैयारी के लिए विश्राम भी जरूरी है।',
                emotion: 'calm',
              },
              {
                characterName: companionName,
                text: 'बर्फ का ठंडा स्पर्श कितना शांत और सुहाना है।',
                emotion: 'calm',
              },
            ],
            characterActions: [
              { characterName: 'Earth', action: 'idle', pose: 'peaceful', description: 'Earth rests serenely in winter mist.' },
              { characterName: companionName, action: 'walk', pose: 'curious', description: `${companionName} walks carefully on snow.` },
            ],
          },
          {
            title: 'रंग-बिरंगी शरद ऋतु (Colorful Autumn)',
            summary: 'सुनहरे पत्तों की छटा और सुहाने मौसम में प्रकृति का अनोखा नृत्य।',
            visualDescription: 'Forest hills with golden falling leaves swirling in the breeze and flying birds in the sky.',
            location: 'Autumn Hills',
            timeOfDay: 'Sunset',
            narration: 'शरद ऋतु में पत्ते सुनहरे होकर गिरते हैं और पक्षी सुहाने मौसम में उड़ते हैं।',
            dialogue: [
              {
                characterName: 'Earth',
                text: 'पतझड़ के बाद नया बसंत आता है! प्रकृति का यह चक्र हमेशा मुस्कुराता रहता है।',
                emotion: 'cheerful',
              },
              {
                characterName: companionName,
                text: 'हवा में उड़ते सुनहरे पत्ते कितने मनमोहक हैं!',
                emotion: 'excited',
              },
            ],
            characterActions: [
              { characterName: 'Earth', action: 'wave', pose: 'cheerful', description: 'Earth waves to flying birds.' },
              { characterName: companionName, action: 'jump', pose: 'happy', description: `${companionName} catches falling leaves.` },
            ],
          },
          {
            title: 'प्रकृति का संतुलन और सीख (Harmony of Earth)',
            summary: 'सभी ऋतुएँ मिलकर हमारी प्यारी धरती को जीवन और खुशियों से भर देती हैं।',
            visualDescription: 'A panoramic flourishing landscape of Earth under a warm rainbow and gentle breeze.',
            location: 'Rainbow Horizon',
            timeOfDay: 'Twilight',
            narration: 'सभी ऋतुएँ मिलकर प्रकृति का संतुलन बनाती हैं और हमें प्रकृति से प्यार करना सिखाती हैं।',
            dialogue: [
              {
                characterName: 'Earth',
                text: 'हम सब मिलकर इस खूबसूरत धरती का ख्याल रखेंगे!',
                emotion: 'happy',
              },
              {
                characterName: companionName,
                text: 'हाँ, हम अपनी प्यारी पृथ्वी का हमेशा ध्यान रखेंगे!',
                emotion: 'cheerful',
              },
            ],
            characterActions: [
              { characterName: 'Earth', action: 'wave', pose: 'happy', description: 'Earth smiles broadly at the rainbow.' },
              { characterName: companionName, action: 'wave', pose: 'cheerful', description: `${companionName} waves both hands happily.` },
            ],
          },
        ];
      } else {
        storyBeats = [
          {
            title: 'Golden Summer',
            summary: 'Earth introduces the warmth of summer and how sunshine nurtures life.',
            visualDescription: 'Sun-drenched golden meadows with distant mountains, vibrant sunshine rays and heat shimmer.',
            location: 'Golden Meadow',
            timeOfDay: 'Morning',
            narration: 'In the golden days of summer, the sun radiates warmth and meadows burst with vibrant life.',
            dialogue: [
              { characterName: 'Earth', text: 'Hello young explorers! I am your living Earth. Feel the gentle warmth feeding the crops!', emotion: 'happy' },
              { characterName: companionName, text: 'The sunlight makes everything glow with energy!', emotion: 'excited' },
            ],
            characterActions: [
              { characterName: 'Earth', action: 'wave', pose: 'happy', description: 'Earth smiles and waves gently.' },
              { characterName: companionName, action: 'jump', pose: 'cheerful', description: `${companionName} jumps in the sunlight.` },
            ],
          },
          {
            title: 'The Monsoon Rain',
            summary: 'Rain clouds roll in to quench thirsty fields and fill winding rivers.',
            visualDescription: 'Lush green hills and valleys covered in fresh gentle monsoon rain, rolling clouds and water splashes.',
            location: 'Rainy Valley',
            timeOfDay: 'Afternoon',
            narration: 'When monsoon clouds gather, cool raindrops splash down, bringing fresh life to every flower.',
            dialogue: [
              { characterName: 'Earth', text: 'Listen to the sweet raindrops filling up our streams and lakes!', emotion: 'excited' },
              { characterName: companionName, text: 'The fresh rain smells so sweet and clean!', emotion: 'happy' },
            ],
            characterActions: [
              { characterName: 'Earth', action: 'idle', pose: 'calm', description: 'Earth glows happily under rainfall.' },
              { characterName: companionName, action: 'wave', pose: 'excited', description: `${companionName} waves at the rain.` },
            ],
          },
          {
            title: 'Peaceful Winter',
            summary: 'Winter covers the trees in blankets of white, teaching the peace of rest.',
            visualDescription: 'Serene snowy forest with pine trees covered in soft snowfall, gentle fog and mist.',
            location: 'Snowy Forest',
            timeOfDay: 'Late Afternoon',
            narration: 'Soft snowfall blankets the sleeping forest, reminding nature that rest is part of life.',
            dialogue: [
              { characterName: 'Earth', text: 'Winter reminds us that resting prepares nature for new beginnings.', emotion: 'calm' },
              { characterName: companionName, text: 'The crisp snow is so peaceful and quiet.', emotion: 'calm' },
            ],
            characterActions: [
              { characterName: 'Earth', action: 'idle', pose: 'peaceful', description: 'Earth rests serenely in winter mist.' },
              { characterName: companionName, action: 'walk', pose: 'curious', description: `${companionName} walks carefully on snow.` },
            ],
          },
          {
            title: 'Colorful Autumn',
            summary: 'Autumn swirls in golden hues as birds migrate across clear blue skies.',
            visualDescription: 'Forest hills with golden falling leaves swirling in the breeze and flying birds in the sky.',
            location: 'Autumn Hills',
            timeOfDay: 'Sunset',
            narration: 'Golden leaves dance in the autumn breeze, celebrating a year full of wonders.',
            dialogue: [
              { characterName: 'Earth', text: 'After autumn comes the promise of spring! The cycle of nature never ends.', emotion: 'cheerful' },
              { characterName: companionName, text: 'The golden leaves are like nature’s confetti!', emotion: 'excited' },
            ],
            characterActions: [
              { characterName: 'Earth', action: 'wave', pose: 'cheerful', description: 'Earth waves to flying birds.' },
              { characterName: companionName, action: 'jump', pose: 'happy', description: `${companionName} catches falling leaves.` },
            ],
          },
          {
            title: 'Harmony of Earth',
            summary: 'Reflecting on the harmony of nature and caring for our planet.',
            visualDescription: 'A panoramic flourishing landscape of Earth under a warm rainbow and gentle breeze.',
            location: 'Rainbow Horizon',
            timeOfDay: 'Twilight',
            narration: 'Together, the seasons paint our living planet with beauty, harmony, and eternal hope.',
            dialogue: [
              { characterName: 'Earth', text: 'Together, we will cherish and protect our beautiful planet forever!', emotion: 'happy' },
              { characterName: companionName, text: 'We promise to take care of you, Earth!', emotion: 'cheerful' },
            ],
            characterActions: [
              { characterName: 'Earth', action: 'wave', pose: 'happy', description: 'Earth smiles broadly at the rainbow.' },
              { characterName: companionName, action: 'wave', pose: 'cheerful', description: `${companionName} waves both hands happily.` },
            ],
          },
        ];
      }
    } else if (isHindi) {
      storyBeats = [
        {
          title: 'एक अनोखी शुरुआत',
          summary: `${heroName} एक नए रास्ते की खोज करता है।`,
          visualDescription: 'A bright, sunlit meadow dotted with sparkling flowers under a blue sky.',
          location: 'Sunny Meadow',
          timeOfDay: 'Morning',
          narration: `एक सुनहरी सुबह, ${heroName} ने एक चमकता हुआ सुंदर रास्ता देखा।`,
          dialogue: [
            { characterName: heroName, text: `उधर देखो! वह रास्ता कितना जादुई लग रहा है। चलो देखें!`, emotion: 'excited' },
            { characterName: companionName, text: `मैं तुम्हारे साथ हूँ, ${heroName}! नया सफर शुरू करते हैं!`, emotion: 'happy' },
          ],
          characterActions: [
            { characterName: heroName, action: 'walk', pose: 'curious', description: `${heroName} steps forward.` },
            { characterName: companionName, action: 'wave', pose: 'cheerful', description: `${companionName} waves happily.` },
          ],
        },
        {
          title: 'जादुई जंगल की सैर',
          summary: 'दोनों साथी मिलकर नए-नए नजारों का आनंद लेते हैं।',
          visualDescription: 'A lush enchanted forest with tall whispering trees and soft mossy ground.',
          location: 'Enchanted Forest',
          timeOfDay: 'Afternoon',
          narration: `वे दोनों घने जंगल में आगे बढ़े जहाँ हर पत्ता हवा में झूम रहा था।`,
          dialogue: [
            { characterName: heroName, text: `यहाँ सब कुछ कितना जीवंत और सुंदर है!`, emotion: 'curious' },
            { characterName: companionName, text: `साथ-साथ चलो, कितना मजा आ रहा है!`, emotion: 'happy' },
          ],
          characterActions: [
            { characterName: heroName, action: 'walk', pose: 'excited', description: `${heroName} walks through trees.` },
            { characterName: companionName, action: 'idle', pose: 'attentive', description: `${companionName} looks around.` },
          ],
        },
        {
          title: 'मदद का हाथ',
          summary: 'वे मिलकर एक दोस्त की मदद करते हैं।',
          visualDescription: 'A sparkling stream with smooth stepping stones and gentle waterfalls.',
          location: 'Sparkling Stream',
          timeOfDay: 'Late Afternoon',
          narration: `नदी के किनारे उन्होंने देखा कि मिलकर काम करने से हर मुश्किल आसान हो जाती है।`,
          dialogue: [
            { characterName: heroName, text: `चिंता मत करो! हम सब मिलकर इस नदी को पार कर लेंगे।`, emotion: 'calm' },
            { characterName: companionName, text: `हाथ पकड़ो! सहयोग में ही सबसे बड़ी ताकत है।`, emotion: 'happy' },
          ],
          characterActions: [
            { characterName: heroName, action: 'jump', pose: 'brave', description: `${heroName} jumps across stepping stones.` },
            { characterName: companionName, action: 'wave', pose: 'supportive', description: `${companionName} waves supportively.` },
          ],
        },
        {
          title: 'सफलता की खुशी',
          summary: 'वे अपनी मंजिल पर पहुँचकर मुस्कुराते हैं।',
          visualDescription: 'A glowing clearing with warm lights under a twilight sky.',
          location: 'Glowing Garden',
          timeOfDay: 'Sunset',
          narration: `अंत में, उन्होंने देखा कि साथ मिलकर की गई यात्रा सबसे खूबसूरत होती है।`,
          dialogue: [
            { characterName: heroName, text: `हमने यह कर दिखाया! यह सचमुच अद्भुत अनुभव था।`, emotion: 'happy' },
            { characterName: companionName, text: `तुम सबसे अच्छे दोस्त हो!`, emotion: 'cheerful' },
          ],
          characterActions: [
            { characterName: heroName, action: 'jump', pose: 'celebratory', description: `${heroName} jumps for joy.` },
            { characterName: companionName, action: 'wave', pose: 'celebratory', description: `${companionName} waves in triumph.` },
          ],
        },
        {
          title: 'मीठी यादें',
          summary: 'घर लौटकर वे आज के सबक को याद करते हैं।',
          visualDescription: 'A cozy hilltop village under a starry twilight canopy.',
          location: 'Starry Hilltop',
          timeOfDay: 'Twilight',
          narration: `जैसे ही आसमान में तारे चमके, वे खुशियों भरी यादों के साथ विश्राम करने लगे।`,
          dialogue: [
            { characterName: heroName, text: `आज हमने सीखा कि दया और दोस्ती ही सबसे बड़ा खजाना है।`, emotion: 'peaceful' },
          ],
          characterActions: [
            { characterName: heroName, action: 'wave', pose: 'peaceful', description: `${heroName} waves goodbye to the sunset.` },
          ],
        },
      ];
    } else {
      storyBeats = [
        {
          title: 'A Curious Beginning',
          summary: `${heroName} discovers something unexpected and sets out on a new journey.`,
          visualDescription: `A bright, sunlit meadow dotted with sparkling flowers and gentle rolling hills under a soft blue sky.`,
          location: 'Sunny Meadow',
          timeOfDay: 'Morning',
          narration: `One bright and sunny morning, ${heroName} noticed a shimmering path leading toward the mysterious horizon.`,
          dialogue: [
            {
              characterName: heroName,
              text: `Look over there! That path looks so magical. Let's go see where it leads!`,
              emotion: 'excited',
            },
            {
              characterName: companionName,
              text: `I'm right behind you, ${heroName}! Adventure awaits!`,
              emotion: 'happy',
            },
          ],
          characterActions: [
            {
              characterName: heroName,
              action: 'walk',
              pose: 'curious',
              description: `${heroName} steps forward along the flower-lined path.`,
            },
            {
              characterName: companionName,
              action: 'wave',
              pose: 'cheerful',
              description: `${companionName} waves happily to lead the way.`,
            },
          ],
        },
        {
          title: 'The Hidden Path',
          summary: `The two friends walk deeper into the unknown, marveling at the sights.`,
          visualDescription: `A lush enchanted forest with tall whispering trees, colorful glowing lanterns, and soft mossy ground.`,
          location: 'Enchanted Forest',
          timeOfDay: 'Afternoon',
          narration: `Together, they walked into the whispering forest, where every leaf seemed to dance in the gentle breeze.`,
          dialogue: [
            {
              characterName: heroName,
              text: `Everything here feels alive and full of wonder!`,
              emotion: 'curious',
            },
            {
              characterName: companionName,
              text: `Stay close, we don't want to get lost!`,
              emotion: 'calm',
            },
          ],
          characterActions: [
            {
              characterName: heroName,
              action: 'walk',
              pose: 'excited',
              description: `${heroName} walks briskly through the arch of trees.`,
            },
            {
              characterName: companionName,
              action: 'idle',
              pose: 'attentive',
              description: `${companionName} pauses to look around carefully.`,
            },
          ],
        },
        {
          title: 'Lending a Helping Hand',
          summary: `They encounter a little creature in need and work together to help.`,
          visualDescription: `A sparkling stream with smooth stepping stones, gentle waterfalls, and vibrant butterflies fluttering nearby.`,
          location: 'Sparkling Stream',
          timeOfDay: 'Late Afternoon',
          narration: `Along the riverbank, they found a lost friend who needed help finding their way back home.`,
          dialogue: [
            {
              characterName: heroName,
              text: `Don't worry! If we work together, we can cross this stream safely.`,
              emotion: 'kind',
            },
            {
              characterName: companionName,
              text: `Take my hand! Teamwork always makes hard things easy.`,
              emotion: 'encouraging',
            },
          ],
          characterActions: [
            {
              characterName: heroName,
              action: 'jump',
              pose: 'brave',
              description: `${heroName} jumps across the stepping stones to guide the way.`,
            },
            {
              characterName: companionName,
              action: 'wave',
              pose: 'supportive',
              description: `${companionName} waves enthusiastically from the riverbank.`,
            },
          ],
        },
        {
          title: 'The Glowing Wonder',
          summary: `The friends arrive at the heart of their quest and discover the true treasure.`,
          visualDescription: `A breathtaking glowing clearing where magical lanterns shine warmly under a twilight canopy.`,
          location: 'Glowing Garden Heart',
          timeOfDay: 'Sunset',
          narration: `At last, they stood before the glowing garden, realizing that sharing the moment made it even more special.`,
          dialogue: [
            {
              characterName: heroName,
              text: `It's the most beautiful place in the world, and we did it together!`,
              emotion: 'joyful',
            },
            {
              characterName: companionName,
              text: `Best adventure ever! I'm so glad we're friends.`,
              emotion: 'happy',
            },
          ],
          characterActions: [
            {
              characterName: heroName,
              action: 'jump',
              pose: 'celebratory',
              description: `${heroName} jumps with joy under the shimmering sky.`,
            },
            {
              characterName: companionName,
              action: 'wave',
              pose: 'celebratory',
              description: `${companionName} waves both hands in happy triumph.`,
            },
          ],
        },
        {
          title: 'Journey Home with Smiles',
          summary: `Reflecting on the lessons of friendship, kindness, and bravery.`,
          visualDescription: `A warm cozy hilltop overlooking the peaceful kingdom under starry twilight.`,
          location: 'Starry Hilltop',
          timeOfDay: 'Twilight',
          narration: `As the stars began to twinkle, they walked home with full hearts, ready for their next great story.`,
          dialogue: [
            {
              characterName: heroName,
              text: `Today we learned that being kind and helping others is the biggest adventure of all.`,
              emotion: 'peaceful',
            },
          ],
          characterActions: [
            {
              characterName: heroName,
              action: 'wave',
              pose: 'peaceful',
              description: `${heroName} waves goodbye to the magical sunset.`,
            },
          ],
        },
        {
          title: 'A Peaceful Goodnight',
          summary: `The friends rest after an amazing day, filled with wonderful memories.`,
          visualDescription: `A cozy village under a canopy of warm glowing stars and a gentle crescent moon.`,
          location: 'Cozy Village',
          timeOfDay: 'Night',
          narration: `And so, with happy smiles and sleepy eyes, another wonderful chapter came to a peaceful close. Goodnight, brave explorers!`,
          dialogue: [
            {
              characterName: heroName,
              text: `Goodnight, wonderful world! See you tomorrow!`,
              emotion: 'sleepy',
            },
          ],
          characterActions: [
            {
              characterName: heroName,
              action: 'idle',
              pose: 'calm',
              description: `${heroName} stands calmly beneath the gentle moonlight.`,
            },
          ],
        },
      ];
    }

    // Select the requested number of beats
    const selectedBeats = storyBeats.slice(0, sceneCount);

    const scenes = selectedBeats.map((beat, idx) => ({
      sceneNumber: idx + 1,
      title: beat.title,
      summary: beat.summary,
      visualDescription: beat.visualDescription,
      location: beat.location,
      timeOfDay: beat.timeOfDay,
      narration: beat.narration,
      dialogue: beat.dialogue,
      characterActions: beat.characterActions,
      durationSeconds: sceneDuration,
    }));

    return {
      title,
      logline,
      lesson,
      targetAudience: ageGroup,
      genre,
      estimatedDurationSeconds: totalDurationSeconds,
      characters,
      scenes,
    };
  }
}

