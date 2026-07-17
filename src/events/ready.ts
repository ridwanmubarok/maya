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
      logger.info(`Mulai mendaftarkan ${commandData.length} global slash command...`);

      // Register commands globally (highly recommended for production/public bots)
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commandData }
      );

      logger.info(`Sukses mendaftarkan global slash commands.`);
    } catch (error) {
      logger.error("Gagal mendaftarkan slash command:", error);
    }
  }
};

export default event;
