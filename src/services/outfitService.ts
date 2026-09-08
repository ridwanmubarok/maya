import { EmbedBuilder } from "discord.js";
import { logger } from "../utils/logger";

export interface OutfitStyle {
  id: string;
  name: string;
  vibe: string;
  gender: "Cowok" | "Cewek" | "Unisex";
  occasion: string; // Ngampus, Kantor, Kencan, Hangout, Santai
  top: string;
  bottom: string;
  footwear: string;
  accessories: string;
  colorPalette: string;
  stylingTips: string;
}

const OUTFIT_CATALOG: OutfitStyle[] = [
  {
    id: "outfit-kr-minimalist",
    name: "Korean Minimalist Casual",
    vibe: "Clean, Rapih, Estetik & Effortless",
    gender: "Unisex",
    occasion: "Ngampus, Nongkrong di Cafe, Kencan Santai",
    top: "Oversized boxy t-shirt polos atau lightweight knit sweater",
    bottom: "Wide-leg pleated trousers atau straight cut raw denim",
    footwear: "Clean retro trainers (New Balance 530 / Samba) atau white leather sneakers",
    accessories: "Minimalist canvas tote bag, cap netral polos, jam tangan tipis",
    colorPalette: "Broken White, Khaki / Cream, Sage Green, Charcoal",
    stylingTips: "Terapkan aturan proporsi 1/3 atasan (french tuck ke celana) dan 2/3 bawahan agar postur terlihat lebih tinggi dan rapi.",
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
    stylingTips: "Kunci gaya old money adalah bahan kain berkualitas yang breathable dan fit yang tidak terlalu ketat ataupun terlalu longgar.",
  },
  {
    id: "outfit-casual-hangout",
    name: "Casual Hangout / Tongkrongan Santai",
    vibe: "Santai Maksimal, Nyaman & Gak Bikin Gerah",
    gender: "Unisex",
    occasion: "Nongkrong Warkop / Kafe, Weekend Chill, Jalan Santai Sore",
    top: "Kemeja flanel bertekstur atau cuban collar shirt sebagai outer di atas kaos putih",
    bottom: "Relaxed-fit denim jeans atau easy-wear corduroy pants",
    footwear: "Classic low canvas sneakers (Vans / Chuck 70) atau Birkenstock Boston",
    accessories: "Canvas waist bag, jam tangan digital klasik (Casio)",
    colorPalette: "Earthy Brown, Mustard, Washed Indigo, Off-White",
    stylingTips: "Biarkan kancing kemeja luar terbuka untuk memberikan aksen layer yang hidup tanpa terasa gerah.",
  },
  {
    id: "outfit-chic-femme",
    name: "Korean Chic & Soft Aesthetic (Cewek)",
    vibe: "Manis, Anggun, Trendy & Estetik",
    gender: "Cewek",
    occasion: "Cafe Hopping, Foto OOTD, Nonton Bioskop, Kencan Pertama",
    top: "Ribbed knit cardigan manis dengan aksen kancing mutiara atau cropped baby tee",
    bottom: "A-line flowy midi skirt atau high-waist loose denim",
    footwear: "Mary Jane flat shoes dengan kaus kaki putih pendek, atau platform loafers",
    accessories: "Shoulder bag mini warna pastel, jepit rambut satin / hair ribbon, kalung tipis",
    colorPalette: "Butter Yellow, Soft Pastel Pink, Baby Blue, Vanilla Creme",
    stylingTips: "Kombinasikan atasan yang pas di badan (fitted) dengan bawahan yang lebih jatuh bervolume untuk ilusi siluet proporsional.",
  },
];

/**
 * Search and curate outfit recommendations based on natural query
 */
export function searchOutfitTrends(query: string): OutfitStyle[] {
  const q = (query || "").toLowerCase();
  logger.info(`OutfitService: Mencari rekomendasi outfit untuk query: "${query}"`);

  let filtered = OUTFIT_CATALOG;

  if (q.includes("cewek") || q.includes("wanita") || q.includes("perempuan")) {
    filtered = filtered.filter((o) => o.gender === "Cewek" || o.gender === "Unisex");
  } else if (q.includes("cowok") || q.includes("pria") || q.includes("laki")) {
    filtered = filtered.filter((o) => o.gender === "Cowok" || o.gender === "Unisex");
  }

  // Filter berdasarkan occasion / situasi
  if (q.includes("ngampus") || q.includes("kuliah")) {
    const campusOutfits = filtered.filter((o) => o.occasion.toLowerCase().includes("ngampus") || o.occasion.toLowerCase().includes("kuliah"));
    if (campusOutfits.length > 0) return campusOutfits.slice(0, 3);
  }

  if (q.includes("kencan") || q.includes("date") || q.includes("pacar")) {
    const dateOutfits = filtered.filter((o) => o.occasion.toLowerCase().includes("kencan") || o.name.toLowerCase().includes("chic") || o.name.toLowerCase().includes("old money"));
    if (dateOutfits.length > 0) return dateOutfits.slice(0, 3);
  }

  if (q.includes("kantor") || q.includes("kerja") || q.includes("formal") || q.includes("smart")) {
    const workOutfits = filtered.filter((o) => o.occasion.toLowerCase().includes("kantor") || o.name.toLowerCase().includes("smart"));
    if (workOutfits.length > 0) return workOutfits.slice(0, 3);
  }

  if (q.includes("streetwear") || q.includes("hype") || q.includes("konser")) {
    const streetOutfits = filtered.filter((o) => o.name.toLowerCase().includes("streetwear"));
    if (streetOutfits.length > 0) return streetOutfits;
  }

  if (q.includes("korean") || q.includes("korea") || q.includes("minimalis") || q.includes("clean")) {
    const krOutfits = filtered.filter((o) => o.name.toLowerCase().includes("korean") || o.name.toLowerCase().includes("minimalist"));
    if (krOutfits.length > 0) return krOutfits;
  }

  return filtered.slice(0, 3);
}

/**
 * Render clean journal-style embed for Outfit Trends (tanpa spam emoji)
 */
export function createOutfitEmbed(
  outfits: OutfitStyle[],
  queryPrompt: string,
  botAvatarUrl?: string
): { embed: EmbedBuilder } {
  const embed = new EmbedBuilder()
    .setColor(0xD97706) // Warm Amber / Ochre Fashion Tone
    .setTitle("Panduan Trend Outfit & Inspirasi Gaya Busana (OOTD)")
    .setDescription(
      `Kurasi referensi gaya busana terkini • Kueri: **"${queryPrompt}"**\n───────────────────────────────`
    )
    .setFooter({
      text: "Maya Style & Fashion Curator • Rapi & Bebas Halusinasi",
      iconURL: botAvatarUrl,
    })
    .setTimestamp();

  outfits.forEach((item, idx) => {
    const num = idx + 1;
    const content =
      `**Vibe Style**: ${item.vibe}\n` +
      `**Cocok Untuk**: ${item.occasion}\n` +
      `**Atasan**: ${item.top}\n` +
      `**Bawahan**: ${item.bottom}\n` +
      `**Alas Kaki**: ${item.footwear}\n` +
      `**Aksesoris**: ${item.accessories}\n` +
      `**Palet Warna**: ${item.colorPalette}\n` +
      `> *Tips Padu Padan: ${item.stylingTips}*`;

    embed.addFields({
      name: `${num}. ${item.name} (${item.gender})`,
      value: content,
      inline: false,
    });
  });

  return { embed };
}
