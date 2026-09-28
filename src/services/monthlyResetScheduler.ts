import { Client } from "discord.js";
import { prisma } from "./database";
import { logger } from "../utils/logger";
import {
  getWibDateInfo,
  sendH5Notification,
  sendH3Notification,
  archiveAndResetSeason,
  pickMonthlyGoldenCandidates,
} from "./monthlySeasonManager";

let monthlySchedulerInitialized = false;

/**
 * Initialize automatic monthly season scheduler
 * - H-5 alert to @amubhya and 3 golden candidates (10:00 WIB)
 * - H-3 public broadcast (10:00 WIB)
 * - Month-end season archive and point reset to 0 (23:59 WIB)
 */
export function initMonthlyResetScheduler(client: Client) {
  if (monthlySchedulerInitialized) return;
  monthlySchedulerInitialized = true;

  logger.info("MonthlyResetScheduler: Initialized automatic monthly season scheduler (WIB Timezone).");

  // Initial check on startup
  checkMonthlySeasonTriggers(client).catch((err) => {
    logger.error("MonthlyResetScheduler: Error during initial check:", err);
  });

  // Run periodic checks every 1 minute
  setInterval(async () => {
    try {
      await checkMonthlySeasonTriggers(client);
    } catch (error) {
      logger.error("MonthlyResetScheduler: Error processing monthly season triggers:", error);
    }
  }, 60000);
}

async function checkMonthlySeasonTriggers(client: Client) {
  const dateInfo = getWibDateInfo();
  const guilds = client.guilds.cache;

  for (const [guildId] of guilds) {
    try {
      const config = await prisma.guildConfig.findUnique({ where: { guildId } });
      if (!config || config.monthlyResetEnabled === false) {
        continue;
      }

      // Evaluate Golden Candidates only when reaching the redeem window (H-5 onwards)
      let candidates: string[] = [];
      try {
        candidates = JSON.parse(config.goldenCandidateIds || "[]");
      } catch (_) {}

      // If we are at or after H-5 (last 5 days) and candidates have not been evaluated, pick the 2 most active
      if (dateInfo.daysRemaining <= 5 && candidates.length < 2) {
        logger.info(`MonthlyResetScheduler: Mengevaluasi keaktifan member & memilih 2 Golden Candidates untuk guild ${guildId}...`);
        candidates = await pickMonthlyGoldenCandidates(client, guildId, true);
      }

      // 1. H-5 Alert (at or after 10:00 WIB)
      if (dateInfo.daysRemaining === 5 && dateInfo.hour >= 10 && config.lastMonthlyWarningH5Date !== dateInfo.dateStr) {
        logger.info(`MonthlyResetScheduler: Triggering H-5 warning for guild ${guildId}...`);
        await sendH5Notification(client, guildId);
      }

      // 2. H-3 Alert (at or after 10:00 WIB)
      if (dateInfo.daysRemaining === 3 && dateInfo.hour >= 10 && config.lastMonthlyWarningH3Date !== dateInfo.dateStr) {
        logger.info(`MonthlyResetScheduler: Triggering H-3 warning for guild ${guildId}...`);
        await sendH3Notification(client, guildId);
      }

      // 3. Month-End Season Archive & Point Reset
      // Trigger at 23:55+ WIB on last day of month OR 00:00-00:30 WIB on 1st day of next month
      const isMonthEndWindow =
        (dateInfo.isLastDay && dateInfo.hour === 23 && dateInfo.minute >= 50) ||
        (dateInfo.day === 1 && dateInfo.hour === 0 && dateInfo.minute <= 30);

      if (isMonthEndWindow && config.lastMonthlyResetDate !== dateInfo.dateStr) {
        logger.info(`MonthlyResetScheduler: Triggering Month-End Reset & Archive for guild ${guildId}...`);
        await archiveAndResetSeason(client, guildId);
      }
    } catch (err) {
      logger.error(`MonthlyResetScheduler: Error processing guild ${guildId}:`, err);
    }
  }
}
