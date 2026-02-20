import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 120;

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || '';

// Stability AI for background removal
const STABILITY_API_KEY = process.env.STABILITY_API_KEY || '';

// xAI Grok Imagine for expression/outfit editing
const XAI_API_KEY = process.env.XAI_API_KEY || '';

// Alibaba Cloud DashScope for Wan2.5 image editing
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || '';

// fal.ai for Wan2.5 image editing (with safety checker toggle)
const FAL_KEY = process.env.FAL_KEY || '';

// RunPod Serverless for ComfyUI img2img (no content filtering)
const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY || '';
const RUNPOD_ENDPOINT_ID = process.env.RUNPOD_ENDPOINT_ID || '';

// ============================================================
// Replicate API Helpers
// ============================================================

/**
 * Run a Replicate model using versioned format (owner/name:version).
 */
async function replicateRunVersion(
  version: string,
  input: Record<string, unknown>,
  timeoutMs: number = 90000,
): Promise<unknown> {
  // Retry up to 2 times on rate limit (429)
  let createRes: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    createRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
      },
      body: JSON.stringify({
        version,
        input,
      }),
    });

    if (createRes.status === 429 && attempt < 2) {
      // Rate limited — wait and retry
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    break;
  }

  if (!createRes || !createRes.ok) {
    const errText = await createRes?.text().catch(() => '') || '';
    throw new Error(`Replicate create failed (${createRes?.status}): ${errText}`);
  }

  const prediction = await createRes.json();

  if (prediction.status === 'succeeded') return prediction.output;
  if (prediction.status === 'failed') throw new Error(prediction.error || 'Replicate prediction failed');

  const pollUrl = prediction.urls?.get || `https://api.replicate.com/v1/predictions/${prediction.id}`;
  const startTime = Date.now();
  const pollInterval = 2000;

  while (Date.now() - startTime < timeoutMs) {
    await new Promise((r) => setTimeout(r, pollInterval));

    const statusRes = await fetch(pollUrl, {
      headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` },
    });

    if (!statusRes.ok) continue;

    const statusData = await statusRes.json();

    if (statusData.status === 'succeeded') return statusData.output;
    if (statusData.status === 'failed') throw new Error(statusData.error || 'Replicate prediction failed');
    if (statusData.status === 'canceled') throw new Error('Replicate prediction canceled');
  }

  throw new Error('Polling timeout — Replicate prediction did not complete in time');
}

/**
 * Download an image URL and convert to data URI.
 */
async function urlToDataUri(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download image: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') || 'image/png';
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

// ============================================================
// Stability AI Background Removal
// ============================================================

async function removeBackgroundAPI(
  imageBase64: string,
  imageMimeType: string = 'image/png',
): Promise<string | null> {
  try {
    const imageBytes = Buffer.from(imageBase64, 'base64');
    const imageBlob = new Blob([imageBytes], { type: imageMimeType });

    const form = new FormData();
    form.append('image', imageBlob, 'input.png');
    form.append('output_format', 'png');

    const res = await fetch('https://api.stability.ai/v2beta/stable-image/edit/remove-background', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STABILITY_API_KEY}`,
        Accept: 'application/json',
      },
      body: form,
    });

    if (!res.ok) {
      console.error(`Background removal failed (${res.status})`);
      return null;
    }

    const data = await res.json();
    if (data.image) return `data:image/png;base64,${data.image}`;
    return null;
  } catch (err) {
    console.error('Background removal error:', err);
    return null;
  }
}

// ============================================================
// xAI Grok Imagine API Helper
// ============================================================

async function grokImageEdit(
  prompt: string,
  imageDataUri: string,
  responseFormat: 'url' | 'b64_json' = 'b64_json',
): Promise<string> {
  const res = await fetch('https://api.x.ai/v1/images/edits', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'grok-imagine-image',
      prompt,
      image: {
        url: imageDataUri,
        type: 'image_url',
      },
      n: 1,
      response_format: responseFormat,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Grok Imagine edit failed (${res.status}): ${errText}`);
  }

  const data = await res.json();

  if (responseFormat === 'b64_json') {
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error('No b64_json in Grok response');
    return `data:image/png;base64,${b64}`;
  } else {
    const url = data.data?.[0]?.url;
    if (!url) throw new Error('No URL in Grok response');
    return url;
  }
}

// ============================================================
// Alibaba Wan2.5 Image Editing API Helper
// ============================================================

async function wan25ImageEdit(
  prompt: string,
  imageDataUri: string,
  timeoutMs: number = 90000,
): Promise<string> {
  const DASHSCOPE_BASE = 'https://dashscope-intl.aliyuncs.com/api/v1';

  // Step 1: Submit async task
  const createRes = await fetch(`${DASHSCOPE_BASE}/services/aigc/image2image/image-synthesis`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify({
      model: 'wan2.5-i2i-preview',
      input: {
        prompt,
        images: [imageDataUri],
      },
      parameters: {
        n: 1,
        prompt_extend: false,
        watermark: false,
      },
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text().catch(() => '');
    throw new Error(`Wan2.5 task creation failed (${createRes.status}): ${errText}`);
  }

  const createData = await createRes.json();
  const taskId = createData.output?.task_id;
  if (!taskId) throw new Error('No task_id in Wan2.5 response');

  // Step 2: Poll for completion
  const startTime = Date.now();
  const pollInterval = 3000;

  while (Date.now() - startTime < timeoutMs) {
    await new Promise((r) => setTimeout(r, pollInterval));

    const pollRes = await fetch(`${DASHSCOPE_BASE}/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${DASHSCOPE_API_KEY}` },
    });

    if (!pollRes.ok) continue;
    const pollData = await pollRes.json();
    const status = pollData.output?.task_status;

    if (status === 'SUCCEEDED') {
      const resultUrl = pollData.output?.results?.[0]?.url;
      if (!resultUrl) throw new Error('No result URL in Wan2.5 response');
      // Download and convert to data URI (URLs expire in 24h)
      return await urlToDataUri(resultUrl);
    }
    if (status === 'FAILED') {
      throw new Error(`Wan2.5 task failed: ${pollData.output?.message || 'unknown error'}`);
    }
  }

  throw new Error('Wan2.5 polling timeout — task did not complete in time');
}

// ============================================================
// fal.ai Wan2.5 Image Editing API Helper
// ============================================================

async function falWan25ImageEdit(
  prompt: string,
  imageDataUri: string,
  timeoutMs: number = 120000,
): Promise<string> {
  const FAL_BASE = 'https://queue.fal.run/fal-ai/wan-25-preview/image-to-image';

  // Step 1: Submit to queue
  const submitRes = await fetch(FAL_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${FAL_KEY}`,
    },
    body: JSON.stringify({
      prompt,
      image_urls: [imageDataUri],
      enable_safety_checker: false,
      num_images: 1,
      image_size: {
        width: 832,
        height: 1216,
      },
    }),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => '');
    throw new Error(`fal.ai submit failed (${submitRes.status}): ${errText}`);
  }

  const submitData = await submitRes.json();
  const requestId = submitData.request_id;
  if (!requestId) throw new Error('No request_id in fal.ai response');

  // Use URLs from the submit response (they exclude the /image-to-image sub-path)
  const statusUrl = submitData.status_url || `https://queue.fal.run/fal-ai/wan-25-preview/requests/${requestId}/status`;
  const resultUrl = submitData.response_url || `https://queue.fal.run/fal-ai/wan-25-preview/requests/${requestId}`;

  // Step 2: Poll for completion
  const startTime = Date.now();
  const pollInterval = 3000;

  while (Date.now() - startTime < timeoutMs) {
    await new Promise((r) => setTimeout(r, pollInterval));

    const pollRes = await fetch(statusUrl, {
      headers: { Authorization: `Key ${FAL_KEY}` },
    });

    if (!pollRes.ok) continue;
    const pollData = await pollRes.json();

    if (pollData.status === 'COMPLETED') {
      // Fetch the actual result
      const resultRes = await fetch(resultUrl, {
        headers: { Authorization: `Key ${FAL_KEY}` },
      });
      if (!resultRes.ok) throw new Error('Failed to fetch fal.ai result');
      const resultData = await resultRes.json();

      const imgUrl = resultData.images?.[0]?.url;
      if (!imgUrl) throw new Error('No image URL in fal.ai result');
      return await urlToDataUri(imgUrl);
    }
    if (pollData.status === 'FAILED') {
      throw new Error(`fal.ai task failed: ${JSON.stringify(pollData)}`);
    }
  }

  throw new Error('fal.ai polling timeout — task did not complete in time');
}

// ============================================================
// RunPod ComfyUI img2img (JANKU v6.9 Illustrious/SDXL — no content filter)
// ============================================================

const SDXL_NEGATIVE = 'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry, artist name, deformed, ugly, duplicate, morbid, mutilated, extra limbs, cloned face, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, fused fingers, too many fingers, long neck';

function buildJankuImg2ImgWorkflow(prompt: string, negativePrompt: string, seed: number, denoise: number = 0.55, cfg: number = 6.0): Record<string, unknown> {
  return {
    "1": {
      "inputs": { "ckpt_name": "JANKUTrainedNoobaiRouwei_v69.safetensors" },
      "class_type": "CheckpointLoaderSimple"
    },
    "2": {
      "inputs": { "text": prompt, "clip": ["1", 1] },
      "class_type": "CLIPTextEncode"
    },
    "3": {
      "inputs": { "text": negativePrompt, "clip": ["1", 1] },
      "class_type": "CLIPTextEncode"
    },
    "4": {
      "inputs": { "image": "input.png" },
      "class_type": "LoadImage"
    },
    "5": {
      "inputs": { "pixels": ["4", 0], "vae": ["1", 2] },
      "class_type": "VAEEncode"
    },
    "6": {
      "inputs": {
        "seed": seed,
        "steps": 30,
        "cfg": cfg,
        "sampler_name": "euler_ancestral",
        "scheduler": "normal",
        "denoise": denoise,
        "model": ["1", 0],
        "positive": ["2", 0],
        "negative": ["3", 0],
        "latent_image": ["5", 0]
      },
      "class_type": "KSampler"
    },
    "7": {
      "inputs": { "samples": ["6", 0], "vae": ["1", 2] },
      "class_type": "VAEDecode"
    },
    "8": {
      "inputs": { "filename_prefix": "output", "images": ["7", 0] },
      "class_type": "SaveImage"
    }
  };
}

async function runpodComfyUIImageEdit(
  prompt: string,
  imageDataUri: string,
  timeoutMs: number = 120000,
  denoise: number = 0.55,
  cfg: number = 6.0,
  negativePrompt: string = SDXL_NEGATIVE,
): Promise<string> {
  const RUNPOD_BASE = `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}`;

  // Strip data URI prefix if present to get raw base64
  const base64Data = imageDataUri.replace(/^data:image\/\w+;base64,/, '');

  const seed = Math.floor(Math.random() * 2147483647);
  const workflow = buildJankuImg2ImgWorkflow(prompt, negativePrompt, seed, denoise, cfg);

  // Step 1: Submit async job
  const submitRes = await fetch(`${RUNPOD_BASE}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RUNPOD_API_KEY}`,
    },
    body: JSON.stringify({
      input: {
        workflow,
        images: [
          {
            name: 'input.png',
            image: base64Data,
          },
        ],
      },
    }),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => '');
    throw new Error(`RunPod submit failed (${submitRes.status}): ${errText}`);
  }

  const submitData = await submitRes.json();
  const jobId = submitData.id;
  if (!jobId) throw new Error('No job ID in RunPod response');

  // Step 2: Poll for completion
  const startTime = Date.now();
  const pollInterval = 3000;

  while (Date.now() - startTime < timeoutMs) {
    await new Promise((r) => setTimeout(r, pollInterval));

    const pollRes = await fetch(`${RUNPOD_BASE}/status/${jobId}`, {
      headers: { Authorization: `Bearer ${RUNPOD_API_KEY}` },
    });

    if (!pollRes.ok) continue;
    const pollData = await pollRes.json();
    const status = pollData.status;

    if (status === 'COMPLETED') {
      // v5.0.0+ returns output.images array with {filename, type, data}
      const images = pollData.output?.images;
      if (images && images.length > 0) {
        const img = images[0];
        if (img.type === 'base64') {
          return `data:image/png;base64,${img.data}`;
        } else if (img.type === 's3_url') {
          return await urlToDataUri(img.data);
        }
      }
      // Fallback for older versions: output.message contains base64 or URL
      const message = pollData.output?.message;
      if (message) {
        if (message.startsWith('http')) {
          return await urlToDataUri(message);
        }
        return `data:image/png;base64,${message}`;
      }
      throw new Error('No image data in RunPod response');
    }
    if (status === 'FAILED') {
      throw new Error(`RunPod job failed: ${pollData.error || JSON.stringify(pollData)}`);
    }
  }

  throw new Error('RunPod polling timeout — job did not complete in time');
}

// ============================================================
// Anime Prompt Builders (Danbooru tag style)
// ============================================================

const ANIME_NEGATIVE =
  'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry, artist name, multiple views, multiple angles';

function buildCharacterTags(characterName: string, description: string): string {
  return [
    'masterpiece, best quality, absurdres, highres',
    '1girl, solo',
    description,
    'full body, standing, looking at viewer',
    'anime coloring, clean lineart, cel shading',
    'simple background, white background',
    characterName ? `(${characterName})` : '',
  ]
    .filter(Boolean)
    .join(', ');
}

function isOutfitPrompt(expression: string): boolean {
  return expression.startsWith('wearing ');
}

// Instructional prompt for models that understand editing (Wan2.5, Grok)
function buildExpressionPrompt(
  characterDescription: string,
  expression: string,
): string {
  const expressionMap: Record<string, string> = {
    default: 'standing naturally with a calm, neutral expression',
    happy: 'with a gentle smile, relaxed and cheerful posture',
    sad: 'looking slightly downward with a soft frown, shoulders lowered a bit',
    annoyed: 'with a slight frown and arms crossed, looking mildly irritated',
    surprised: 'with slightly widened eyes and a small gasp, leaning back a little',
    aroused: 'with half-lidded eyes, lips slightly parted, a subtle flush on the cheeks, one hand resting lightly on the chest, leaning forward slightly with a warm inviting gaze',
    embarrassed: 'looking slightly away with a faint blush and a shy half-smile',
  };

  if (isOutfitPrompt(expression)) {
    const outfitDesc = expression.replace('wearing ', '');
    return `Edit this anime character to be ${expression}. Change the outfit to: ${outfitDesc}. Keep the same character identity, same face, same hair color, same eye color, same body type. ${characterDescription ? `Character: ${characterDescription}.` : ''} Full body, anime style, high quality.`;
  }

  const exprPhrase = expressionMap[expression] || expression;
  return `Edit this anime character: ${exprPhrase}. Keep the same character identity, same outfit, same hair color, same eye color. ${characterDescription ? `Character: ${characterDescription}.` : ''} Full body, anime style, high quality.`;
}

// Danbooru-tag prompt for SDXL/Illustrious models (JANKU, NoobAI, etc.)
// JANKU is an uncensored model — prompts should faithfully reflect user intent including NSFW
function buildSdxlDescriptivePrompt(
  characterDescription: string,
  expression: string,
): string {
  const expressionMap: Record<string, string> = {
    default: 'calm expression, standing naturally',
    happy: 'smile, happy, cheerful, relaxed',
    sad: 'looking down, sad, frown, shoulders lowered',
    annoyed: 'frown, arms crossed, annoyed, irritated',
    surprised: 'wide eyes, surprised, open mouth, leaning back',
    aroused: 'nsfw, half-closed eyes, parted lips, heavy blush, bedroom eyes, seductive smile, leaning forward, hand on own chest, sweat, panting, suggestive pose, looking at viewer',
    embarrassed: 'looking away, blush, shy, half smile, embarrassed, covering, flustered',
  };

  if (isOutfitPrompt(expression)) {
    const outfitDesc = expression.replace('wearing ', '');
    // Pass the outfit description faithfully — if the user wants NSFW, let JANKU deliver
    return `masterpiece, best quality, absurdres, highres, 1girl, solo, ${characterDescription || 'anime girl'}, ${outfitDesc}, full body, standing, looking at viewer, anime coloring, detailed, simple background, white background`;
  }

  const exprPhrase = expressionMap[expression] || expression;
  return `masterpiece, best quality, absurdres, highres, 1girl, solo, ${characterDescription || 'anime girl'}, ${exprPhrase}, full body, standing, looking at viewer, anime coloring, detailed, simple background, white background`;
}

function buildBackgroundTags(prompt: string): string {
  return [
    'masterpiece, best quality, absurdres, highres',
    'no humans, scenery, landscape',
    prompt,
    'anime background, visual novel background',
    'detailed environment, atmospheric lighting',
    'wide shot',
  ].join(', ');
}

function buildKeyArtTags(prompt: string): string {
  return [
    'masterpiece, best quality, absurdres, highres',
    prompt,
    'anime illustration, key visual',
    'dramatic lighting, detailed',
    'vivid colors',
  ].join(', ');
}

// ============================================================
// Replicate Model IDs
// ============================================================

// Animagine XL 4.0 — fast, cheap ($0.007/run), excellent anime quality
const ANIMAGINE_VERSION = '057e2276ac5dcd8d1575dc37b131f903df9c10c41aed53d47cd7d4f068c19fa5';

// SD 3.5 Large — kept for potential future use
// const SD35_VERSION = '2fdf9488b53c1e0fd3aef7b477def1c00d1856a38466733711f9c769942598f5';

// ============================================================
// Route Handler
// ============================================================

interface RequestBody {
  action: string;
  [key: string]: unknown;
}

export async function POST(req: NextRequest) {
  if (!REPLICATE_API_TOKEN) {
    return NextResponse.json(
      { error: 'Replicate API not configured' },
      { status: 500 },
    );
  }

  try {
    const body: RequestBody = await req.json();

    switch (body.action) {
      case 'generate_character':
        return await handleCharacterGeneration(body);
      case 'generate_expression':
        return await handleExpressionGeneration(body);
      case 'generate_background':
        return await handleBackgroundGeneration(body);
      case 'generate_keyart':
        return await handleKeyArtGeneration(body);
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('API route error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ============================================================
// Character Generation (Animagine XL 4.0 txt2img → remove bg)
// ============================================================

async function handleCharacterGeneration(body: RequestBody) {
  const { prompt, characterName } = body as unknown as {
    prompt: string;
    characterName: string;
    referenceImageUrl?: string;
  };

  const tags = buildCharacterTags(characterName, prompt);

  try {
    // Use Animagine XL 4.0 for character generation
    const output = await replicateRunVersion(ANIMAGINE_VERSION, {
      prompt: tags,
      negative_prompt: ANIME_NEGATIVE,
      width: 832,
      height: 1216,
      cfg_scale: 5,
      steps: 28,
      scheduler: 'Euler a',
    });

    // Output is an array of image URLs
    const outputUrls = output as string[];
    if (!outputUrls || outputUrls.length === 0) {
      return NextResponse.json({ error: 'Image generation failed' }, { status: 500 });
    }

    // Download the image and convert to data URI
    const imageDataUri = await urlToDataUri(outputUrls[0]);

    // Remove background
    const raw = imageDataUri.replace(/^data:image\/\w+;base64,/, '');
    const cleaned = await removeBackgroundAPI(raw, 'image/png');
    return NextResponse.json({ imageUrl: cleaned || imageDataUri });
  } catch (error) {
    console.error('Character generation error:', error);
    return NextResponse.json(
      { error: `Character generation failed: ${error instanceof Error ? error.message : 'unknown'}` },
      { status: 500 },
    );
  }
}

// ============================================================
// Expression Generation (NoobAI-XL img2img)
// ============================================================

async function handleExpressionGeneration(body: RequestBody) {
  const { baseImageUrl, expression, characterDescription = '' } = body as unknown as {
    baseImageUrl: string;
    expression: string;
    characterName: string;
    characterDescription?: string;
  };

  const isOutfit = isOutfitPrompt(expression);
  // SDXL/JANKU needs danbooru-tag prompts; Wan2.5/Grok need instructional prompts
  const instructionalPrompt = buildExpressionPrompt(characterDescription, expression);
  const sdxlPrompt = buildSdxlDescriptivePrompt(characterDescription, expression);

  try {
    let imageInput: string | null = null;

    if (baseImageUrl && baseImageUrl.startsWith('data:')) {
      imageInput = baseImageUrl;
    } else if (baseImageUrl) {
      imageInput = baseImageUrl;
    }

    if (!imageInput) {
      return NextResponse.json({ imageUrl: null, message: 'No base image provided' });
    }

    // Priority: RunPod ComfyUI with JANKU (truly uncensored SDXL) → fal.ai → DashScope → Grok
    // SDXL img2img: denoise 0.65-0.80 for outfits (more change), 0.40-0.55 for expressions (subtle)
    // CFG 6-7 for SDXL (higher = more prompt adherence)
    let editedDataUri: string;
    if (RUNPOD_API_KEY && RUNPOD_ENDPOINT_ID) {
      editedDataUri = await runpodComfyUIImageEdit(
        sdxlPrompt, imageInput, 120000,
        isOutfit ? 0.82 : 0.45,  // SDXL denoise: 0.82 for outfits (major change), 0.45 for expressions (subtle)
        isOutfit ? 7.5 : 5.5,    // SDXL cfg: 7.5 for outfits to strongly push prompt adherence
      );
    } else if (FAL_KEY) {
      editedDataUri = await falWan25ImageEdit(instructionalPrompt, imageInput);
    } else if (DASHSCOPE_API_KEY) {
      editedDataUri = await wan25ImageEdit(instructionalPrompt, imageInput);
    } else {
      editedDataUri = await grokImageEdit(instructionalPrompt, imageInput, 'b64_json');
    }

    // Skip Stability AI background removal for expressions/outfits — it has
    // built-in content moderation that blurs NSFW images. The base portrait already
    // has a transparent background, and JANKU prompts include 'white background',
    // so the output doesn't need external bg removal.
    return NextResponse.json({ imageUrl: editedDataUri });
  } catch (error) {
    console.error('Expression generation error:', error);
    return NextResponse.json(
      { error: `Expression generation failed: ${error instanceof Error ? error.message : 'unknown'}` },
      { status: 500 },
    );
  }
}

// ============================================================
// Background Generation (Animagine XL 4.0 txt2img, landscape)
// ============================================================

async function handleBackgroundGeneration(body: RequestBody) {
  const { prompt } = body as unknown as { prompt: string };
  const tags = buildBackgroundTags(prompt);

  const negPrompt = [
    'lowres, worst quality, low quality, jpeg artifacts',
    'text, watermark, signature, logo',
    'people, characters, figures, person, human, 1girl, 1boy',
  ].join(', ');

  try {
    const output = await replicateRunVersion(ANIMAGINE_VERSION, {
      prompt: tags,
      negative_prompt: negPrompt,
      width: 1216,
      height: 832,
      cfg_scale: 5,
      steps: 28,
      scheduler: 'Euler a',
    });

    const outputUrls = output as string[];
    if (!outputUrls || outputUrls.length === 0) {
      return NextResponse.json({ error: 'Background generation failed' }, { status: 500 });
    }

    const imageDataUri = await urlToDataUri(outputUrls[0]);
    return NextResponse.json({ imageUrl: imageDataUri });
  } catch (error) {
    console.error('Background generation error:', error);
    return NextResponse.json(
      { error: `Background generation failed: ${error instanceof Error ? error.message : 'unknown'}` },
      { status: 500 },
    );
  }
}

// ============================================================
// Key Art Generation (Animagine XL 4.0 txt2img, portrait)
// ============================================================

async function handleKeyArtGeneration(body: RequestBody) {
  const { prompt } = body as unknown as { prompt: string };
  const tags = buildKeyArtTags(prompt);

  const negPrompt =
    'lowres, worst quality, low quality, jpeg artifacts, text, watermark, signature, logo, bad anatomy, deformed';

  try {
    const output = await replicateRunVersion(ANIMAGINE_VERSION, {
      prompt: tags,
      negative_prompt: negPrompt,
      width: 832,
      height: 1216,
      cfg_scale: 5,
      steps: 28,
      scheduler: 'Euler a',
    });

    const outputUrls = output as string[];
    if (!outputUrls || outputUrls.length === 0) {
      return NextResponse.json({ error: 'Key art generation failed' }, { status: 500 });
    }

    const imageDataUri = await urlToDataUri(outputUrls[0]);
    return NextResponse.json({ imageUrl: imageDataUri });
  } catch (error) {
    console.error('Key art generation error:', error);
    return NextResponse.json(
      { error: `Key art generation failed: ${error instanceof Error ? error.message : 'unknown'}` },
      { status: 500 },
    );
  }
}
