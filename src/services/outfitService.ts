import axios from "axios";
import * as cheerio from "cheerio";
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { logger } from "../utils/logger";

export interface OutfitStyle {
  id: string;
  name: string;
  vibe: string;
  gender: "Cowok" | "Cewek" | "Unisex";
  occasion: string;
  top?: string;
  bottom?: string;
  footwear?: string;
  accessories?: string;
  colorPalette?: string;
  stylingTips: string;
  url?: string;
  source: string;
}

const FALLBACK_OUTFITS: OutfitStyle[] = [
  {
    id: "outfit-kr-minimalist",
    name: "Korean Minimalist Casual",
    vibe: "Clean, Rapih, Estetik & Effortless",
    gender: "Unisex",
    occasion: "Ngampus, Nongkrong di Cafe, Kencan Santai",
    top: "Oversized boxy t-shirt polos atau lightweight knit sweater",
    bottom: "Wide-leg pleated trousers atau straight cut raw denim",
    footwear: "Clean retro trainers (New Balance 530 / Samba)",
    accessories: "Minimalist canvas tote bag, cap netral polos, jam tangan tipis",
    colorPalette: "Broken White, Khaki / Cream, Sage Green, Charcoal",
    stylingTips: "Terapkan aturan proporsi 1/3 atasan (french tuck ke celana) dan 2/3 bawahan agar postur terlihat lebih proporsional.",
    source: "Editorial Style Guide",
  },
  {
    id: "outfit-smart-casual",
    name: "Smart Casual Clean Fit",
    vibe: "Profesional Santai, Sopan & Berkelas",
    gender: "Unisex",
    occasion: "Kuliah Presentasi, Magang / Ngantor, Meeting Klien, Dinner",
    top: "Relaxed-fit blazer over knit polo shirt atau kemeja oxford berkerah rapi",
    bottom: "Tapered ankle chinos atau tailored slack pants dengan potongan pas",
    footwear: "Leather penny loafers atau minimalist court sneakers sol putih",
    accessories: "Classic leather strap watch, leather cross-body messenger bag",
    colorPalette: "Navy Blue, Light Grey, Off-White, Olive",
    stylingTips: "Gulung rapi lengan kemeja hingga bawah siku dan pastikan warna ikat pinggang senada dengan warna sepatu.",
    source: "Editorial Style Guide",
  },
  {
    id: "outfit-streetwear",
    name: "Urban Streetwear & Utility",
    vibe: "Bold, Trendy, Nyaman & Berkarakter",
    gender: "Unisex",
    occasion: "Konser Musik, Hangout Malam, City Tour, Street Photography",
    top: "Heavyweight oversized graphic tee atau boxy drop-shoulder hoodie",
    bottom: "Double-knee utility carpenter jeans atau multi-pocket parachute cargo pants",
    footwear: "Retro basketball high/low sneakers (Dunk / Jordan) atau trail runners (Salomon)",
    accessories: "Tactical crossbody sling bag, silver chain necklace, bucket hat / beanie",
    colorPalette: "Washed Vintage Black, Cement Grey, Forest Green, Earth Sand",
    stylingTips: "Beri ruang siluet celana jatuh sedikit menumpuk di atas sepatu (stacking effect) untuk look streetwear yang natural.",
    source: "Editorial Style Guide",
  },
  {
    id: "outfit-old-money",
    name: "Old Money & Quiet Luxury",
    vibe: "Elegan Abadi, Tanpa Logo Norak, Sangat Matang",
    gender: "Unisex",
    occasion: "Kencan Romantis, Acara Keluarga, Semi-Formal, Liburan Santai",
    top: "Kemeja linen lengan panjang (digulung santai) atau pique knit polo",
    bottom: "Double-pleated tailored trousers bahan katun/linen jatuh",
    footwear: "Suede driving shoes atau Belgian loafers warna cokelat mocca",
    accessories: "Vintage chronograph watch dengan strap kulit, tortoise-shell sunglasses",
    colorPalette: "Beige, Pure White, Sky Blue, Camel Tan, Dark Olive",
    stylingTips: "Kunci gaya old money adalah bahan kain berkualitas yang breathable dan fit yang pas di badan tanpa terlalu ketat.",
    source: "Editorial Style Guide",
  },
];

async function fetchLiveFashionTrends(query: string = ""): Promise<OutfitStyle[]> {
  const q = query.toLowerCase();
  const isFemale = q.includes("cewek") || q.includes("wanita") || q.includes("perempuan");
  const isMale = q.includes("cowok") || q.includes("pria") || q.includes("laki");

  const liveResults: OutfitStyle[] = [];

  // 1. Fetch Who What Wear (Top global women fashion trends)
  if (!isMale) {
    try {
      const res = await axios.get("https://www.whowhatwear.com/rss", {
        timeout: 4500,
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      const $ = cheerio.load(res.data, { xmlMode: true });
      $("item").each((i, el) => {
        if (liveResults.length >= 3) return;
        const title = $(el).find("title").text().replace(/\s+/g, " ").trim();
        const link = $(el).find("link").text().trim();
        const desc = $(el).find("description").text().replace(/<[^>]+>/g, "").trim();

        if (title && link) {
          liveResults.push({
            id: `live-www-${i}`,
            name: title,
            vibe: "Chic, Elegant & Seasonal 2026 Trend",
            gender: "Cewek",
            occasion: "Daily Wear / Cafe Hopping / Seasonal Trend 2026",
            stylingTips: desc ? (desc.length > 200 ? desc.substring(0, 197) + "..." : desc) : "Inspirasi padu padan siluet modern dengan fokus pada tekstur kain dan layering elegan.",
            url: link,
            source: "Who What Wear Fashion Editorial",
          });
        }
      });
    } catch (err) {
      logger.warn("OutfitService: Gagal mengambil feed WhoWhatWear:", err);
    }
  }

  // 2. Fetch Hypebeast Indonesia (Top streetwear & sneaker releases)
  if (!isFemale || liveResults.length < 3) {
    try {
      const res = await axios.get("https://hypebeast.com/id/feed", {
        timeout: 4500,
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      const $ = cheerio.load(res.data, { xmlMode: true });
      $("item").each((i, el) => {
        if (liveResults.length >= 3) return;
        const title = $(el).find("title").text().trim();
        const link = $(el).find("link").text().trim();
        const desc = $(el).find("description").text().replace(/<[^>]+>/g, "").trim();

        if (title && link && /sepatu|jordan|sneaker|koleksi|baju|jaket|outfit|style|wear|tee|drop|celana|denim/i.test(title + desc)) {
          liveResults.push({
            id: `live-hb-${i}`,
            name: title,
            vibe: "Urban Streetwear & Contemporary Clean Fit",
            gender: "Cowok",
            occasion: "Hangout / Street Styling 2026",
            stylingTips: desc ? (desc.length > 200 ? desc.substring(0, 197) + "..." : desc) : "Perhatikan padu padan warna alas kaki dan siluet celana agar menghasilkan proporsi tubuh yang kokoh.",
            url: link,
            source: "Hypebeast Indonesia",
          });
        }
      });
    } catch (err) {
      logger.warn("OutfitService: Gagal mengambil feed Hypebeast:", err);
    }
  }

  return liveResults;
}

/**
 * Search and curate outfit recommendations based on natural query
 */
export async function searchOutfitTrends(query: string): Promise<OutfitStyle[]> {
  logger.info(`OutfitService: Memulai pencarian live outfit trend untuk kueri: "${query}"`);

  const liveTrends = await fetchLiveFashionTrends(query);
  if (liveTrends.length > 0) {
    return liveTrends.slice(0, 3);
  }

  // Fallback to catalog if network is down
  return FALLBACK_OUTFITS.slice(0, 3);
}

/**
 * Render clean journal-style embed for Outfit Trends (tanpa spam emoji)
 */
export function createOutfitEmbed(
  outfits: OutfitStyle[],
  queryPrompt: string,
  botAvatarUrl?: string
): { embed: EmbedBuilder; components: ActionRowBuilder<ButtonBuilder>[] } {
  const embed = new EmbedBuilder()
    .setColor(0xD97706) // Warm Amber Fashion Tone
    .setTitle("Panduan Trend Outfit & Inspirasi Gaya Busana (OOTD)")
    .setDescription(
      `Kurasi referensi gaya busana terkini • Kueri: **"${queryPrompt}"**\n───────────────────────────────`
    )
    .setFooter({
      text: "Maya Style & Fashion Curator • Tren 2026 Live Web",
      iconURL: botAvatarUrl,
    })
    .setTimestamp();

  const buttons: ButtonBuilder[] = [];

  outfits.forEach((item, idx) => {
    const num = idx + 1;
    let content =
      `**Vibe Style**: ${item.vibe}\n` +
      `**Cocok Untuk**: ${item.occasion}\n`;

    if (item.top) content += `**Atasan**: ${item.top}\n`;
    if (item.bottom) content += `**Bawahan**: ${item.bottom}\n`;
    if (item.footwear) content += `**Alas Kaki**: ${item.footwear}\n`;
    if (item.colorPalette) content += `**Palet Warna**: ${item.colorPalette}\n`;

    content += `> *Tips / Ulasan: ${item.stylingTips}*`;

    if (item.url) {
      content += `\n**Sumber Resmi**: [${item.source}](${item.url})`;
    }

    embed.addFields({
      name: `${num}. ${item.name} (${item.gender})`,
      value: content,
      inline: false,
    });

    if (buttons.length < 4 && item.url && item.url.startsWith("http")) {
      const srcShort = item.source.length > 18 ? item.source.substring(0, 15) + "..." : item.source;
      buttons.push(
        new ButtonBuilder()
          .setLabel(`Baca Tren #${num} (${srcShort})`)
          .setStyle(ButtonStyle.Link)
          .setURL(item.url)
      );
    }
  });

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  if (buttons.length > 0) {
    components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons));
  }

  return { embed, components };
}
