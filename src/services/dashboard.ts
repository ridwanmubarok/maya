import express, { Request, Response, NextFunction } from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { MayaClient } from "../types";
import { prisma } from "./database";
import { logger } from "../utils/logger";
import { EmbedBuilder, TextChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { createMabarEmbed, createMabarButtons } from "./mabarManager";
import { getGuildAnalytics } from "./analyticsService";
import { 
  getGuildShopItems, 
  createShopItem, 
  updateShopItem,
  deleteShopItem, 
  getGuildOrders, 
  approveShopOrder, 
  rejectShopOrder 
} from "./shopService";
import { broadcastDailyRiddlesForGuild } from "./dailyRiddleScheduler";
import { startDailyPollForGuild, getLatestPollData } from "./dailyPollManager";
import { announceStorySessionStart, compileDailyStoryForGuild, getTodayStoryStatus } from "./storyManager";
import { announcePantunSessionStart, closeAndEvaluateDailyPantun, getTodayPantunStatus } from "./pantunManager";
import { tebakManager } from "./tebakManager";
import { voiceChatManager } from "./voiceChatManager";
import { sendHistoryAnnouncement, broadcastMayaAdjustmentHistory } from "../utils/historyLogger";
import { AVAILABLE_AI_MODELS, DEFAULT_AI_MODEL } from "./aiClient";
import {
  getGuildJoinRequests,
  actionGuildJoinRequest,
  getPendingGuildMembers,
  approvePendingMember,
  kickPendingMember,
} from "./joinRequestService";
import {
  getWibDateInfo,
  sendDay1Announcement,
  sendDay3RedeemOpenNotification,
  sendDay5LastCallNotification,
  sendH5Notification,
  sendH3Notification,
  archiveAndResetSeason,
  pickMonthlyGoldenCandidates,
  evaluateAndRotateGoldenCandidates,
} from "./monthlySeasonManager";
import { getXpRequiredForNextLevel } from "./levelingManager";
import { bonfireManager } from "./bonfireManager";

const app = express();
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ limit: "25mb", extended: true }));

// Enable CORS headers
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Serve static frontend files
const publicPath = path.join(__dirname, "../public");
app.use(express.static(publicPath));

// Live Landing Page Bonfire Activity System
let ioInstance: Server | null = null;
let globalLandingSparks = 128490;

export interface LandingActivityItem {
  id: string;
  username: string;
  avatar: string;
  action: string;
  time: string;
  type: "spark" | "voice" | "message" | "levelup";
}

let recentServerActivities: LandingActivityItem[] = [];

export function broadcastLandingActivity(activity: {
  username: string;
  avatar?: string;
  action: string;
  type: "spark" | "voice" | "message" | "levelup";
}) {
  const item: LandingActivityItem = {
    id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
    username: activity.username,
    avatar: activity.avatar || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80",
    action: activity.action,
    time: "Baru saja",
    type: activity.type
  };
  recentServerActivities.unshift(item);
  if (recentServerActivities.length > 25) {
    recentServerActivities.pop();
  }
  if (ioInstance) {
    ioInstance.emit("serverActivity", item);
  }
}

// Simple authorization middleware
const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const expectedPassword = process.env.DASHBOARD_PASSWORD || "admin123";

  // Check if token matches
  if (!authHeader || authHeader !== expectedPassword) {
    return res.status(401).json({ error: "Unauthorized. Passcode salah atau kosong." });
  }
  next();
};

export function startDashboard(client: MayaClient) {
  const port = process.env.PORT || 3000;

  bonfireManager.init(client, (state) => {
    if (ioInstance) {
      ioInstance.emit("bonfireUpdate", state);
    }
  });

  // Endpoint to verify passcode
  app.post("/api/auth", (req: Request, res: Response) => {
    const { passcode } = req.body;
    const expectedPassword = process.env.DASHBOARD_PASSWORD || "admin123";

    if (passcode === expectedPassword) {
      return res.json({ success: true, token: passcode });
    } else {
      return res.status(401).json({ error: "Passcode yang Anda masukkan salah." });
    }
  });

  // Fetch all guilds the bot is currently in (Requires Auth)
  app.get("/api/guilds", authMiddleware, (req: Request, res: Response) => {
    try {
      const guilds = client.guilds.cache.map(guild => ({
        id: guild.id,
        name: guild.name,
        icon: guild.iconURL() || null,
        memberCount: guild.memberCount
      }));
      res.json({ guilds });
    } catch (error) {
      logger.error("Error fetching guilds for dashboard:", error);
      res.status(500).json({ error: "Gagal mengambil daftar server." });
    }
  });

  // Fetch configuration for a specific guild (Requires Auth)
  app.get("/api/configs/:guildId", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    try {
      let config: any = null;
      try {
        config = await prisma.guildConfig.findUnique({
          where: { guildId }
        });
      } catch (dbErr) {
        logger.error(`Database fetch error for guild ${guildId}:`, dbErr);
      }

      // If configuration doesn't exist yet, return defaults
      if (!config) {
        config = {
          guildId,
          welcomeChannelId: null,
          moderationLogChannelId: null,
          prefix: "!",
          welcomeTitle: "👋 Selamat Datang!",
          welcomeMessage: "Selamat datang **{username}** di **{guildName}**!\n\nKamu adalah member ke-**{memberCount}** di server ini.\nJangan lupa untuk membaca aturan server dan bersenang-senang!",
          welcomeImage: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1000&auto=format&fit=crop&q=80",
          welcomeThumbnail: true,
          aiPersonality: "Kamu adalah Maya, teman yang seru, cerdas, dan suportif di server Discord ini. Ngobrollah dengan santai, akrab, dan menyenangkan.",
          aiModel: process.env.GEMINI_MODEL || process.env.NVIDIA_MODEL || DEFAULT_AI_MODEL,
          bannedWords: "anjing,babi,bangsat,kontol,memek,goblok,tolol,bajingan",
          maxStrikes: 3,
          muteDuration: 10,
          storyEnabled: true,
          storyChannelId: null,
          storyStartHour: 17,
          storyPublishHour: 20,
          storyWordReward: 10,
          storyMvpReward: 250,
          pantunEnabled: true,
          pantunChannelId: null,
          pantunStartHour: 9,
          pantunCloseHour: 23,
          pantunRewardAmount: 15,
          pantunMvpReward: 150,
          createdAt: new Date(),
          updatedAt: new Date()
        };
      }

      // Pastikan fallback aiModel ada jika null di database
      if (!config.aiModel) {
        config.aiModel = process.env.GEMINI_MODEL || process.env.NVIDIA_MODEL || DEFAULT_AI_MODEL;
      }

      // Fetch guild channels to let the user select target channel
      let guild = client.guilds.cache.get(guildId);
      if (!guild) {
        guild = (await client.guilds.fetch(guildId).catch(() => null)) || undefined;
      }

      let channels: { id: string; name: string }[] = [];

      if (guild) {
        try {
          const fetchedChannels = await guild.channels.fetch();
          channels = Array.from(fetchedChannels.values())
            .filter((c): c is any => c !== null && typeof c.isTextBased === "function" && c.isTextBased() && !c.isThread())
            .map(c => ({ id: c.id, name: c.name }))
            .sort((a, b) => a.name.localeCompare(b.name));
        } catch (e) {
          try {
            channels = Array.from(guild.channels.cache.values())
              .filter(c => typeof c.isTextBased === "function" && c.isTextBased() && !c.isThread())
              .map(c => ({ id: c.id, name: c.name }))
              .sort((a, b) => a.name.localeCompare(b.name));
          } catch (err) {}
        }
      }

      res.json({ config, channels });
    } catch (error: any) {
      logger.error(`Error fetching config for guild ${guildId}:`, error);
      res.json({
        config: {
          guildId,
          welcomeChannelId: null,
          moderationLogChannelId: null,
          prefix: "!",
          welcomeTitle: "👋 Selamat Datang!",
          welcomeMessage: "Selamat datang **{username}** di **{guildName}**!",
          welcomeImage: "",
          welcomeThumbnail: true,
          aiPersonality: "",
          aiModel: process.env.GEMINI_MODEL || process.env.NVIDIA_MODEL || DEFAULT_AI_MODEL,
          bannedWords: "",
          maxStrikes: 3,
          muteDuration: 10
        },
        channels: []
      });
    }
  });

  // Fetch Server Analytics for a specific guild (Requires Auth)
  app.get("/api/analytics/:guildId", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    try {
      const data = await getGuildAnalytics(guildId);
      res.json({ success: true, analytics: data });
    } catch (error: any) {
      logger.error(`Error fetching analytics for guild ${guildId}:`, error);
      res.status(500).json({ error: "Gagal memuat statistik server." });
    }
  });

  // Fetch Economy Balances & Leaderboard (Requires Auth)
  app.get("/api/economy/:guildId", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    try {
      const topBalances = await prisma.triviaScore.findMany({
        where: { guildId },
        orderBy: [
          { score: "desc" },
          { updatedAt: "asc" }
        ],
        take: 15
      });

      const totalStats = await prisma.triviaScore.aggregate({
        where: { guildId },
        _sum: { score: true },
        _count: { id: true }
      });

      const config = await prisma.guildConfig.findUnique({ where: { guildId } });
      const dateInfo = getWibDateInfo();
      const pastArchives = await prisma.monthlySeasonArchive.findMany({
        where: { guildId },
        orderBy: { createdAt: "desc" },
        take: 5
      });

      let currentMonthRedeemedUsers: string[] = [];
      try {
        currentMonthRedeemedUsers = JSON.parse(config?.currentMonthRedeemedUsers || "[]");
      } catch (_) {}

      let cooldownUserIds: string[] = [];
      try {
        cooldownUserIds = JSON.parse(config?.cooldownUserIds || "[]");
      } catch (_) {}

      // Derive live eligible candidates directly from top leaderboard balances
      const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
      const excludedIds = new Set<string>([...cooldownUserIds, ...currentMonthRedeemedUsers]);
      if (guild?.ownerId) excludedIds.add(guild.ownerId);

      const goldenCandidateIds = topBalances
        .filter((b) => !excludedIds.has(b.userId) && !/(amubhya|amubhy|amubh|amub|ambu|\babu\b|mubhya)/i.test(b.username))
        .slice(0, 2)
        .map((b) => b.userId);

      res.json({
        success: true,
        balances: topBalances,
        totalCirculating: totalStats._sum.score || 0,
        totalWallets: totalStats._count.id || 0,
        season: {
          dateInfo,
          config: {
            monthlyResetEnabled: config?.monthlyResetEnabled ?? true,
            monthlyResetChannelId: config?.rewardChannelId ?? config?.monthlyResetChannelId ?? null,
            rewardChannelId: config?.rewardChannelId ?? config?.monthlyResetChannelId ?? null,
            historyChannelId: config?.historyChannelId ?? null,
            monthlyRedeemQuota: config?.monthlyRedeemQuota ?? 2,
            goldenCandidateIds,
            currentMonthRedeemedUsers,
            cooldownUserIds,
            lastMonthlyAnnouncementDate: config?.lastMonthlyAnnouncementDate,
            lastMonthlyRedeemOpenDate: config?.lastMonthlyRedeemOpenDate,
            lastMonthlyRedeemClosingDate: config?.lastMonthlyRedeemClosingDate,
            lastMonthlyResetDate: config?.lastMonthlyResetDate,
          },
          archives: pastArchives
        }
      });
    } catch (error: any) {
      logger.error(`Error fetching economy data for guild ${guildId}:`, error);
      res.status(500).json({ error: "Gagal memuat data ekonomi server." });
    }
  });

  // Manual Trigger Day 1 Announcement (Pengumuman Kickoff Season)
  app.post("/api/economy/:guildId/season/trigger-day1", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    try {
      await sendDay1Announcement(client, guildId);
      res.json({ success: true, message: "Pengumuman Kickoff Season (Day 1) berhasil dikirim ke server & dicatat di #history!" });
    } catch (error: any) {
      logger.error(`Error triggering Day 1 announcement for guild ${guildId}:`, error);
      res.status(500).json({ error: error.message || "Gagal mengirim pengumuman Day 1." });
    }
  });

  // Manual Trigger Day 3 Notification (Pembukaan Resmi Redeem /shop)
  app.post("/api/economy/:guildId/season/trigger-day3", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    try {
      await sendDay3RedeemOpenNotification(client, guildId);
      res.json({ success: true, message: "Notifikasi Pembukaan Redeem (Day 3) berhasil dikirim ke server & dicatat di #history!" });
    } catch (error: any) {
      logger.error(`Error triggering Day 3 notification for guild ${guildId}:`, error);
      res.status(500).json({ error: error.message || "Gagal mengirim notifikasi Day 3." });
    }
  });

  // Manual Trigger Day 5 Notification (Peringatan Hari Terakhir Penukaran)
  app.post("/api/economy/:guildId/season/trigger-day5", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    try {
      await sendDay5LastCallNotification(client, guildId);
      res.json({ success: true, message: "Notifikasi Hari Terakhir (Day 5) berhasil dikirim ke server & dicatat di #history!" });
    } catch (error: any) {
      logger.error(`Error triggering Day 5 notification for guild ${guildId}:`, error);
      res.status(500).json({ error: error.message || "Gagal mengirim notifikasi Day 5." });
    }
  });

  // Legacy route alias for trigger-h5
  app.post("/api/economy/:guildId/season/trigger-h5", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    try {
      await sendDay3RedeemOpenNotification(client, guildId);
      res.json({ success: true, message: "Notifikasi pembukaan redeem berhasil dikirim ke server & dicatat di #history!" });
    } catch (error: any) {
      logger.error(`Error triggering notification for guild ${guildId}:`, error);
      res.status(500).json({ error: error.message || "Gagal mengirim notifikasi." });
    }
  });

  // Silently Evaluate & Rotate Inactive Golden Candidates (Admin Manual Check)
  app.post("/api/economy/:guildId/season/rotate-candidates", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    try {
      const result = await evaluateAndRotateGoldenCandidates(client, guildId);
      if (result.rotated) {
        res.json({
          success: true,
          rotated: true,
          candidates: result.currentCandidates,
          message: `Evaluasi selesai: Terjadi rotasi hening! Kandidat aktif saat ini: ${result.currentCandidates.join(", ")}`,
        });
      } else {
        res.json({
          success: true,
          rotated: false,
          candidates: result.currentCandidates,
          message: "Evaluasi selesai: Seluruh kandidat masih aktif (< 3 hari inaktif). Tidak ada pergantian slot.",
        });
      }
    } catch (error: any) {
      logger.error(`Error rotating golden candidates for guild ${guildId}:`, error);
      res.status(500).json({ error: error.message || "Gagal mengevaluasi rotasi kandidat." });
    }
  });

  // Manual Re-roll / Pick 2 Golden Candidates (Admin)
  app.post("/api/economy/:guildId/season/pick-candidates", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    try {
      const candidates = await pickMonthlyGoldenCandidates(client, guildId, true);
      res.json({ success: true, candidates, message: `Berhasil memilih ulang 2 Golden Candidates: ${candidates.join(", ")}` });
    } catch (error: any) {
      logger.error(`Error picking golden candidates for guild ${guildId}:`, error);
      res.status(500).json({ error: error.message || "Gagal memilih golden candidates." });
    }
  });

  // Manual Season Archive & Reset Points (Admin)
  app.post("/api/economy/:guildId/season/reset", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    try {
      await archiveAndResetSeason(client, guildId);
      res.json({ success: true, message: "Season berhasil diarsipkan ke database dan seluruh poin direset ke 0! Kandidat baru akan dievaluasi pada Tanggal 1 dari keaktifan member." });
    } catch (error: any) {
      logger.error(`Error resetting season for guild ${guildId}:`, error);
      res.status(500).json({ error: error.message || "Gagal mereset season." });
    }
  });

  // Adjust / Give / Edit RTK Points for a User (Requires Auth)
  app.post("/api/economy/:guildId/adjust", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    const { userId, username, action, amount, reason } = req.body;

    if (!userId || typeof amount !== "number" || isNaN(amount) || amount < 0) {
      return res.status(400).json({ error: "Parameter userId dan jumlah amount valid (angka non-negatif) wajib diisi." });
    }

    if (!["add", "subtract", "set"].includes(action)) {
      return res.status(400).json({ error: "Aksi tidak valid. Pilih antara 'add', 'subtract', atau 'set'." });
    }

    try {
      const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
      let targetUsername = username || "";

      if (!targetUsername && guild) {
        const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
        if (member) {
          targetUsername = member.user.displayName || member.user.username;
        }
      }

      if (!targetUsername) {
        targetUsername = `User-${userId.slice(-4)}`;
      }

      const todayStr = new Date().toISOString().split("T")[0];
      const existing = await prisma.triviaScore.findUnique({
        where: { guildId_userId: { guildId, userId } }
      });

      let currentScore = existing?.score ?? 0;
      let newScore = currentScore;

      if (action === "add") {
        newScore = currentScore + amount;
      } else if (action === "subtract") {
        newScore = Math.max(0, currentScore - amount);
      } else if (action === "set") {
        newScore = amount;
      }

      const updated = await prisma.triviaScore.upsert({
        where: { guildId_userId: { guildId, userId } },
        update: {
          score: newScore,
          username: targetUsername || existing?.username || "User",
          updatedAt: new Date()
        },
        create: {
          guildId,
          userId,
          username: targetUsername,
          score: newScore,
          dailyScore: action === "add" ? amount : 0,
          lastDailyDate: todayStr
        }
      });

      logger.info(`Dashboard Economy: Admin menyesuaikan saldo untuk ${targetUsername} (${userId}) [${action}: ${amount}] -> Saldo Baru: ${newScore} RTK. Alasan: ${reason || '-'}`);

      res.json({
        success: true,
        message: `Saldo RTK untuk ${targetUsername} berhasil diperbarui menjadi ${newScore.toLocaleString('id-ID')} RTK!`,
        updatedBalance: updated.score,
        user: {
          userId: updated.userId,
          username: updated.username,
          score: updated.score,
          dailyScore: updated.dailyScore
        }
      });
    } catch (error: any) {
      logger.error(`Error adjusting economy balance for guild ${guildId}:`, error);
      res.status(500).json({ error: "Gagal menyesuaikan saldo RTK member." });
    }
  });

  // --- LEVELING & XP MANAGEMENT ENDPOINTS ---

  // Get Leveling Config & Leaderboard
  app.get("/api/leveling/:guildId", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    try {
      const config = await prisma.guildConfig.findUnique({
        where: { guildId },
        select: {
          levelingEnabled: true,
          levelUpChannelId: true,
          levelUpMessage: true,
        },
      });

      const [topUsers, totalMembers] = await Promise.all([
        prisma.userLevel.findMany({
          where: { guildId },
          orderBy: [
            { level: "desc" },
            { xp: "desc" },
          ],
          take: 25,
        }),
        prisma.userLevel.count({ where: { guildId } }),
      ]);

      const formattedUsers = topUsers.map((u, i) => {
        const needed = getXpRequiredForNextLevel(u.level);
        const current = Math.min(u.xp, needed);
        const percentage = Math.min(100, Math.round((current / needed) * 100));
        return {
          rank: i + 1,
          userId: u.userId,
          username: u.username,
          level: u.level,
          xp: u.xp,
          neededXp: needed,
          percentage,
          messagesCount: u.messagesCount,
          voiceSeconds: u.voiceSeconds,
          triviaWins: u.triviaWins,
          pantunCount: u.pantunCount,
          storyCount: u.storyCount,
          pollCount: u.pollCount,
          updatedAt: u.updatedAt,
        };
      });

      let guild = client.guilds.cache.get(guildId);
      if (!guild) {
        guild = (await client.guilds.fetch(guildId).catch(() => null)) || undefined;
      }
      let channels: { id: string; name: string }[] = [];
      if (guild) {
        try {
          const fetchedChannels = await guild.channels.fetch();
          channels = Array.from(fetchedChannels.values())
            .filter((c): c is any => c !== null && typeof c.isTextBased === "function" && c.isTextBased() && !c.isThread())
            .map(c => ({ id: c.id, name: c.name }))
            .sort((a, b) => a.name.localeCompare(b.name));
        } catch (_) {}
      }

      res.json({
        success: true,
        config: config || {
          levelingEnabled: true,
          levelUpChannelId: null,
          levelUpMessage: "🎉 Selamat {user}, kamu telah naik ke **Level {level}**!",
        },
        leaderboard: formattedUsers,
        totalMembers,
        channels,
      });
    } catch (error: any) {
      logger.error(`Error fetching leveling data for guild ${guildId}:`, error);
      res.status(500).json({ error: "Gagal memuat data leveling server." });
    }
  });

  // Save Leveling Config
  app.post("/api/leveling/:guildId/config", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    const { levelingEnabled, levelUpChannelId, levelUpMessage } = req.body;
    logger.info(`Dashboard: Saving leveling config for guild ${guildId}: levelingEnabled=${levelingEnabled}, levelUpChannelId=${levelUpChannelId}, levelUpMessage=${levelUpMessage}`);
    try {
      const updated = await prisma.guildConfig.upsert({
        where: { guildId },
        update: {
          levelingEnabled: levelingEnabled !== undefined ? Boolean(levelingEnabled) : true,
          levelUpChannelId: levelUpChannelId || null,
          levelUpMessage: levelUpMessage || "🎉 Selamat {user}, kamu telah naik ke **Level {level}**!",
        },
        create: {
          guildId,
          levelingEnabled: levelingEnabled !== undefined ? Boolean(levelingEnabled) : true,
          levelUpChannelId: levelUpChannelId || null,
          levelUpMessage: levelUpMessage || "🎉 Selamat {user}, kamu telah naik ke **Level {level}**!",
        },
      });
      res.json({ success: true, config: updated });
    } catch (error: any) {
      logger.error(`Error saving leveling config for guild ${guildId}:`, error);
      res.status(500).json({ error: "Gagal menyimpan konfigurasi leveling." });
    }
  });

  // --- VOICE CHAT MANAGEMENT ENDPOINTS ---

  // Check Voice Connection Status
  app.get("/api/voice/:guildId/status", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    const isConnected = voiceChatManager.isConnected(guildId);
    const session = voiceChatManager.getSession(guildId);

    res.json({
      success: true,
      connected: isConnected,
      channelId: session?.channelId || null,
      channelName: session?.channelName || null,
      joinedAt: session?.joinedAt || null
    });
  });

  // Make Maya Speak in Voice Channel from Dashboard
  app.post("/api/voice/:guildId/speak", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Teks ucapan tidak boleh kosong." });
    }

    if (!voiceChatManager.isConnected(guildId)) {
      return res.status(400).json({ error: "Maya belum bergabung di Voice Channel server ini. Gunakan /voice join di Discord terlebih dahulu." });
    }

    const success = await voiceChatManager.speak(guildId, text.trim());
    if (success) {
      res.json({ success: true, message: "Suara Maya berhasil diputar di Voice Channel!" });
    } else {
      res.status(500).json({ error: "Gagal memutar audio di Voice Channel." });
    }
  });

  // Disconnect Maya from Voice Channel
  app.post("/api/voice/:guildId/leave", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    if (!voiceChatManager.isConnected(guildId)) {
      return res.status(400).json({ error: "Maya tidak sedang berada di Voice Channel." });
    }

    await voiceChatManager.leave(guildId, true);
    res.json({ success: true, message: "Maya berhasil keluar dari Voice Channel." });
  });

  // --- SHOP MANAGEMENT ENDPOINTS ---

  // Ambil daftar produk toko aktif
  app.get("/api/shop/items/:guildId", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    try {
      const items = await getGuildShopItems(guildId);
      res.json({ success: true, items });
    } catch (error: any) {
      res.status(500).json({ error: "Gagal mengambil daftar produk toko." });
    }
  });

  // Tambah produk toko baru
  app.post("/api/shop/items/:guildId", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    const { title, description, priceRtk, category, imageUrl } = req.body;

    if (!title || !priceRtk) {
      return res.status(400).json({ error: "Judul produk dan Harga RTK wajib diisi." });
    }

    try {
      const newItem = await createShopItem({
        guildId,
        title,
        description: description || "",
        priceRtk: Number(priceRtk),
        category: category || "GAME",
        imageUrl: imageUrl || null
      });
      res.json({ success: true, item: newItem });
    } catch (error: any) {
      res.status(500).json({ error: "Gagal menambahkan produk toko baru." });
    }
  });

  // Edit/Update produk toko
  app.put("/api/shop/items/:id", authMiddleware, async (req: Request, res: Response) => {
    const { id } = req.params;
    const { guildId, title, description, priceRtk, category, imageUrl } = req.body;

    if (!guildId) {
      return res.status(400).json({ error: "guildId wajib disertakan." });
    }

    try {
      await updateShopItem(Number(id), guildId, {
        title,
        description,
        priceRtk: priceRtk !== undefined ? Number(priceRtk) : undefined,
        category,
        imageUrl
      });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: "Gagal mengedit produk toko." });
    }
  });

  // Hapus produk toko
  app.delete("/api/shop/items/:id", authMiddleware, async (req: Request, res: Response) => {
    const { id } = req.params;
    const guildId = req.query.guildId as string;
    try {
      await deleteShopItem(Number(id), guildId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: "Gagal menghapus produk toko." });
    }
  });

  // Ambil daftar pesanan member
  app.get("/api/shop/orders/:guildId", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    try {
      const orders = await getGuildOrders(guildId);
      res.json({ success: true, orders });
    } catch (error: any) {
      res.status(500).json({ error: "Gagal mengambil daftar pesanan toko." });
    }
  });

  // Setujui pesanan (COMPLETED)
  app.post("/api/shop/orders/approve", authMiddleware, async (req: Request, res: Response) => {
    const { orderId, notes } = req.body;
    try {
      const order = await approveShopOrder(client, orderId, notes);
      res.json({ success: true, order });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Gagal menyetujui pesanan." });
    }
  });

  // Tolak pesanan (REFUNDED)
  app.post("/api/shop/orders/reject", authMiddleware, async (req: Request, res: Response) => {
    const { orderId, reason } = req.body;
    try {
      const order = await rejectShopOrder(client, orderId, reason);
      res.json({ success: true, order });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Gagal menolak pesanan." });
    }
  });

  // Trigger Tes Broadcast Tebak-Tebakan Harian Langsung dari Web Dashboard
  app.post("/api/configs/:guildId/test-daily-riddle", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      return res.status(404).json({ error: "Server tidak ditemukan atau bot tidak aktif di server tersebut." });
    }

    try {
      const config = await prisma.guildConfig.findUnique({ where: { guildId } });
      const success = await broadcastDailyRiddlesForGuild(guild, config?.dailyRiddleChannelId || undefined, true);
      if (success) {
        res.json({ success: true, message: "Broadcast Tebak-Tebakan Harian berhasil dikirim ke server!" });
      } else {
        res.status(500).json({ error: "Gagal mengirim broadcast. Pastikan channel target terpasang dan bot memiliki izin kirim pesan." });
      }
    } catch (error: any) {
      logger.error(`Error testing daily riddle for guild ${guildId}:`, error);
      res.status(500).json({ error: "Terjadi kesalahan saat memicu broadcast tebakan." });
    }
  });

  // Trigger Tes Broadcast Daily AI Polls Langsung dari Web Dashboard
  app.post("/api/configs/:guildId/test-daily-poll", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      return res.status(404).json({ error: "Server tidak ditemukan atau bot tidak aktif di server tersebut." });
    }

    try {
      const config = await prisma.guildConfig.findUnique({ where: { guildId } });
      const success = await startDailyPollForGuild(guild, config?.dailyPollChannelId || undefined);
      if (success) {
        res.json({ success: true, message: "Broadcast Daily AI Poll berhasil dikirim ke server!" });
      } else {
        res.status(500).json({ error: "Gagal mengirim broadcast poll. Pastikan channel target terpasang dan bot memiliki izin kirim pesan." });
      }
    } catch (error: any) {
      logger.error(`Error testing daily poll for guild ${guildId}:`, error);
      res.status(500).json({ error: "Terjadi kesalahan saat memicu broadcast poll." });
    }
  });

  // Ambil data status tebakan aktif & history jawaban member (Backoffice Dashboard)
  app.get("/api/configs/:guildId/active-riddle", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    try {
      const activeData = tebakManager.getActiveRiddleSession(guildId);
      res.json({ success: true, ...activeData });
    } catch (error: any) {
      logger.error(`Error fetching active riddle session for ${guildId}:`, error);
      res.status(500).json({ error: "Gagal mengambil data tebakan aktif." });
    }
  });

  // Ambil data polling aktif & daftar partisipan member (Live Backoffice Dashboard)
  app.get("/api/configs/:guildId/active-poll", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    try {
      const pollData = await getLatestPollData(guildId);
      res.json({ success: true, ...pollData });
    } catch (error: any) {
      logger.error(`Error fetching active poll data for ${guildId}:`, error);
      res.status(500).json({ error: "Gagal mengambil data polling aktif." });
    }
  });

  // Ambil data rantai kata & status cerita harian hari ini (Live Backoffice Dashboard)
  app.get("/api/configs/:guildId/today-story", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    try {
      const storyData = await getTodayStoryStatus(guildId);
      res.json({ success: true, ...storyData });
    } catch (error: any) {
      logger.error(`Error fetching today story status for ${guildId}:`, error);
      res.status(500).json({ error: "Gagal mengambil status cerita harian." });
    }
  });

  // Trigger Kirim Pengingat Pembukaan Sesi Cerita dari Dashboard
  app.post("/api/configs/:guildId/start-story-session", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      return res.status(404).json({ error: "Server tidak ditemukan atau bot tidak aktif di server tersebut." });
    }

    try {
      const config = await prisma.guildConfig.findUnique({ where: { guildId } });
      const success = await announceStorySessionStart(guild, config?.storyChannelId || undefined);

      if (success) {
        res.json({ success: true, message: "Pengumuman pembukaan sesi Maya Story Chain berhasil dikirim ke channel target!" });
      } else {
        res.status(400).json({ error: "Gagal mengirim pengumuman. Pastikan channel target Maya Story Chain sudah dikonfigurasi." });
      }
    } catch (error: any) {
      logger.error(`Error starting story session for guild ${guildId}:`, error);
      res.status(500).json({ error: "Terjadi kesalahan sistem saat memicu pengumuman sesi cerita." });
    }
  });

  app.post("/api/configs/:guildId/publish-story", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      return res.status(404).json({ error: "Server tidak ditemukan atau bot tidak aktif di server tersebut." });
    }

    try {
      const config = await prisma.guildConfig.findUnique({ where: { guildId } });
      const success = await compileDailyStoryForGuild(guild, config?.storyChannelId || undefined);

      if (success) {
        res.json({ success: true, message: "Cerita komedi & gambar AI berhasil dirangkai dan dipublikasikan ke channel!" });
      } else {
        res.status(400).json({ error: "Gagal mempublikasikan cerita. Pastikan ada kontribusi kalimat member hari ini atau channel sudah dikonfigurasi." });
      }
    } catch (error: any) {
      logger.error(`Error publishing story for guild ${guildId}:`, error);
      res.status(500).json({ error: "Terjadi kesalahan sistem saat mempublikasikan cerita." });
    }
  });

  // ==========================================
  // MAYA LANJUTKAN PANTUN DASHBOARD API
  // ==========================================

  // Get Pantun Configuration & Today's Active Session (Requires Auth)
  app.get("/api/configs/:guildId/pantun", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    try {
      let config = await prisma.guildConfig.findUnique({ where: { guildId } });
      if (!config) {
        config = await prisma.guildConfig.create({
          data: { guildId }
        });
      }

      const todayPantun = await getTodayPantunStatus(guildId);

      res.json({
        success: true,
        enabled: config.pantunEnabled !== false,
        channelId: config.pantunChannelId || null,
        startHour: config.pantunStartHour ?? 9,
        closeHour: config.pantunCloseHour ?? 23,
        rewardAmount: config.pantunRewardAmount ?? 15,
        mvpReward: config.pantunMvpReward ?? 150,
        todayPantun
      });
    } catch (error: any) {
      logger.error(`Error fetching Pantun config for guild ${guildId}:`, error);
      res.status(500).json({ error: "Gagal mengambil konfigurasi Maya Lanjutkan Pantun." });
    }
  });

  // Manually Trigger Pantun Session Start Announcement (Requires Auth)
  app.post("/api/configs/:guildId/pantun/start", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    try {
      const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) {
        return res.status(404).json({ error: "Server Discord tidak ditemukan." });
      }

      const success = await announcePantunSessionStart(guild);
      if (success) {
        res.json({ success: true, message: "Sesi Maya Lanjutkan Pantun hari ini berhasil dibuka dan diumumkan!" });
      } else {
        res.status(400).json({ error: "Gagal membuka sesi. Pastikan channel target Pantun sudah dikonfigurasi dan bot memiliki izin kirim pesan." });
      }
    } catch (error: any) {
      logger.error(`Error triggering Pantun start for guild ${guildId}:`, error);
      res.status(500).json({ error: "Terjadi kesalahan sistem saat memicu pembukaan sesi pantun." });
    }
  });

  // Manually Trigger Pantun Session Close & MVP Review (Requires Auth)
  app.post("/api/configs/:guildId/pantun/close", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    try {
      const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) {
        return res.status(404).json({ error: "Server Discord tidak ditemukan." });
      }

      const success = await closeAndEvaluateDailyPantun(guild);
      if (success) {
        res.json({ success: true, message: "Sesi Pantun berhasil ditutup dan dinilai oleh Maya!" });
      } else {
        res.status(400).json({ error: "Gagal menutup sesi pantun." });
      }
    } catch (error: any) {
      logger.error(`Error triggering Pantun close for guild ${guildId}:`, error);
      res.status(500).json({ error: "Terjadi kesalahan sistem saat menutup sesi pantun." });
    }
  });

  // Save/Update configuration for a specific guild (Requires Auth)
  app.post("/api/configs/:guildId", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    const { 
      welcomeChannelId,
      moderationLogChannelId, 
      welcomeTitle, 
      welcomeMessage, 
      welcomeImage, 
      welcomeThumbnail,
      aiPersonality,
      aiModel,
      bannedWords,
      maxStrikes,
      muteDuration,
      dailyRiddleChannelId,
      dailyRiddleEnabled,
      dailyRiddlePostHour,
      dailyLeaderboardPostHour,
      dailyRiddleRewardAmount,
      dailyRiddleCloseRewardAmount,
      dailyPollChannelId,
      dailyPollEnabled,
      dailyPollPostHour,
      dailyPollRewardAmount,
      menfessChannelId,
      menfessEnabled,
      voiceRewardEnabled,
      voiceRewardIntervalMin,
      voiceRewardAmount,
      storyChannelId,
      storyEnabled,
      storyStartHour,
      storyPublishHour,
      storyWordReward,
      storyMvpReward,
      pantunEnabled,
      pantunChannelId,
      pantunStartHour,
      pantunCloseHour,
      pantunRewardAmount,
      pantunMvpReward,
      monthlyResetEnabled,
      monthlyResetChannelId,
      rewardChannelId,
      historyChannelId,
      monthlyRedeemQuota,
      levelingEnabled,
      levelUpChannelId,
      levelUpMessage
    } = req.body;

    try {
      const updateData: any = {};
      if (welcomeChannelId !== undefined) updateData.welcomeChannelId = welcomeChannelId || null;
      if (moderationLogChannelId !== undefined) updateData.moderationLogChannelId = moderationLogChannelId || null;
      if (welcomeTitle !== undefined) updateData.welcomeTitle = welcomeTitle;
      if (welcomeMessage !== undefined) updateData.welcomeMessage = welcomeMessage;
      if (welcomeImage !== undefined) updateData.welcomeImage = welcomeImage;
      if (welcomeThumbnail !== undefined) updateData.welcomeThumbnail = Boolean(welcomeThumbnail);
      if (aiPersonality !== undefined) updateData.aiPersonality = aiPersonality;
      if (aiModel !== undefined) updateData.aiModel = aiModel ? String(aiModel).trim() : null;
      if (bannedWords !== undefined) updateData.bannedWords = bannedWords;
      if (maxStrikes !== undefined) updateData.maxStrikes = Number(maxStrikes);
      if (muteDuration !== undefined) updateData.muteDuration = Number(muteDuration);
      if (dailyRiddleChannelId !== undefined) updateData.dailyRiddleChannelId = dailyRiddleChannelId || null;
      if (dailyRiddleEnabled !== undefined) updateData.dailyRiddleEnabled = Boolean(dailyRiddleEnabled);
      if (dailyRiddlePostHour !== undefined) updateData.dailyRiddlePostHour = Number(dailyRiddlePostHour);
      if (dailyLeaderboardPostHour !== undefined) updateData.dailyLeaderboardPostHour = Number(dailyLeaderboardPostHour);
      if (dailyRiddleRewardAmount !== undefined) updateData.dailyRiddleRewardAmount = Number(dailyRiddleRewardAmount);
      if (dailyRiddleCloseRewardAmount !== undefined) updateData.dailyRiddleCloseRewardAmount = Number(dailyRiddleCloseRewardAmount);
      if (dailyPollChannelId !== undefined) updateData.dailyPollChannelId = dailyPollChannelId || null;
      if (dailyPollEnabled !== undefined) updateData.dailyPollEnabled = Boolean(dailyPollEnabled);
      if (dailyPollPostHour !== undefined) updateData.dailyPollPostHour = Number(dailyPollPostHour);
      if (dailyPollRewardAmount !== undefined) updateData.dailyPollRewardAmount = Number(dailyPollRewardAmount);
      if (menfessChannelId !== undefined) updateData.menfessChannelId = menfessChannelId || null;
      if (menfessEnabled !== undefined) updateData.menfessEnabled = Boolean(menfessEnabled);
      if (voiceRewardEnabled !== undefined) updateData.voiceRewardEnabled = Boolean(voiceRewardEnabled);
      if (voiceRewardIntervalMin !== undefined) updateData.voiceRewardIntervalMin = Number(voiceRewardIntervalMin);
      if (voiceRewardAmount !== undefined) updateData.voiceRewardAmount = Number(voiceRewardAmount);
      if (storyChannelId !== undefined) updateData.storyChannelId = storyChannelId || null;
      if (storyEnabled !== undefined) updateData.storyEnabled = Boolean(storyEnabled);
      if (storyStartHour !== undefined) updateData.storyStartHour = Number(storyStartHour);
      if (storyPublishHour !== undefined) updateData.storyPublishHour = Number(storyPublishHour);
      if (storyWordReward !== undefined) updateData.storyWordReward = Number(storyWordReward);
      if (storyMvpReward !== undefined) updateData.storyMvpReward = Number(storyMvpReward);
      if (pantunEnabled !== undefined) updateData.pantunEnabled = Boolean(pantunEnabled);
      if (pantunChannelId !== undefined) updateData.pantunChannelId = pantunChannelId || null;
      if (pantunStartHour !== undefined) updateData.pantunStartHour = Number(pantunStartHour);
      if (pantunCloseHour !== undefined) updateData.pantunCloseHour = Number(pantunCloseHour);
      if (pantunRewardAmount !== undefined) updateData.pantunRewardAmount = Number(pantunRewardAmount);
      if (pantunMvpReward !== undefined) updateData.pantunMvpReward = Number(pantunMvpReward);
      if (monthlyResetEnabled !== undefined) updateData.monthlyResetEnabled = Boolean(monthlyResetEnabled);
      if (monthlyResetChannelId !== undefined) {
        updateData.monthlyResetChannelId = monthlyResetChannelId || null;
        if (rewardChannelId === undefined) updateData.rewardChannelId = monthlyResetChannelId || null;
      }
      if (rewardChannelId !== undefined) {
        updateData.rewardChannelId = rewardChannelId || null;
        updateData.monthlyResetChannelId = rewardChannelId || null;
      }
      if (historyChannelId !== undefined) {
        updateData.historyChannelId = historyChannelId || null;
      }
      if (monthlyRedeemQuota !== undefined) updateData.monthlyRedeemQuota = Number(monthlyRedeemQuota);
      if (levelingEnabled !== undefined) updateData.levelingEnabled = Boolean(levelingEnabled);
      if (levelUpChannelId !== undefined) updateData.levelUpChannelId = levelUpChannelId || null;
      if (levelUpMessage !== undefined) updateData.levelUpMessage = levelUpMessage || "🎉 Selamat {user}, kamu telah naik ke **Level {level}**!";

      const updatedConfig = await prisma.guildConfig.upsert({
        where: { guildId },
        update: updateData,
        create: {
          guildId,
          ...updateData
        }
      });

      res.json({ success: true, config: updatedConfig });
      logger.info(`Dashboard: Konfigurasi guild ${guildId} berhasil diperbarui.`);
    } catch (error: any) {
      logger.error(`Error saving config for guild ${guildId}:`, error);
      if (error.code === "P2021") {
        return res.status(500).json({ error: "Tabel database belum dibuat. Silakan jalankan 'npm run db:push' di terminal Anda." });
      }
      res.status(500).json({ error: "Gagal menyimpan konfigurasi server." });
    }
  });

  // Send custom embed from dashboard to a channel (Requires Auth)
  app.post("/api/configs/:guildId/send-embed", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    const { channelId, title, description, color, bannerUrl, thumbnailUrl, buttonLabel, buttonUrl, mention } = req.body;

    if (!channelId || !description) {
      return res.status(400).json({ error: "Channel dan Deskripsi wajib diisi." });
    }

    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        return res.status(404).json({ error: "Server tidak ditemukan oleh bot." });
      }

      let channel = guild.channels.cache.get(channelId);
      if (!channel) {
        channel = (await guild.channels.fetch(channelId).catch(() => null)) || undefined;
      }

      if (!channel || !channel.isTextBased()) {
        return res.status(404).json({ error: "Channel teks tidak ditemukan atau bot tidak memiliki akses." });
      }

      const textChannel = channel as TextChannel;

      // Construct embed
      const embed = new EmbedBuilder()
        .setDescription(description.replace(/\\n/g, "\n"))
        .setTimestamp();

      if (title) embed.setTitle(title);
      
      // Parse color (e.g. #5865f2 or standard blurple)
      if (color) {
        const hex = color.replace("#", "");
        const colorInt = parseInt(hex, 16);
        if (!isNaN(colorInt)) {
          embed.setColor(colorInt);
        }
      } else {
        embed.setColor(0x5865F2); // Default blurple
      }

      if (bannerUrl && bannerUrl.trim().startsWith("http")) {
        embed.setImage(bannerUrl.trim());
      }

      if (thumbnailUrl && thumbnailUrl.trim().startsWith("http")) {
        embed.setThumbnail(thumbnailUrl.trim());
      }

      const components: any[] = [];
      if (buttonLabel && buttonUrl && buttonUrl.trim().startsWith("http")) {
        const button = new ButtonBuilder()
          .setLabel(buttonLabel)
          .setURL(buttonUrl.trim())
          .setStyle(ButtonStyle.Link);
        
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
        components.push(row);
      }

      // Handle mentions
      let content = undefined;
      if (mention === "everyone") {
        content = "@everyone";
      } else if (mention === "here") {
        content = "@here";
      }

      await textChannel.send({ content, embeds: [embed], components });

      res.json({ success: true });
      logger.info(`Dashboard: Mengirim embed kustom ke channel ${channelId} di guild ${guildId}.`);
    } catch (error) {
      logger.error(`Error sending custom embed for guild ${guildId}:`, error);
      res.status(500).json({ error: "Gagal mengirim pesan embed ke server Discord." });
    }
  });

  // Trigger or send Silent History Announcement to #history
  app.post("/api/history-announcement", authMiddleware, async (req: Request, res: Response) => {
    const { title, description, fields } = req.body;
    try {
      if (!title || !description) {
        await broadcastMayaAdjustmentHistory(client);
        return res.json({ success: true, message: "Silent history announcement berhasil disiarkan ke channel #history!" });
      }

      await sendHistoryAnnouncement(client, {
        title,
        description,
        fields: fields || [],
        footerText: "Maya System Changelog • Silent History Log"
      });

      res.json({ success: true, message: "Custom silent history announcement berhasil dikirim ke channel #history!" });
    } catch (error: any) {
      logger.error("Error sending silent history announcement:", error);
      res.status(500).json({ error: "Gagal mengirim silent history announcement." });
    }
  });

  // Get all warning logs for a guild (Requires Auth)
  app.get("/api/moderation/:guildId/warnings", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    try {
      let warnings: any[] = [];
      try {
        warnings = await prisma.warnLog.findMany({
          where: { guildId },
          orderBy: { createdAt: "desc" }
        });
      } catch (e) {
        logger.error(`Prisma warnLog fetch error for guild ${guildId}:`, e);
      }

      // Enrich warning logs with user tags and avatar URLs
      const enrichedWarnings = await Promise.all(
        warnings.map(async (log) => {
          let userTag = `User (${log.userId})`;
          let userAvatar = "https://cdn.discordapp.com/embed/avatars/0.png";
          
          if (log.userId) {
            try {
              const cachedUser = client.users.cache.get(log.userId);
              const user = cachedUser || await client.users.fetch(log.userId).catch(() => null);
              if (user) {
                userTag = user.tag || user.username || userTag;
                if (typeof user.displayAvatarURL === "function") {
                  userAvatar = user.displayAvatarURL({ size: 64 }) || userAvatar;
                }
              }
            } catch (e) {
              // Ignore individual user fetch error
            }
          }

          return {
            id: log.id,
            userId: log.userId,
            guildId: log.guildId,
            reason: log.reason || "Tidak ada alasan",
            moderatorId: log.moderatorId || "Staff",
            createdAt: log.createdAt,
            userTag,
            userAvatar
          };
        })
      );

      res.json({ warnings: enrichedWarnings });
    } catch (error: any) {
      logger.error(`Error fetching warnings for guild ${guildId}:`, error);
      res.json({ warnings: [] });
    }
  });

  // Create a manual warning log for a user (Requires Auth)
  app.post("/api/moderation/:guildId/warnings", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    const { userId, reason } = req.body;

    if (!userId || !reason) {
      return res.status(400).json({ error: "User ID dan Alasan Strike wajib diisi." });
    }

    try {
      const warnLog = await prisma.warnLog.create({
        data: {
          guildId,
          userId,
          reason,
          moderatorId: "Dashboard Staff"
        }
      });

      res.json({ success: true, warnLog });
      logger.info(`Dashboard: Berhasil menambahkan strike untuk user ${userId} di guild ${guildId}.`);
    } catch (error) {
      logger.error(`Error creating warning log for user ${userId} in guild ${guildId}:`, error);
      res.status(500).json({ error: "Gagal membuat catatan strike." });
    }
  });

  // Reset/Delete ALL warning logs in a server (Requires Auth)
  app.delete("/api/moderation/:guildId/warnings/reset", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    try {
      await prisma.warnLog.deleteMany({
        where: { guildId }
      });
      res.json({ success: true });
      logger.info(`Dashboard: Seluruh log strike untuk guild ${guildId} berhasil di-reset.`);
    } catch (error) {
      logger.error(`Error resetting warnings for guild ${guildId}:`, error);
      res.status(500).json({ error: "Gagal me-reset log strike server." });
    }
  });

  // Reset/Delete all warning logs for a specific user in a server (Requires Auth)
  app.delete("/api/moderation/:guildId/warnings/user/:userId", authMiddleware, async (req: Request, res: Response) => {
    const { guildId, userId } = req.params;
    try {
      await prisma.warnLog.deleteMany({
        where: { guildId, userId }
      });
      res.json({ success: true });
      logger.info(`Dashboard: Seluruh log strike untuk user ${userId} di guild ${guildId} berhasil di-reset.`);
    } catch (error) {
      logger.error(`Error resetting warnings for user ${userId} in guild ${guildId}:`, error);
      res.status(500).json({ error: "Gagal me-reset log strike user." });
    }
  });

  // Revoke/Delete a single warning log (Requires Auth)
  app.delete("/api/moderation/:guildId/warnings/:id", authMiddleware, async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      await prisma.warnLog.delete({
        where: { id: Number(id) }
      });
      res.json({ success: true });
      logger.info(`Dashboard: Strike log #${id} berhasil dihapus.`);
    } catch (error) {
      logger.error(`Error deleting warning log #${id}:`, error);
      res.status(500).json({ error: "Gagal menghapus log strike." });
    }
  });

  // Get AI conversation history for a guild (Requires Auth)
  app.get("/api/ai/:guildId/history", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    try {
      const history = await prisma.aiChatMessage.findMany({
        where: { guildId },
        orderBy: { createdAt: "desc" },
        take: 30
      });
      res.json({ history: history.reverse() });
    } catch (error) {
      logger.error(`Error fetching AI chat history for guild ${guildId}:`, error);
      res.status(500).json({ error: "Gagal mengambil riwayat percakapan AI." });
    }
  });

  // Reset/Clear ALL AI conversation memory for a guild (Requires Auth)
  app.delete("/api/ai/:guildId/history/reset", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    try {
      await prisma.aiChatMessage.deleteMany({
        where: { guildId }
      });
      res.json({ success: true });
      logger.info(`Dashboard: Riwayat percakapan AI untuk guild ${guildId} berhasil dibersihkan.`);
    } catch (error) {
      logger.error(`Error clearing AI chat history for guild ${guildId}:`, error);
      res.status(500).json({ error: "Gagal menghapus memori percakapan AI." });
    }
  });

  // Get available AI models list (Requires Auth)
  app.get("/api/ai/models", authMiddleware, (req: Request, res: Response) => {
    try {
      res.json({
        defaultModel: process.env.GEMINI_MODEL || DEFAULT_AI_MODEL,
        models: AVAILABLE_AI_MODELS
      });
    } catch (error) {
      logger.error("Error fetching AI models list:", error);
      res.status(500).json({ error: "Gagal memuat daftar model AI." });
    }
  });

  // Get all roles for a guild (Requires Auth)
  app.get("/api/roles/:guildId", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    try {
      let guild = client.guilds.cache.get(guildId);
      if (!guild) {
        guild = (await client.guilds.fetch(guildId).catch(() => null)) || undefined;
      }
      if (!guild) return res.status(404).json({ error: "Server tidak ditemukan." });

      let fetchedRoles = guild.roles.cache;
      try {
        fetchedRoles = await guild.roles.fetch();
      } catch (e) {}

      const roles = Array.from(fetchedRoles.values())
        .map(r => {
          let memberCount = 0;
          try {
            memberCount = r.members ? r.members.size : 0;
          } catch (e) {}

          return {
            id: r.id,
            name: r.name || "Role Kustom",
            color: r.hexColor || "#99aab5",
            hoist: Boolean(r.hoist),
            position: r.position || 0,
            memberCount,
            managed: Boolean(r.managed)
          };
        })
        .sort((a, b) => b.position - a.position);

      res.json({ roles });
    } catch (error) {
      logger.error(`Error fetching roles for guild ${guildId}:`, error);
      res.status(500).json({ error: "Gagal mengambil daftar role." });
    }
  });

  // Create a new role in guild (Requires Auth)
  app.post("/api/roles/:guildId", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    const { name, color, hoist } = req.body;

    if (!name) return res.status(400).json({ error: "Nama role wajib diisi." });

    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return res.status(404).json({ error: "Server tidak ditemukan." });

      const newRole = await guild.roles.create({
        name,
        color: color || "#99aab5",
        hoist: hoist || false,
        reason: "Dibuat via Maya Web Dashboard"
      });

      res.json({ success: true, role: { id: newRole.id, name: newRole.name } });
      logger.info(`Dashboard: Berhasil membuat role baru '${name}' di guild ${guildId}.`);
    } catch (error) {
      logger.error(`Error creating role for guild ${guildId}:`, error);
      res.status(500).json({ error: "Gagal membuat role. Pastikan bot memiliki izin Manage Roles." });
    }
  });

  // Delete a role in guild (Requires Auth)
  app.delete("/api/roles/:guildId/:roleId", authMiddleware, async (req: Request, res: Response) => {
    const { guildId, roleId } = req.params;
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return res.status(404).json({ error: "Server tidak ditemukan." });

      const role = guild.roles.cache.get(roleId);
      if (!role) return res.status(404).json({ error: "Role tidak ditemukan." });

      if (role.managed) return res.status(400).json({ error: "Role ini dikelola secara eksternal dan tidak bisa dihapus." });

      await role.delete("Dihapus via Maya Web Dashboard");
      res.json({ success: true });
      logger.info(`Dashboard: Berhasil menghapus role ID ${roleId} di guild ${guildId}.`);
    } catch (error) {
      logger.error(`Error deleting role ${roleId} for guild ${guildId}:`, error);
      res.status(500).json({ error: "Gagal menghapus role. Pastikan bot memiliki wewenang (posisi role bot di atas role tersebut)." });
    }
  });

  // Get all active mabar schedules for a guild (Requires Auth)
  app.get("/api/mabar/:guildId", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    try {
      const sessions = await prisma.gameSession.findMany({
        where: { guildId },
        orderBy: { createdAt: "desc" }
      });
      res.json({ sessions });
    } catch (error) {
      logger.error(`Error fetching mabar sessions for guild ${guildId}:`, error);
      res.status(500).json({ error: "Gagal mengambil daftar mabar." });
    }
  });

  // Create a new mabar schedule from dashboard (Requires Auth)
  app.post("/api/mabar/:guildId", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    const { channelId, game, description, playTime, maxPlayers, gameUrl } = req.body;

    if (!channelId || !game || !playTime || !description) {
      return res.status(400).json({ error: "Channel, Game, Waktu, dan Deskripsi wajib diisi." });
    }

    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return res.status(404).json({ error: "Server tidak ditemukan." });

      let channel = guild.channels.cache.get(channelId);
      if (!channel) {
        channel = (await guild.channels.fetch(channelId).catch(() => null)) || undefined;
      }

      if (!channel || !channel.isTextBased()) {
        return res.status(404).json({ error: "Channel teks tidak ditemukan atau bot tidak memiliki akses." });
      }

      const textChannel = channel as TextChannel;

      // Create a temporary session in database
      const tempSession = await prisma.gameSession.create({
        data: {
          guildId,
          channelId,
          messageId: `temp_${Date.now()}`,
          game,
          description,
          playTime,
          maxPlayers: maxPlayers ? Number(maxPlayers) : 10,
          gameUrl: gameUrl || null,
          creatorId: "Dashboard Admin",
          creatorName: "Dashboard Admin",
          participantIds: "[]" // Empty list to start
        }
      });

      // Construct Embed and Buttons
      const embed = createMabarEmbed({
        id: tempSession.id,
        game,
        description,
        playTime,
        maxPlayers: maxPlayers ? Number(maxPlayers) : null,
        gameUrl: gameUrl || null,
        creatorId: "Dashboard Admin",
        participants: []
      });

      const buttons = createMabarButtons(tempSession.id, gameUrl || null);

      // Send message to Discord
      const msg = await textChannel.send({
        embeds: [embed],
        components: [buttons]
      });

      // Update message ID in DB
      const session = await prisma.gameSession.update({
        where: { id: tempSession.id },
        data: { messageId: msg.id }
      });

      res.json({ success: true, session });
      logger.info(`Dashboard: Berhasil menjadwalkan mabar ${game} di channel ${channelId} untuk guild ${guildId}.`);
    } catch (error) {
      logger.error(`Error creating mabar from dashboard for guild ${guildId}:`, error);
      res.status(500).json({ error: "Gagal membuat jadwal mabar." });
    }
  });

  // Delete a mabar schedule from dashboard (Requires Auth)
  app.delete("/api/mabar/:guildId/:sessionId", authMiddleware, async (req: Request, res: Response) => {
    const { guildId, sessionId } = req.params;
    try {
      const session = await prisma.gameSession.findUnique({
        where: { id: sessionId }
      });

      if (!session) return res.status(404).json({ error: "Jadwal mabar tidak ditemukan." });

      // Try deleting the message from Discord channel first
      const guild = client.guilds.cache.get(guildId);
      if (guild) {
        const channel = guild.channels.cache.get(session.channelId);
        if (channel && channel.isTextBased()) {
          try {
            const msg = await channel.messages.fetch(session.messageId);
            if (msg) await msg.delete();
          } catch (err) {
            logger.error(`Failed to delete mabar message ${session.messageId} from Discord:`, err);
          }
        }
      }

      // Delete database record
      await prisma.gameSession.delete({
        where: { id: sessionId }
      });

      res.json({ success: true });
      logger.info(`Dashboard: Berhasil menghapus mabar ID ${sessionId} untuk guild ${guildId}.`);
    } catch (error) {
      logger.error(`Error deleting mabar session ${sessionId} for guild ${guildId}:`, error);
      res.status(500).json({ error: "Gagal menghapus jadwal mabar." });
    }
  });

  // Get all Reaction Role menus for a guild (Requires Auth)
  app.get("/api/reaction-roles/:guildId", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    try {
      const menus = await prisma.reactionRoleMenu.findMany({
        where: { guildId },
        include: { options: true },
        orderBy: { createdAt: "desc" }
      });
      res.json({ menus });
    } catch (error) {
      logger.error(`Error fetching reaction role menus for guild ${guildId}:`, error);
      res.status(500).json({ error: "Gagal mengambil daftar menu reaction roles." });
    }
  });

  // Create a new Reaction Role menu and post to Discord (Requires Auth)
  app.post("/api/reaction-roles/:guildId", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    const { channelId, title, description, color, options } = req.body;

    if (!channelId || !title || !options || !Array.isArray(options) || options.length === 0) {
      return res.status(400).json({ error: "Channel, Judul, dan Minimal 1 Role Option wajib diisi." });
    }

    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return res.status(404).json({ error: "Server tidak ditemukan." });

      let channel = guild.channels.cache.get(channelId);
      if (!channel) {
        channel = (await guild.channels.fetch(channelId).catch(() => null)) || undefined;
      }

      if (!channel || !channel.isTextBased()) {
        return res.status(404).json({ error: "Channel teks tidak ditemukan atau bot tidak memiliki akses." });
      }

      const textChannel = channel as TextChannel;

      // Construct Embed
      const hex = (color || "#5865F2").replace("#", "");
      const colorInt = parseInt(hex, 16) || 0x5865F2;

      const embed = new EmbedBuilder()
        .setColor(colorInt)
        .setTitle(title)
        .setDescription(description || "Klik tombol di bawah untuk mengambil atau melepas role secara otomatis!")
        .setTimestamp();

      // Construct Buttons ActionRows (max 5 buttons per row)
      const rows: ActionRowBuilder<ButtonBuilder>[] = [];
      let currentArr: ButtonBuilder[] = [];

      for (const opt of options) {
        let style = ButtonStyle.Primary;
        if (opt.style === "Secondary") style = ButtonStyle.Secondary;
        if (opt.style === "Success") style = ButtonStyle.Success;
        if (opt.style === "Danger") style = ButtonStyle.Danger;

        const btn = new ButtonBuilder()
          .setCustomId(`rr:${opt.roleId}`)
          .setLabel(opt.label || opt.roleName || "Role")
          .setStyle(style);

        if (opt.emoji && opt.emoji.trim()) {
          try {
            btn.setEmoji(opt.emoji.trim());
          } catch (e) {
            // Ignore emoji format errors
          }
        }

        currentArr.push(btn);
        if (currentArr.length === 5) {
          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(currentArr);
          rows.push(row);
          currentArr = [];
        }
      }

      if (currentArr.length > 0) {
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(currentArr);
        rows.push(row);
      }

      // Send to Discord
      const msg = await textChannel.send({ embeds: [embed], components: rows });

      // Save to Database
      const menu = await prisma.reactionRoleMenu.create({
        data: {
          guildId,
          channelId,
          messageId: msg.id,
          title,
          description: description || "",
          color: color || "#5865F2",
          options: {
            create: options.map((opt: any) => ({
              roleId: opt.roleId,
              roleName: opt.roleName || "Role",
              label: opt.label || opt.roleName || "Role",
              emoji: opt.emoji || null,
              style: opt.style || "Primary"
            }))
          }
        },
        include: { options: true }
      });

      res.json({ success: true, menu });
      logger.info(`Dashboard: Berhasil membuat Reaction Role menu "${title}" di channel ${channelId} untuk guild ${guildId}.`);
    } catch (error: any) {
      logger.error(`Error creating reaction role menu for guild ${guildId}:`, error);
      res.status(500).json({ error: error.message || "Gagal membuat Reaction Role menu." });
    }
  });

  // Delete a Reaction Role menu (Requires Auth)
  app.delete("/api/reaction-roles/:guildId/:menuId", authMiddleware, async (req: Request, res: Response) => {
    const { guildId, menuId } = req.params;
    try {
      const menu = await prisma.reactionRoleMenu.findUnique({
        where: { id: menuId }
      });

      if (!menu) return res.status(404).json({ error: "Menu Reaction Role tidak ditemukan." });

      // Delete message from Discord if possible
      const guild = client.guilds.cache.get(guildId);
      if (guild && menu.messageId) {
        let channel = guild.channels.cache.get(menu.channelId);
        if (!channel) {
          channel = (await guild.channels.fetch(menu.channelId).catch(() => null)) || undefined;
        }
        if (channel && channel.isTextBased()) {
          try {
            const msg = await (channel as TextChannel).messages.fetch(menu.messageId);
            if (msg) await msg.delete();
          } catch (e) {
            // Ignore message deletion error if already deleted
          }
        }
      }

      await prisma.reactionRoleMenu.delete({
        where: { id: menuId }
      });

      res.json({ success: true });
      logger.info(`Dashboard: Berhasil menghapus Reaction Role menu ${menuId} untuk guild ${guildId}.`);
    } catch (error) {
      logger.error(`Error deleting reaction role menu ${menuId} for guild ${guildId}:`, error);
      res.status(500).json({ error: "Gagal menghapus Reaction Role menu." });
    }
  });

  // --- GUILD JOIN REQUESTS & MEMBER APPROVALS ---

  // Get join requests for guild
  app.get("/api/join-requests/:guildId", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    const status = (req.query.status as any) || "SUBMITTED";
    try {
      const data = await getGuildJoinRequests(guildId, status);
      res.json(data);
    } catch (error: any) {
      logger.error(`Error fetching join requests for guild ${guildId}:`, error);
      res.status(500).json({ error: error.message || "Gagal mengambil daftar join request." });
    }
  });

  // Action (approve or reject) a join request
  app.post("/api/join-requests/:guildId/:requestId/action", authMiddleware, async (req: Request, res: Response) => {
    const { guildId, requestId } = req.params;
    const { action, rejectionReason } = req.body;

    if (!action || !["APPROVED", "REJECTED"].includes(action)) {
      return res.status(400).json({ error: "Action harus 'APPROVED' atau 'REJECTED'." });
    }

    try {
      const updatedRequest = await actionGuildJoinRequest(guildId, requestId, action, rejectionReason);
      res.json({ success: true, request: updatedRequest });
    } catch (error: any) {
      logger.error(`Error executing action ${action} on join request ${requestId}:`, error);
      res.status(400).json({ error: error.message || `Gagal mengeksekusi ${action} pada permohonan.` });
    }
  });

  // Get pending members inside guild (Membership screening)
  app.get("/api/join-requests/:guildId/pending-members", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    try {
      const data = await getPendingGuildMembers(client, guildId);
      res.json(data);
    } catch (error: any) {
      logger.error(`Error fetching pending members for guild ${guildId}:`, error);
      res.status(500).json({ error: error.message || "Gagal mengambil data pending members." });
    }
  });

  // Approve pending member by giving role
  app.post("/api/join-requests/:guildId/pending-members/:userId/approve", authMiddleware, async (req: Request, res: Response) => {
    const { guildId, userId } = req.params;
    const { roleId } = req.body;
    try {
      const result = await approvePendingMember(client, guildId, userId, roleId);
      res.json(result);
    } catch (error: any) {
      logger.error(`Error approving pending member ${userId} in guild ${guildId}:`, error);
      res.status(400).json({ error: error.message || "Gagal menyetujui pending member." });
    }
  });

  // Reject / kick pending member
  app.post("/api/join-requests/:guildId/pending-members/:userId/reject", authMiddleware, async (req: Request, res: Response) => {
    const { guildId, userId } = req.params;
    const { reason } = req.body;
    try {
      const result = await kickPendingMember(client, guildId, userId, reason);
      res.json(result);
    } catch (error: any) {
      logger.error(`Error kicking pending member ${userId} in guild ${guildId}:`, error);
      res.status(400).json({ error: error.message || "Gagal menolak / kick pending member." });
    }
  });

  // ==========================================
  // LANDING PAGE ENDPOINTS (THE CHECKPOINT)
  // ==========================================

  // Public Landing Page Stats Endpoint for The Checkpoint Bonfire
  app.get("/api/landing/stats", async (req: Request, res: Response) => {
    try {
      // Find The Checkpoint guild from client cache
      let checkpointGuild = client.guilds.cache.find(g => 
        g.name.toLowerCase().includes("checkpoint")
      ) || client.guilds.cache.first();

      const guildName = checkpointGuild ? checkpointGuild.name : "THE CHECKPOINT";
      const guildIcon = checkpointGuild?.iconURL({ size: 256 }) || null;
      const memberCount = checkpointGuild?.memberCount || 1429;

      // 1. DYNAMICALLY SCAN ALL REAL VOICE CHANNELS LIVE
      const voiceMembers: any[] = [];
      const liveVoiceActivities: LandingActivityItem[] = [];
      let totalVoiceUsers = 0;

      if (checkpointGuild) {
        // Ensure guild cache is populated
        if (checkpointGuild.members.cache.size <= 2) {
          await checkpointGuild.members.fetch().catch(() => {});
        }

        checkpointGuild.channels.cache.forEach(channel => {
          if (channel.isVoiceBased()) {
            channel.members.forEach(member => {
              if (!member.user.bot) {
                totalVoiceUsers++;
                const vItem = {
                  id: member.id,
                  username: member.user.username,
                  displayName: member.displayName || member.user.username,
                  avatar: member.user.displayAvatarURL({ extension: "png", size: 128 }),
                  level: 1,
                  xp: 100,
                  status: "voice" as const,
                  role: `Active in ${channel.name}`,
                  channelName: channel.name,
                  channelId: channel.id
                };
                voiceMembers.push(vItem);

                liveVoiceActivities.push({
                  id: `voice-${member.id}-${channel.id}`,
                  username: member.displayName || member.user.username,
                  avatar: member.user.displayAvatarURL({ extension: "png", size: 128 }),
                  action: `sedang aktif di Voice ${channel.name} 🎙️`,
                  time: "Sedang berlangsung",
                  type: "voice"
                });
              }
            });
          }
        });
      }

      // 2. DYNAMICALLY SCAN RECENT REAL CHAT MESSAGES FROM CHANNELS
      const liveChatActivities: LandingActivityItem[] = [];
      if (checkpointGuild) {
        const textChannels = Array.from(checkpointGuild.channels.cache.values())
          .filter(c => c.isTextBased() && "messages" in c && !c.name.includes("history") && !c.name.includes("log") && !c.name.includes("bot"))
          .slice(0, 5);

        for (const tc of textChannels) {
          try {
            const msgs = await (tc as any).messages.fetch({ limit: 3 });
            msgs.forEach((m: any) => {
              if (!m.author.bot && m.content && m.content.trim().length > 0 && !m.content.startsWith("!")) {
                const diffMinutes = Math.max(1, Math.round((Date.now() - m.createdTimestamp) / 60000));
                const timeStr = diffMinutes < 60 ? `${diffMinutes}m lalu` : `${Math.round(diffMinutes / 60)}j lalu`;
                const cleanContent = m.content.replace(/<@!?\d+>/g, "").trim();
                const preview = cleanContent.length > 32 ? cleanContent.slice(0, 30) + "..." : cleanContent;
                
                liveChatActivities.push({
                  id: `msg-${m.id}`,
                  username: m.member?.displayName || m.author.displayName || m.author.username,
                  avatar: m.author.displayAvatarURL({ extension: "png", size: 128 }),
                  action: `mengobrol di #${tc.name}: "${preview}" 💬`,
                  time: timeStr,
                  type: "message"
                });
              }
            });
          } catch (_) {}
        }
      }

      // 3. COMBINE DYNAMIC ACTIVITIES (Voice first, then live sparks, then recent messages)
      const combinedActivities: LandingActivityItem[] = [
        ...liveVoiceActivities,
        ...recentServerActivities.filter(a => a.type === "spark").slice(0, 3),
        ...liveChatActivities.slice(0, 6)
      ];

      // 4. FETCH ACTIVE MEMBERS (Prioritize anyone in voice right now, then top XP from DB)
      let activeMembers: any[] = [...voiceMembers];
      const seenUserIds = new Set(voiceMembers.map(m => m.id));

      try {
        if (checkpointGuild) {
          const topUsers = await prisma.userLevel.findMany({
            where: { guildId: checkpointGuild.id },
            orderBy: { xp: "desc" },
            take: 15
          });

          for (const u of topUsers) {
            if (seenUserIds.has(u.userId)) continue;
            seenUserIds.add(u.userId);

            const discordMember = checkpointGuild.members.cache.get(u.userId);
            const avatarUrl = discordMember 
              ? discordMember.user.displayAvatarURL({ extension: "png", size: 128 })
              : `https://cdn.discordapp.com/embed/avatars/${parseInt(u.userId.slice(-2)) % 5}.png`;
            
            activeMembers.push({
              id: u.userId,
              username: u.username,
              displayName: discordMember?.displayName || u.username,
              avatar: avatarUrl,
              level: u.level || 1,
              xp: u.xp || 0,
              status: discordMember?.voice?.channelId ? "voice" : "online",
              role: (u.level && u.level > 10) ? "Elder Guardian" : "Fire Keeper"
            });
          }
        }
      } catch (e) {
        // Fallback gracefully if DB is offline
      }

      // If active members still needed, fill from verified real Checkpoint members
      if (activeMembers.length < 5) {
        const realCheckpointGuardians = [
          {
            id: "939847522971709450",
            username: "amubhya",
            displayName: "amubhya",
            avatar: "https://cdn.discordapp.com/avatars/939847522971709450/4ec41b2feeddeee73c8610de6232f3f2.png?size=128",
            level: 19,
            xp: 21261,
            status: "online",
            role: "Server Pioneer & Elder"
          },
          {
            id: "1396267202289864785",
            username: "nararas_",
            displayName: "naaa",
            avatar: "https://cdn.discordapp.com/avatars/1396267202289864785/ecaf23184362a6382a761dd47e7201ea.png?size=128",
            level: 18,
            xp: 18730,
            status: "online",
            role: "Senior Guardian"
          },
          {
            id: "1431690979378724925",
            username: "selina444__23366",
            displayName: "Selina444",
            avatar: "https://cdn.discordapp.com/embed/avatars/2.png",
            level: 15,
            xp: 12434,
            status: "online",
            role: "Bonfire Keeper"
          },
          {
            id: "1427871927283749028",
            username: "jun_misugi96",
            displayName: "KarlHeinzSchneider",
            avatar: "https://cdn.discordapp.com/avatars/1427871927283749028/da13324bf7180b5735a3f6c55bb19aee.png?size=128",
            level: 12,
            xp: 8200,
            status: "online",
            role: "Guardian of The Hearth"
          },
          {
            id: "1426948435826708615",
            username: "khairilumam2104",
            displayName: "REL SIBUK",
            avatar: "https://cdn.discordapp.com/avatars/1426948435826708615/f51487cfa076dcc63df7111ec1ec86ae.png?size=128",
            level: 10,
            xp: 4880,
            status: "online",
            role: "Wanderer Sentinel"
          },
          {
            id: "974161822695428147",
            username: "karrlsefni_22",
            displayName: "KAL VOID",
            avatar: "https://cdn.discordapp.com/avatars/974161822695428147/0a32828c0ffed98cd1a9b131e0572df1.png?size=128",
            level: 9,
            xp: 3800,
            status: "online",
            role: "Void Stargazer"
          },
          {
            id: "1436539511608971314",
            username: "tasy0_6",
            displayName: "Cimy 🦖",
            avatar: "https://cdn.discordapp.com/avatars/1436539511608971314/7c85d10e9d3ef003f758afcd6cd315f2.png?size=128",
            level: 6,
            xp: 2020,
            status: "online",
            role: "Dino Guardian"
          }
        ];

        for (const g of realCheckpointGuardians) {
          if (!seenUserIds.has(g.id)) {
            seenUserIds.add(g.id);
            activeMembers.push(g);
          }
        }
      }

      const bonfire = bonfireManager.getState();
      const inviteUrl = process.env.DISCORD_INVITE_URL || "https://discord.gg/TVKcyQqB3";

      res.json({
        serverName: guildName,
        tagline: "A Sanctuary for Travelers & Night Owls • Discord Community",
        icon: guildIcon,
        totalMembers: memberCount,
        onlineCount: checkpointGuild ? checkpointGuild.members.cache.filter(m => !m.user.bot).size : 1429,
        voiceCount: bonfire.voiceCount,
        voiceMembers: bonfire.voiceMembers,
        energy: Math.round(bonfire.energy * 100),
        energyDecimal: bonfire.energy,
        totalSparks: bonfire.sparks,
        streakDays: bonfire.streakDays,
        streakTier: bonfire.streakTier,
        streakMultiplier: bonfire.streakMultiplier,
        bonfireState: bonfire,
        inviteUrl,
        activeMembers,
        recentActivity: combinedActivities.length > 0 ? combinedActivities : [
          { id: "1", username: "amubhya", avatar: "https://cdn.discordapp.com/avatars/939847522971709450/4ec41b2feeddeee73c8610de6232f3f2.png?size=128", action: "berada di sanctuary The Checkpoint ✨", time: "Aktif", type: "message" }
        ]
      });
    } catch (error) {
      logger.error("Error generating landing stats:", error);
      res.status(500).json({ error: "Gagal memuat stats landing." });
    }
  });

  // Public Spark Trigger for visitors/members
  app.post("/api/landing/spark", (req: Request, res: Response) => {
    const { username, avatar } = req.body;
    const user = username || "Pengelana";
    const newState = bonfireManager.addActivitySpark(5);

    broadcastLandingActivity({
      username: user,
      avatar: avatar,
      action: "menambahkan spark ke api unggun 🔥",
      type: "spark"
    });

    if (ioInstance) {
      ioInstance.emit("bonfireUpdate", newState);
    }

    res.json({
      success: true,
      bonfireState: newState
    });
  });

  // Public Endpoint to search or list Checkpoint members for Social Share Story
  app.get("/api/landing/search-members", async (req: Request, res: Response) => {
    try {
      const q = ((req.query.q as string) || "").trim().toLowerCase();
      let checkpointGuild = client.guilds.cache.find(g => 
        g.name.toLowerCase().includes("checkpoint") || g.id === "1527510081284079728"
      ) || client.guilds.cache.first();

      if (!checkpointGuild) {
        return res.json({ members: [] });
      }

      const results: any[] = [];
      const seen = new Set<string>();

      // 1. Prioritize Voice channel members
      checkpointGuild.channels.cache.forEach(ch => {
        if (ch.isVoiceBased()) {
          ch.members.forEach(m => {
            if (!m.user.bot && !seen.has(m.id)) {
              const nameMatches = !q || m.user.username.toLowerCase().includes(q) || (m.displayName && m.displayName.toLowerCase().includes(q));
              if (nameMatches) {
                seen.add(m.id);
                results.push({
                  id: m.id,
                  username: m.user.username,
                  displayName: m.displayName || m.user.username,
                  avatar: m.user.displayAvatarURL({ extension: "png", size: 128 }),
                  inVoice: true,
                  channelName: ch.name,
                  role: "Voice Traveler"
                });
              }
            }
          });
        }
      });

      // 2. Check Database user levels (XP leaders)
      try {
        const dbUsers = await prisma.userLevel.findMany({
          where: {
            guildId: checkpointGuild.id,
            ...(q ? {
              OR: [
                { username: { contains: q, mode: "insensitive" } },
                { userId: { contains: q } }
              ]
            } : {})
          },
          orderBy: { xp: "desc" },
          take: 20
        });

        for (const u of dbUsers) {
          if (!seen.has(u.userId)) {
            seen.add(u.userId);
            const m = checkpointGuild.members.cache.get(u.userId);
            results.push({
              id: u.userId,
              username: u.username,
              displayName: m?.displayName || u.username,
              avatar: m ? m.user.displayAvatarURL({ extension: "png", size: 128 }) : `https://cdn.discordapp.com/embed/avatars/${parseInt(u.userId.slice(-2)) % 5}.png`,
              inVoice: !!m?.voice?.channelId,
              channelName: m?.voice?.channel?.name || null,
              role: u.level > 10 ? "Elder Guardian" : "Hearth Keeper",
              level: u.level
            });
          }
        }
      } catch (_) {}

      // 3. Fallback to cached guild members if query provided and results < 15
      if (q && results.length < 15) {
        for (const m of checkpointGuild.members.cache.values()) {
          if (m.user.bot || seen.has(m.id)) continue;
          if (m.user.username.toLowerCase().includes(q) || (m.displayName && m.displayName.toLowerCase().includes(q))) {
            seen.add(m.id);
            results.push({
              id: m.id,
              username: m.user.username,
              displayName: m.displayName || m.user.username,
              avatar: m.user.displayAvatarURL({ extension: "png", size: 128 }),
              inVoice: !!m.voice?.channelId,
              channelName: m.voice?.channel?.name || null,
              role: "Checkpoint Traveler"
            });
            if (results.length >= 25) break;
          }
        }
      }

      res.json({ members: results.slice(0, 25) });
    } catch (err: any) {
      logger.error("Error searching landing members:", err);
      res.status(500).json({ error: "Gagal mencari member." });
    }
  });

  // Public Endpoint to proxy Discord avatar for CORS-free Canvas Story export
  app.get("/api/landing/proxy-avatar", async (req: Request, res: Response) => {
    try {
      const targetUrl = req.query.url as string;
      if (!targetUrl || (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://"))) {
        return res.status(400).send("Invalid avatar URL");
      }

      const allowedHosts = ["cdn.discordapp.com", "media.discordapp.net", "images.unsplash.com"];
      const parsed = new URL(targetUrl);
      if (!allowedHosts.some(h => parsed.hostname.endsWith(h))) {
        return res.status(403).send("Host not allowed");
      }

      const response = await fetch(targetUrl);
      if (!response.ok) {
        return res.status(response.status).send("Failed to fetch image");
      }

      const buffer = await response.arrayBuffer();
      res.setHeader("Content-Type", response.headers.get("content-type") || "image/png");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.send(Buffer.from(buffer));
    } catch (err: any) {
      res.status(500).send("Proxy error: " + err.message);
    }
  });

  // ==========================================
  // SPA ROUTING
  // ==========================================

  // Serve Backoffice Dashboard on /dashboard or /admin
  app.get(["/dashboard", "/dashboard/*", "/admin", "/admin/*"], (req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, "dashboard.html"));
  });

  // Catch-all route to serve the Landing Page (The Checkpoint)
  app.get("*", (req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, "index.html"));
  });

  const httpServer = http.createServer(app);

  // Initialize Socket.IO on the server
  const io = new Server(httpServer, {
    cors: { origin: "*" }
  });
  ioInstance = io;

  io.on("connection", (socket) => {
    const currentState = bonfireManager.getState();
    socket.emit("bonfireState", {
      ...currentState,
      recentActivity: recentServerActivities.slice(0, 6)
    });

    socket.on("addSpark", (data) => {
      const newState = bonfireManager.addActivitySpark(5);
      const activity: LandingActivityItem = {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
        username: data?.username || "Pengelana",
        avatar: data?.avatar || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80",
        action: "menambahkan spark ke api unggun 🔥",
        time: "Baru saja",
        type: "spark"
      };
      recentServerActivities.unshift(activity);
      if (recentServerActivities.length > 25) recentServerActivities.pop();
      io.emit("bonfireUpdate", newState);
      io.emit("serverActivity", activity);
    });
  });

  httpServer.listen(Number(port), "0.0.0.0", () => {
    logger.info(`Web Dashboard & The Checkpoint Landing berjalan di http://localhost:${port}`);
  });
}
