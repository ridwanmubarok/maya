import axios from "axios";
import * as cheerio from "cheerio";
import { logger } from "../utils/logger";

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  publishedAt: string;
  url: string;
  category: string;
}

interface FeedConfig {
  name: string;
  url: string;
  category: string;
}

const FEEDS_CONFIG: Record<string, FeedConfig[]> = {
  semua: [
    { name: "CNN Indonesia", url: "https://www.cnnindonesia.com/nasional/rss", category: "Berita Nasional" },
    { name: "Antara News", url: "https://www.antaranews.com/rss/politik.xml", category: "Politik" },
    { name: "Detikcom", url: "https://news.detik.com/rss", category: "Peristiwa & Nasional" },
    { name: "Antara News", url: "https://www.antaranews.com/rss/terkini.xml", category: "Terkini" }
  ],
  politik: [
    { name: "Antara Politik", url: "https://www.antaranews.com/rss/politik.xml", category: "Politik" },
    { name: "CNN Indonesia", url: "https://www.cnnindonesia.com/nasional/rss", category: "Politik & Nasional" },
    { name: "Tempo", url: "https://rss.tempo.co/nasional", category: "Politik & Pemerintahan" }
  ],
  nasional: [
    { name: "CNN Indonesia", url: "https://www.cnnindonesia.com/nasional/rss", category: "Berita Nasional" },
    { name: "Detik News", url: "https://news.detik.com/rss", category: "Nasional & Terkini" },
    { name: "Antara News", url: "https://www.antaranews.com/rss/terkini.xml", category: "Kabar Nusantara" }
  ],
  ekonomi: [
    { name: "CNN Ekonomi", url: "https://www.cnnindonesia.com/ekonomi/rss", category: "Ekonomi & Bisnis" },
    { name: "CNBC Indonesia", url: "https://www.cnbcindonesia.com/news/rss", category: "Pasar & Finansial" }
  ]
};

/**
 * Fetch and parse an RSS feed URL
 */
async function fetchFeed(feed: FeedConfig, maxItems: number = 4): Promise<NewsItem[]> {
  const items: NewsItem[] = [];
  try {
    const res = await axios.get(feed.url, {
      timeout: 6000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      }
    });

    const $ = cheerio.load(res.data, { xmlMode: true });
    $("item").each((i, el) => {
      if (items.length >= maxItems) return;

      const title = $(el).find("title").text().trim();
      const link = $(el).find("link").text().trim();
      const pubDate = $(el).find("pubDate").text().trim();
      let description = $(el).find("description").text().replace(/<[^>]*>?/gm, "").replace(/&nbsp;/g, " ").trim();

      if (description.length > 150) {
        description = `${description.substring(0, 147)}...`;
      }

      if (title && link) {
        let formattedDate = "Terbaru";
        if (pubDate) {
          try {
            formattedDate = new Date(pubDate).toLocaleDateString("id-ID", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit"
            });
          } catch (_) {
            formattedDate = "Hari Ini";
          }
        }

        items.push({
          id: `${feed.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}-${i}`,
          title,
          summary: description || "Klik tombol untuk membaca artikel berita selengkapnya.",
          source: feed.name,
          publishedAt: formattedDate,
          url: link,
          category: feed.category
        });
      }
    });
  } catch (error: any) {
    logger.warn(`NewsScraper: Gagal mengambil feed dari ${feed.name} (${feed.url}): ${error.message}`);
  }
  return items;
}

/**
 * Fetch latest Indonesian news (focusing on Politik, Nasional, and General news)
 */
export async function fetchIndonesianNews(category: string = "semua"): Promise<NewsItem[]> {
  const normalizedCategory = (category || "semua").toLowerCase();
  const feedsToFetch = FEEDS_CONFIG[normalizedCategory] || FEEDS_CONFIG.semua;

  logger.info(`NewsScraper: Mengambil berita Indonesia terkini (Kategori: '${category}')`);

  const results = await Promise.all(feedsToFetch.map(f => fetchFeed(f, 3)));
  const allNews = results.flat();

  // Deduplicate by title
  const uniqueMap = new Map<string, NewsItem>();
  for (const item of allNews) {
    const key = item.title.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, item);
    }
  }

  const finalNews = Array.from(uniqueMap.values());

  // Fallback curated news if network fails
  if (finalNews.length === 0) {
    return [
      {
        id: "cur-1",
        title: "Perkembangan Dinamika Politik & Kebijakan Publik Nasional 2026",
        summary: "Pemerintah dan DPR terus membahas penyelarasan regulasi strategis untuk pembangunan infrastruktur dan tata kelola daerah.",
        source: "Antara News",
        publishedAt: "Hari Ini",
        url: "https://www.antaranews.com/politik",
        category: "Politik & Nasional"
      },
      {
        id: "cur-2",
        title: "Kabar Terkini Perekonomian dan Pertumbuhan Sektor Domestik",
        summary: "Stabilitas pasar dan penguatan daya beli masyarakat menjadi fokus utama dalam kebijakan fiskal nasional kuartal ini.",
        source: "CNN Indonesia",
        publishedAt: "Hari Ini",
        url: "https://www.cnnindonesia.com/ekonomi",
        category: "Ekonomi & Bisnis"
      },
      {
        id: "cur-3",
        title: "Rangkuman Berita Peristiwa dan Isu Hangat Nusantara",
        summary: "Berbagai perkembangan peristiwa dan liputan terkini dari berbagai penjuru tanah air.",
        source: "Detikcom",
        publishedAt: "Hari Ini",
        url: "https://news.detik.com/",
        category: "Berita Nasional"
      }
    ];
  }

  return finalNews.slice(0, 5);
}

// Backward compatibility alias
export const fetchTechNews = fetchIndonesianNews;
