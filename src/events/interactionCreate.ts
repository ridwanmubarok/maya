import { Events, Interaction } from "discord.js";
import { BotEvent, MayaClient } from "../types";
import { logger } from "../utils/logger";
import { createEmbed } from "../utils/embeds";

const event: BotEvent = {
  name: Events.InteractionCreate,
  async execute(interaction: Interaction) {
    if (!interaction.isChatInputCommand()) return;

    const client = interaction.client as MayaClient;
    const command = client.commands.get(interaction.commandName);

    if (!command) {
      logger.warn(`Command tidak dikenal: ${interaction.commandName}`);
      return;
    }

    try {
      logger.debug(`Menjalankan command: ${interaction.commandName} oleh ${interaction.user.tag}`);
      await command.execute(interaction);
    } catch (error) {
      logger.error(`Error saat menjalankan command /${interaction.commandName}:`, error);
      
      const embedError = createEmbed.error(
        "Terjadi Kesalahan",
        "Maaf, terjadi kesalahan saat menjalankan perintah ini. Silakan coba lagi nanti."
      );

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [embedError], ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ embeds: [embedError], ephemeral: true }).catch(() => {});
      }
    }
  }
};

export default event;
