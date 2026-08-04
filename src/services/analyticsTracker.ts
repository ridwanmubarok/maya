import { prisma } from "./database";
import { logger } from "../utils/logger";

export type AnalyticsEventType = "MEMBER_JOIN" | "COMMAND_EXEC" | "MESSAGE_SENT";

/**
 * Mencatat event analytics ke database secara background non-blocking.
 */
export async function trackAnalyticsEvent(
  guildId: string,
  eventType: AnalyticsEventType,
  eventName?: string
): Promise<void> {
  try {
    const now = new Date();
    // Hitung jam dalam WIB (UTC+7)
    const wibHour = (now.getUTCHours() + 7) % 24;

    await prisma.analyticsLog.create({
      data: {
        guildId,
        eventType,
        eventName: eventName || null,
        hour: wibHour
      }
    });
  } catch (error) {
    logger.error(`Error tracking analytics event [${eventType}]:`, error);
  }
}
