import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 60;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const STABILITY_API_KEY = process.env.STABILITY_API_KEY || '';
const STABILITY_BASE = 'https://api.stability.ai/v2beta/stable-image/generate';

// ============================================================
// Stability AI Image Generation Helpers
// ============================================================

/** Models to try in order — Ultra is highest quality, then SD3.5 Large, then Core (fastest/cheapest) */
const STABILITY_ENDPOINTS = [
  `${STABILITY_BASE}/ultra`,
  `${STABILITY_BASE}/sd3`,
  `${STABILITY_BASE}/core`,
];

/**
 * Text-to-image generation via Stability AI.
 * Tries Ultra → SD3.5 → Core until one succeeds.
 */
async function generateImage(
  prompt: string,
  negativePrompt: string,
  aspectRatio: string = '2:3',
): Promise<{ imageUrl: string } | null> {
  for (const endpoint of STABILITY_ENDPOINTS) {
    try {
      const form = new FormData();
      form.append('prompt', prompt);
      form.append('negative_prompt', negativePrompt);
      form.append('aspect_ratio', aspectRatio);
      form.append('output_format', 'png');

      // SD3 endpoint accepts a model param
      if (endpoint.includes('/sd3')) {
        form.append('model', 'sd3.5-large');
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${STABILITY_API_KEY}`,
          Accept: 'application/json',
        },
        body: form,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error(`Stability ${endpoint} failed (${res.status}):`, errText);
        continue;
      }

      const data = await res.json();
      if (data.image) {
        return { imageUrl: `data:image/png;base64,${data.image}` };
      }
    } catch (err) {
      console.error(`Stability ${endpoint} error:`, err instanceof Error ? err.message : err);
      continue;
    }
  }
  return null;
}

/**
 * Image-to-image generation via Stability AI SD3.
 * Takes a base image and generates a variant with the given prompt.
 * Strength controls how much the output deviates from the input (0 = identical, 1 = completely new).
 */
async function generateImageToImage(
  prompt: string,
  negativePrompt: string,
  imageBase64: string,
  imageMimeType: string,
  strength: number = 0.65,
): Promise<{ imageUrl: string } | null> {
  // Convert base64 to Blob for FormData
  const imageBytes = Buffer.from(imageBase64, 'base64');
  const ext = imageMimeType.includes('png') ? 'png' : 'jpg';
  const imageBlob = new Blob([imageBytes], { type: imageMimeType });

  // Try SD3 endpoint for img2img (it supports mode: image-to-image)
  const endpoints = [
    `${STABILITY_BASE}/sd3`,
    `${STABILITY_BASE}/ultra`,
  ];

  for (const endpoint of endpoints) {
    try {
      const form = new FormData();
      form.append('prompt', prompt);
      form.append('negative_prompt', negativePrompt);
      form.append('mode', 'image-to-image');
      form.append('image', imageBlob, `input.${ext}`);
      form.append('strength', strength.toString());
      form.append('output_format', 'png');

      if (endpoint.includes('/sd3')) {
        form.append('model', 'sd3.5-large');
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${STABILITY_API_KEY}`,
          Accept: 'application/json',
        },
        body: form,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error(`Stability img2img ${endpoint} failed (${res.status}):`, errText);
        continue;
      }

      const data = await res.json();
      if (data.image) {
        return { imageUrl: `data:image/png;base64,${data.image}` };
      }
    } catch (err) {
      console.error(`Stability img2img ${endpoint} error:`, err instanceof Error ? err.message : err);
      continue;
    }
  }
  return null;
}

// ============================================================
// Anime-tuned prompts & negative prompts
// ============================================================

/** Shared negative prompt optimized for clean anime character sprites */
const ANIME_NEGATIVE_PROMPT = [
  'photorealistic', 'photo', '3D render', 'CGI', 'western cartoon',
  'deformed', 'ugly', 'blurry', 'low quality', 'bad anatomy',
  'extra limbs', 'extra fingers', 'mutated hands', 'poorly drawn face',
  'poorly drawn hands', 'missing fingers', 'fused fingers',
  'text', 'watermark', 'signature', 'logo', 'username',
  'cropped', 'out of frame', 'worst quality', 'low resolution',
  'jpeg artifacts', 'duplicate', 'morbid', 'mutilated',
  'disfigured', 'gross proportions', 'malformed limbs',
  'multiple views', 'multiple angles', 'split screen',
  'background elements', 'scenery', 'landscape', 'furniture',
  'busy background', 'patterned background',
].join(', ');

function getExpressivenessDescription(level: number): string {
  if (level <= 15) return 'VERY SUBTLE expression — barely noticeable change, stoic and reserved like Frieren or Violet Evergarden. The emotion should be conveyed through very slight micro-expressions only.';
  if (level <= 35) return 'SUBTLE expression — understated and restrained, gentle change in facial features. The character shows emotion in a quiet, composed way.';
  if (level <= 55) return 'MODERATE expression — natural and balanced, a clear but not exaggerated expression. The emotion is easily readable but grounded.';
  if (level <= 75) return 'EXPRESSIVE — clearly animated facial expression and body language. The emotion is vivid and easy to read, with noticeable posture change.';
  return 'VERY EXPRESSIVE — highly exaggerated, dramatic anime expression with strong body language. Think over-the-top shoujo/otome reactions with large emotional displays.';
}

/**
 * Build the full character generation prompt, tuned for attractive anime characters.
 */
function buildCharacterPrompt(characterName: string, description: string): string {
  return [
    // Style anchor — this is the most important part for getting anime output
    'masterpiece, best quality, highly detailed anime illustration,',
    'beautiful 2D anime character art, otome game visual novel sprite,',
    'bishounen bishoujo character design,',
    // Character specifics
    `character name: ${characterName || 'Original Character'},`,
    `${description},`,
    // Body & pose requirements
    'full body standing pose, head to feet visible, character standing upright,',
    'single character, centered in frame, portrait orientation,',
    // Art style reinforcement
    'clean sharp linework, cel shading, soft pastel color palette,',
    'large expressive anime eyes, delicate facial features, attractive face,',
    'light bloom effects, gentle shading, vivid hair color,',
    'premium anime art quality like Mystic Messenger or Ikemen Series,',
    // Background requirement
    'plain solid white background, no background elements,',
    'no scenery, no decorations, no shadows on ground, clean cutout sprite',
  ].join(' ');
}

/**
 * Build the expression generation prompt.
 * Used in img2img mode — keeps the character but changes the expression.
 */
function buildExpressionPrompt(
  characterName: string,
  expression: string,
  expressiveness: number,
): string {
  const expressivenessDesc = getExpressivenessDescription(expressiveness);

  return [
    'masterpiece, best quality, highly detailed anime illustration,',
    'beautiful 2D anime character art, otome game visual novel sprite,',
    `${characterName || 'anime character'} showing "${expression}" expression,`,
    `${expressivenessDesc},`,
    'full body standing pose, head to feet visible, same character design,',
    'same clothing, same hair style, same hair color, same eye color,',
    `change only the facial expression and body language to show "${expression}",`,
    'clean sharp linework, cel shading, soft pastel color palette,',
    'large expressive anime eyes, attractive anime face,',
    'plain solid white background, no background elements,',
    'no scenery, no decorations, clean cutout sprite',
  ].join(' ');
}

/**
 * Map expressiveness level to img2img strength.
 * Lower expressiveness → lower strength (keeps closer to original).
 * Higher expressiveness → higher strength (allows more change).
 */
function expressivenessToStrength(level: number): number {
  // Range: 0.45 (very muted) to 0.75 (very expressive)
  const minStrength = 0.45;
  const maxStrength = 0.75;
  return minStrength + (level / 100) * (maxStrength - minStrength);
}

// ============================================================
// Route Handler
// ============================================================

interface RequestBody {
  action: string;
  [key: string]: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json();

    switch (body.action) {
      case 'scene_dialogue':
        // Scene dialogue still uses Gemini for text generation
        if (!process.env.GEMINI_API_KEY) {
          return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
        }
        return await handleSceneDialogue(body);

      case 'generate_character':
        if (!STABILITY_API_KEY) {
          return NextResponse.json({ error: 'Stability AI API key not configured' }, { status: 500 });
        }
        return await handleCharacterGeneration(body);

      case 'generate_expression':
        if (!STABILITY_API_KEY) {
          return NextResponse.json({ error: 'Stability AI API key not configured' }, { status: 500 });
        }
        return await handleExpressionGeneration(body);

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('API route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================================
// Character Image Generation (Stability AI)
// ============================================================

async function handleCharacterGeneration(body: RequestBody) {
  const { prompt, characterName, referenceImageUrl } = body as unknown as {
    prompt: string;
    characterName: string;
    referenceImageUrl?: string;
  };

  const fullPrompt = buildCharacterPrompt(characterName, prompt);

  try {
    let result;

    if (referenceImageUrl && referenceImageUrl.startsWith('data:')) {
      // Image-to-image: use the reference image as a starting point
      const [meta, data] = referenceImageUrl.split(',');
      const mimeType = meta.match(/data:(.*);/)?.[1] || 'image/png';

      result = await generateImageToImage(
        fullPrompt,
        ANIME_NEGATIVE_PROMPT,
        data,
        mimeType,
        0.70, // Moderate strength — keeps reference likeness but generates in anime style
      );
    } else {
      // Pure text-to-image
      result = await generateImage(
        fullPrompt,
        ANIME_NEGATIVE_PROMPT,
        '2:3', // Portrait orientation for full-body characters
      );
    }

    if (result) {
      return NextResponse.json(result);
    }
    return NextResponse.json({
      error: 'All Stability AI models failed. Try again or upload manually.',
    }, { status: 500 });
  } catch (error) {
    console.error('Character generation error:', error);
    return NextResponse.json({ error: 'Failed to generate character' }, { status: 500 });
  }
}

// ============================================================
// Expression Generation (Stability AI img2img)
// ============================================================

async function handleExpressionGeneration(body: RequestBody) {
  const { baseImageUrl, expression, characterName, expressiveness = 50 } = body as unknown as {
    baseImageUrl: string;
    expression: string;
    characterName: string;
    expressiveness?: number;
  };

  const fullPrompt = buildExpressionPrompt(characterName, expression, expressiveness);
  const strength = expressivenessToStrength(expressiveness);

  try {
    if (baseImageUrl && baseImageUrl.startsWith('data:')) {
      const [meta, data] = baseImageUrl.split(',');
      const mimeType = meta.match(/data:(.*);/)?.[1] || 'image/png';

      const result = await generateImageToImage(
        fullPrompt,
        ANIME_NEGATIVE_PROMPT + ', same pose as original, do not change character design',
        data,
        mimeType,
        strength,
      );

      if (result) return NextResponse.json(result);

      return NextResponse.json({
        imageUrl: null,
        message: 'Expression generation failed. Try again or upload manually.',
      });
    } else if (baseImageUrl) {
      // If it's a URL (Firebase Storage), fetch it first then do img2img
      try {
        const imgRes = await fetch(baseImageUrl);
        if (imgRes.ok) {
          const buffer = Buffer.from(await imgRes.arrayBuffer());
          const base64 = buffer.toString('base64');
          const contentType = imgRes.headers.get('content-type') || 'image/png';

          const result = await generateImageToImage(
            fullPrompt,
            ANIME_NEGATIVE_PROMPT,
            base64,
            contentType,
            strength,
          );
          if (result) return NextResponse.json(result);
        }
      } catch (err) {
        console.error('Failed to fetch base image URL:', err);
      }

      // Fallback: text-to-image (won't match character perfectly but better than nothing)
      const fallback = await generateImage(fullPrompt, ANIME_NEGATIVE_PROMPT, '2:3');
      if (fallback) return NextResponse.json(fallback);

      return NextResponse.json({
        imageUrl: null,
        message: 'Could not process the base image URL. Upload the expression manually.',
      });
    } else {
      return NextResponse.json({
        imageUrl: null,
        message: 'No base image provided.',
      });
    }
  } catch (error) {
    console.error('Expression generation error:', error);
    return NextResponse.json({ error: 'Failed to generate expression' }, { status: 500 });
  }
}

// ============================================================
// Scene Dialogue (Gemini — unchanged)
// ============================================================

const TEXT_MODEL = 'gemini-2.0-flash';

interface DialogueRequest {
  action: string;
  scenePrompt: string;
  characters: {
    id: string;
    name: string;
    displayName: string;
    description: string;
    outfit: string;
  }[];
  conversationHistory: {
    role: string;
    characterId?: string;
    characterName?: string;
    text: string;
  }[];
  playerMessage: string;
  winConditions: {
    id: string;
    description: string;
    completionCriteria: string;
  }[];
  completedConditionIds: string[];
}

async function handleSceneDialogue(body: RequestBody) {
  const dialogueBody = body as unknown as DialogueRequest;
  const model = genAI.getGenerativeModel({ model: TEXT_MODEL });

  const characterDescriptions = dialogueBody.characters
    .map(
      (c) =>
        `- ${c.displayName} (id: ${c.id}): ${c.description}${
          c.outfit ? `\n  Current outfit: ${c.outfit}` : ''
        }`
    )
    .join('\n');

  const remainingConditions = dialogueBody.winConditions
    .filter((wc) => !dialogueBody.completedConditionIds.includes(wc.id))
    .map((wc) => `- [${wc.id}] ${wc.completionCriteria}`)
    .join('\n');

  const completedConditions = dialogueBody.winConditions
    .filter((wc) => dialogueBody.completedConditionIds.includes(wc.id))
    .map((wc) => `- [COMPLETED] ${wc.description}`)
    .join('\n');

  const conversationText = dialogueBody.conversationHistory
    .map((msg) => {
      if (msg.role === 'player') return `Player: ${msg.text}`;
      if (msg.role === 'narrator') return `Narrator: ${msg.text}`;
      return `${msg.characterName || 'Character'}: ${msg.text}`;
    })
    .join('\n');

  const systemPrompt = `You are the AI narrator and character voice for an interactive visual novel scene.

SCENE SETTING:
${dialogueBody.scenePrompt}

CHARACTERS PRESENT:
${characterDescriptions}

${completedConditions ? `ALREADY COMPLETED CONDITIONS:\n${completedConditions}\n` : ''}
${
  remainingConditions
    ? `REMAINING WIN CONDITIONS (hidden from player — evaluate after each response):
${remainingConditions}`
    : 'All conditions have been met.'
}

RULES:
1. Respond as ONE character per turn. Stay in character based on their personality and description.
2. Make the dialogue engaging, emotional, and true to the character's personality.
3. Reference what the characters are wearing when it's natural to do so.
4. Keep responses to 1-3 paragraphs maximum.
5. Advance the scene naturally based on the player's input.
6. If conditions are close to being met by the player's actions, let them be met naturally.

You MUST end every response with a JSON block on its own line in this exact format:
\`\`\`json
{"character": "character_id_here", "emotion": "one_of_default_happy_sad_angry_surprised_thinking_embarrassed", "completed_conditions": ["condition_id_if_newly_completed"]}
\`\`\`

The "emotion" must be one of: default, happy, sad, angry, surprised, thinking, embarrassed.
The "completed_conditions" array should contain IDs of any conditions the player just fulfilled. Use empty array [] if none.
The "character" must be the exact character ID of who is speaking.`;

  const prompt = `${
    conversationText ? `Previous conversation:\n${conversationText}\n\n` : ''
  }Player says: "${dialogueBody.playerMessage}"

Respond as the most appropriate character in the scene. Remember to end with the JSON block.`;

  const result = await model.generateContent({
    contents: [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: 'I understand. I will narrate the visual novel scene, respond in character, include emotions, and evaluate win conditions. I\'ll always end with the required JSON block.' }] },
      { role: 'user', parts: [{ text: prompt }] },
    ],
    generationConfig: {
      temperature: 0.85,
      topP: 0.95,
      maxOutputTokens: 1024,
    },
  });

  const responseText = result.response.text();

  const jsonMatch = responseText.match(/```json\s*\n?([\s\S]*?)\n?\s*```/);
  let parsed = {
    character: dialogueBody.characters[0]?.id || '',
    emotion: 'default' as string,
    completed_conditions: [] as string[],
  };

  if (jsonMatch) {
    try {
      parsed = JSON.parse(jsonMatch[1]);
    } catch {
      console.error('Failed to parse JSON block from response');
    }
  }

  const cleanText = responseText
    .replace(/```json\s*\n?[\s\S]*?\n?\s*```/, '')
    .trim();

  return NextResponse.json({
    text: cleanText,
    character: parsed.character,
    emotion: parsed.emotion || 'default',
    completedConditions: parsed.completed_conditions || [],
  });
}
