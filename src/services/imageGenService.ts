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
}

/**
 * Enhance user prompt using Gemini AI
 */
export async function enhancePromptWithGemini(userPrompt: string, style: string): Promise<string> {
  const systemPrompt = "Anda adalah AI Prompt Engineer ahli untuk generator gambar Google Imagen 3 dan Gemini. Tugas Anda adalah mengubah deskripsi kasar user menjadi prompt gambar bahasa Inggris yang padat, estetik, beresolusi tinggi, dan artistik sesuai gaya visual yang diminta (maksimal 250 karakter). Jawab HANYA dengan prompt bahasa Inggris murni tanpa teks sapaan, tanpa percakapan, dan tanpa tanda petik pembungkus.";

  const prompt = `
Ubah deskripsi gambar berikut menjadi prompt gambar Bahasa Inggris yang padat & detail untuk gaya visual "${style}".

Deskripsi User: "${userPrompt}"

Target Gaya: ${style} (Sertakan elemen pencahayaan, tekstur detail, komposisi sinematik, dan resolusi tinggi dalam maksimal 250 karakter).
`.trim();

  try {
    const raw = await askAI(prompt, systemPrompt);
    const cleaned = raw.replace(/^["']|["']$/g, "").trim();
    if (cleaned && cleaned.length > 5) {
      return cleaned.length > 250 ? cleaned.slice(0, 250) : cleaned;
    }
  } catch (error) {
    logger.error("ImageGenService: Error enhancing prompt with Gemini AI:", error);
  }

  const fallback = `${userPrompt}, ${style} style, masterpiece, sharp focus, 8k resolution, highly aesthetic`;
  return fallback.length > 250 ? fallback.slice(0, 250) : fallback;
}

// Backward-compatible alias
export const enhancePromptWithNvidia = enhancePromptWithGemini;

/**
 * Save image buffer to public directory so it can be served via Express static
 */
function saveGeneratedImageLocally(buffer: Buffer): { fileName: string; relativeUrl: string } {
  const fileHash = crypto.randomBytes(8).toString("hex");
  const fileName = `gemini_${Date.now()}_${fileHash}.jpg`;

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
 * Generate HD image using Google Gemini (Imagen 3 Engine)
 */
export async function generateFreeImage(
  userPrompt: string,
  style: string = "Anime",
  customSeed?: number
): Promise<ImageGenResult | null> {
  const seed = customSeed || Math.floor(Math.random() * 10000000);

  try {
    const baseEnhanced = await enhancePromptWithGemini(userPrompt, style);
    const enhancedPrompt = `${baseEnhanced}, masterpiece, sharp focus, crisp details, highly detailed`;

    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    // 1. Try Google Gemini Imagen 3 API if key is available
    if (geminiKey) {
      const imagenModels = ["imagen-3.0-generate-002", "imagen-3.0-fast-generate-001"];

      for (const model of imagenModels) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${geminiKey}`;
          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              instances: [
                {
                  prompt: enhancedPrompt
                }
              ],
              parameters: {
                sampleCount: 1,
                aspectRatio: "1:1",
                outputMimeType: "image/jpeg"
              }
            }),
            signal: AbortSignal.timeout(30000)
          });

          if (response.ok) {
            const data: any = await response.json();
            const base64Data = data.predictions?.[0]?.bytesBase64Encoded;

            if (base64Data) {
              const imageBuffer = Buffer.from(base64Data, "base64");
              const { relativeUrl } = saveGeneratedImageLocally(imageBuffer);

              const baseUrl = (process.env.PUBLIC_URL || "").replace(/\/+$/, "");
              const imageUrl = baseUrl ? `${baseUrl}${relativeUrl}` : relativeUrl;

              return {
                userPrompt,
                enhancedPrompt,
                imageUrl,
                imageBuffer,
                style,
                seed
              };
            }
          } else {
            const errBody = await response.text().catch(() => "");
            logger.warn(`ImageGenService: Gemini Imagen model ${model} error (${response.status}): ${errBody}`);
          }
        } catch (err: any) {
          logger.warn(`ImageGenService: Gagal memanggil model ${model}: ${err.message || err}`);
        }
      }
    }

    // 2. High-speed Turbo fallback (NEVER FLUX.1)
    const safePrompt = enhancedPrompt.length > 200 ? enhancedPrompt.slice(0, 200) : enhancedPrompt;
    const encodedPrompt = encodeURIComponent(safePrompt);
    const fallbackUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=turbo&width=1024&height=1024&seed=${seed}&nologo=true&enhance=true`;

    return {
      userPrompt,
      enhancedPrompt,
      imageUrl: fallbackUrl,
      style,
      seed
    };
  } catch (error) {
    logger.error("ImageGenService: Error generating image with Gemini:", error);
    return null;
  }
}
