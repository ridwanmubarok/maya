import { askNvidia } from "./aiClient";
import { searchLyrics } from "./lyricsService";
import { logger } from "../utils/logger";

export interface SongMeaningResult {
  title: string;
  artist: string;
  fullMeaningText: string;
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
Kamu adalah pakar bedah lagu dan pengamat musik profesional berstandar editorial enterprise.
Tolong berikan analisis bedah dan makna mendalam untuk lagu berikut:

Judul Lagu: "${songTitle}"
Penyanyi/Band: "${artistName}"
Kutipan Lirik:
${lyricsSnippet}

Tolong susun analisis dalam format Markdown yang rapi dengan struktur berikut:

**1. Pesan Utama & Tema Inti**
(Penjelasan pesan utama lagu dalam 2-3 kalimat)

**2. Kisah di Balik Pembuatan Lagu**
(Penjelasan konteks, filosofi, dan latar belakang pembuatan lagu)

**3. Bedah Makna Lirik Pilihan**
(Penjelasan bait/frasa kunci lirik dan simbolisme yang terkandung)

**4. Nuansa Emosional & Refleksi**
(Penjelasan kesan emosi dan pesan moral bagi pendengar)

Catatan: Format jawaban harus bersih, profesional, puitis, dan tanpa menggunakan emoji berlebihan.
`.trim();

  try {
    const aiResponse = await askNvidia(prompt);
    let cleanResponse = (aiResponse || "").trim();

    if (cleanResponse.length > 3800) {
      cleanResponse = `${cleanResponse.substring(0, 3797)}...`;
    }

    return {
      title: songTitle,
      artist: artistName,
      fullMeaningText: cleanResponse || `**1. Pesan Utama & Tema Inti**\nLagu **${songTitle}** oleh **${artistName}** menyampaikan pesan emosional tentang hubungan dan pengalaman manusia.`,
    };
  } catch (error) {
    logger.error("SongMeaningService: Error in AI song analysis:", error);
    return {
      title: songTitle,
      artist: artistName,
      fullMeaningText: `**1. Pesan Utama & Tema Inti**\nLagu **${songTitle}** oleh **${artistName}** menyampaikan pesan emosional yang mendalam mengenai perenungan dan pengalaman hidup.`,
    };
  }
}
