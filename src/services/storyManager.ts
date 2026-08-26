import { EmbedBuilder, TextChannel, Message, Guild } from "discord.js";
import { prisma } from "./database";
import { askNvidia } from "./aiClient";
import { logger } from "../utils/logger";
import { generateFreeImage } from "./imageGenService";

export interface StoryWordItem {
  id: number;
  userId: string;
  username: string;
  word: string;
  createdAt: Date;
}

/**
 * Get current date string in WIB timezone (YYYY-MM-DD)
 */
function getWibDateString(): string {
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
 * Handle incoming messages in the story chain channel (1 kalimat per pesan)
 */
export async function handleStoryWordMessage(message: Message) {
  try {
    if (!message.guild || message.author.bot) return;

    const guildId = message.guild.id;
    const config = await prisma.guildConfig.findUnique({ where: { guildId } });

    if (!config || !config.storyEnabled || !config.storyChannelId) return;
    if (message.channelId !== config.storyChannelId) return;

    const text = message.content.trim();
    if (!text) return;

    // 1. Enforce 1-sentence limit per message (max 25 words, max 250 chars, no multi-line spam)
    const words = text.split(/\s+/).filter(Boolean);
    if (text.includes("\n") || words.length > 25 || text.length > 250) {
      const warnMsg = await message.reply("⚠️ Di channel ini hanya boleh menulis **1 kalimat pendek per pesan** (maks. 25 kata & 1 baris)! Pesan kamu telah dihapus.").catch(() => null);
      await message.delete().catch(() => {});
      if (warnMsg) setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
      return;
    }

    const singleSentence = text;
    const todayStr = getWibDateString();

    // 2. Anti-consecutive-posting (User cannot write 2 sentences in a row consecutively)
    const lastWord = await prisma.dailyStoryWord.findFirst({
      where: { guildId, dateStr: todayStr },
      orderBy: { id: "desc" }
    });

    if (lastWord && lastWord.userId === message.author.id) {
      const warnMsg = await message.reply("⏳ Harap tunggu member lain menulis kalimat berikutnya baru giliranmu lagi! Pesan kamu telah dihapus.").catch(() => null);
      await message.delete().catch(() => {});
      if (warnMsg) setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
      return;
    }

    // 3. Enforce 2-attempt daily limit per member
    const userWordCount = await prisma.dailyStoryWord.count({
      where: { guildId, dateStr: todayStr, userId: message.author.id }
    });

    if (userWordCount >= 2) {
      const warnMsg = await message.reply("🎉 Kamu sudah menggunakan **2 kesempatan menulis kalimat hari ini**! Sesi kamu hari ini sudah selesai. Pesan kamu telah dihapus.").catch(() => null);
      await message.delete().catch(() => {});
      if (warnMsg) setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
      return;
    }

    // Save sentence to database
    await prisma.dailyStoryWord.create({
      data: {
        guildId,
        userId: message.author.id,
        username: message.author.displayName || message.author.username,
        word: singleSentence,
        dateStr: todayStr
      }
    });

    // Award +10 RTK Points (or configured storyWordReward)
    const wordReward = config.storyWordReward ?? 10;
    if (wordReward > 0) {
      await prisma.triviaScore.upsert({
        where: { guildId_userId: { guildId, userId: message.author.id } },
        update: {
          score: { increment: wordReward },
          dailyScore: { increment: wordReward },
          lastDailyDate: todayStr,
          username: message.author.displayName || message.author.username
        },
        create: {
          guildId,
          userId: message.author.id,
          username: message.author.displayName || message.author.username,
          score: wordReward,
          dailyScore: wordReward,
          lastDailyDate: todayStr
        }
      });
    }

    // React with 👍 on valid sentence message
    await message.react("👍").catch(() => {});

  } catch (err) {
    logger.error("Error in handleStoryWordMessage:", err);
  }
}

/**
 * Announce story session start & daily reminder
 */
export async function announceStorySessionStart(guild: Guild, configuredChannelId?: string): Promise<boolean> {
  try {
    const config = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });
    const channelId = configuredChannelId || config?.storyChannelId;
    if (!channelId) return false;

    let targetChannel: TextChannel | null = null;
    try {
      targetChannel = (guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null))) as TextChannel;
    } catch (_) {}

    if (!targetChannel || !("send" in targetChannel)) return false;

    const rewardAmount = config?.storyWordReward ?? 10;
    const mvpRewardAmount = config?.storyMvpReward ?? 250;

    const embed = new EmbedBuilder()
      .setTitle("📖 MAYA STORY CHAIN HARI INI")
      .setColor("#5865F2")
      .setDescription(
        "Sesi kolaborasi menyambung cerita bersama member lain hari ini telah dibuka!\n\n" +
        "📌 **Aturan Menulis**:\n" +
        `• Tulis **1 kalimat lanjutan per pesan** di channel ini (maks. 25 kata).\n` +
        `• Maksimal **2 kalimat per member** setiap harinya.\n` +
        `• Wajib **gantian** dengan member lain (tidak boleh 2x berurutan).\n` +
        `• Hadiah Langsung: **+${rewardAmount} RTK Point** per kalimat valid!\n\n` +
        `🏆 **Bonus MVP Pilihan Maya**: **+${mvpRewardAmount} RTK Point** untuk kontributor kalimat paling konyol/berpengaruh di akhir hari!`
      )
      .setFooter({ text: "Maya Story Engine • Sambung ceritamu sekarang!" })
      .setTimestamp();

    await targetChannel.send({
      content: "📢 @everyone **MAYA STORY CHAIN HARI INI TELAH DIBUKA!**",
      embeds: [embed]
    });

    logger.info(`StoryManager: Announcement start posted for ${guild.name}`);
    return true;
  } catch (err) {
    logger.error(`Error announcing story session start for ${guild.name}:`, err);
    return false;
  }
}

/**
 * Compile today's story sentences, synthesize fairytale via AI, generate AI image, pick MVP automatically & award points
 */
export async function compileDailyStoryForGuild(guild: Guild, configuredChannelId?: string): Promise<boolean> {
  try {
    const todayStr = getWibDateString();

    // Check if story for today is already compiled
    const existingStory = await prisma.dailyStory.findFirst({
      where: { guildId: guild.id, dateStr: todayStr }
    });
    if (existingStory) {
      logger.info(`StoryManager: Story for today (${todayStr}) already compiled for guild ${guild.name}, skipping duplicate compilation.`);
      return true;
    }

    const words = await prisma.dailyStoryWord.findMany({
      where: { guildId: guild.id, dateStr: todayStr },
      orderBy: { id: "asc" }
    });

    const config = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });
    const channelId = configuredChannelId || config?.storyChannelId;
    if (!channelId) return false;

    let targetChannel: TextChannel | null = null;
    try {
      targetChannel = (guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null))) as TextChannel;
    } catch (_) {}

    if (!targetChannel || !("send" in targetChannel)) return false;

    if (words.length === 0) {
      await targetChannel.send({
        content: "📖 **Maya Story Chain**: Sesi hari ini ditutup. Belum ada kalimat yang disumbangkan oleh member hari ini. Sesi berikutnya dibuka besok!"
      }).catch(() => {});
      return false;
    }

    const rawWordStream = words.map(w => `[User ID: ${w.userId}, Name: ${w.username}] -> "${w.word}"`).join("\n");
    const mvpReward = config?.storyMvpReward ?? 250;

    // AI Synthesis & Automatic MVP Selection with Master Storyteller & Smart Cocokologi
    const prompt = `Berikut adalah urutan kalimat mentah yang ditulis oleh member Discord secara estafet hari ini:

${rawWordStream}

TUGAS UTAMA MAYA (PENULIS DONGENG KOMEDI & MASTER COCOKOLOGI):
Tulis ulang dan karanglah sebuah **Cerita Petualangan Komedi / Dongeng Satir yang SANGAT NYAMBUNG, RUNTUT, MENGALIR, dan SUPER LUCU** berdasarkan ide-ide kalimat di atas!

PANDUAN PENULISAN (WAJIB DIPATUHI):
1. **ALUR SEBAB-AKIBAT YANG RUNTUT & NYAMBUNG**:
   - DILARANG hanya menempel kalimat mentah! Kamu HARUS menyusun cerita dengan alur sebab-akibat (kausalitas) yang jelas: Pembuka -> Konflik Konyol -> Plot Twist -> Penutup/Punchline.
   - Jembatani setiap ide yang acak dengan narasi penghubung yang masuk akal dalam logika komedi, sehingga tidak ada adegan yang terputus atau melompat tanpa konteks.
   - Cerita harus mengalir luwes, enak dibaca, dan padat (2-3 paragraf).
2. **JADIKAN MEMBER SEBAGAI TOKOH UTAMA**:
   - Masukkan nama-nama member kontributor di atas sebagai karakter yang berinteraksi langsung satu sama lain dalam petualangan tersebut.
3. **PILIH 1 MVP**:
   - Tentukan 1 member yang idenya paling memicu plot twist atau punchline paling gokil.
4. **PROMPT GAMBAR**:
   - Buatkan 1 kalimat deskripsi prompt visual digital art kartun komedi dalam bahasa Inggris.

SYARAT FORMAT:
- DILARANG menggunakan banyak emoji keyboard lebay! Maksimal 1 emoji di judul.
- Output HANYA JSON persis tanpa teks pengantar / markdown:
{
  "title": "Judul Cerita Komedi yang Menarik",
  "storyText": "Teks cerita utuh yang mengalir sangat nyambung dan lucu di sini (2-3 paragraf mengalir)...",
  "mvpUserId": "User ID member pilihanmu",
  "mvpUsername": "Nama member pilihanmu",
  "mvpReason": "Alasan apresiasi yang lucu kenapa memilih dia sebagai MVP",
  "imagePrompt": "A humorous vibrant digital art illustration of [scene description in English]"
}`;

    let title = "Petualangan Konyol Warga Server";
    let storyText = words.map(w => w.word).join(" ");
    let mvpUserId = words[0].userId;
    let mvpUsername = words[0].username;
    let mvpReason = "Kalimatnya memicu alur cerita yang tak terduga!";
    let imagePrompt = "A funny cartoon illustration of a humorous adventure";

    try {
      const rawAi = await askNvidia(prompt, "Kamu adalah Maya, novelis dan pendongeng komedi cerdas yang ahli merangkai cerita nyambung dan penuh tawa.");
      const jsonMatch = rawAi.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.title) title = parsed.title;
        if (parsed.storyText && parsed.storyText.trim().length > 20) storyText = parsed.storyText.trim();
        if (parsed.mvpUserId) mvpUserId = parsed.mvpUserId;
        if (parsed.mvpUsername) mvpUsername = parsed.mvpUsername;
        if (parsed.mvpReason) mvpReason = parsed.mvpReason;
        if (parsed.imagePrompt) imagePrompt = parsed.imagePrompt;
      }
    } catch (err) {
      logger.error("StoryManager: Gagal mensintesis cerita AI, menggunakan fallback:", err);
      // Fallback narrative generation
      if (words.length > 0) {
        storyText = `Kisah hari ini dimulai ketika @${words[0].username} mencetuskan: "${words[0].word}". Tak lama kemudian, suasana semakin seru saat anggota server lainnya ikut menyambung alur petualangan ini hingga mencapai akhir kisah yang menggelitik.`;
      }
    }

    // Generate AI Illustration Image
    let imageUrl: string | undefined = undefined;
    try {
      const imgRes = await generateFreeImage(imagePrompt, "Digital Art");
      if (imgRes && imgRes.imageUrl) {
        imageUrl = imgRes.imageUrl;
      }
    } catch (_) {}

    // Award +250 RTK Points to MVP
    if (mvpUserId && mvpReward > 0) {
      await prisma.triviaScore.upsert({
        where: { guildId_userId: { guildId: guild.id, userId: mvpUserId } },
        update: {
          score: { increment: mvpReward },
          dailyScore: { increment: mvpReward },
          lastDailyDate: todayStr,
          username: mvpUsername
        },
        create: {
          guildId: guild.id,
          userId: mvpUserId,
          username: mvpUsername,
          score: mvpReward,
          dailyScore: mvpReward,
          lastDailyDate: todayStr
        }
      });
    }

    // Save DailyStory record in DB
    const uniqueUserIds = new Set(words.map(w => w.userId));

    await prisma.dailyStory.create({
      data: {
        guildId: guild.id,
        title,
        storyText,
        imageUrl: imageUrl || null,
        mvpUserId,
        mvpUsername,
        mvpReason,
        contributorCount: uniqueUserIds.size,
        dateStr: todayStr
      }
    });

    // Build Clean Embed Output
    const embed = new EmbedBuilder()
      .setTitle(`📖 MAYA STORY CHAIN • ${todayStr}`)
      .setColor("#5865F2")
      .setDescription(
        `### ${title}\n` +
        `${storyText}\n\n` +
        `🏆 **MVP Kontributor Terbaik Pilihan Maya**:\n` +
        `<@${mvpUserId}> (**${mvpUsername}**) — **+${mvpReward} RTK Points**\n` +
        `💬 *"${mvpReason}"*\n\n` +
        `👥 **Total Kontributor**: **${uniqueUserIds.size} Member** (${words.length} Kalimat)`
      )
      .setFooter({ text: "Maya Story Chain • Terima kasih telah berkolaborasi hari ini!" })
      .setTimestamp();

    if (imageUrl) {
      embed.setImage(imageUrl);
    }

    await targetChannel.send({
      content: "📢 @everyone **CERITA MAYA STORY CHAIN HARI INI TELAH DIRENDER!** 🎉",
      embeds: [embed]
    });

    logger.info(`StoryManager: Successfully compiled daily story for ${guild.name}`);
    return true;
  } catch (err) {
    logger.error(`StoryManager: Error compiling daily story for guild ${guild.name}:`, err);
    return false;
  }
}

/**
 * Fetch Today's Story status & collaboration chain for Web Dashboard Backoffice
 */
export async function getTodayStoryStatus(guildId: string) {
  try {
    const todayStr = getWibDateString();
    const words = await prisma.dailyStoryWord.findMany({
      where: { guildId, dateStr: todayStr },
      orderBy: { id: "asc" }
    });

    const latestStory = await prisma.dailyStory.findFirst({
      where: { guildId },
      orderBy: { createdAt: "desc" }
    });

    // Calculate per-member attempt counts (out of 2)
    const userAttemptsMap: Record<string, { userId: string; username: string; count: number; words: string[]; lastTime: Date }> = {};
    for (const w of words) {
      if (!userAttemptsMap[w.userId]) {
        userAttemptsMap[w.userId] = {
          userId: w.userId,
          username: w.username,
          count: 0,
          words: [],
          lastTime: w.createdAt
        };
      }
      userAttemptsMap[w.userId].count++;
      userAttemptsMap[w.userId].words.push(w.word);
      userAttemptsMap[w.userId].lastTime = w.createdAt;
    }

    const contributorsList = Object.values(userAttemptsMap);

    return {
      active: true,
      todayDate: todayStr,
      totalWords: words.length,
      totalContributors: contributorsList.length,
      words: words.map(w => ({
        id: w.id,
        userId: w.userId,
        username: w.username,
        word: w.word,
        createdAt: w.createdAt
      })),
      contributors: contributorsList,
      latestStory: latestStory ? {
        id: latestStory.id,
        title: latestStory.title,
        storyText: latestStory.storyText,
        imageUrl: latestStory.imageUrl,
        mvpUserId: latestStory.mvpUserId,
        mvpUsername: latestStory.mvpUsername,
        mvpReason: latestStory.mvpReason,
        contributorCount: latestStory.contributorCount,
        dateStr: latestStory.dateStr,
        createdAt: latestStory.createdAt
      } : null
    };
  } catch (err) {
    logger.error(`Error fetching today story status for ${guildId}:`, err);
    return { active: false };
  }
}
