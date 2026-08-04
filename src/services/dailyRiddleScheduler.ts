import { Client, TextChannel, EmbedBuilder } from "discord.js";
import { tebakManager } from "./tebakManager";
import { prisma } from "./database";
import { logger } from "../utils/logger";

let dailySchedulerInitialized = false;

// Memory tracker to prevent duplicate broadcasts on the same date per guild
const lastRiddlePostMap = new Map<string, string>();
const lastLeaderboardPostMap = new Map<string, string>();

/**
 * Initialize Automatic Daily Riddle Scheduler & Evening Leaderboard Broadcast
 */
export function initDailyRiddleScheduler(client: Client) {
  if (dailySchedulerInitialized) return;
  dailySchedulerInitialized = true;

  logger.info("DailyRiddleScheduler: Initialized automatic daily riddle background timer (WIB Timezone).");

  // Run initial check immediately on startup
  processScheduledBroadcasts(client).catch((err) =>
    logger.error("DailyRiddleScheduler: Initial startup check error:", err)
  );

  // Check every 1 minute for exact time precision
  setInterval(async () => {
    await processScheduledBroadcasts(client);
  }, 60000);
}

/**
 * Get current WIB (UTC+7) hour and date string (YYYY-MM-DD)
 */
function getWibDateTime() {
  const now = new Date();
  // WIB is UTC+7
  const wibTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const wibHour = wibTime.getUTCHours();
  const dateStr = wibTime.toISOString().split("T")[0]; // "YYYY-MM-DD"
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

      // 1. Check if it's time to post Daily Riddle (WIB) and not posted today yet
      if (wibHour === riddlePostHour && lastRiddlePostMap.get(guildId) !== dateStr) {
        lastRiddlePostMap.set(guildId, dateStr);
        logger.info(`DailyRiddleScheduler: Triggering daily riddle for ${guild.name} at ${wibHour}:00 WIB`);
        await broadcastDailyRiddlesForGuild(guild, config?.dailyRiddleChannelId || undefined);
      }

      // 2. Check if it's time to post Evening Daily Leaderboard (WIB) and not posted today yet
      if (wibHour === leaderboardPostHour && lastLeaderboardPostMap.get(guildId) !== dateStr) {
        lastLeaderboardPostMap.set(guildId, dateStr);
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
export async function broadcastDailyRiddlesForGuild(guild: any, configuredChannelId?: string) {
  try {
    let targetChannel: TextChannel | null = null;

    if (configuredChannelId) {
      targetChannel = (guild.channels.cache.get(configuredChannelId) || (await guild.channels.fetch(configuredChannelId).catch(() => null))) as TextChannel;
    }

    if (!targetChannel) {
      targetChannel =
        guild.systemChannel ||
        (guild.channels.cache.find(
          (c: any) => c.isTextBased() && (c.name.includes("general") || c.name.includes("chat") || c.name.includes("main") || c.name.includes("tebak"))
        ) as TextChannel);
    }

    if (targetChannel && "send" in targetChannel) {
      await tebakManager.startDailyRiddleSession(targetChannel, guild.id);
    } else {
      logger.warn(`DailyRiddleScheduler: Channel target daily riddle tidak ditemukan di ${guild.name}`);
    }
  } catch (e) {
    logger.error(`DailyRiddleScheduler: Error broadcasting riddle to guild ${guild.name}:`, e);
  }
}

/**
 * Broadcast Daily Leaderboard Summary to a specific guild
 */
export async function broadcastDailyLeaderboardsForGuild(guild: any, configuredChannelId?: string) {
  try {
    const leaderboard = await tebakManager.getDailyLeaderboard(guild.id);
    if (!leaderboard || leaderboard.length === 0) return;

    let targetChannel: TextChannel | null = null;

    if (configuredChannelId) {
      targetChannel = (guild.channels.cache.get(configuredChannelId) || (await guild.channels.fetch(configuredChannelId).catch(() => null))) as TextChannel;
    }

    if (!targetChannel) {
      targetChannel =
        guild.systemChannel ||
        (guild.channels.cache.find(
          (c: any) => c.isTextBased() && (c.name.includes("general") || c.name.includes("chat") || c.name.includes("main") || c.name.includes("tebak"))
        ) as TextChannel);
    }

    if (targetChannel && "send" in targetChannel) {
      const embed = new EmbedBuilder()
        .setTitle(`🏆 KLASEMEN LEADERBOARD HARIAN • ${guild.name}`)
        .setDescription("Berikut adalah daftar member paling aktif & berprestasi pada Tebak-Tebakan Harian hari ini:")
        .setColor("#10B981")
        .setFooter({ text: "Maya Trivia Engine • Klasemen Harian Reset Setiap Malam" })
        .setTimestamp();

      let text = "";
      leaderboard.forEach((entry, index) => {
        const rank = index + 1;
        const rankPrefix = rank === 1 ? "🥇 (Juara 1 Hari Ini)" : rank === 2 ? "🥈 (Juara 2 Hari Ini)" : rank === 3 ? "🥉 (Juara 3 Hari Ini)" : `${rank}`;
        text += `**${rankPrefix}**. <@${entry.userId}> — **${entry.dailyScore} Poin Harian**\n`;
      });

      embed.addFields({ name: "Papan Peringkat Harian", value: text });

      await targetChannel.send({
        content: "@everyone @here **Pengumuman Pemenang Klasemen Tebak-Tebakan Harian Hari Ini!** 🎉",
        embeds: [embed],
      });
    }
  } catch (e) {
    logger.error(`DailyRiddleScheduler: Error broadcasting daily leaderboard to guild ${guild.name}:`, e);
  }
}
