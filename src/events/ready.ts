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
      logger.info(`Mendaftarkan ${commandData.length} slash commands secara instan (Guild Commands)...`);

      // 1. Membersihkan Global Commands lama (agar TIDAK DUPLIKAT di Discord)
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: [] }
      ).catch(() => {});

      // 2. Mendaftarkan langsung per-Guild agar instan (0 DETIK DELAY)
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

      logger.info(`Sukses mendaftarkan ${commandData.length} slash commands secara INSTAN (0 detik delay) tanpa duplikasi!`);
    } catch (error) {
      logger.error("Gagal mendaftarkan slash command:", error);
    }
  }
};

export default event;
