import express, { Request, Response, NextFunction } from "express";
import path from "path";
import { MayaClient } from "../types";
import { prisma } from "./database";
import { getMusicManager } from "./musicManager";
import { logger } from "../utils/logger";
import { EmbedBuilder, TextChannel } from "discord.js";

const app = express();
app.use(express.json());

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
      let config = await prisma.guildConfig.findUnique({
        where: { guildId }
      });

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

      // Fetch guild channels to let the user select welcome channel
      const guild = client.guilds.cache.get(guildId);
      const channels = guild 
        ? guild.channels.cache
            .filter(c => c.type === 0) // 0 is text channel (GuildText)
            .map(c => ({ id: c.id, name: c.name }))
        : [];

      res.json({ config, channels });
    } catch (error: any) {
      logger.error(`Error fetching config for guild ${guildId}:`, error);
      if (error.code === "P2021") {
        return res.status(500).json({ error: "Tabel database belum dibuat. Silakan jalankan 'npm run db:push' di terminal Anda." });
      }
      res.status(500).json({ error: "Gagal mengambil konfigurasi server." });
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
      muteDuration
    } = req.body;

    try {
      const updatedConfig = await prisma.guildConfig.upsert({
        where: { guildId },
        update: {
          welcomeChannelId: welcomeChannelId || null,
          moderationLogChannelId: moderationLogChannelId || null,
          welcomeTitle: welcomeTitle !== undefined ? welcomeTitle : "👋 Selamat Datang!",
          welcomeMessage: welcomeMessage !== undefined ? welcomeMessage : "",
          welcomeImage: welcomeImage !== undefined ? welcomeImage : "",
          welcomeThumbnail: welcomeThumbnail !== undefined ? welcomeThumbnail : true,
          aiPersonality: aiPersonality !== undefined ? aiPersonality : "Anda adalah Maya, asisten AI pintar di server Discord ini. Jawablah pertanyaan dengan sopan, cerdas, dan membantu.",
          bannedWords: bannedWords !== undefined ? bannedWords : "anjing,babi,bangsat,kontol,memek,goblok,tolol,bajingan",
          maxStrikes: maxStrikes !== undefined ? Number(maxStrikes) : 3,
          muteDuration: muteDuration !== undefined ? Number(muteDuration) : 10
        },
        create: {
          guildId,
          welcomeChannelId: welcomeChannelId || null,
          moderationLogChannelId: moderationLogChannelId || null,
          welcomeTitle: welcomeTitle || "👋 Selamat Datang!",
          welcomeMessage: welcomeMessage || "",
          welcomeImage: welcomeImage || "",
          welcomeThumbnail: welcomeThumbnail !== undefined ? welcomeThumbnail : true,
          aiPersonality: aiPersonality || "Anda adalah Maya, asisten AI pintar di server Discord ini. Jawablah pertanyaan dengan sopan, cerdas, dan membantu.",
          bannedWords: bannedWords || "anjing,babi,bangsat,kontol,memek,goblok,tolol,bajingan",
          maxStrikes: maxStrikes !== undefined ? Number(maxStrikes) : 3,
          muteDuration: muteDuration !== undefined ? Number(muteDuration) : 10
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
    const { channelId, title, description, color, bannerUrl, thumbnailUrl } = req.body;

    if (!channelId || !description) {
      return res.status(400).json({ error: "Channel dan Deskripsi wajib diisi." });
    }

    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        return res.status(404).json({ error: "Server tidak ditemukan oleh bot." });
      }

      const channel = guild.channels.cache.get(channelId);
      if (!channel || !channel.isTextBased()) {
        return res.status(404).json({ error: "Channel teks tidak ditemukan." });
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

      await textChannel.send({ embeds: [embed] });

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
      const warnings = await prisma.warnLog.findMany({
        where: { guildId },
        orderBy: { createdAt: "desc" }
      });
      res.json({ warnings });
    } catch (error: any) {
      logger.error(`Error fetching warnings for guild ${guildId}:`, error);
      if (error.code === "P2021") {
        return res.status(500).json({ error: "Tabel database belum dibuat. Silakan jalankan 'npm run db:push' di terminal Anda." });
      }
      res.status(500).json({ error: "Gagal mengambil log strike." });
    }
  });

  // Revoke/Delete warning log (Requires Auth)
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

  // Get music status and queue (Requires Auth)
  app.get("/api/music/:guildId", authMiddleware, (req: Request, res: Response) => {
    const { guildId } = req.params;
    try {
      const manager = getMusicManager(guildId);
      const queue = manager.queue;
      const currentTrack = manager.currentTrack;
      const isPlaying = currentTrack !== null && manager.player.state.status === "playing";

      res.json({
        isPlaying,
        currentTrack,
        queue,
        playerState: manager.player.state.status
      });
    } catch (error) {
      logger.error(`Error fetching music status for guild ${guildId}:`, error);
      res.status(500).json({ error: "Gagal mengambil status musik." });
    }
  });

  // Control music playback (Requires Auth)
  app.post("/api/music/:guildId/control", authMiddleware, (req: Request, res: Response) => {
    const { guildId } = req.params;
    const { action } = req.body;

    try {
      const manager = getMusicManager(guildId);

      if (action === "skip") {
        const success = manager.skip();
        return res.json({ success });
      } else if (action === "stop") {
        manager.stop();
        return res.json({ success: true });
      } else if (action === "pause") {
        const success = manager.player.pause();
        return res.json({ success });
      } else if (action === "resume") {
        const success = manager.player.unpause();
        return res.json({ success });
      }

      res.status(400).json({ error: "Aksi tidak dikenal." });
    } catch (error) {
      logger.error(`Error controlling music for guild ${guildId}:`, error);
      res.status(500).json({ error: "Gagal mengontrol musik." });
    }
  });

  // Catch-all route to serve the SPA
  app.get("*", (req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, "index.html"));
  });

  app.listen(port, () => {
    logger.info(`Web Dashboard (Backoffice) berjalan di http://localhost:${port}`);
  });
}
