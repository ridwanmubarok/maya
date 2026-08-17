import { Client } from "discord.js";
import { startDailyPollForGuild } from "./dailyPollManager";
import { prisma } from "./database";
import { logger } from "../utils/logger";

let dailyPollSchedulerInitialized = false;

// Memory tracker to prevent duplicate poll posts on the same date per guild
const lastPollPostMap = new Map<string, string>();

/**
 * Initialize Automatic Daily AI Poll Scheduler (WIB Timezone)
 */
export function initDailyPollScheduler(client: Client) {
  if (dailyPollSchedulerInitialized) return;
  dailyPollSchedulerInitialized = true;

  logger.info("DailyPollScheduler: Initialized automatic daily AI poll timer (WIB Timezone).");

  // Run initial check on startup
  processScheduledPolls(client).catch((err) =>
    logger.error("DailyPollScheduler: Startup check error:", err)
  );

  // Check every 1 minute
  setInterval(async () => {
    await processScheduledPolls(client);
  }, 60000);
}

/**
 * Get current WIB (UTC+7) hour and date string (YYYY-MM-DD)
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

async function processScheduledPolls(client: Client) {
  const { wibHour, dateStr } = getWibDateTime();
  const guilds = client.guilds.cache;

  for (const [guildId, guild] of guilds) {
    try {
      const config = await prisma.guildConfig.findUnique({ where: { guildId } });
      if (config && config.dailyPollEnabled === false) {
        continue; // Disabled by admin in web dashboard
      }

      const pollPostHour = config?.dailyPollPostHour ?? 10; // Default 10:00 AM WIB

      if (wibHour === pollPostHour && lastPollPostMap.get(guildId) !== dateStr) {
        lastPollPostMap.set(guildId, dateStr);
        logger.info(`DailyPollScheduler: Triggering daily AI poll for ${guild.name} at ${wibHour}:00 WIB`);
        await startDailyPollForGuild(guild, config?.dailyPollChannelId || undefined);
      }
    } catch (e) {
      logger.error(`DailyPollScheduler: Error processing schedule for ${guild.name}:`, e);
    }
  }
}
