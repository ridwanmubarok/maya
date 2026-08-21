import { Client } from "discord.js";
import { startDailyPollForGuild } from "./dailyPollManager";
import { prisma } from "./database";
import { logger } from "../utils/logger";

let dailyPollSchedulerInitialized = false;

// In-memory lookup cache
const lastPollPostMap = new Map<string, string>();

/**
 * Initialize Automatic Daily AI Poll Scheduler (WIB Timezone)
 */
export function initDailyPollScheduler(client: Client) {
  if (dailyPollSchedulerInitialized) return;
  dailyPollSchedulerInitialized = true;

  logger.info("DailyPollScheduler: Initialized automatic daily AI poll timer (WIB Timezone).");

  // Check every 1 minute (do NOT trigger duplicate on startup)
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

      const alreadyPostedPollToday = config?.lastPollPostDate === dateStr || lastPollPostMap.get(guildId) === dateStr;
      if (wibHour === pollPostHour && !alreadyPostedPollToday) {
        lastPollPostMap.set(guildId, dateStr);
        await prisma.guildConfig.update({
          where: { guildId },
          data: { lastPollPostDate: dateStr }
        }).catch(() => {});

        logger.info(`DailyPollScheduler: Triggering daily AI poll for ${guild.name} at ${wibHour}:00 WIB`);
        await startDailyPollForGuild(guild, config?.dailyPollChannelId || undefined);
      }
    } catch (e) {
      logger.error(`DailyPollScheduler: Error processing schedule for ${guild.name}:`, e);
    }
  }
}
