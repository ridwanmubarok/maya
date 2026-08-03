import axios from "axios";
import * as cheerio from "cheerio";
import { logger } from "../utils/logger";

export interface LyricsResult {
  id: string;
  title: string;
  artist: string;
  album?: string;
  lyrics: string;
  artworkUrl?: string;
  url: string;
  source: string;
}

/**
 * Fetch lyrics from LrcLib API with Web Scraper fallback
 */
export async function searchLyrics(query: string, artistInput?: string): Promise<LyricsResult | null> {
  const searchQuery = artistInput ? `${query} ${artistInput}` : query;
  logger.info(`LyricsService: Memulai pencarian lirik untuk '${searchQuery}'`);

  // Source 1: LrcLib API (Open & Free Lyrics Database)
  try {
    const url = `https://lrclib.net/api/search?q=${encodeURIComponent(searchQuery)}`;
    const res = await axios.get(url, {
      timeout: 7000,
      headers: {
        "User-Agent": "MayaDiscordBot/1.0 (https://github.com)",
      },
    });

    if (Array.isArray(res.data) && res.data.length > 0) {
      // Find item with plainLyrics
      const match = res.data.find((item: any) => item.plainLyrics && item.plainLyrics.trim().length > 0) || res.data[0];

      if (match && match.plainLyrics) {
        return {
          id: `lrclib-${match.id}`,
          title: match.trackName || query,
          artist: match.artistName || artistInput || "Artis Tidak Diketahui",
          album: match.albumName || undefined,
          lyrics: match.plainLyrics.trim(),
          artworkUrl: match.albumName ? `https://coverartarchive.org/release/find?query=${encodeURIComponent(match.albumName)}` : undefined,
          url: `https://lrclib.net/`,
          source: "LrcLib Database",
        };
      }
    }
  } catch (error) {
    logger.error("LyricsService: Error fetching from LrcLib API:", error);
  }

  // Source 2: Genius / Genius Public Web Scraping Fallback
  try {
    const geniusSearchUrl = `https://genius.com/api/search/multi?q=${encodeURIComponent(searchQuery)}`;
    const res = await axios.get(geniusSearchUrl, {
      timeout: 7000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      },
    });

    const sections = res.data?.response?.sections || [];
    const songSection = sections.find((s: any) => s.type === "song");
    const hits = songSection?.hits || [];

    if (hits.length > 0) {
      const topHit = hits[0].result;
      const songPath = topHit.path;
      const songUrl = `https://genius.com${songPath}`;
      const title = topHit.title || query;
      const artist = topHit.artist_names || artistInput || "Artis Tidak Diketahui";
      const artwork = topHit.header_image_thumbnail_url || topHit.song_art_image_thumbnail_url;

      // Scrape lyrics page HTML
      const pageRes = await axios.get(songUrl, {
        timeout: 7000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        },
      });

      const $ = cheerio.load(pageRes.data);
      let scrapedLyrics = "";

      $("[class*='Lyrics__Container'], .lyrics").each((_, el) => {
        // Replace <br> with newline
        $(el).find("br").replaceWith("\n");
        scrapedLyrics += $(el).text() + "\n";
      });

      scrapedLyrics = scrapedLyrics.trim();

      if (scrapedLyrics) {
        return {
          id: `genius-${topHit.id}`,
          title,
          artist,
          lyrics: scrapedLyrics,
          artworkUrl: artwork,
          url: songUrl,
          source: "Genius Lyrics",
        };
      }
    }
  } catch (error) {
    logger.error("LyricsService: Error scraping Genius:", error);
  }

  // Source 3: Google Lyrics Search Web Scraper Fallback
  try {
    const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${searchQuery} lirik`)}`;
    const pageRes = await axios.get(googleSearchUrl, {
      timeout: 7000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8",
      },
    });

    const $ = cheerio.load(pageRes.data);
    let googleLyrics = "";

    $("[data-lyricid], [class*='vk_c'], div[aria-label='Lirik']").find("span").each((_, el) => {
      googleLyrics += $(el).text() + "\n";
    });

    googleLyrics = googleLyrics.trim();

    if (googleLyrics && googleLyrics.length > 50) {
      return {
        id: `google-${Date.now()}`,
        title: query,
        artist: artistInput || "Artis Tidak Diketahui",
        lyrics: googleLyrics,
        url: googleSearchUrl,
        source: "Google Search",
      };
    }
  } catch (error) {
    logger.error("LyricsService: Error scraping Google Lyrics:", error);
  }

  return null;
}
