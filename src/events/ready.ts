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
      logger.info(`Mendaftarkan ${commandData.length} global slash command...`);

      // 1. Register Global Commands ONLY (to prevent command duplication)
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commandData }
      );
      logger.info(`Sukses mendaftarkan global slash commands.`);

      // 2. Clear any leftover duplicate per-guild commands if any exist
      const guilds = client.guilds.cache;
      for (const [guildId] of guilds) {
        try {
          await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: [] }
          );
        } catch {
          // Ignore if guild command clearance fails
        }
      }
    } catch (error) {
      logger.error("Gagal mendaftarkan slash command:", error);
    }
  }
};

export default event;
