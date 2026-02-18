import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

const NOVELAI_API = 'https://image.novelai.net';
const NOVELAI_KEY = process.env.NOVELAI_API_KEY;

interface GenerateRequest {
  action: 'generate_character' | 'generate_expression' | 'generate_background';
  prompt: string;
  characterName?: string;
  expression?: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
}

function buildCharacterPrompt(prompt: string, characterName?: string): string {
  return `masterpiece, best quality, highly detailed, ${prompt}, full body, standing pose, anime style, 2d illustration, clean lineart, transparent background, single character${
    characterName ? `, ${characterName}` : ''
  }`;
}

function buildExpressionPrompt(prompt: string, expression: string, characterName?: string): string {
  const expressionMap: Record<string, string> = {
    default: 'neutral expression, calm face',
    happy: 'happy expression, bright smile, joyful eyes',
    sad: 'sad expression, downcast eyes, slight frown',
    angry: 'angry expression, furrowed brows, intense eyes',
    surprised: 'surprised expression, wide eyes, open mouth',
    thinking: 'thinking expression, hand on chin, contemplative look',
    embarrassed: 'embarrassed expression, blushing, looking away',
  };

  return `masterpiece, best quality, highly detailed, ${prompt}, ${
    expressionMap[expression] || expression
  }, full body, standing pose, anime style, 2d illustration, single character${
    characterName ? `, ${characterName}` : ''
  }`;
}

function buildBackgroundPrompt(prompt: string): string {
  return `masterpiece, best quality, highly detailed, ${prompt}, anime background, visual novel background, no people, no characters, wide shot, detailed environment`;
}

const DEFAULT_NEGATIVE =
  'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry, multiple characters, duplicate';

export async function POST(req: NextRequest) {
  if (!NOVELAI_KEY) {
    return NextResponse.json({ error: 'NovelAI API key not configured' }, { status: 500 });
  }

  try {
    const body: GenerateRequest = await req.json();
    const { action, prompt, characterName, expression, negativePrompt, width, height } = body;

    let finalPrompt: string;
    let w = width || 512;
    let h = height || 768;

    switch (action) {
      case 'generate_character':
        finalPrompt = buildCharacterPrompt(prompt, characterName);
        w = 512;
        h = 768;
        break;
      case 'generate_expression':
        finalPrompt = buildExpressionPrompt(prompt, expression || 'default', characterName);
        w = 512;
        h = 768;
        break;
      case 'generate_background':
        finalPrompt = buildBackgroundPrompt(prompt);
        w = 1024;
        h = 576;
        break;
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const response = await fetch(`${NOVELAI_API}/ai/generate-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${NOVELAI_KEY}`,
      },
      body: JSON.stringify({
        input: finalPrompt,
        model: 'nai-diffusion-4-curated-preview',
        action: 'generate',
        parameters: {
          width: w,
          height: h,
          scale: 5,
          sampler: 'k_euler',
          steps: 28,
          n_samples: 1,
          ucPreset: 0,
          qualityToggle: true,
          negative_prompt: negativePrompt || DEFAULT_NEGATIVE,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('NovelAI error:', response.status, errorText);
      return NextResponse.json(
        { error: `NovelAI API error: ${response.status}` },
        { status: response.status }
      );
    }

    // NovelAI returns a zip file containing the image
    const buffer = await response.arrayBuffer();

    // The response is a zip file. Extract the PNG from it.
    // NovelAI zip contains a single image file.
    // For simplicity, we'll look for the PNG signature in the buffer.
    const bytes = new Uint8Array(buffer);

    // Find PNG start signature: 137 80 78 71 13 10 26 10
    let pngStart = -1;
    for (let i = 0; i < bytes.length - 8; i++) {
      if (
        bytes[i] === 137 &&
        bytes[i + 1] === 80 &&
        bytes[i + 2] === 78 &&
        bytes[i + 3] === 71 &&
        bytes[i + 4] === 13 &&
        bytes[i + 5] === 10 &&
        bytes[i + 6] === 26 &&
        bytes[i + 7] === 10
      ) {
        pngStart = i;
        break;
      }
    }

    if (pngStart === -1) {
      // Maybe the response is already a direct image
      const base64 = Buffer.from(buffer).toString('base64');
      return NextResponse.json({
        imageUrl: `data:image/png;base64,${base64}`,
      });
    }

    // Extract from PNG start to end of buffer
    const pngBytes = bytes.slice(pngStart);
    const base64 = Buffer.from(pngBytes).toString('base64');

    return NextResponse.json({
      imageUrl: `data:image/png;base64,${base64}`,
    });
  } catch (error) {
    console.error('NovelAI route error:', error);
    return NextResponse.json(
      { error: 'Failed to generate image' },
      { status: 500 }
    );
  }
}
