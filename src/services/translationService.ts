import { askNvidia } from "./aiClient";
import { logger } from "../utils/logger";

export interface TranslationResult {
  originalText: string;
  translatedText: string;
  targetLang: "EN" | "JA" | "ZH";
  langName: string;
  flag: string;
  pronunciation?: string; // Romaji for Japanese, Pinyin for Chinese
  style: string;
  notes?: string;
}

/**
 * Translate text using NVIDIA LLM AI Engine
 */
export async function translateWithNvidia(
  text: string,
  targetLang: "EN" | "JA" | "ZH",
  style: string = "Santai"
): Promise<TranslationResult | null> {
  const langNames = {
    EN: { name: "Bahasa Inggris (English)", flag: "🇬🇧" },
    JA: { name: "Bahasa Jepang (日本語)", flag: "🇯🇵" },
    ZH: { name: "Bahasa Mandarin (中文)", flag: "🇨🇳" },
  };

  const info = langNames[targetLang] || langNames.EN;

  const systemPrompt =
    "Anda adalah Pakar Penerjemah Bahasa Universal & Budaya berpengalaman. Jawab HANYA dalam format JSON valid tanpa sapaan, tanpa percakapan, dan tanpa markdown pembungkus di luar JSON.";

  const prompt = `
Terjemahkan teks berikut dari Bahasa Indonesia ke dalam **${info.name}** dengan gaya bahasa **${style}**.

Teks Asli: "${text}"

PETUNJUK OUTPUT JSON WAJIB:
1. "translatedText": Tuliskan HASIL TERJEMAHAN UTAMA dalam huruf/karakter ${info.name}. (Contoh: "Good morning!" untuk EN, "おはようございます" untuk JA, "大家好，早上好" untuk ZH Mandarin). JANGAN PERNAH MENISIKAN STRING KOSONG ""!
2. "pronunciation": Jika target JA isi Romaji cara baca, jika target ZH isi Pinyin nada baca, jika target EN isi null.
3. "notes": Catatan singkat nuansa bahasa atau pilihan kata (opsional).

Format JSON wajib:
{
  "translatedText": "...",
  "pronunciation": "...",
  "notes": "..."
}
`.trim();

  try {
    const raw = await askNvidia(prompt, systemPrompt);
    const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      let translated = (data.translatedText || data.translation || data.hanzi || data.chinese || data.result || "").trim();
      
      // Fallback if AI put translation in pronunciation
      if (!translated && data.pronunciation) {
        translated = data.pronunciation.trim();
      }

      if (translated.length > 0) {
        return {
          originalText: text,
          translatedText: translated,
          targetLang,
          langName: info.name,
          flag: info.flag,
          pronunciation: data.pronunciation && data.pronunciation !== translated ? data.pronunciation : undefined,
          style,
          notes: data.notes || undefined,
        };
      }
    }
    logger.warn(`TranslationService: Could not extract valid translatedText from NVIDIA response: ${raw}`);
  } catch (error) {
    logger.error(`TranslationService: Error translating text to ${targetLang}:`, error);
  }

  return null;
}
