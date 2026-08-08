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

  const prompt = `
Anda adalah Pakar Penerjemah Bahasa Universal & Budaya berpengalaman.
Tugas Anda: Terjemahkan teks berikut ke dalam **${info.name}** dengan gaya bahasa **${style}**.

Teks Asli: "${text}"

Ketentuan:
1. Jika target adalah Bahasa Jepang (JA), sertakan "pronunciation" berupa Romaji (cara baca).
2. Jika target adalah Bahasa Mandarin (ZH), sertakan "pronunciation" berupa Pinyin dengan nada baca.
3. Terjemahan harus alami, akurat, dan sesuai nuansa budaya target.
4. Jawab HANYA dalam format JSON persis seperti berikut tanpa teks atau markdown tambahan di luar JSON:

{
  "translatedText": "Hasil terjemahan di sini...",
  "pronunciation": "Cara baca Romaji atau Pinyin di sini (isi null jika target EN)...",
  "notes": "Catatan singkat nuansa bahasa/pilihan kata..."
}
`.trim();

  try {
    const raw = await askNvidia(prompt);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      if (data.translatedText) {
        return {
          originalText: text,
          translatedText: data.translatedText,
          targetLang,
          langName: info.name,
          flag: info.flag,
          pronunciation: data.pronunciation || undefined,
          style,
          notes: data.notes || undefined,
        };
      }
    }
  } catch (error) {
    logger.error(`TranslationService: Error translating text to ${targetLang}:`, error);
  }

  return null;
}
