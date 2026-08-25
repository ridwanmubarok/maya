import { Client } from "discord.js";
import { prisma } from "./database";
import { logger } from "../utils/logger";
import { announcePantunSessionStart, closeAndEvaluateDailyPantun } from "./pantunManager";

let schedulerInterval: NodeJS.Timeout | null = null;
let lastStartTriggerMap: Record<string, string> = {};
let lastCloseTriggerMap: Record<string, string> = {};

/**
 * Initialize Daily Pantun Scheduler
 */
export function initDailyPantunScheduler(client: Client) {
  if (schedulerInterval) clearInterval(schedulerInterval);

  logger.info("DailyPantunScheduler: Scheduler started for Maya Lanjutkan Pantun (WIB Timezone).");

  // Check every 60 seconds (Anti-duplicate safe on restart/redeploy)
  schedulerInterval = setInterval(() => {
    checkAndTriggerDailyPantun(client).catch((err) => {
      logger.error("DailyPantunScheduler: Error checking schedule:", err);
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
 * Check WIB Time & trigger start (09:00 WIB) / close (23:00 WIB) sessions
 */
async function checkAndTriggerDailyPantun(client: Client) {
  const { wibHour, dateStr } = getWibDateTime();

  for (const guild of client.guilds.cache.values()) {
    try {
      const config = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });
      if (!config || !config.pantunEnabled || !config.pantunChannelId) continue;

      const startHour = config.pantunStartHour ?? 9;
      const closeHour = config.pantunCloseHour ?? 23;

      // 1. Trigger Start Announcement (09:00 WIB)
      const startKey = `${guild.id}_${dateStr}_${startHour}`;
      const alreadyStartedToday = config.lastPantunStartDate === dateStr || lastStartTriggerMap[startKey];
      if (wibHour === startHour && !alreadyStartedToday) {
        lastStartTriggerMap[startKey] = "TRIGGERED";
        await prisma.guildConfig.update({
          where: { guildId: guild.id },
          data: { lastPantunStartDate: dateStr }
        }).catch(() => {});

        logger.info(`DailyPantunScheduler: Triggering Pantun Session Start for guild ${guild.name} at ${wibHour}:00 WIB`);
        await announcePantunSessionStart(guild, config.pantunChannelId);
      }

      // 2. Trigger Close Session & MVP Evaluation (23:00 WIB)
      const closeKey = `${guild.id}_${dateStr}_${closeHour}`;
      const alreadyClosedToday = config.lastPantunCloseDate === dateStr || lastCloseTriggerMap[closeKey];
      if (wibHour === closeHour && !alreadyClosedToday) {
        lastCloseTriggerMap[closeKey] = "TRIGGERED";
        await prisma.guildConfig.update({
          where: { guildId: guild.id },
          data: { lastPantunCloseDate: dateStr }
        }).catch(() => {});

        logger.info(`DailyPantunScheduler: Triggering Pantun Session Close & MVP Review for guild ${guild.name} at ${wibHour}:00 WIB`);
        await closeAndEvaluateDailyPantun(guild, config.pantunChannelId);
      }

    } catch (err) {
      logger.error(`DailyPantunScheduler: Error processing guild ${guild.name}:`, err);
    }
  }
}
