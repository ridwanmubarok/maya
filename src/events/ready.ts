import { Events, REST, Routes } from "discord.js";
import { BotEvent, MayaClient } from "../types";
import { logger } from "../utils/logger";

const event: BotEvent = {
  name: Events.ClientReady,
  once: true,
  async execute(client: MayaClient) {
    logger.info(`Bot berhasil login sebagai ${client.user?.tag}!`);

    // Prepare commands data for registration
    const commandData = client.commands.map(cmd => cmd.data.toJSON());
    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.CLIENT_ID;

    if (!token || !clientId) {
      logger.error("DISCORD_TOKEN atau CLIENT_ID tidak ditentukan. Slash Commands tidak didaftarkan.");
      return;
    }

    // Periksa apakah CLIENT_ID adalah angka murni (Snowflake)
    if (!/^\d+$/.test(clientId)) {
      logger.error(`CLIENT_ID "${clientId}" tidak valid (harus berupa deretan angka/snowflake). Harap isi CLIENT_ID asli Anda di file .env.`);
      return;
    }

    const rest = new REST({ version: "10" }).setToken(token);

    try {
      logger.info(`Mulai mendaftarkan ${commandData.length} slash command...`);

      // 1. Register global commands
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commandData }
      );
      logger.info(`Sukses mendaftarkan global slash commands.`);

      // 2. Register instant guild commands for all connected servers
      const guilds = client.guilds.cache;
      for (const [guildId, guild] of guilds) {
        try {
          await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commandData }
          );
          logger.info(`Sukses mendaftarkan instant slash commands ke server: ${guild.name} (${guildId})`);
        } catch (e) {
          logger.warn(`Gagal mendaftarkan guild commands untuk ${guild.name}: ${e}`);
        }
      }
    } catch (error) {
      logger.error("Gagal mendaftarkan slash command:", error);
    }
  }
};

export default event;
