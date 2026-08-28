import { EmbedBuilder, TextChannel, Message, Guild } from "discord.js";
import { prisma } from "./database";
import { askNvidia } from "./aiClient";
import { logger } from "../utils/logger";

/**
 * Get current date string in WIB timezone (YYYY-MM-DD)
 */
export function getWibDateString(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

/**
 * Get current hour in WIB timezone (0-23)
 */
export function getWibHour(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  const hour = parts.find((p) => p.type === "hour")?.value;
  return parseInt(hour || "0", 10);
}

const PANTUN_THEMES = [
  "Humor Receh & Kehidupan Sehari-hari",
  "Nongkrong Warkop & Jajan Gorengan",
  "Dilema Cinta Ngenes & Mantan",
  "Dunia Kerja, Kampus & Rebahan",
  "Gaming, Push Rank & Paket Internet",
  "Meme, TikTok & Netizen Konoha",
  "Tanggal Tua, Saldo Kritis & Dompet Tipis",
  "Belanja Online & Kurir Nyasar",
  "Hewan Absurd & Cerita Nyeleneh",
  "Diet Wacana & Kuliner Malam",
  "Keluarga, Kakek Nenek & Tetangga",
  "Piknik, Hutan & Petualangan Konyol"
];

const CURATED_STARTER_PANTUNS = [
  {
    theme: "Pasar & Belanja",
    lines: "Pergi ke pasar membeli tomat,\nPulang ke rumah memetik kelapa."
  },
  {
    theme: "Anak Ayam & Jagung",
    lines: "Anak ayam turun sepuluh,\nMakan jagung di tepi kolam."
  },
  {
    theme: "Danau & Pohon Rindang",
    lines: "Jalan-jalan ke tepi danau,\nMelihat pohon rindang berdaun."
  },
  {
    theme: "Empang & Teratai",
    lines: "Pergi memancing ke pinggir empang,\nMelihat bunga teratai mekar."
  },
  {
    theme: "Burung Kicau & Hutan",
    lines: "Burung kutilang terbang melayang,\nHinggap sebentar di dahan cemara."
  },
  {
    theme: "Kelapa Muda & Petang",
    lines: "Kelapa muda dibuat santan,\nDiminum santai di waktu petang."
  },
  {
    theme: "Mancing & Sungai",
    lines: "Pagi-pagi memancing ikan,\nSungai mengalir airnya jernih."
  },
  {
    theme: "Ladang & Sumur",
    lines: "Kalau ada sumur di ladang,\nBolehlah kita menumpang mandi."
  },
  {
    theme: "Koran & Kopi",
    lines: "Duduk di teras membaca koran,\nSambil menyeruput kopi hangat."
  },
  {
    theme: "Bunga di Taman",
    lines: "Bunga mawar harum baunya,\nMekar indah di taman kota."
  },
  {
    theme: "Hutan & Satwa",
    lines: "Pergi berjalan ke tengah rimba,\nMelihat kijang berlari kencang."
  },
  {
    theme: "Pantai & Ombak",
    lines: "Duduk bersantai di pasir pantai,\nMemandang ombak berkejaran."
  },
  {
    theme: "Pohon Kelapa",
    lines: "Tinggi menjulang pohon kelapa,\nTertiup angin bergoyang-goyang."
  },
  {
    theme: "Hujan & Pelangi",
    lines: "Rintik hujan telah mereda,\nMuncul pelangi di balik awan."
  },
  {
    theme: "Kebun Jeruk",
    lines: "Memetik jeruk di kebun paman,\nBuahnya ranum rasanya manis."
  },
  {
    theme: "Layang-Layang & Sore",
    lines: "Sore hari bermain layangan,\nTerbang tinggi ditiup angin."
  },
  {
    theme: "Sepeda & Pagi",
    lines: "Mengayuh sepeda di waktu fajar,\nMenghirup udara segar pedesaan."
  },
  {
    theme: "Kucing & Halaman",
    lines: "Kucing belang tidur di bangku,\nTerbangun saat terdengar suara."
  },
  {
    theme: "Padi & Sawah",
    lines: "Kuning menguning butiran padi,\nPetani tersenyum hatinya gembira."
  },
  {
    theme: "Malam & Bintang",
    lines: "Malam sunyi bertabur bintang,\nCahaya bulan bersinar terang."
  }
];

/**
 * Generate or retrieve today's starter pantun for a guild (guaranteed unique & fresh every day)
 */
export async function getOrCreateTodayPantun(guildId: string) {
  const todayStr = getWibDateString();

  let pantun = await prisma.dailyPantun.findFirst({
    where: { guildId, dateStr: todayStr }
  });

  if (pantun) return pantun;

  // Fetch past pantun starter lines from DB to prevent repetition
  const pastPantuns = await prisma.dailyPantun.findMany({
    where: { guildId },
    select: { starterLines: true },
    orderBy: { id: "desc" },
    take: 60
  });

  const usedLinesSet = new Set(pastPantuns.map(p => p.starterLines.trim().toLowerCase()));
  const historySnippet = pastPantuns.slice(0, 15).map(p => `"${p.starterLines.replace(/\n/g, ' / ')}"`).join(", ");

  // Pick a fresh theme based on date hash and past count
  const daySeed = Math.abs(todayStr.split("-").reduce((acc, part) => acc + parseInt(part, 10), 0) + pastPantuns.length);
  const pickedTheme = PANTUN_THEMES[daySeed % PANTUN_THEMES.length];

  let starterLines = "";
  let theme = pickedTheme;

  try {
    const aiPrompt = `Kamu adalah Maya, cewek Gen-Z cerdas di Discord yang jago membuat sampiran pantun bahasa Indonesia yang indah, natural, berirama merdu, dan tidak memaksakan kata.
Hari ini adalah tanggal ${todayStr}.
Tema sampiran hari ini: "${pickedTheme}".

PENTING ANTI-DUPLIKASI:
DILARANG membuat bait pembuka yang sudah pernah dipakai berikut:
[${historySnippet || "Belum ada riwayat"}]

ATURAN PEMBUATAN SAMPIRAN PANTUN (2 BARIS):
1. **RIMA ALAMI & STRUKTUR SASTRA INDONESIA**:
   - Terdiri dari TEPAT 2 BARIS sampiran.
   - Panjang baris berkisar antara 8-12 suku kata (panjang wajar pantun).
   - Rima akhir baris harus jelas, natural, dan mudah disambung menjadi pantun 4 baris oleh member Discord.
   - DILARANG memaksakan kata-kata aneh atau tata bahasa yang rancu hanya demi mengejar bunyi akhir!
2. **KONTEKS NYATA & AKRAB**:
   - Gambarkan suasana alam, aktivitas sehari-hari, makanan, benda, atau situasi ringan yang familiar bagi orang Indonesia.

Format balasan HANYA JSON persis tanpa teks tambahan atau markdown codeblock:
{
  "theme": "${pickedTheme}",
  "lines": "Baris 1 sampiran\\nBaris 2 sampiran"
}`;

    const rawResponse = await askNvidia(aiPrompt, "Kamu adalah Maya, pencipta pantun sastra humoris yang cerdas dan berirama indah.");
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.lines && parsed.lines.trim() && parsed.lines.includes("\n")) {
        const candidate = parsed.lines.trim();
        // Ensure AI candidate is not in usedLinesSet
        if (!usedLinesSet.has(candidate.toLowerCase())) {
          starterLines = candidate;
          theme = parsed.theme || theme;
        }
      }
    }
  } catch (err) {
    logger.warn("PantunManager: Gagal menghasilkan sampiran AI, menggunakan fallback:", err);
  }

  // Fallback to curated list if AI didn't return
  if (!starterLines) {
    const availableCurated = CURATED_STARTER_PANTUNS.filter(p => !usedLinesSet.has(p.lines.trim().toLowerCase()));
    const pool = availableCurated.length > 0 ? availableCurated : CURATED_STARTER_PANTUNS;
    const selected = pool[Math.floor(Math.random() * pool.length)];
    starterLines = selected.lines;
    theme = selected.theme;
  }

  pantun = await prisma.dailyPantun.create({
    data: {
      guildId,
      dateStr: todayStr,
      theme,
      starterLines,
      isActive: true
    }
  });

  return pantun;
}

/**
 * Announce pantun session start (Runs at configured startHour, default 09:00 WIB)
 */
export async function announcePantunSessionStart(guild: Guild, configuredChannelId?: string): Promise<boolean> {
  try {
    const config = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });
    if (!config || !config.pantunEnabled) return false;

    const channelId = configuredChannelId || config.pantunChannelId;
    let targetChannel: TextChannel | null = null;

    if (channelId) {
      targetChannel = (guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null))) as TextChannel;
    }

    if (!targetChannel) {
      try {
        const fetchedChannels = await guild.channels.fetch();
        targetChannel = (fetchedChannels.find(
          (c: any) => c && c.isTextBased() && !c.isThread() && (c.name.includes("trivia") || c.name.includes("tebak") || c.name.includes("pantun") || c.name.includes("general") || c.name.includes("chat"))
        ) || guild.systemChannel) as TextChannel;
      } catch (_) {
        targetChannel = guild.systemChannel as TextChannel;
      }
    }

    if (!targetChannel || !("send" in targetChannel)) return false;

    const todayStr = getWibDateString();
    const pantun = await getOrCreateTodayPantun(guild.id);

    const embed = new EmbedBuilder()
      .setTitle("🎭 MAYA LANJUTKAN PANTUN • SESI HARI INI DIBUKA!")
      .setColor("#F59E0B")
      .setDescription(
        `Selamat pagi warga **${guild.name}**! Sesi **Lanjutkan Pantun** hari ini telah resmi dibuka.\n` +
        `Yuk lanjutkan 2 baris isi pantun di bawah ini dengan rima yang pas, lucu, dan kreatif!`
      )
      .addFields(
        {
          name: `📜 Bait Pembuka Maya (${pantun.theme || "Pantun Hari Ini"})`,
          value: pantun.starterLines.split("\n").map(line => `> *${line}*`).join("\n"),
          inline: false
        },
        {
          name: "🎯 Cara Bermain & Aturan",
          value:
            "• **1 Kesempatan / Hari**: Setiap member hanya boleh mengirim 1 pantun lanjutan per hari.\n" +
            `• **Reward Langsung**: Kiriman valid otomatis mendapat **+${config.pantunRewardAmount ?? 15} RTK Points**.\n` +
            `• **Penutupan & MVP**: Sesi ditutup jam **${config.pantunCloseHour ?? 23}:00 WIB**. Maya akan memilih **1 MVP Pantun Terbaik (+${config.pantunMvpReward ?? 150} RTK Points)**!`,
          inline: false
        }
      )
      .setFooter({ text: `Maya Lanjutkan Pantun • Sesi Aktif Hingga ${config.pantunCloseHour ?? 23}:00 WIB`, iconURL: guild.client.user?.displayAvatarURL() })
      .setTimestamp();

    await targetChannel.send({
      content: "📢 @everyone @here **MAYA LANJUTKAN PANTUN HARI INI TELAH DIBUKA!** Ayo lanjutkan pantunnya di channel ini dan raih RTK Points!",
      embeds: [embed]
    });

    // Update persistent start date
    await prisma.guildConfig.update({
      where: { guildId: guild.id },
      data: { lastPantunStartDate: todayStr }
    });

    logger.info(`PantunManager: Sesi pantun berhasil diumumkan di guild ${guild.name}`);
    return true;
  } catch (error) {
    logger.error(`PantunManager: Error announcing pantun session in ${guild.name}:`, error);
    return false;
  }
}

/**
 * Handle incoming user pantun submission in the dedicated channel
 */
export async function handlePantunMessage(message: Message) {
  try {
    if (!message.guild || message.author.bot) return;

    const guildId = message.guild.id;
    const config = await prisma.guildConfig.findUnique({ where: { guildId } });

    if (!config || !config.pantunEnabled || !config.pantunChannelId) return;
    if (message.channelId !== config.pantunChannelId) return;

    const text = message.content.trim();
    if (!text) return;

    // Check operating hours (between startHour and closeHour WIB)
    const currentHour = getWibHour();
    const startHour = config.pantunStartHour ?? 9;
    const closeHour = config.pantunCloseHour ?? 23;

    if (currentHour < startHour || currentHour >= closeHour) {
      const warnMsg = await message.reply(
        `⏳ Sesi **Maya Lanjutkan Pantun** sedang ditutup! Sesi buka setiap hari pukul **${startHour}:00 WIB** s/d **${closeHour}:00 WIB**.`
      ).catch(() => null);
      await message.delete().catch(() => {});
      if (warnMsg) setTimeout(() => warnMsg.delete().catch(() => {}), 6000);
      return;
    }

    const todayStr = getWibDateString();
    const activePantun = await getOrCreateTodayPantun(guildId);

    if (!activePantun || !activePantun.isActive) {
      const warnMsg = await message.reply("⏳ Sesi pantun hari ini telah selesai atau belum dimulai.").catch(() => null);
      await message.delete().catch(() => {});
      if (warnMsg) setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
      return;
    }

    // Check 1-submission limit per user per day
    const existingSubmission = await prisma.dailyPantunSubmission.findFirst({
      where: {
        dailyPantunId: activePantun.id,
        userId: message.author.id
      }
    });

    if (existingSubmission) {
      const warnMsg = await message.reply(
        "⚠️ Kamu sudah menggunakan **1 kesempatan mengirim pantun hari ini**! Pantunmu sebelumnya sudah tercatat untuk penilaian MVP malam nanti."
      ).catch(() => null);
      await message.delete().catch(() => {});
      if (warnMsg) setTimeout(() => warnMsg.delete().catch(() => {}), 6000);
      return;
    }

    // Validate length (reasonable pantun length, max 350 chars)
    if (text.length < 5 || text.length > 350) {
      const warnMsg = await message.reply("⚠️ Pantun lanjutan terlalu pendek atau terlalu panjang (maks. 350 karakter)!").catch(() => null);
      await message.delete().catch(() => {});
      if (warnMsg) setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
      return;
    }

    // Save submission
    await prisma.dailyPantunSubmission.create({
      data: {
        dailyPantunId: activePantun.id,
        guildId,
        userId: message.author.id,
        username: message.author.displayName || message.author.username,
        userAvatar: message.author.displayAvatarURL(),
        content: text,
        dateStr: todayStr
      }
    });

    // Award participation reward points
    const reward = config.pantunRewardAmount ?? 15;
    if (reward > 0) {
      await prisma.triviaScore.upsert({
        where: { guildId_userId: { guildId, userId: message.author.id } },
        update: {
          score: { increment: reward },
          dailyScore: { increment: reward },
          lastDailyDate: todayStr,
          username: message.author.displayName || message.author.username
        },
        create: {
          guildId,
          userId: message.author.id,
          username: message.author.displayName || message.author.username,
          score: reward,
          dailyScore: reward,
          lastDailyDate: todayStr
        }
      });
    }

    // React with appreciation emojis
    await message.react("👏").catch(() => {});
    await message.react("✨").catch(() => {});

    logger.info(`PantunManager: Submission received from ${message.author.username} in guild ${message.guild.name}`);
  } catch (error) {
    logger.error("PantunManager: Error handling user pantun message:", error);
  }
}

/**
 * Close pantun session, evaluate submissions with AI, pick MVP, and post showcase (Runs at 23:00 WIB)
 */
export async function closeAndEvaluateDailyPantun(guild: Guild, configuredChannelId?: string): Promise<boolean> {
  try {
    const config = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });
    if (!config || !config.pantunEnabled) return false;

    const channelId = configuredChannelId || config.pantunChannelId;
    let targetChannel: TextChannel | null = null;

    if (channelId) {
      targetChannel = (guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null))) as TextChannel;
    }

    if (!targetChannel) {
      try {
        const fetchedChannels = await guild.channels.fetch();
        targetChannel = (fetchedChannels.find(
          (c: any) => c && c.isTextBased() && !c.isThread() && (c.name.includes("trivia") || c.name.includes("tebak") || c.name.includes("pantun") || c.name.includes("general") || c.name.includes("chat"))
        ) || guild.systemChannel) as TextChannel;
      } catch (_) {
        targetChannel = guild.systemChannel as TextChannel;
      }
    }

    if (!targetChannel || !("send" in targetChannel)) return false;

    const todayStr = getWibDateString();
    const activePantun = await prisma.dailyPantun.findFirst({
      where: { guildId: guild.id, dateStr: todayStr },
      include: { submissions: true }
    });

    if (!activePantun) {
      logger.info(`PantunManager: Tidak ada sesi pantun aktif hari ini untuk guild ${guild.name}`);
      return false;
    }

    const submissions = activePantun.submissions;

    if (submissions.length === 0) {
      // Close without submissions
      await prisma.dailyPantun.update({
        where: { id: activePantun.id },
        data: { isActive: false }
      });

      const emptyEmbed = new EmbedBuilder()
        .setTitle("🌙 MAYA LANJUTKAN PANTUN • SESI DITUTUP")
        .setColor("#6B7280")
        .setDescription("Sesi pantun hari ini telah berakhir. Belum ada kiriman pantun dari member. Sampai jumpa di sesi berikutnya besok jam 09:00 WIB!")
        .setTimestamp();

      await targetChannel.send({ embeds: [emptyEmbed] });

      await prisma.guildConfig.update({
        where: { guildId: guild.id },
        data: { lastPantunCloseDate: todayStr }
      });
      return true;
    }

    // AI Evaluation of submissions
    const submissionsText = submissions.map((s, idx) => `[#${idx + 1}] ID: ${s.id} | User: @${s.username} (UserId: ${s.userId})\nPantun Lanjutan:\n"${s.content}"`).join("\n\n");

    const evalPrompt = `Kamu adalah juri pantun komedi dan sastra humor profesional di Discord server Maya.
Berikut adalah 2 baris sampiran pembuka pantun hari ini (Tema: "${activePantun.theme || 'Pantun'} "):
"${activePantun.starterLines}"

Berikut adalah daftar kiriman bait isi pantun dari para member:
${submissionsText}

TUGAS PENILAIAN JURI MAYA:
1. Pilihlah SATU pantun lanjutan terbaik yang:
   - Paling nyambung rimanya dengan sampiran di atas.
   - Paling receh, pendek, gokil, lucu, dan punchline-nya paling pecah ala Gen-Z.
2. Tuliskan alasan apresiasi yang kocak, gaul, dan menghibur khas gaya bicara Maya (1-2 kalimat).

Balas HANYA dalam format JSON persis tanpa markdown lain:
{
  "mvpSubmissionId": 123,
  "mvpUserId": "user_id_string",
  "mvpUsername": "username_string",
  "mvpPantun": "isi pantun terpilih",
  "mvpReason": "alasan kocak dan apresiatif dari Maya"
}`;

    let mvpData = {
      mvpUserId: submissions[0].userId,
      mvpUsername: submissions[0].username,
      mvpPantun: submissions[0].content,
      mvpReason: "Pantun lanjutan yang paling berima, kreatif, dan menghibur hari ini!"
    };

    try {
      const aiResponse = await askNvidia(evalPrompt, "Kamu adalah Maya, juri pantun humoris yang cerdas dan adil.");
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.mvpUserId) {
          const matchSub = submissions.find(s => s.userId === parsed.mvpUserId || s.id === parsed.mvpSubmissionId) || submissions[0];
          mvpData = {
            mvpUserId: matchSub.userId,
            mvpUsername: matchSub.username,
            mvpPantun: parsed.mvpPantun || matchSub.content,
            mvpReason: parsed.mvpReason || mvpData.mvpReason
          };
        }
      }
    } catch (err) {
      logger.warn("PantunManager: AI evaluation failed, fallback to first submission:", err);
    }

    // Update DailyPantun record
    await prisma.dailyPantun.update({
      where: { id: activePantun.id },
      data: {
        isActive: false,
        mvpUserId: mvpData.mvpUserId,
        mvpUsername: mvpData.mvpUsername,
        mvpPantun: mvpData.mvpPantun,
        mvpReason: mvpData.mvpReason
      }
    });

    // Award MVP Bonus (+150 RTK Points)
    const mvpReward = config.pantunMvpReward ?? 150;
    if (mvpReward > 0 && mvpData.mvpUserId) {
      await prisma.triviaScore.upsert({
        where: { guildId_userId: { guildId: guild.id, userId: mvpData.mvpUserId } },
        update: {
          score: { increment: mvpReward },
          dailyScore: { increment: mvpReward },
          lastDailyDate: todayStr,
          username: mvpData.mvpUsername
        },
        create: {
          guildId: guild.id,
          userId: mvpData.mvpUserId,
          username: mvpData.mvpUsername,
          score: mvpReward,
          dailyScore: mvpReward,
          lastDailyDate: todayStr
        }
      });
    }

    // Full Complete Pantun Compilation
    const fullPantunText = `${activePantun.starterLines}\n${mvpData.mvpPantun}`;

    // Construct Award Embed
    const closeEmbed = new EmbedBuilder()
      .setTitle("🏆 REKAP JUARA MAYA LANJUTKAN PANTUN HARI INI")
      .setColor("#10B981")
      .setDescription(
        `Sesi **Lanjutkan Pantun** hari ini telah resmi ditutup!\n` +
        `Total **${submissions.length} member** telah berpartisipasi berpantun ria hari ini.`
      )
      .addFields(
        {
          name: `🌟 Pantun Utuh Terbaik (Karya Maya & @${mvpData.mvpUsername})`,
          value: fullPantunText.split("\n").map(l => `> *${l}*`).join("\n"),
          inline: false
        },
        {
          name: `👑 MVP Pujangga Hari Ini: @${mvpData.mvpUsername}`,
          value:
            `💬 *"${mvpData.mvpReason}"*\n` +
            `🎁 Bonus Juara: **+${mvpReward} RTK Points** telah dikreditkan ke dompet!`,
          inline: false
        }
      )
      .setFooter({ text: "Maya Lanjutkan Pantun • Sesi Buka Kembali Besok Jam 09:00 WIB", iconURL: guild.client.user?.displayAvatarURL() })
      .setTimestamp();

    await targetChannel.send({
      content: "🏆 @everyone **REKAP JUARA MAYA LANJUTKAN PANTUN HARI INI!**",
      embeds: [closeEmbed]
    });

    // Update persistent close date
    await prisma.guildConfig.update({
      where: { guildId: guild.id },
      data: { lastPantunCloseDate: todayStr }
    });

    logger.info(`PantunManager: Sesi pantun berhasil ditutup dan dinilai untuk guild ${guild.name}`);
    return true;
  } catch (error) {
    logger.error(`PantunManager: Error closing pantun session in ${guild.name}:`, error);
    return false;
  }
}

/**
 * Get status of today's pantun session for dashboard & slash commands
 */
export async function getTodayPantunStatus(guildId: string) {
  const todayStr = getWibDateString();
  const pantun = await prisma.dailyPantun.findFirst({
    where: { guildId, dateStr: todayStr },
    include: {
      submissions: {
        orderBy: { createdAt: "desc" }
      }
    }
  });

  return pantun;
}
