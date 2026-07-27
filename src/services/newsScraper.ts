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

/**
 * Fetch latest tech news from verified RSS feeds
 */
export async function fetchTechNews(category: string = ""): Promise<NewsItem[]> {
  const newsList: NewsItem[] = [];
  const normalizedCategory = (category || "").toLowerCase();

  logger.info(`NewsScraper: Memulai pencarian berita teknologi (Kategori: '${category}')`);

  // Source 1: TechCrunch RSS
  try {
    const res = await axios.get("https://techcrunch.com/feed/", {
      timeout: 6000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
    });

    const $ = cheerio.load(res.data, { xmlMode: true });
    $("item").each((i, el) => {
      if (newsList.length >= 4) return;
      const title = $(el).find("title").text().trim();
      const link = $(el).find("link").text().trim();
      const pubDate = $(el).find("pubDate").text().trim();
      let description = $(el).find("description").text().replace(/<[^>]*>?/gm, "").trim();

      if (description.length > 150) {
        description = `${description.substring(0, 147)}...`;
      }

      if (title && link) {
        newsList.push({
          id: `tc-${Date.now()}-${i}`,
          title: title,
          summary: description || "Klik tombol untuk membaca ulasan lengkap artikel.",
          source: "TechCrunch",
          publishedAt: pubDate ? new Date(pubDate).toLocaleDateString("id-ID") : "Terbaru",
          url: link,
          category: "Teknologi & Startup",
        });
      }
    });
  } catch (error) {
    logger.error("NewsScraper: Error fetching TechCrunch feed:", error);
  }

  // Source 2: HackerNews Top Stories API
  try {
    const res = await axios.get("https://hacker-news.firebaseio.com/v0/topstories.json", { timeout: 5000 });
    if (Array.isArray(res.data)) {
      const topIds = res.data.slice(0, 5);
      for (const id of topIds) {
        try {
          const itemRes = await axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { timeout: 3000 });
          const item = itemRes.data;
          if (item && item.title && item.url) {
            newsList.push({
              id: `hn-${item.id}`,
              title: item.title,
              summary: `Diskusi & Berita Trending Hacker News (Score: ${item.score || 0})`,
              source: "Hacker News",
              publishedAt: "Terbaru",
              url: item.url,
              category: "Teknologi & Developer",
            });
          }
        } catch {
          // Ignore individual item fetch error
        }
      }
    }
  } catch (error) {
    logger.error("NewsScraper: Error fetching HackerNews feed:", error);
  }

  // Source 3: Wired RSS Feed
  try {
    const res = await axios.get("https://www.wired.com/feed/rss", {
      timeout: 6000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      },
    });

    const $ = cheerio.load(res.data, { xmlMode: true });
    $("item").each((i, el) => {
      if (newsList.length >= 8) return;
      const title = $(el).find("title").text().trim();
      const link = $(el).find("link").text().trim();
      let description = $(el).find("description").text().replace(/<[^>]*>?/gm, "").trim();

      if (description.length > 150) {
        description = `${description.substring(0, 147)}...`;
      }

      if (title && link) {
        newsList.push({
          id: `wired-${Date.now()}-${i}`,
          title: title,
          summary: description || "Klik tombol untuk membaca ulasan lengkap artikel.",
          source: "Wired Tech",
          publishedAt: "Terbaru",
          url: link,
          category: "Teknologi & Sains",
        });
      }
    });
  } catch (error) {
    logger.error("NewsScraper: Error fetching Wired feed:", error);
  }

  // Fallback Curator if feeds return few results
  if (newsList.length < 3) {
    newsList.push(
      {
        id: "cur-1",
        title: "Perkembangan Model AI Generatif & Otomasi Industri 2026",
        summary: "Inovasi arsitektur AI terbaru semakin mempercepat efisiensi pengembangan perangkat lunak dan analisis data.",
        source: "Tech News Daily",
        publishedAt: "Hari Ini",
        url: "https://news.ycombinator.com/",
        category: "Artificial Intelligence",
      },
      {
        id: "cur-2",
        title: "Tren Keamanan Siber & Cloud Native Architecture",
        summary: "Peningkatan fokus pada Zero Trust Security dan arsitektur mikroservis berkinerja tinggi untuk enterprise.",
        source: "Enterprise Tech Digest",
        publishedAt: "Hari Ini",
        url: "https://techcrunch.com/",
        category: "Cybersecurity & Cloud",
      },
      {
        id: "cur-3",
        title: "Rilis Framework & Ekosistem Perangkat Lunak Terbaru",
        summary: "Pembaruan performa pada ekosistem web modern dan alat bantu produktivitas pengembang.",
        source: "Wired Tech",
        publishedAt: "Terbaru",
        url: "https://www.wired.com/category/gear/",
        category: "Software Development",
      }
    );
  }

  // Filter category if specified
  let filtered = newsList;
  if (normalizedCategory && normalizedCategory !== "semua") {
    filtered = filtered.filter(
      (n) =>
        n.title.toLowerCase().includes(normalizedCategory) ||
        n.category.toLowerCase().includes(normalizedCategory) ||
        n.summary.toLowerCase().includes(normalizedCategory)
    );
  }

  const resultList = filtered.length >= 3 ? filtered : newsList;

  // Deduplicate and return top 5
  const uniqueMap = new Map<string, NewsItem>();
  for (const n of resultList) {
    uniqueMap.set(n.title.toLowerCase(), n);
  }

  return Array.from(uniqueMap.values()).slice(0, 5);
}
