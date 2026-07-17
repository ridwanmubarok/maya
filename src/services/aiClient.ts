import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "../utils/logger";

let aiModel: any = null;

export function initAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.warn("GEMINI_API_KEY tidak ditemukan di .env. Fitur AI tidak akan berfungsi.");
    return;
  }

  try {
    const ai = new GoogleGenerativeAI(apiKey);
    // Use gemini-1.5-flash as default because of its speed and capability
    aiModel = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
    logger.info("Gemini AI Client berhasil diinisialisasi.");
  } catch (error) {
    logger.error("Gagal menginisialisasi Gemini AI:", error);
  }
}

export async function askGemini(prompt: string): Promise<string> {
  if (!aiModel) {
    return "Maaf, fitur AI tidak dapat diakses karena Gemini API Key belum dikonfigurasi.";
  }

  try {
    const result = await aiModel.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 2000,
        temperature: 0.7,
      }
    });

    const responseText = result.response.text();
    return responseText || "Maaf, saya tidak menerima respons yang valid dari model.";
  } catch (error: any) {
    logger.error(`Error saat memanggil Gemini API:`, error);
    return `Maaf, terjadi kesalahan saat menghubungi AI: ${error.message || error}`;
  }
}
