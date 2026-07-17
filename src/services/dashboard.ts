import express, { Request, Response, NextFunction } from "express";
import path from "path";
import { MayaClient } from "../types";
import { prisma } from "./database";
import { logger } from "../utils/logger";

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
    } catch (error) {
      logger.error(`Error fetching config for guild ${guildId}:`, error);
      res.status(500).json({ error: "Gagal mengambil konfigurasi server." });
    }
  });

  // Save/Update configuration for a specific guild (Requires Auth)
  app.post("/api/configs/:guildId", authMiddleware, async (req: Request, res: Response) => {
    const { guildId } = req.params;
    const { 
      welcomeChannelId, 
      welcomeTitle, 
      welcomeMessage, 
      welcomeImage, 
      welcomeThumbnail 
    } = req.body;

    try {
      const updatedConfig = await prisma.guildConfig.upsert({
        where: { guildId },
        update: {
          welcomeChannelId: welcomeChannelId || null,
          welcomeTitle: welcomeTitle !== undefined ? welcomeTitle : "👋 Selamat Datang!",
          welcomeMessage: welcomeMessage !== undefined ? welcomeMessage : "",
          welcomeImage: welcomeImage !== undefined ? welcomeImage : "",
          welcomeThumbnail: welcomeThumbnail !== undefined ? welcomeThumbnail : true
        },
        create: {
          guildId,
          welcomeChannelId: welcomeChannelId || null,
          welcomeTitle: welcomeTitle || "👋 Selamat Datang!",
          welcomeMessage: welcomeMessage || "",
          welcomeImage: welcomeImage || "",
          welcomeThumbnail: welcomeThumbnail !== undefined ? welcomeThumbnail : true
        }
      });

      res.json({ success: true, config: updatedConfig });
      logger.info(`Dashboard: Konfigurasi guild ${guildId} berhasil diperbarui.`);
    } catch (error) {
      logger.error(`Error saving config for guild ${guildId}:`, error);
      res.status(500).json({ error: "Gagal menyimpan konfigurasi server." });
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
