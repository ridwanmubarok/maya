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
    aiModel = ai.getGenerativeModel({ model: "gemini-3.1-flash-lite" });
    logger.info("Gemini AI Client berhasil diinisialisasi.");
  } catch (error) {
    logger.error("Gagal menginisialisasi Gemini AI:", error);
  }
}

export async function askGemini(prompt: string, personality?: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return "Maaf, fitur AI tidak dapat diakses karena Gemini API Key belum dikonfigurasi.";
  }

  try {
    const ai = new GoogleGenerativeAI(apiKey);
    // Instantiate model with optional systemInstruction for custom personality
    const model = ai.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      systemInstruction: personality
    });

    const result = await model.generateContent({
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
