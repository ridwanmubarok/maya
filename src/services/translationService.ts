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
    "Anda adalah Pakar Penerjemah Bahasa Universal & Budaya berpengalaman. Tugas utama Anda adalah menerjemahkan ke dalam bahasa sehari-hari/lisan (spoken language) yang alami, santai, dan populer digunakan oleh penutur asli dalam percakapan nyata. Jawab HANYA dalam format JSON valid tanpa sapaan, tanpa percakapan, dan tanpa markdown pembungkus di luar JSON.";

  const styleDescription = targetLang === "ZH"
    ? "Bahasa Mandarin Lisan Sehari-hari (口语 - Kǒuyǔ) yang ALAMI, POPULER DIPAKAI SEHARI-HARI/CHATTING, DAN TIDAK KAKU. Hindari terjemahan kaku ala buku teks/dokumen resmi!"
    : `gaya bahasa **${style}**`;

  const prompt = `
Terjemahkan teks berikut dari Bahasa Indonesia ke dalam **${info.name}** dengan ${styleDescription}.

Teks Asli: "${text}"

ATURAN KHUSUS UTAMA OUTPUT JSON:
1. "translatedText": WAJIB TULISAN/AKSARA ASLI NATIVE BAHASA TARGET!
   - Jika target JA: WAJIB karakter Jepang Asli (Kanji / Hiragana / Katakana), CONTOH: "おはよう、みんな！". DILARANG HURUF LATIN/ROMAJI DI SINI!
   - Jika target ZH: WAJIB karakter Mandarin Hanzi Asli yang ALAMI, POPULER DIPAKAI SEHARI-HARI/CHATTING (口语), CONTOH: "大家早！" atau "早安！" atau "谢谢啦". DILARANG BAHASA BUKU/FORMAL KAKU!
   - Jika target EN: Bahasa Inggris natural. CONTOH: "Good morning everyone!"
2. "pronunciation":
   - Jika target JA: Cara baca Romaji Latin (CONTOH: "Ohayou minna!").
   - Jika target ZH: Pinyin nada baca Latin (CONTOH: "Dàjiā zǎo!").
   - Jika target EN: null.
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
