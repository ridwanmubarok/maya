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

const CURATED_STARTER_PANTUNS = [
  {
    theme: "Kisah Kopi & Senja Santai",
    lines: "Beli kopi di pinggir jalan,\nMinumnya sambil makan combro."
  },
  {
    theme: "Petualangan & Pasar Malam",
    lines: "Pergi ke pasar beli blewah,\nPulangnya mampir ke toko pita."
  },
  {
    theme: "Dunia Digital & Gaming",
    lines: "Main game dari pagi hingga senja,\nBaterai habis tinggal lima persen."
  },
  {
    theme: "Kocak & Percintaan Ringan",
    lines: "Pohon beringin daunnya lebat,\nTempat berteduh si burung nuri."
  },
  {
    theme: "Misteri & Humor Sehari-hari",
    lines: "Jalan-jalan ke kota Blitar,\nJangan lupa beli sukun."
  },
  {
    theme: "Semangat & Keseharian",
    lines: "Beli mangga manis rasanya,\nDipetik langsung dari dahan."
  }
];

/**
 * Generate or retrieve today's starter pantun for a guild
 */
export async function getOrCreateTodayPantun(guildId: string) {
  const todayStr = getWibDateString();

  let pantun = await prisma.dailyPantun.findFirst({
    where: { guildId, dateStr: todayStr }
  });

  if (pantun) return pantun;

  // Try generating with AI
  let starterLines = "";
  let theme = "Pantun Bebas & Kreatif";

  try {
    const aiPrompt = `Buatkan 2 baris bait pembuka (sampiran pantun) dalam bahasa Indonesia yang unik, berima rima a-b atau sajak jelas, lucu/menarik, dan mudah dilanjutkan oleh member Discord.
Format balasan HANYA JSON persis tanpa markdown lain:
{"theme": "Tema singkat", "lines": "Baris 1 sampiran\\nBaris 2 sampiran"}`;

    const rawResponse = await askNvidia(aiPrompt);
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.lines && parsed.lines.trim()) {
        starterLines = parsed.lines.trim();
        theme = parsed.theme || theme;
      }
    }
  } catch (err) {
    logger.warn("PantunManager: Gagal membuat bait AI, menggunakan kurasi fallback:", err);
  }

  if (!starterLines) {
    const fallback = CURATED_STARTER_PANTUNS[Math.floor(Math.random() * CURATED_STARTER_PANTUNS.length)];
    starterLines = fallback.lines;
    theme = fallback.theme;
  }

  pantun = await prisma.dailyPantun.create({
    data: {
      guildId,
      starterLines,
      theme,
      dateStr: todayStr,
      isActive: true
    }
  });

  return pantun;
}

/**
 * Announce pantun session start (Runs at 09:00 WIB)
 */
export async function announcePantunSessionStart(guild: Guild, configuredChannelId?: string): Promise<boolean> {
  try {
    const config = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });
    if (!config || !config.pantunEnabled) return false;

    const channelId = configuredChannelId || config.pantunChannelId;
    if (!channelId) return false;

    const channel = (guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null)) as TextChannel;
    if (!channel || !channel.isTextBased()) return false;

    const todayStr = getWibDateString();
    const pantun = await getOrCreateTodayPantun(guild.id);

    const embed = new EmbedBuilder()
      .setTitle("🎭 MAYA LANJUTKAN PANTUN • SESI RESMI DIBUKA!")
      .setColor("#F59E0B")
      .setDescription(
        `Selamat pagi warga **${guild.name}**! Sesi **Lanjutkan Pantun** hari ini telah dibuka.\n` +
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
            `• **Penutupan & MVP**: Sesi ditutup jam **${config.pantunCloseHour ?? 23}:00 WIB**. Maya AI akan memilih **1 MVP Pantun Terbaik (+${config.pantunMvpReward ?? 150} RTK Points)**!`,
          inline: false
        }
      )
      .setFooter({ text: "Maya Lanjutkan Pantun • Sesi Aktif Hingga 23:00 WIB", iconURL: guild.client.user?.displayAvatarURL() })
      .setTimestamp();

    await channel.send({ embeds: [embed] });

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
    if (!channelId) return false;

    const channel = (guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null)) as TextChannel;
    if (!channel || !channel.isTextBased()) return false;

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

      await channel.send({ embeds: [emptyEmbed] });

      await prisma.guildConfig.update({
        where: { guildId: guild.id },
        data: { lastPantunCloseDate: todayStr }
      });
      return true;
    }

    // AI Evaluation of submissions
    const submissionsText = submissions.map((s, idx) => `[#${idx + 1}] ID: ${s.id} | User: @${s.username} (UserId: ${s.userId})\nPantun Lanjutan:\n"${s.content}"`).join("\n\n");

    const evalPrompt = `Kamu adalah juri pantun sastra humor profesional di Discord server Maya.
Berikut adalah 2 baris sampiran pembuka pantun hari ini:
"${activePantun.starterLines}"

Berikut adalah daftar kiriman bait isi pantun dari member server:
${submissionsText}

Tugas:
Pilihlah SATU pantun lanjutan terbaik, paling lucu/kreatif, dan rimanya paling pas menyatu dengan bait sampiran di atas sebagai MVP Juara Pantun Hari Ini.
Berikan alasan apresiasi singkat yang santai dan menghibur (1-2 kalimat).

Balas HANYA dalam format JSON persis:
{
  "mvpSubmissionId": 123,
  "mvpUserId": "user_id_string",
  "mvpUsername": "username_string",
  "mvpPantun": "isi pantun terpilih",
  "mvpReason": "alasan apresiasi yang seru dan apresiatif"
}`;

    let mvpData = {
      mvpUserId: submissions[0].userId,
      mvpUsername: submissions[0].username,
      mvpPantun: submissions[0].content,
      mvpReason: "Pantun lanjutan yang paling berima, kreatif, dan menghibur hari ini!"
    };

    try {
      const aiResponse = await askNvidia(evalPrompt);
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

    await channel.send({ embeds: [closeEmbed] });

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
