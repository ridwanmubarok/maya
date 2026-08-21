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

  logger.info("DailyStoryScheduler: Schedulers started for Maya Story Chain.");

  // Check every 60 seconds (do NOT trigger duplicate on startup)
  schedulerInterval = setInterval(() => {
    checkAndTriggerDailyStory(client).catch((err) => {
      logger.error("DailyStoryScheduler: Error checking schedule:", err);
    });
  }, 60000);
}

/**
 * Check WIB Time & trigger start / end sessions for enabled guilds
 */
async function checkAndTriggerDailyStory(client: Client) {
  // Get current WIB time (Asia/Jakarta)
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  };

  const timeFormatter = new Intl.DateTimeFormat("id-ID", options);
  const timeString = timeFormatter.format(now);
  const [currentHourStr] = timeString.split(":");
  const currentHour = parseInt(currentHourStr, 10);
  const dateStr = now.toISOString().split("T")[0];

  for (const guild of client.guilds.cache.values()) {
    try {
      const config = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });
      if (!config || !config.storyEnabled || !config.storyChannelId) continue;

      const startHour = config.storyStartHour ?? 17;
      const publishHour = config.storyPublishHour ?? 20;

      // 1. Trigger Start Announcement (Start Hour) - Checked against DB persistent date
      const startKey = `${guild.id}_${dateStr}_${startHour}`;
      const alreadyStartedToday = config.lastStoryStartDate === dateStr || lastStartTriggerMap[startKey];
      if (currentHour === startHour && !alreadyStartedToday) {
        lastStartTriggerMap[startKey] = "TRIGGERED";
        await prisma.guildConfig.update({
          where: { guildId: guild.id },
          data: { lastStoryStartDate: dateStr }
        }).catch(() => {});

        logger.info(`DailyStoryScheduler: Triggering Start Announcement for guild ${guild.name}`);
        await announceStorySessionStart(guild, config.storyChannelId);
      }

      // 2. Trigger End Session & AI Compilation (Publish Hour) - Checked against DB persistent date
      const publishKey = `${guild.id}_${dateStr}_${publishHour}`;
      const alreadyPublishedToday = config.lastStoryPublishDate === dateStr || lastPublishTriggerMap[publishKey];
      if (currentHour === publishHour && !alreadyPublishedToday) {
        lastPublishTriggerMap[publishKey] = "TRIGGERED";
        await prisma.guildConfig.update({
          where: { guildId: guild.id },
          data: { lastStoryPublishDate: dateStr }
        }).catch(() => {});

        logger.info(`DailyStoryScheduler: Triggering Story Compilation for guild ${guild.name}`);
        await compileDailyStoryForGuild(guild, config.storyChannelId);
      }

    } catch (err) {
      logger.error(`DailyStoryScheduler: Error processing guild ${guild.name}:`, err);
    }
  }
}
