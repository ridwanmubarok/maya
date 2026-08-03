import { askNvidia } from "./aiClient";
import { searchLyrics } from "./lyricsService";
import { logger } from "../utils/logger";

export interface SongMeaningResult {
  title: string;
  artist: string;
  coreMessage: string;
  storyBehind: string;
  stanzaAnalysis: string;
  emotionalVibe: string;
}

/**
 * Deep Analysis & Interpretation of Song Meaning using Maya AI Engine
 */
export async function analyzeSongMeaning(title: string, artistInput?: string): Promise<SongMeaningResult> {
  logger.info(`SongMeaningService: Memulai analisis bedah makna lagu '${title}' by '${artistInput || "Unknown"}'`);

  // Fetch lyrics context if available
  const lyricsData = await searchLyrics(title, artistInput);
  const songTitle = lyricsData?.title || title;
  const artistName = lyricsData?.artist || artistInput || "Penyanyi/Band";
  const lyricsSnippet = lyricsData?.lyrics ? lyricsData.lyrics.substring(0, 1500) : "Lirik lagu terlampir dalam konteks populer.";

  const prompt = `
Kamu adalah pakar bedah lagu dan pengamat musik profesional.
Tolong berikan analisis bedah dan makna mendalam untuk lagu berikut:

Judul Lagu: "${songTitle}"
Penyanyi/Band: "${artistName}"
Kutipan Lirik:
${lyricsSnippet}

Tolong berikan analisis dalam 4 bagian terstruktur:
1. PESAN UTAMA: (Pesan inti & tema utama lagu dalam 2-3 kalimat)
2. KISAH DI BALIK LAGU: (Konteks, latar belakang pembuatan, atau filosofi lagu)
3. BEDAH MAKNA LIRIK: (Penjelasan frasa/bait lirik pilihan dan simbolisme yang terkandung)
4. EMOSI & KESIMPULAN: (Nuansa emosional musik & pesan moral bagi pendengar)

Format jawaban harus profesional, puitis, dan mendalam tanpa menggunakan emoji berlebihan.
`.trim();

  try {
    const aiResponse = await askNvidia(prompt);

    // Parse sections or return clean structured format
    const coreMessage = extractSection(aiResponse, "PESAN UTAMA") || "Lagu ini menyampaikan pesan emosional tentang perjalanan hidup dan pengalaman manusia.";
    const storyBehind = extractSection(aiResponse, "KISAH DI BALIK LAGU") || "Lagu ini diciptakan berdasarkan refleksi pengalaman personal dan ungkapan perasaan yang mendalam.";
    const stanzaAnalysis = extractSection(aiResponse, "BEDAH MAKNA LIRIK") || "Setiap bait lagu menggambarkan metafora dan simbolisme perasaan yang menyentuh hati.";
    const emotionalVibe = extractSection(aiResponse, "EMOSI & KESIMPULAN") || "Lagu ini menghadirkan perpaduan rasa haru, kedewasaan, dan perenungan.";

    return {
      title: songTitle,
      artist: artistName,
      coreMessage,
      storyBehind,
      stanzaAnalysis,
      emotionalVibe,
    };
  } catch (error) {
    logger.error("SongMeaningService: Error in AI song analysis:", error);
    return {
      title: songTitle,
      artist: artistName,
      coreMessage: "Lagu ini memiliki makna mendalam mengenai hubungan dan pengalaman emosional manusia.",
      storyBehind: "Kisah di balik lagu ini mencerminkan dinamika perasaan dan perenungan hidup.",
      stanzaAnalysis: "Bait lirik lagu menyampaikan metafora yang menyentuh dan puitis.",
      emotionalVibe: "Memberikan nuansa kontemplatif dan reflektif bagi pendengar.",
    };
  }
}

function extractSection(text: string, headerName: string): string {
  try {
    const regex = new RegExp(`${headerName}:?\\s*([\\s\\S]*?)(?=\\n\\s*\\d+\\.|\\n[A-Z\\s]{4,}:|$)`, "i");
    const match = text.match(regex);
    if (match && match[1]) {
      return match[1].trim();
    }
  } catch {
    // Fallback
  }
  return "";
}
