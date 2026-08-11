import { askNvidia } from "./aiClient";
import { logger } from "../utils/logger";

export interface ImageGenResult {
  userPrompt: string;
  enhancedPrompt: string;
  imageUrl: string;
  style: string;
  seed: number;
}

/**
 * Enhance user prompt using NVIDIA Llama 3.1 AI
 */
export async function enhancePromptWithNvidia(userPrompt: string, style: string): Promise<string> {
  const systemPrompt = "Anda adalah AI Prompt Engineer ahli untuk generator gambar FLUX.1 dan Midjourney. Tugas Anda adalah mengubah deskripsi kasar user menjadi prompt gambar bahasa Inggris yang padat, akurat, dan estetik (maksimal 150-200 karakter). Jawab HANYA dengan prompt bahasa Inggris murni tanpa teks sapaan, tanpa percakapan, dan tanpa tanda petik pembungkus.";

  const prompt = `
Ubah deskripsi gambar berikut menjadi prompt gambar Bahasa Inggris yang padat & detail untuk gaya visual "${style}".

Deskripsi User: "${userPrompt}"

Target Gaya: ${style} (Sertakan kata kunci pencahayaan, detail tekstur, dan resolusi 8K dalam maksimal 200 karakter).
`.trim();

  try {
    const raw = await askNvidia(prompt, systemPrompt);
    const cleaned = raw.replace(/^["']|["']$/g, "").trim();
    if (cleaned && cleaned.length > 5) {
      return cleaned.length > 200 ? cleaned.slice(0, 200) : cleaned;
    }
  } catch (error) {
    logger.error("ImageGenService: Error enhancing prompt with NVIDIA AI:", error);
  }

  const fallback = `${userPrompt}, ${style} style, highly detailed, 8k resolution`;
  return fallback.length > 200 ? fallback.slice(0, 200) : fallback;
}

/**
 * Generate free HD image using FLUX.1 Engine via Pollinations AI
 */
export async function generateFreeImage(
  userPrompt: string,
  style: string = "Anime",
  customSeed?: number
): Promise<ImageGenResult | null> {
  try {
    const seed = customSeed || Math.floor(Math.random() * 10000000);
    const enhancedPrompt = await enhancePromptWithNvidia(userPrompt, style);

    // Truncate prompt safely if needed to ensure encoded URL is always well below Discord limit (2048 chars)
    const safePrompt = enhancedPrompt.length > 200 ? enhancedPrompt.slice(0, 200) : enhancedPrompt;
    const encodedPrompt = encodeURIComponent(safePrompt);
    let imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=flux&width=1024&height=1024&seed=${seed}&nologo=true`;

    if (imageUrl.length > 1800) {
      const truncatedEncoded = encodeURIComponent(safePrompt.slice(0, 100));
      imageUrl = `https://image.pollinations.ai/prompt/${truncatedEncoded}?model=flux&width=1024&height=1024&seed=${seed}&nologo=true`;
    }

    return {
      userPrompt,
      enhancedPrompt,
      imageUrl,
      style,
      seed,
    };
  } catch (error) {
    logger.error("ImageGenService: Error generating image:", error);
    return null;
  }
}
