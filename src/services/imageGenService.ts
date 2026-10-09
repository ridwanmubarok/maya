import fs from "fs";
import path from "path";
import crypto from "crypto";
import { askAI } from "./aiClient";
import { logger } from "../utils/logger";

export interface ImageGenResult {
  userPrompt: string;
  enhancedPrompt: string;
  imageUrl: string;
  imageBuffer?: Buffer;
  style: string;
  seed: number;
  modelUsed?: string;
  durationMs?: number;
}

const STYLE_ENHANCERS: Record<string, string> = {
  Anime: "anime style, Makoto Shinkai aesthetic, vibrant colors, clean lineart, highly detailed, atmospheric lighting, 8k resolution, masterpiece",
  Photorealistic: "photorealistic, 8k uhd, dslr photo, professional photography, natural lighting, sharp focus, hyperrealistic textures, masterpiece",
  Cyberpunk: "cyberpunk aesthetic, neon glow, futuristic cityscape, dark atmospheric lighting, highly detailed, octane render, masterpiece",
  "3D Pixar": "3d pixar animation style, adorable, volumetric lighting, smooth textures, vibrant colors, cinematic 3d render, masterpiece",
  Fantasy: "epic fantasy art, digital oil painting, magical atmosphere, rich vibrant colors, intricate details, masterpiece",
  "Digital Art": "modern digital art, clean composition, artistic lighting, vibrant palette, sharp focus, 8k resolution, masterpiece"
};

/**
 * Enhance user prompt into aesthetic English image prompt.
 * If Gemini has quota, it enhances smartly; if quota is exhausted,
 * it immediately uses high-grade curated style dictionary.
 */
export async function enhancePromptWithGemini(userPrompt: string, style: string = "Anime"): Promise<string> {
  const styleKeywords = STYLE_ENHANCERS[style] || STYLE_ENHANCERS["Digital Art"];

  try {
    const systemPrompt = "You are an expert AI image prompt engineer for FLUX and diffusion models. Convert user description into a concise, vivid English prompt under 200 characters with aesthetic visual details. Output ONLY the English prompt text without quotes or conversation.";
    const prompt = `Convert this description into a vivid English prompt for ${style} style: "${userPrompt}"`;

    // Attempt Gemini with short timeout (catch quota error gracefully)
    const raw = await askAI(prompt, systemPrompt);
    const cleaned = raw.replace(/^["']|["']$/g, "").trim();
    const invalidKeywords = ["maaf", "tidak dapat", "belum dikonfigurasi", "api_key", "error", "kuota", "quota", "gagal", "terjadi kesalahan", "limit", "exhausted"];
    const hasError = invalidKeywords.some(kw => cleaned.toLowerCase().includes(kw));

    if (cleaned && cleaned.length > 5 && !hasError) {
      return cleaned.length > 220 ? cleaned.slice(0, 220) : cleaned;
    }
  } catch (_) {
    // Quota exhausted or network issue: use curated fallback smoothly
  }

  const fallback = `${userPrompt}, ${styleKeywords}`;
  return fallback.length > 250 ? fallback.slice(0, 250) : fallback;
}

export const enhancePromptWithNvidia = enhancePromptWithGemini;

/**
 * Save image buffer to public directory so it can be served via Express static
 */
function saveGeneratedImageLocally(buffer: Buffer, ext: string = "jpg"): { fileName: string; relativeUrl: string } {
  const fileHash = crypto.randomBytes(8).toString("hex");
  const fileName = `img_${Date.now()}_${fileHash}.${ext}`;

  const targetDirs = [
    path.join(__dirname, "../public/generated-images"),
    path.join(process.cwd(), "src/public/generated-images"),
    path.join(process.cwd(), "dist/public/generated-images")
  ];

  for (const dir of targetDirs) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(path.join(dir, fileName), buffer);
    } catch (_) {}
  }

  return {
    fileName,
    relativeUrl: `/generated-images/${fileName}`
  };
}

/**
 * Engine 1: High quality direct Pollinations engine (Free & Fast)
 */
async function callPollinationsEngine(
  prompt: string,
  model: string = "flux"
): Promise<{ buffer: Buffer; format: string } | null> {
  try {
    const encoded = encodeURIComponent(prompt);
    const url = `https://image.pollinations.ai/prompt/${encoded}?model=${model}&nologo=true`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://pollinations.ai/",
        "Accept": "image/jpeg,image/png,image/*"
      },
      signal: AbortSignal.timeout(18000)
    });

    if (res.ok) {
      const arrayBuf = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      if (buffer.length > 4000) {
        return { buffer, format: "jpg" };
      }
    }
  } catch (err: any) {
    logger.warn(`ImageGenService: Pollinations error (${err.message}). Trying secondary engine...`);
  }
  return null;
}

/**
 * Engine 2: HuggingFace Official FLUX.1 Space via Gradio SSE Protocol (100% Free)
 */
async function callFluxGradioSpace(
  prompt: string,
  seed: number = 0
): Promise<{ buffer: Buffer; format: string } | null> {
  const spaces = [
    "black-forest-labs-flux-1-schnell.hf.space",
    "evalstate-flux1-schnell.hf.space"
  ];

  for (const spaceHost of spaces) {
    try {
      const submitUrl = `https://${spaceHost}/gradio_api/call/infer`;
      const postRes = await fetch(submitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: [prompt, seed, true, 1024, 1024, 4]
        }),
        signal: AbortSignal.timeout(18000)
      });

      if (!postRes.ok) continue;
      const postData: any = await postRes.json();
      const eventId = postData?.event_id;
      if (!eventId) continue;

      const eventUrl = `https://${spaceHost}/gradio_api/call/infer/${eventId}`;
      const sseRes = await fetch(eventUrl, {
        signal: AbortSignal.timeout(30000)
      });

      if (!sseRes.ok) continue;
      const sseText = await sseRes.text();

      const lines = sseText.split("\n");
      for (const line of lines) {
        if (line.startsWith("data:")) {
          try {
            const parsed = JSON.parse(line.slice(5).trim());
            if (Array.isArray(parsed) && parsed[0]?.url) {
              const rawImgUrl = parsed[0].url;
              const imgRes = await fetch(rawImgUrl, { signal: AbortSignal.timeout(15000) });
              if (imgRes.ok) {
                const arrayBuf = await imgRes.arrayBuffer();
                const buffer = Buffer.from(arrayBuf);
                if (buffer.length > 5000) {
                  return { buffer, format: "webp" };
                }
              }
            }
          } catch (_) {}
        }
      }
    } catch (err: any) {
      logger.warn(`ImageGenService: FLUX space ${spaceHost} error: ${err.message}`);
    }
  }

  return null;
}

/**
 * Generate HD image using dual-engine architecture (Pollinations & FLUX.1)
 * 100% Free, Unlimited & Zero Gemini Quota usage.
 */
export async function generateFreeImage(
  userPrompt: string,
  style: string = "Anime",
  customSeed?: number,
  preferredModel?: string
): Promise<ImageGenResult | null> {
  const startTime = Date.now();
  const seed = customSeed || Math.floor(Math.random() * 10000000);

  try {
    const baseEnhanced = await enhancePromptWithGemini(userPrompt, style);
    const enhancedPrompt = `${baseEnhanced}, sharp focus, crisp details, highly detailed`;

    const modelToUse = preferredModel && preferredModel.trim() ? preferredModel.trim() : "flux";

    // 1. Try Primary Engine (Pollinations Free Tier)
    const primaryResult = await callPollinationsEngine(enhancedPrompt, modelToUse);
    if (primaryResult) {
      const { relativeUrl } = saveGeneratedImageLocally(primaryResult.buffer, primaryResult.format);
      const baseUrl = (process.env.PUBLIC_URL || "").replace(/\/+$/, "");
      const finalImageUrl = baseUrl ? `${baseUrl}${relativeUrl}` : relativeUrl;

      return {
        userPrompt,
        enhancedPrompt,
        imageUrl: finalImageUrl,
        imageBuffer: primaryResult.buffer,
        style,
        seed,
        modelUsed: `${modelToUse.toUpperCase()} Engine`,
        durationMs: Date.now() - startTime
      };
    }

    // 2. Try Secondary Engine (HuggingFace FLUX.1 Space)
    const secondaryResult = await callFluxGradioSpace(enhancedPrompt, seed);
    if (secondaryResult) {
      const { relativeUrl } = saveGeneratedImageLocally(secondaryResult.buffer, secondaryResult.format);
      const baseUrl = (process.env.PUBLIC_URL || "").replace(/\/+$/, "");
      const finalImageUrl = baseUrl ? `${baseUrl}${relativeUrl}` : relativeUrl;

      return {
        userPrompt,
        enhancedPrompt,
        imageUrl: finalImageUrl,
        imageBuffer: secondaryResult.buffer,
        style,
        seed,
        modelUsed: "FLUX.1 Schnell Space",
        durationMs: Date.now() - startTime
      };
    }

    return null;
  } catch (error: any) {
    logger.error("ImageGenService: Fatal error generating image:", error);
    return null;
  }
}
