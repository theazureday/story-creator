import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 60;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

interface DialogueRequest {
  action: 'scene_dialogue' | 'evaluate_conditions';
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

export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
  }

  try {
    const body: DialogueRequest = await req.json();

    if (body.action === 'scene_dialogue') {
      return await handleSceneDialogue(body);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Gemini route error:', error);
    return NextResponse.json({ error: 'Failed to generate dialogue' }, { status: 500 });
  }
}

async function handleSceneDialogue(body: DialogueRequest) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const characterDescriptions = body.characters
    .map(
      (c) =>
        `- ${c.displayName} (id: ${c.id}): ${c.description}${
          c.outfit ? `\n  Current outfit: ${c.outfit}` : ''
        }`
    )
    .join('\n');

  const remainingConditions = body.winConditions
    .filter((wc) => !body.completedConditionIds.includes(wc.id))
    .map((wc) => `- [${wc.id}] ${wc.completionCriteria}`)
    .join('\n');

  const completedConditions = body.winConditions
    .filter((wc) => body.completedConditionIds.includes(wc.id))
    .map((wc) => `- [COMPLETED] ${wc.description}`)
    .join('\n');

  const conversationText = body.conversationHistory
    .map((msg) => {
      if (msg.role === 'player') return `Player: ${msg.text}`;
      if (msg.role === 'narrator') return `Narrator: ${msg.text}`;
      return `${msg.characterName || 'Character'}: ${msg.text}`;
    })
    .join('\n');

  const systemPrompt = `You are the AI narrator and character voice for an interactive visual novel scene.

SCENE SETTING:
${body.scenePrompt}

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
  }Player says: "${body.playerMessage}"

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

  // Parse the JSON block from the response
  const jsonMatch = responseText.match(/```json\s*\n?([\s\S]*?)\n?\s*```/);
  let parsed = {
    character: body.characters[0]?.id || '',
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

  // Clean the response text (remove the JSON block)
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
