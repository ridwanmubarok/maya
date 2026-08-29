import { Client, TextChannel, EmbedBuilder } from "discord.js";
import { tebakManager } from "./tebakManager";
import { prisma } from "./database";
import { logger } from "../utils/logger";

let dailySchedulerInitialized = false;

// In-memory quick lookup cache
const lastRiddlePostMap = new Map<string, string>();
const lastLeaderboardPostMap = new Map<string, string>();

/**
 * Initialize Automatic Daily Riddle Scheduler & Evening Leaderboard Broadcast
 */
export function initDailyRiddleScheduler(client: Client) {
  if (dailySchedulerInitialized) return;
  dailySchedulerInitialized = true;

  logger.info("DailyRiddleScheduler: Initialized automatic daily riddle background timer (WIB Timezone).");

  // Check every 1 minute for exact time precision (do NOT trigger duplicate on startup)
  setInterval(async () => {
    await processScheduledBroadcasts(client);
  }, 60000);
}

/**
 * Get current WIB (UTC+7) hour and date string (YYYY-MM-DD) natively
 */
function getWibDateTime() {
  const now = new Date();
  const wibHour = parseInt(
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", hour: "numeric", hour12: false }).format(now),
    10
  );
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  const dateStr = `${year}-${month}-${day}`;
  return { wibHour, dateStr };
}

async function processScheduledBroadcasts(client: Client) {
  const { wibHour, dateStr } = getWibDateTime();
  const guilds = client.guilds.cache;

  for (const [guildId, guild] of guilds) {
    try {
      const config = await prisma.guildConfig.findUnique({ where: { guildId } });
      if (config && config.dailyRiddleEnabled === false) {
        continue; // Disabled by admin in web dashboard
      }

      const riddlePostHour = config?.dailyRiddlePostHour ?? 9;
      const leaderboardPostHour = config?.dailyLeaderboardPostHour ?? 21;

      // 1. Check if it's time to post Daily Riddle (WIB) and not posted today yet (both in memory and persistent DB)
      const alreadyPostedRiddleToday = config?.lastRiddlePostDate === dateStr || lastRiddlePostMap.get(guildId) === dateStr;
      if (wibHour === riddlePostHour && !alreadyPostedRiddleToday) {
        lastRiddlePostMap.set(guildId, dateStr);
        await prisma.guildConfig.update({
          where: { guildId },
          data: { lastRiddlePostDate: dateStr }
        }).catch(() => {});

        logger.info(`DailyRiddleScheduler: Triggering daily riddle for ${guild.name} at ${wibHour}:00 WIB`);
        await broadcastDailyRiddlesForGuild(guild, config?.dailyRiddleChannelId || undefined);
      }

      // 2. Check if it's time to post Evening Daily Leaderboard (WIB) and not posted today yet
      const alreadyPostedLeaderboardToday = config?.lastLeaderboardPostDate === dateStr || lastLeaderboardPostMap.get(guildId) === dateStr;
      if (wibHour === leaderboardPostHour && !alreadyPostedLeaderboardToday) {
        lastLeaderboardPostMap.set(guildId, dateStr);
        await prisma.guildConfig.update({
          where: { guildId },
          data: { lastLeaderboardPostDate: dateStr }
        }).catch(() => {});

        logger.info(`DailyRiddleScheduler: Triggering daily leaderboard for ${guild.name} at ${wibHour}:00 WIB`);
        await broadcastDailyLeaderboardsForGuild(guild, config?.dailyRiddleChannelId || undefined);
      }
    } catch (e) {
      logger.error(`DailyRiddleScheduler: Error processing schedule for ${guild.name}:`, e);
    }
  }
}

/**
 * Broadcast Daily Riddle to a specific guild
 */
export async function broadcastDailyRiddlesForGuild(guild: any, configuredChannelId?: string, force: boolean = false): Promise<boolean> {
  try {
    let targetChannel: TextChannel | null = null;

    if (configuredChannelId) {
      targetChannel = (guild.channels.cache.get(configuredChannelId) || (await guild.channels.fetch(configuredChannelId).catch(() => null))) as TextChannel;
    }

    if (!targetChannel) {
      try {
        const fetchedChannels = await guild.channels.fetch();
        targetChannel = (fetchedChannels.find(
          (c: any) => c && c.isTextBased() && !c.isThread() && (c.name.includes("tebak") || c.name.includes("general") || c.name.includes("chat") || c.name.includes("main"))
        ) || guild.systemChannel) as TextChannel;
      } catch (_) {
        targetChannel = guild.systemChannel as TextChannel;
      }
    }

    if (targetChannel && "send" in targetChannel) {
      if (force) {
        tebakManager.clearChannelSession(targetChannel.id);
      }
      return await tebakManager.startDailyRiddleSession(targetChannel, guild.id);
    } else {
      logger.warn(`DailyRiddleScheduler: Channel target daily riddle tidak ditemukan di ${guild.name}`);
      return false;
    }
  } catch (e) {
    logger.error(`DailyRiddleScheduler: Error broadcasting riddle to guild ${guild.name}:`, e);
    return false;
  }
}

/**
 * Broadcast Evening Daily Leaderboard (Peringkat Jawaban Hari Ini) to a specific guild
 */
export async function broadcastDailyLeaderboardsForGuild(guild: any, configuredChannelId?: string): Promise<boolean> {
  try {
    let targetChannel: TextChannel | null = null;

    if (configuredChannelId) {
      targetChannel = (guild.channels.cache.get(configuredChannelId) || (await guild.channels.fetch(configuredChannelId).catch(() => null))) as TextChannel;
    }

    if (!targetChannel) {
      try {
        const fetchedChannels = await guild.channels.fetch();
        targetChannel = (fetchedChannels.find(
          (c: any) => c && c.isTextBased() && !c.isThread() && (c.name.includes("tebak") || c.name.includes("general") || c.name.includes("chat") || c.name.includes("main"))
        ) || guild.systemChannel) as TextChannel;
      } catch (_) {
        targetChannel = guild.systemChannel as TextChannel;
      }
    }

    if (!targetChannel || !("send" in targetChannel)) {
      logger.warn(`DailyRiddleScheduler: Channel target leaderboard harian tidak ditemukan di ${guild.name}`);
      return false;
    }

    const todayStr = new Date().toISOString().split("T")[0];

    // Fetch top 10 users for dailyQuizScore sorted by highest dailyQuizScore desc, updatedAt asc (first to answer correctly)
    const topDailyUsers = await prisma.triviaScore.findMany({
      where: { guildId: guild.id, lastDailyQuizDate: todayStr, dailyQuizScore: { gt: 0 } },
      orderBy: [{ dailyQuizScore: "desc" }, { updatedAt: "asc" }],
      take: 10,
    });

    const now = new Date();
    const dateFormatted = new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      dateStyle: "full",
    }).format(now);

    const embed = new EmbedBuilder()
      .setTitle("🏆 KLASEMEN HARIAN TEBAK-TEBAKAN MAYA")
      .setDescription(
        `Berikut adalah perolehan skor tebak-tebakan harian member tercepat & terhebat hari ini (**${dateFormatted}**):\n\n` +
        (topDailyUsers.length === 0
          ? "*Belum ada member yang berhasil memecahkan tebak-tebakan hari ini.*"
          : topDailyUsers
              .map((u, index) => {
                const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `**#${index + 1}**`;
                return `${medal} <@${u.userId}> — **${u.dailyQuizScore} RTK Points**`;
              })
              .join("\n")) +
        `\n\n💡 *Skor harian tebak-tebakan dihitung khusus dari jawaban tebakan harian.*`
      )
      .setColor("#EAB308")
      .setFooter({ text: "Maya Daily Trivia Engine • Leaderboard Malam" })
      .setTimestamp();

    await targetChannel.send({
      content: "📢 @everyone **Rekap Klasemen Tebak-Tebakan Harian Maya Hari Ini!** 🎉",
      embeds: [embed],
    });

    logger.info(`DailyRiddleScheduler: Daily leaderboard posted to channel #${targetChannel.name} in ${guild.name}`);
    return true;
  } catch (e) {
    logger.error(`DailyRiddleScheduler: Error broadcasting daily leaderboard to guild ${guild.name}:`, e);
    return false;
  }
}
