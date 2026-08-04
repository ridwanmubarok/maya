import { prisma } from "./database";
import { logger } from "../utils/logger";

export interface AnalyticsSummary {
  summary: {
    memberJoins7d: number;
    totalCommands7d: number;
    peakHourWib: string;
    totalMenfess: number;
    totalTriviaScores: number;
    totalWarnings: number;
  };
  dailyJoins: Array<{ date: string; count: number }>;
  topCommands: Array<{ command: string; count: number }>;
  hourlyActivity: Array<{ hour: string; count: number }>;
  featureBreakdown: Array<{ feature: string; count: number }>;
}

export async function getGuildAnalytics(guildId: string): Promise<AnalyticsSummary> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  try {
    // 1. Fetch member joins in the last 7 days
    const joinLogs = await prisma.analyticsLog.findMany({
      where: {
        guildId,
        eventType: "MEMBER_JOIN",
        createdAt: { gte: sevenDaysAgo }
      }
    });

    // 2. Fetch command executions in the last 7 days
    const commandLogs = await prisma.analyticsLog.findMany({
      where: {
        guildId,
        eventType: "COMMAND_EXEC",
        createdAt: { gte: sevenDaysAgo }
      }
    });

    // 3. Fetch all hourly logs (message sent + commands + joins) in last 7 days for peak hour calculation
    const allLogs7d = await prisma.analyticsLog.findMany({
      where: {
        guildId,
        createdAt: { gte: sevenDaysAgo }
      }
    });

    // 4. Feature totals from existing tables
    const totalMenfess = await prisma.menfessLog.count({ where: { guildId } });
    const totalTriviaScores = await prisma.triviaScore.count({ where: { guildId } });
    const totalWarnings = await prisma.warnLog.count({ where: { guildId } });
    const aiChatCount = await prisma.aiChatMessage.count({ where: { guildId } });

    // Aggregate daily member joins (last 7 days)
    const dailyJoinsMap: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
      dailyJoinsMap[dateStr] = 0;
    }

    joinLogs.forEach((log) => {
      const dateStr = log.createdAt.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
      if (dailyJoinsMap[dateStr] !== undefined) {
        dailyJoinsMap[dateStr]++;
      }
    });

    const dailyJoins = Object.entries(dailyJoinsMap).map(([date, count]) => ({ date, count }));

    // Aggregate top commands
    const commandCountMap: Record<string, number> = {};
    commandLogs.forEach((log) => {
      const cmdName = log.eventName ? `/${log.eventName}` : "/lainnya";
      commandCountMap[cmdName] = (commandCountMap[cmdName] || 0) + 1;
    });

    // Fallback default sample data if no slash commands have been executed yet
    if (Object.keys(commandCountMap).length === 0) {
      commandCountMap["/tebak"] = totalTriviaScores;
      commandCountMap["/menfess"] = totalMenfess;
      commandCountMap["/lirik"] = 1;
      commandCountMap["/makna"] = 1;
    }

    const topCommands = Object.entries(commandCountMap)
      .map(([command, count]) => ({ command, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Aggregate hourly activity (00:00 to 23:00 WIB)
    const hourlyCounts = Array(24).fill(0);
    allLogs7d.forEach((log) => {
      if (log.hour >= 0 && log.hour < 24) {
        hourlyCounts[log.hour]++;
      }
    });

    let peakHourIndex = 20; // Default peak hour 20:00 WIB
    let maxHourlyCount = -1;
    hourlyCounts.forEach((cnt, idx) => {
      if (cnt > maxHourlyCount) {
        maxHourlyCount = cnt;
        peakHourIndex = idx;
      }
    });

    const peakHourWib = `${String(peakHourIndex).padStart(2, "0")}:00 - ${String((peakHourIndex + 1) % 24).padStart(2, "0")}:00 WIB`;

    const hourlyActivity = hourlyCounts.map((count, i) => ({
      hour: `${String(i).padStart(2, "0")}:00`,
      count
    }));

    // Feature breakdown
    const featureBreakdown = [
      { feature: "Tebak-Tebakan", count: totalTriviaScores },
      { feature: "AI Menfess", count: totalMenfess },
      { feature: "AI Chat / Ask", count: aiChatCount },
      { feature: "Automod Warning", count: totalWarnings },
      { feature: "Lainnya", count: commandLogs.length }
    ];

    return {
      summary: {
        memberJoins7d: joinLogs.length,
        totalCommands7d: commandLogs.length,
        peakHourWib,
        totalMenfess,
        totalTriviaScores,
        totalWarnings
      },
      dailyJoins,
      topCommands,
      hourlyActivity,
      featureBreakdown
    };
  } catch (error) {
    logger.error("Error generating guild analytics:", error);
    return {
      summary: {
        memberJoins7d: 0,
        totalCommands7d: 0,
        peakHourWib: "20:00 - 21:00 WIB",
        totalMenfess: 0,
        totalTriviaScores: 0,
        totalWarnings: 0
      },
      dailyJoins: [],
      topCommands: [],
      hourlyActivity: [],
      featureBreakdown: []
    };
  }
}
