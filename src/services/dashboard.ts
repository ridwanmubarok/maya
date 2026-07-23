import express, { Request, Response, NextFunction } from "express";
import path from "path";
import { MayaClient } from "../types";
import { prisma } from "./database";
import { getMusicManager } from "./musicManager";
import { logger } from "../utils/logger";
import { EmbedBuilder, TextChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { createMabarEmbed, createMabarButtons } from "./mabarManager";

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
    const { channelId, title, description, color, bannerUrl, thumbnailUrl, buttonLabel, buttonUrl, mention } = req.body;

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
      const warnings = await prisma.warnLog.findMany({
        where: { guildId },
        orderBy: { createdAt: "desc" }
      });

      // Enrich warning logs with user tags and avatar URLs from Discord API/cache
      const enrichedWarnings = await Promise.all(
        warnings.map(async (log) => {
          let userTag = `ID: ${log.userId}`;
          let userAvatar = "https://cdn.discordapp.com/embed/avatars/0.png";
          try {
            const user = await client.users.fetch(log.userId).catch(() => null);
            if (user) {
              userTag = user.tag;
              userAvatar = user.displayAvatarURL({ size: 64 }) || userAvatar;
            }
          } catch (e) {
            // Ignore fetch error
          }
          return {
            ...log,
            userTag,
            userAvatar
          };
        })
      );

      res.json({ warnings: enrichedWarnings });
    } catch (error: any) {
      logger.error(`Error fetching warnings for guild ${guildId}:`, error);
      if (error.code === "P2021") {
        return res.status(500).json({ error: "Tabel database belum dibuat. Silakan jalankan 'npm run db:push' di terminal Anda." });
      }
      res.status(500).json({ error: "Gagal mengambil log strike." });
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
  });  // Get music status and queue (Requires Auth)
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
        playerState: manager.player.state.status,
        volume: manager.volume
      });
    } catch (error) {
      logger.error(`Error fetching music status for guild ${guildId}:`, error);
      res.status(500).json({ error: "Gagal mengambil status musik." });
    }
  });

  // Control music playback (Requires Auth)
  app.post("/api/music/:guildId/control", authMiddleware, (req: Request, res: Response) => {
    const { guildId } = req.params;
    const { action, value } = req.body;

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
      } else if (action === "volume") {
        if (typeof value === "number") {
          manager.setVolume(value);
          return res.json({ success: true, volume: manager.volume });
        }
        return res.status(400).json({ error: "Nilai volume tidak valid." });
      }

      res.status(400).json({ error: "Aksi tidak dikenal." });
    } catch (error) {
      logger.error(`Error controlling music for guild ${guildId}:`, error);
      res.status(500).json({ error: "Gagal mengontrol musik." });
    }
  });


  // Get all roles for a guild (Requires Auth)
  app.get("/api/roles/:guildId", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return res.status(404).json({ error: "Server tidak ditemukan." });

      const roles = guild.roles.cache
        .map(r => ({
          id: r.id,
          name: r.name,
          color: r.hexColor,
          hoist: r.hoist,
          position: r.position,
          memberCount: r.members.size,
          managed: r.managed
        }))
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

      const channel = guild.channels.cache.get(channelId);
      if (!channel || !channel.isTextBased()) {
        return res.status(404).json({ error: "Channel teks tidak ditemukan." });
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

  // Catch-all route to serve the SPA
  app.get("*", (req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, "index.html"));
  });

  app.listen(port, () => {
    logger.info(`Web Dashboard (Backoffice) berjalan di http://localhost:${port}`);
  });
}
