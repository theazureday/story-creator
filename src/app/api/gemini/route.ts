import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 60;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// ============================================================
// Image Generation Helpers
// ============================================================

const IMAGE_MODELS = [
  'gemini-3-pro-image-preview',
  'gemini-2.5-flash-image',
  'gemini-2.0-flash-exp-image-generation',
];

const TEXT_MODEL = 'gemini-2.0-flash';

interface GeminiImageData {
  inlineData: {
    data: string;
    mimeType: string;
  };
}

async function generateImage(prompt: string): Promise<{ imageUrl: string } | null> {
  for (const modelName of IMAGE_MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } as any,
      });
      const result = await model.generateContent(prompt);
      const candidates = result.response.candidates;
      if (candidates && candidates[0]?.content?.parts) {
        for (const part of candidates[0].content.parts) {
          if ('inlineData' in part && part.inlineData) {
            return { imageUrl: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` };
          }
        }
      }
    } catch (err) {
      console.error(`Model ${modelName} failed:`, err instanceof Error ? err.message : err);
      continue;
    }
  }
  return null;
}

async function generateImageFromRef(prompt: string, imageData: GeminiImageData): Promise<{ imageUrl: string } | null> {
  for (const modelName of IMAGE_MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } as any,
      });
      const result = await model.generateContent([prompt, imageData]);
      const candidates = result.response.candidates;
      if (candidates && candidates[0]?.content?.parts) {
        for (const part of candidates[0].content.parts) {
          if ('inlineData' in part && part.inlineData) {
            return { imageUrl: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` };
          }
        }
      }
    } catch (err) {
      console.error(`Model ${modelName} failed:`, err instanceof Error ? err.message : err);
      continue;
    }
  }
  return null;
}

function getExpressivenessDescription(level: number): string {
  if (level <= 15) return 'VERY SUBTLE expression — barely noticeable change, stoic and reserved like Frieren or Violet Evergarden. The emotion should be conveyed through very slight micro-expressions only.';
  if (level <= 35) return 'SUBTLE expression — understated and restrained, gentle change in facial features. The character shows emotion in a quiet, composed way.';
  if (level <= 55) return 'MODERATE expression — natural and balanced, a clear but not exaggerated expression. The emotion is easily readable but grounded.';
  if (level <= 75) return 'EXPRESSIVE — clearly animated facial expression and body language. The emotion is vivid and easy to read, with noticeable posture change.';
  return 'VERY EXPRESSIVE — highly exaggerated, dramatic anime expression with strong body language. Think over-the-top shoujo/otome reactions with large emotional displays.';
}

// ============================================================
// Route Handler
// ============================================================

interface RequestBody {
  action: string;
  [key: string]: unknown;
}

export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
  }

  try {
    const body: RequestBody = await req.json();

    switch (body.action) {
      case 'scene_dialogue':
        return await handleSceneDialogue(body);
      case 'generate_character':
        return await handleCharacterGeneration(body);
      case 'generate_expression':
        return await handleExpressionGeneration(body);
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Gemini route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================================
// Character Image Generation
// ============================================================

async function handleCharacterGeneration(body: RequestBody) {
  const { prompt, characterName, referenceImageUrl } = body as unknown as {
    prompt: string;
    characterName: string;
    referenceImageUrl?: string;
  };

  const charPrompt = `Create an anime 2D otome visual novel character sprite — FULL BODY standing pose on a TRANSPARENT BACKGROUND.

Character: ${characterName || 'Original Character'}
Description: ${prompt}

Art Style Requirements:
- ANIME 2D OTOME ART STYLE — soft, romantic visual novel aesthetic with clean linework
- Bishounen/Bishoujo character design with large expressive eyes, delicate features
- Soft pastel color palette with gentle shading and light bloom effects
- FULL BODY standing pose — head to feet visible, character standing upright
- Neutral/default expression
- Premium quality like Mystic Messenger, Ikemen Series, or Obey Me
- Portrait orientation (tall, narrow) — character centered in frame
- Consistent proportions — the face should be clearly visible and detailed enough to swap later

BACKGROUND REQUIREMENT — THIS IS CRITICAL:
- The background MUST be completely TRANSPARENT / EMPTY / BLANK
- Do NOT draw ANY background elements — no scenery, no ground, no shadows, no gradients, no decorations, no arches, no sparkles, no environment
- The character should be a CUTOUT SPRITE floating on nothing — like a PNG sticker with transparency
- Think of this as a character sprite that will be overlaid on top of separate background images in a visual novel engine
- If you cannot make the background transparent, use a SOLID BRIGHT GREEN (#00FF00) chroma key background instead`;

  try {
    let result;
    if (referenceImageUrl && referenceImageUrl.startsWith('data:')) {
      const [meta, data] = referenceImageUrl.split(',');
      const mimeType = meta.match(/data:(.*);/)?.[1] || 'image/png';
      const imgData: GeminiImageData = { inlineData: { data, mimeType } };
      result = await generateImageFromRef(
        `Using this reference image as inspiration for the character design and style:\n\n${charPrompt}`,
        imgData
      );
    } else {
      result = await generateImage(charPrompt);
    }

    if (result) {
      return NextResponse.json(result);
    }
    return NextResponse.json({
      error: 'All image models failed. Try again or upload manually.',
    }, { status: 500 });
  } catch (error) {
    console.error('Character generation error:', error);
    return NextResponse.json({ error: 'Failed to generate character' }, { status: 500 });
  }
}

// ============================================================
// Expression Generation (single)
// ============================================================

async function handleExpressionGeneration(body: RequestBody) {
  const { baseImageUrl, expression, characterName, expressiveness = 50 } = body as unknown as {
    baseImageUrl: string;
    expression: string;
    characterName: string;
    expressiveness?: number;
  };

  const expressivenessDesc = getExpressivenessDescription(expressiveness);

  try {
    const prompt = `Generate a FULL BODY standing pose of this anime 2D otome-style character showing a "${expression}" expression.

Character: ${characterName || 'Unknown'}
Target Expression: ${expression}

Expressiveness Level: ${expressiveness}/100
${expressivenessDesc}

Art Style Requirements:
- FULL BODY standing pose — head to feet visible, same framing as the reference image
- ANIME 2D OTOME ART STYLE — soft, romantic visual novel aesthetic with clean linework
- Bishounen/Bishoujo character design with large expressive eyes, delicate features
- Soft pastel color palette with gentle shading and light bloom effects
- Keep the EXACT same art style, clothing, hair style, hair color, eye color, and character design
- Change the FACIAL EXPRESSION and BODY LANGUAGE to show "${expression}"
- Portrait orientation (tall, narrow) — character centered in frame

BACKGROUND REQUIREMENT — THIS IS CRITICAL:
- The background MUST be completely TRANSPARENT / EMPTY / BLANK
- Do NOT draw ANY background elements — no scenery, no ground, no shadows, no gradients, no decorations, no arches, no sparkles, no environment
- The character should be a CUTOUT SPRITE floating on nothing — like a PNG sticker with transparency
- This is a character sprite that will be overlaid on top of separate background images
- If you cannot make the background transparent, use a SOLID BRIGHT GREEN (#00FF00) chroma key background instead`;

    if (baseImageUrl && baseImageUrl.startsWith('data:')) {
      const [meta, data] = baseImageUrl.split(',');
      const mimeType = meta.match(/data:(.*);/)?.[1] || 'image/png';
      const imgData: GeminiImageData = { inlineData: { data, mimeType } };

      const result = await generateImageFromRef(prompt, imgData);
      if (result) return NextResponse.json(result);

      return NextResponse.json({
        imageUrl: null,
        message: 'Expression generation failed. Try again or upload manually.',
      });
    } else {
      const result = await generateImage(prompt);
      if (result) return NextResponse.json(result);

      return NextResponse.json({
        imageUrl: null,
        message: 'Base image could not be processed. Upload the expression manually.',
      });
    }
  } catch (error) {
    console.error('Expression generation error:', error);
    return NextResponse.json({ error: 'Failed to generate expression' }, { status: 500 });
  }
}

// ============================================================
// Scene Dialogue (existing functionality)
// ============================================================

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
