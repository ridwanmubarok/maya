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
 * Handle incoming messages in the story channel
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

    // 1. Enforce 1-word limit per message (no whitespace, spaces, or linebreaks)
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length !== 1) {
      const warnMsg = await message.reply("⚠️ Di channel ini hanya boleh menulis **1 kata per pesan**! Pesan kamu telah dihapus.").catch(() => null);
      await message.delete().catch(() => {});
      if (warnMsg) setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
      return;
    }

    const singleWord = words[0];
    const todayStr = new Date().toISOString().split("T")[0];

    // 2. Anti-consecutive-posting (User cannot write 2 words in a row consecutively)
    const lastWord = await prisma.dailyStoryWord.findFirst({
      where: { guildId, dateStr: todayStr },
      orderBy: { id: "desc" }
    });

    if (lastWord && lastWord.userId === message.author.id) {
      const warnMsg = await message.reply("⏳ Harap tunggu member lain menulis kata berikutnya baru giliranmu lagi! Pesan kamu telah dihapus.").catch(() => null);
      await message.delete().catch(() => {});
      if (warnMsg) setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
      return;
    }

    // 3. Enforce 2-attempt daily limit per member
    const userWordCount = await prisma.dailyStoryWord.count({
      where: { guildId, dateStr: todayStr, userId: message.author.id }
    });

    if (userWordCount >= 2) {
      const warnMsg = await message.reply("🎉 Kamu sudah menggunakan **2 kesempatan menulis hari ini**! Sesi kamu hari ini sudah selesai. Pesan kamu telah dihapus.").catch(() => null);
      await message.delete().catch(() => {});
      if (warnMsg) setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
      return;
    }

    // Save word to database
    await prisma.dailyStoryWord.create({
      data: {
        guildId,
        userId: message.author.id,
        username: message.author.displayName || message.author.username,
        word: singleWord,
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

    // React with 👍 on valid word message
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
    const mvpRewardAmount = config?.storyMvpReward ?? 100;

    const embed = new EmbedBuilder()
      .setTitle("📖 MAYA DONGENG BERSAMBUNG HARI INI")
      .setColor("#5865F2")
      .setDescription(
        "Sesi kolaborasi menulis cerita bersama member lain hari ini telah dibuka!\n\n" +
        "📌 **Aturan Menulis**:\n" +
        `• Tulis **1 kata per pesan** di channel ini.\n` +
        `• Maksimal **2 kata per member** setiap harinya.\n` +
        `• Wajib **gantian** dengan member lain (tidak boleh 2x berurutan).\n` +
        `• Hadiah Langsung: **+${rewardAmount} RTK Point** per kata valid!\n\n` +
        `🏆 **Bonus MVP Pilihan Maya AI**: **+${mvpRewardAmount} RTK Point** untuk kontributor paling konyol/berpengaruh di akhir hari!`
      )
      .setFooter({ text: "Maya Story Engine • Mulai tulis katamu sekarang!" })
      .setTimestamp();

    await targetChannel.send({
      content: "📢 @everyone **MAYA DONGENG BERSAMBUNG HARI INI TELAH DIBUKA!**",
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
 * Compile today's story words, synthesize fairytale via AI, generate AI image, pick MVP automatically & award points
 */
export async function compileDailyStoryForGuild(guild: Guild, configuredChannelId?: string): Promise<boolean> {
  try {
    const todayStr = new Date().toISOString().split("T")[0];
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
        content: "📖 **Maya Dongeng Bersambung**: Sesi hari ini ditutup. Belum ada kata yang disumbangkan oleh member hari ini. Sesi berikutnya dibuka besok!"
      }).catch(() => {});
      return false;
    }

    const rawWordStream = words.map(w => `[User ID: ${w.userId}, Name: ${w.username}] -> "${w.word}"`).join("\n");
    const mvpReward = config?.storyMvpReward ?? 100;

    // AI Synthesis & Automatic MVP Selection
    const prompt = `Berikut adalah urutan kata-kata yang ditulis oleh para member Discord hari ini secara bergantian:

${rawWordStream}

TUGAS KAMU SEBAGAI MAYA AI:
1. Rangkailah kata-kata konyol di atas menjadi sebuah **Dongeng Komedi Singkat yang Utuh, Lucu, Konyol, dan Menghibur khas Indonesia** (1-2 paragraf).
2. BERDASARKAN KEHENDAK DAN PENILAIAN MU, pilihlah 1 MEMBER yang kata-katanya paling konyol, paling kocak, atau paling berpengaruh mengubah alur cerita sebagai **MVP / Kontributor Terbaik Hari Ini**.
3. Buatkan prompt gambar dalam Bahasa Inggris untuk menghasilkan ilustrasi AI visual dari adegan dongeng tersebut.

SYARAT PENTING:
- DILARANG menggunakan banyak emoji keyboard lebay! Maksimal 1 emoji di judul.
- Format Output HARUS JSON murni tanpa markdown codeblock:
{
  "title": "Judul Dongeng Komedi",
  "storyText": "Teks dongeng komedi utuh di sini...",
  "mvpUserId": "User ID member pilihanmu",
  "mvpUsername": "Nama member pilihanmu",
  "mvpReason": "Alasan lucu kenapa Maya AI memilih dia sebagai MVP",
  "imagePrompt": "A humorous 3D digital art illustration of [scene description]"
}`;

    let title = "Kisah Konyol Warga Server";
    let storyText = words.map(w => w.word).join(" ");
    let mvpUserId = words[0].userId;
    let mvpUsername = words[0].username;
    let mvpReason = "Kata-katanya menjadi pembuka kisah yang tak terduga!";
    let imagePrompt = "A funny cartoon illustration of a funny fantasy adventure";

    try {
      const rawAi = await askNvidia(prompt, "Kamu adalah Maya, AI penutur cerita humoris yang kreatif dan adil.");
      const cleaned = rawAi.replace(/```json/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned);

      if (parsed.title) title = parsed.title;
      if (parsed.storyText) storyText = parsed.storyText;
      if (parsed.mvpUserId) mvpUserId = parsed.mvpUserId;
      if (parsed.mvpUsername) mvpUsername = parsed.mvpUsername;
      if (parsed.mvpReason) mvpReason = parsed.mvpReason;
      if (parsed.imagePrompt) imagePrompt = parsed.imagePrompt;
    } catch (err) {
      logger.error("Error synthesizing story via AI, using fallback:", err);
    }

    // Generate AI Illustration Image
    let imageUrl: string | undefined = undefined;
    try {
      const imgRes = await generateFreeImage(imagePrompt, "Digital Art");
      if (imgRes && imgRes.imageUrl) {
        imageUrl = imgRes.imageUrl;
      }
    } catch (_) {}

    // Award +100 RTK Points to MVP
    if (mvpUserId && mvpReward > 0) {
      await prisma.triviaScore.upsert({
        where: { guildId_userId: { guildId: guild.id, userId: mvpUserId } },
        update: {
          score: { increment: mvpReward },
          dailyScore: { increment: mvpReward },
          lastDailyDate: todayStr
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
      .setTitle(`📖 MAYA DONGENG BERSAMBUNG • ${todayStr}`)
      .setColor("#5865F2")
      .setDescription(
        `### ${title}\n` +
        `> *${storyText}*\n\n` +
        `🏆 **MVP Kontributor Terbaik Pilihan Maya AI**:\n` +
        `<@${mvpUserId}> (**${mvpUsername}**) — **+${mvpReward} RTK Point**\n` +
        `*Alasan Maya AI*: "${mvpReason}"\n\n` +
        `👥 **Total Kontributor**: **${uniqueUserIds.size} Member** (${words.length} Kata)`
      )
      .setFooter({ text: "Maya Story Engine • Terima kasih telah berkolaborasi hari ini!" })
      .setTimestamp();

    if (imageUrl) {
      embed.setImage(imageUrl);
    }

    await targetChannel.send({
      content: "📢 @everyone **DONGENG KOMEDI SERVER HARI INI TELAH DIRENDER!** 🎉",
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
    const todayStr = new Date().toISOString().split("T")[0];
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
