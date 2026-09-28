import { Client } from "discord.js";
import { prisma } from "./database";
import { logger } from "../utils/logger";
import {
  getWibDateInfo,
  setSeasonManagerClient,
  sendDay1Announcement,
  sendDay3RedeemOpenNotification,
  sendDay5LastCallNotification,
  archiveAndResetSeason,
  pickMonthlyGoldenCandidates,
  evaluateAndRotateGoldenCandidates,
} from "./monthlySeasonManager";

let monthlySchedulerInitialized = false;

/**
 * Initialize automatic monthly season scheduler
 * - Tanggal 1: Evaluasi & Pengumuman 2 Golden Candidates (10:00 WIB)
 * - Tanggal 3: Pembukaan Resmi Periode Redeem /shop (10:00 WIB)
 * - Tanggal 5: Peringatan Hari Terakhir Penukaran (10:00 WIB)
 * - Tanggal 5 (23:59 WIB): Penutupan Redeem, Season Archive, & Reset Poin ke 0
 */
export function initMonthlyResetScheduler(client: Client) {
  if (monthlySchedulerInitialized) return;
  monthlySchedulerInitialized = true;
  setSeasonManagerClient(client);

  logger.info("MonthlyResetScheduler: Initialized automatic monthly season scheduler (WIB Timezone - Cycle: Tgl 1 Announcement, Tgl 3 Open, Tgl 5 Close & Reset).");

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

      // Periodically evaluate and silently rotate inactive Golden Candidates (every 30 mins)
      if (dateInfo.minute % 30 === 0) {
        await evaluateAndRotateGoldenCandidates(client, guildId);
      }

      // 1. Tanggal 1 Alert (Evaluasi & Pengumuman Golden Candidates pada jam >= 10:00 WIB)
      if (dateInfo.day === 1 && dateInfo.hour >= 10 && config.lastMonthlyAnnouncementDate !== dateInfo.dateStr) {
        logger.info(`MonthlyResetScheduler: Triggering Day 1 Golden Candidate announcement for guild ${guildId}...`);
        await sendDay1Announcement(client, guildId);
      }

      // 2. Tanggal 3 Alert (Pembukaan Resmi Periode Redeem pada jam >= 10:00 WIB)
      if (dateInfo.day === 3 && dateInfo.hour >= 10 && config.lastMonthlyRedeemOpenDate !== dateInfo.dateStr) {
        logger.info(`MonthlyResetScheduler: Triggering Day 3 Redeem Open notification for guild ${guildId}...`);
        await sendDay3RedeemOpenNotification(client, guildId);
      }

      // 3. Tanggal 5 Pagi Alert (Peringatan Hari Terakhir Penukaran pada jam >= 10:00 WIB)
      if (dateInfo.day === 5 && dateInfo.hour >= 10 && config.lastMonthlyRedeemClosingDate !== dateInfo.dateStr) {
        logger.info(`MonthlyResetScheduler: Triggering Day 5 Closing Warning for guild ${guildId}...`);
        await sendDay5LastCallNotification(client, guildId);
      }

      // 4. Tanggal 5 Malam (23:50+) atau Tanggal 6 Dini Hari (00:00-00:30): Penutupan Redeem & Reset Poin ke 0
      const isResetWindow =
        (dateInfo.day === 5 && dateInfo.hour === 23 && dateInfo.minute >= 50) ||
        (dateInfo.day === 6 && dateInfo.hour === 0 && dateInfo.minute <= 30);

      if (isResetWindow && config.lastMonthlyResetDate !== dateInfo.dateStr) {
        logger.info(`MonthlyResetScheduler: Triggering Season Reset & Archive (End of Day 5) for guild ${guildId}...`);
        await archiveAndResetSeason(client, guildId);
      }
    } catch (err) {
      logger.error(`MonthlyResetScheduler: Error processing guild ${guildId}:`, err);
    }
  }
}
