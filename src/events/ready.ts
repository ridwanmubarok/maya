import { Events, REST, Routes } from "discord.js";
import { BotEvent, MayaClient } from "../types";
import { logger } from "../utils/logger";
import { initDailyRiddleScheduler } from "../services/dailyRiddleScheduler";
import { initVoiceRewardTicker } from "../services/voiceRewardManager";

const event: BotEvent = {
  name: Events.ClientReady,
  once: true,
  async execute(client: MayaClient) {
    logger.info(`Bot berhasil login sebagai ${client.user?.tag}!`);

    // Initialize automatic daily riddle background scheduler & voice reward ticker
    initDailyRiddleScheduler(client);
    initVoiceRewardTicker(client);

    const commandData = client.commands.map(cmd => cmd.data.toJSON());
    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.CLIENT_ID;

    if (!token || !clientId) {
      logger.error("DISCORD_TOKEN atau CLIENT_ID tidak ditentukan. Slash Commands tidak didaftarkan.");
      return;
    }

    if (!/^\d+$/.test(clientId)) {
      logger.error(`CLIENT_ID "${clientId}" tidak valid. Harap isi CLIENT_ID asli di file .env.`);
      return;
    }

    const rest = new REST({ version: "10" }).setToken(token);

    try {
      logger.info(`Mendaftarkan ${commandData.length} slash commands ke ${client.guilds.cache.size} server...`);

      // 1. Mendaftarkan langsung per-Guild agar instan (0 detik delay) tanpa menunggu cache global Discord
      const guilds = client.guilds.cache;
      for (const [guildId] of guilds) {
        try {
          await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commandData }
          );
        } catch (guildErr: any) {
          logger.warn(`Gagal mendaftarkan guild commands untuk ${guildId}: ${guildErr?.message || guildErr}`);
        }
      }

      // 2. Mendaftarkan Global Commands sebagai backup
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commandData }
      );

      logger.info(`Sukses mendaftarkan ${commandData.length} slash commands secara instan!`);
    } catch (error) {
      logger.error("Gagal mendaftarkan slash command:", error);
    }
  }
};

export default event;
