import { Client } from "discord.js";
import { prisma } from "./database";
import { logger } from "../utils/logger";
import { announceStorySessionStart, compileDailyStoryForGuild } from "./storyManager";

let schedulerInterval: NodeJS.Timeout | null = null;
let lastStartTriggerMap: Record<string, string> = {};
let lastPublishTriggerMap: Record<string, string> = {};

/**
 * Initialize Daily Story Scheduler
 */
export function initDailyStoryScheduler(client: Client) {
  if (schedulerInterval) clearInterval(schedulerInterval);

  logger.info("DailyStoryScheduler: Schedulers started for Maya Story Chain (WIB Timezone).");

  // Check every 60 seconds (do NOT trigger duplicate on startup)
  schedulerInterval = setInterval(() => {
    checkAndTriggerDailyStory(client).catch((err) => {
      logger.error("DailyStoryScheduler: Error checking schedule:", err);
    });
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

/**
 * Check WIB Time & trigger start / end sessions for enabled guilds
 */
async function checkAndTriggerDailyStory(client: Client) {
  const { wibHour, dateStr } = getWibDateTime();

  for (const guild of client.guilds.cache.values()) {
    try {
      const config = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });
      if (!config || !config.storyEnabled || !config.storyChannelId) continue;

      const startHour = config.storyStartHour ?? 17;
      const publishHour = config.storyPublishHour ?? 20;

      // 1. Trigger Start Announcement (Start Hour) - Checked against DB persistent date & in-memory cache
      const startKey = `${guild.id}_${dateStr}_${startHour}`;
      const alreadyStartedToday = config.lastStoryStartDate === dateStr || lastStartTriggerMap[startKey];
      if (wibHour === startHour && !alreadyStartedToday) {
        lastStartTriggerMap[startKey] = "TRIGGERED";
        await prisma.guildConfig.update({
          where: { guildId: guild.id },
          data: { lastStoryStartDate: dateStr }
        }).catch(() => {});

        logger.info(`DailyStoryScheduler: Triggering Start Announcement for guild ${guild.name} at ${wibHour}:00 WIB`);
        await announceStorySessionStart(guild, config.storyChannelId);
      }

      // 2. Trigger End Session & AI Compilation (Publish Hour) - Checked against DB persistent date & in-memory cache
      const publishKey = `${guild.id}_${dateStr}_${publishHour}`;
      const alreadyPublishedToday = config.lastStoryPublishDate === dateStr || lastPublishTriggerMap[publishKey];
      if (wibHour === publishHour && !alreadyPublishedToday) {
        lastPublishTriggerMap[publishKey] = "TRIGGERED";
        await prisma.guildConfig.update({
          where: { guildId: guild.id },
          data: { lastStoryPublishDate: dateStr }
        }).catch(() => {});

        logger.info(`DailyStoryScheduler: Triggering Story Compilation for guild ${guild.name} at ${wibHour}:00 WIB`);
        await compileDailyStoryForGuild(guild, config.storyChannelId);
      }

    } catch (err) {
      logger.error(`DailyStoryScheduler: Error processing guild ${guild.name}:`, err);
    }
  }
}
