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
import { tebakManager } from "./tebakManager";

const app = express();
app.use(express.json());

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
          aiPersonality: "Anda adalah Maya, asisten AI pintar di server Discord ini. Jawablah pertanyaan dengan sopan, cerdas, dan membantu.",
          bannedWords: "anjing,babi,bangsat,kontol,memek,goblok,tolol,bajingan",
          maxStrikes: 3,
          muteDuration: 10,
          createdAt: new Date(),
          updatedAt: new Date()
        };
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
        orderBy: { score: "desc" },
        take: 15
      });

      const totalStats = await prisma.triviaScore.aggregate({
        where: { guildId },
        _sum: { score: true },
        _count: { id: true }
      });

      res.json({
        success: true,
        balances: topBalances,
        totalCirculating: totalStats._sum.score || 0,
        totalWallets: totalStats._count.id || 0
      });
    } catch (error: any) {
      logger.error(`Error fetching economy data for guild ${guildId}:`, error);
      res.status(500).json({ error: "Gagal memuat data ekonomi server." });
    }
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
      bannedWords,
      maxStrikes,
      muteDuration,
      dailyRiddleChannelId,
      dailyRiddleEnabled,
      dailyRiddlePostHour,
      dailyLeaderboardPostHour,
      dailyRiddleRewardAmount,
      dailyRiddleCloseRewardAmount,
      menfessChannelId,
      menfessEnabled,
      voiceRewardEnabled,
      voiceRewardIntervalMin,
      voiceRewardAmount
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
      if (bannedWords !== undefined) updateData.bannedWords = bannedWords;
      if (maxStrikes !== undefined) updateData.maxStrikes = Number(maxStrikes);
      if (muteDuration !== undefined) updateData.muteDuration = Number(muteDuration);
      if (dailyRiddleChannelId !== undefined) updateData.dailyRiddleChannelId = dailyRiddleChannelId || null;
      if (dailyRiddleEnabled !== undefined) updateData.dailyRiddleEnabled = Boolean(dailyRiddleEnabled);
      if (dailyRiddlePostHour !== undefined) updateData.dailyRiddlePostHour = Number(dailyRiddlePostHour);
      if (dailyLeaderboardPostHour !== undefined) updateData.dailyLeaderboardPostHour = Number(dailyLeaderboardPostHour);
      if (dailyRiddleRewardAmount !== undefined) updateData.dailyRiddleRewardAmount = Number(dailyRiddleRewardAmount);
      if (dailyRiddleCloseRewardAmount !== undefined) updateData.dailyRiddleCloseRewardAmount = Number(dailyRiddleCloseRewardAmount);
      if (menfessChannelId !== undefined) updateData.menfessChannelId = menfessChannelId || null;
      if (menfessEnabled !== undefined) updateData.menfessEnabled = Boolean(menfessEnabled);
      if (voiceRewardEnabled !== undefined) updateData.voiceRewardEnabled = Boolean(voiceRewardEnabled);
      if (voiceRewardIntervalMin !== undefined) updateData.voiceRewardIntervalMin = Number(voiceRewardIntervalMin);
      if (voiceRewardAmount !== undefined) updateData.voiceRewardAmount = Number(voiceRewardAmount);

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
    const { channelId, game, description, playTime, maxPlayers } = req.body;

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
          maxPlayers: maxPlayers ? Number(maxPlayers) : null,
          creatorId: "Dashboard Admin",
          participants: [] // Empty list to start or with dummy
        }
      });

      // Construct Embed and Buttons
      const embed = createMabarEmbed({
        id: tempSession.id,
        game,
        description,
        playTime,
        maxPlayers: maxPlayers ? Number(maxPlayers) : null,
        creatorId: "Dashboard Admin",
        participants: []
      });

      const buttons = createMabarButtons(tempSession.id);

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

  // Catch-all route to serve the SPA
  app.get("*", (req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, "index.html"));
  });

  const httpServer = http.createServer(app);

  httpServer.listen(Number(port), "0.0.0.0", () => {
    logger.info(`Web Dashboard berjalan di http://localhost:${port}`);
  });
}
