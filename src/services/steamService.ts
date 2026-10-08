import axios from "axios";
import * as cheerio from "cheerio";
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { logger } from "../utils/logger";

export interface SteamGameDeal {
  appId: string;
  title: string;
  discountPercent: string;
  originalPrice: string;
  finalPrice: string;
  isDiscounted: boolean;
  priceNumber?: number;
  imageUrl?: string;
  steamUrl: string;
  steamDbUrl: string;
  rating?: string;
  releaseDate?: string;
}

export interface ParsedSteamIntent {
  isSteam: boolean;
  titleQuery?: string;
  genre?: string;
  maxPrice?: number;
}

/**
 * Format IDR currency properly
 */
export function formatIDR(amount: number): string {
  if (amount <= 0) return "Gratis (Free)";
  return "Rp " + new Intl.NumberFormat("id-ID").format(amount);
}

/**
 * Parse natural user input for Steam & SteamDB queries
 */
export function parseSteamQuery(prompt: string): ParsedSteamIntent {
  const isConsultation = /(?:kenapa|mengapa|bagaimana\s+cara\s+install|cara\s+refund|cara\s+beli\s+game)\b/i.test(prompt);
  if (isConsultation) return { isSteam: false };

  const hasSteamKeyword = /\b(steam|steamdb)\b/i.test(prompt);
  const hasGameDealIntent = /(?:game\s+diskon|game\s+murah|diskon\s+game|promo\s+game|sale\s+game|promo\s+steam|sale\s+steam|diskon\s+steam|rekomendasi\s+game)/i.test(prompt);

  if (!hasSteamKeyword && !hasGameDealIntent) {
    return { isSteam: false };
  }

  // Detect Max Price filter
  let maxPrice: number | undefined = undefined;
  if (/\b(?:gratis|free)\b/i.test(prompt)) {
    maxPrice = 0;
  } else if (/(\d+)\s*(?:k|rb|ribu)\b/i.test(prompt)) {
    const match = prompt.match(/(\d+)\s*(?:k|rb|ribu)\b/i);
    if (match) {
      maxPrice = parseInt(match[1], 10) * 1000;
    }
  } else if (/dibawah\s*(?:rp\.?\s*)?(\d+)/i.test(prompt)) {
    const match = prompt.match(/dibawah\s*(?:rp\.?\s*)?(\d+)/i);
    if (match) {
      let num = parseInt(match[1], 10);
      if (num < 1000) num *= 1000;
      maxPrice = num;
    }
  } else if (/\b(?:murah|budget|hemat|kantong\s+kering)\b/i.test(prompt)) {
    maxPrice = 100000; // default 100k IDR for "murah"
  }

  // Detect Genre filter
  let genre: string | undefined = undefined;
  if (/\b(?:mabar|coop|co-op|multiplayer|bareng)\b/i.test(prompt)) genre = "co-op";
  else if (/\b(?:horror|horor|serem|hantu)\b/i.test(prompt)) genre = "horror";
  else if (/\b(?:rpg|roleplay|jrpg)\b/i.test(prompt)) genre = "rpg";
  else if (/\b(?:action|aksi)\b/i.test(prompt)) genre = "action";
  else if (/\b(?:santai|cozy|casual|chill)\b/i.test(prompt)) genre = "casual";
  else if (/\b(?:survival|bertahan\s+hidup)\b/i.test(prompt)) genre = "survival";
  else if (/\b(?:fps|shooter|tembak)\b/i.test(prompt)) genre = "fps";
  else if (/\b(?:anime|wibu)\b/i.test(prompt)) genre = "anime";
  else if (/\b(?:strategi|strategy)\b/i.test(prompt)) genre = "strategy";
  else if (/\b(?:open\s*world)\b/i.test(prompt)) genre = "open world";
  else if (/\b(?:racing|balapan)\b/i.test(prompt)) genre = "racing";

  // Clean prompt to extract specific game title
  const cleaned = prompt
    .replace(/<@!?\d+>/g, "")
    .replace(/\b(maya|tolong|carikan|cariin|cari|info|spill|daftar|list|cek|lihat|rekomendasi|rekomendasikan)\b/gi, "")
    .replace(/\b(game|games|steam|steamdb|diskon|diskonan|sale|promo|murah|hemat|budget|kantong\s+kering|terbaik|populer|harga|pricelist|rate)\b/gi, "")
    .replace(/\b(dong|ada|di|yang|buat|lagi|apa|aja|nih|ya|kak|min|om|ga|gak|nggak|kah|bisa)\b/gi, "")
    .replace(/\b(dibawah|kurang\s+dari|maksimal|maks)\b/gi, "")
    .replace(/\b\d+\s*(?:k|rb|ribu|rupiah|rp)\b/gi, "")
    .replace(/\b(mabar|coop|co-op|multiplayer|horror|horor|rpg|action|casual|santai|survival|fps|anime|strategi|strategy|open\s*world|racing)\b/gi, "")
    .replace(/[?!.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const titleQuery = cleaned.length >= 2 ? cleaned : undefined;

  return { isSteam: true, titleQuery, genre, maxPrice };
}

/**
 * Fetch deals and recommendations from Steam & SteamDB
 */
export async function fetchSteamDeals(options: {
  query?: string;
  genre?: string;
  maxPrice?: number;
  limit?: number;
}): Promise<SteamGameDeal[]> {
  const { query, genre, maxPrice, limit = 4 } = options;

  // 1. If searching for a specific game title, query Steam Store Search API first
  if (query && query.trim().length >= 2) {
    try {
      const searchApiUrl = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query.trim())}&l=indonesian&cc=id`;
      const res = await axios.get(searchApiUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        timeout: 7000,
      });

      if (res.data && Array.isArray(res.data.items) && res.data.items.length > 0) {
        const results: SteamGameDeal[] = [];
        for (const item of res.data.items.slice(0, limit)) {
          const appId = String(item.id);
          const initial = item.price ? item.price.initial / 100 : 0;
          const final = item.price ? item.price.final / 100 : 0;
          const isDiscounted = initial > final;
          const discountPct = isDiscounted
            ? `-${Math.round(((initial - final) / initial) * 100)}%`
            : "0%";

          results.push({
            appId,
            title: item.name,
            discountPercent: discountPct,
            originalPrice: initial > 0 ? formatIDR(initial) : (final > 0 ? formatIDR(final) : "Gratis"),
            finalPrice: formatIDR(final),
            isDiscounted,
            priceNumber: final,
            imageUrl: item.tiny_image || undefined,
            steamUrl: `https://store.steampowered.com/app/${appId}/`,
            steamDbUrl: `https://steamdb.info/app/${appId}/`,
            rating: item.metascore ? `Metascore: ${item.metascore}/100` : undefined,
          });
        }
        if (results.length > 0) return results;
      }
    } catch (err: any) {
      logger.warn(`Steam storesearch API failed for "${query}": ${err.message}`);
    }
  }

  // 2. Search live Steam specials and discounts via Steam Search Scraper
  try {
    let searchUrl = "https://store.steampowered.com/search/?specials=1&cc=id&l=indonesian";

    const terms: string[] = [];
    if (query) terms.push(query);
    if (genre) terms.push(genre);
    if (terms.length > 0) {
      searchUrl += `&term=${encodeURIComponent(terms.join(" "))}`;
    }

    if (maxPrice !== undefined) {
      if (maxPrice === 0) {
        searchUrl += "&maxprice=free";
      } else {
        searchUrl += `&maxprice=${maxPrice}`;
      }
    }

    const res = await axios.get(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      timeout: 8000,
    });

    const $ = cheerio.load(res.data);
    const deals: SteamGameDeal[] = [];

    $("#search_resultsRows a.search_result_row").slice(0, limit).each((_, el) => {
      const appId = $(el).attr("data-ds-appid") || "";
      if (!appId) return;

      const title = $(el).find(".title").text().trim();
      const releaseDate = $(el).find(".search_released").text().trim();
      const discountPct = $(el).find(".discount_pct").text().trim() || "0%";
      const origPrice = $(el).find(".discount_original_price").text().trim();
      const finalPrice = $(el).find(".discount_final_price").text().trim() || $(el).find(".search_price").text().trim();
      const reviewSummary = $(el).find(".search_review_summary").attr("data-tooltip-html") || "";
      const img = $(el).find(".search_capsule img").attr("src") || undefined;

      const cleanedReview = reviewSummary
        ? reviewSummary.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
        : undefined;

      deals.push({
        appId,
        title,
        discountPercent: discountPct,
        originalPrice: origPrice || finalPrice || "Rp 0",
        finalPrice: finalPrice || "Gratis",
        isDiscounted: discountPct !== "0%",
        imageUrl: img,
        steamUrl: `https://store.steampowered.com/app/${appId}/`,
        steamDbUrl: `https://steamdb.info/app/${appId}/`,
        rating: cleanedReview,
        releaseDate: releaseDate || undefined,
      });
    });

    if (deals.length > 0) return deals;
  } catch (err: any) {
    logger.warn(`Steam search HTML scraper failed: ${err.message}`);
  }

  // 3. Fallback: Query Steam Featured Categories API (Top Specials)
  try {
    const featuredUrl = "https://store.steampowered.com/api/featuredcategories/?cc=id&l=indonesian";
    const res = await axios.get(featuredUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 6000,
    });

    if (res.data?.specials?.items && Array.isArray(res.data.specials.items)) {
      const specials = res.data.specials.items;
      const deals: SteamGameDeal[] = [];

      for (const item of specials) {
        if (deals.length >= limit) break;

        const appId = String(item.id);
        const orig = (item.original_price || 0) / 100;
        const final = (item.final_price || 0) / 100;

        if (maxPrice !== undefined && maxPrice > 0 && final > maxPrice) {
          continue;
        }

        deals.push({
          appId,
          title: item.name,
          discountPercent: `-${item.discount_percent}%`,
          originalPrice: formatIDR(orig),
          finalPrice: formatIDR(final),
          isDiscounted: item.discount_percent > 0,
          priceNumber: final,
          imageUrl: item.header_image || item.large_capsule_image || undefined,
          steamUrl: `https://store.steampowered.com/app/${appId}/`,
          steamDbUrl: `https://steamdb.info/app/${appId}/`,
          rating: item.controller_support ? `Controller: ${item.controller_support}` : undefined,
        });
      }

      if (deals.length > 0) return deals;
    }
  } catch (err: any) {
    logger.warn(`Steam featured API fallback failed: ${err.message}`);
  }

  return [];
}

/**
 * Build rich Discord embed and interactive action buttons for Steam & SteamDB
 */
export function createSteamDealsEmbed(
  games: SteamGameDeal[],
  params: {
    query?: string;
    genre?: string;
    maxPrice?: number;
  },
  botAvatarUrl?: string
): { embed: EmbedBuilder; components: ActionRowBuilder<ButtonBuilder>[] } {
  let title = "Rekomendasi Promo & Diskon Game Steam";
  let descriptionHeader = "Kurasi diskon game Steam & riwayat harga via **SteamDB**:";

  if (params.query) {
    title = `Pencarian Game Steam: "${params.query}"`;
    descriptionHeader = `Hasil pencarian katalog Steam & riwayat harga SteamDB untuk **"${params.query}"**:`;
  } else if (params.maxPrice !== undefined && params.genre) {
    title = `Diskon Game ${params.genre.toUpperCase()} (Budget ${formatIDR(params.maxPrice)})`;
    descriptionHeader = `Daftar game pilihan genre **${params.genre}** dengan harga di bawah **${formatIDR(params.maxPrice)}**:`;
  } else if (params.maxPrice !== undefined) {
    title = `Rekomendasi Game Murah Steam (Budget ${formatIDR(params.maxPrice)})`;
    descriptionHeader = `Daftar game diskon terbaik dengan harga di bawah **${formatIDR(params.maxPrice)}**:`;
  } else if (params.genre) {
    title = `Rekomendasi Game Diskon Steam: ${params.genre.toUpperCase()}`;
    descriptionHeader = `Diskon terpopuler untuk genre **${params.genre}** di Steam hari ini:`;
  }

  const embed = new EmbedBuilder()
    .setColor(0x2A475E) // Steam Deep Blue Tone
    .setTitle(title)
    .setDescription(
      `${descriptionHeader}\n*Tips: Klik tautan **SteamDB** untuk mengecek riwayat All-Time Low (ATL) dan tren pemain aktif.*\n───────────────────────────────`
    )
    .setFooter({
      text: "Maya Steam & SteamDB Deals Engine • Live Sync",
      iconURL: botAvatarUrl,
    })
    .setTimestamp();

  if (games.length > 0 && games[0].imageUrl) {
    embed.setThumbnail(games[0].imageUrl);
  }

  games.forEach((game, idx) => {
    const num = idx + 1;
    let priceText = "";
    if (game.isDiscounted && game.discountPercent !== "0%") {
      priceText = `~~${game.originalPrice}~~ -> **${game.finalPrice}** (\`${game.discountPercent}\`)`;
    } else {
      priceText = `**${game.finalPrice}**`;
    }

    let fieldContent = `**Harga**: ${priceText}\n`;
    if (game.rating) {
      const shortReview = game.rating.length > 95 ? game.rating.substring(0, 92) + "..." : game.rating;
      fieldContent += `**Ulasan**: ${shortReview}\n`;
    }
    if (game.releaseDate) {
      fieldContent += `**Rilis**: ${game.releaseDate}\n`;
    }
    fieldContent += `**Tautan**: [Steam Store](${game.steamUrl}) • [SteamDB](${game.steamDbUrl})`;

    embed.addFields({
      name: `${num}. ${game.title} ${game.isDiscounted ? `[${game.discountPercent}]` : ""}`,
      value: fieldContent,
      inline: false,
    });
  });

  const components: ActionRowBuilder<ButtonBuilder>[] = [];

  // Row 1: Direct link buttons for top games
  const gameButtons: ButtonBuilder[] = [];
  if (games.length >= 1) {
    gameButtons.push(
      new ButtonBuilder()
        .setLabel(`Steam: ${games[0].title.substring(0, 18)}`)
        .setStyle(ButtonStyle.Link)
        .setURL(games[0].steamUrl),
      new ButtonBuilder()
        .setLabel(`SteamDB #${1}`)
        .setStyle(ButtonStyle.Link)
        .setURL(games[0].steamDbUrl)
    );
  }
  if (games.length >= 2) {
    gameButtons.push(
      new ButtonBuilder()
        .setLabel(`Steam: ${games[1].title.substring(0, 18)}`)
        .setStyle(ButtonStyle.Link)
        .setURL(games[1].steamUrl),
      new ButtonBuilder()
        .setLabel(`SteamDB #${2}`)
        .setStyle(ButtonStyle.Link)
        .setURL(games[1].steamDbUrl)
    );
  }

  if (gameButtons.length > 0) {
    components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(gameButtons));
  }

  // Row 2: General Exploration Buttons
  const navButtons: ButtonBuilder[] = [
    new ButtonBuilder()
      .setLabel("Katalog Diskon SteamDB")
      .setStyle(ButtonStyle.Link)
      .setURL("https://steamdb.info/sales/"),
    new ButtonBuilder()
      .setLabel("Promo Steam Store")
      .setStyle(ButtonStyle.Link)
      .setURL("https://store.steampowered.com/specials/")
  ];

  components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(navButtons));

  return { embed, components };
}
