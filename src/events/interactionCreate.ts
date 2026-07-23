import { Events, Interaction } from "discord.js";
import { BotEvent, MayaClient } from "../types";
import { logger } from "../utils/logger";
import { createEmbed } from "../utils/embeds";

import { handleMabarJoin, handleMabarLeave } from "../services/mabarManager";

const event: BotEvent = {
  name: Events.InteractionCreate,
  async execute(interaction: Interaction) {
    if (interaction.isButton()) {
      const { customId } = interaction;
      if (customId.startsWith("mabar_join:")) {
        const sessionId = customId.split(":")[1];
        await interaction.deferReply({ ephemeral: true });
        const res = await handleMabarJoin(sessionId, interaction.user.id, interaction.client);
        await interaction.editReply({ content: res.message });
        return;
      }
      if (customId.startsWith("mabar_leave:")) {
        const sessionId = customId.split(":")[1];
        await interaction.deferReply({ ephemeral: true });
        const res = await handleMabarLeave(sessionId, interaction.user.id, interaction.client);
        await interaction.editReply({ content: res.message });
        return;
      }
      if (customId.startsWith("rr:")) {
        const roleId = customId.split(":")[1];
        await interaction.deferReply({ ephemeral: true });

        const member = interaction.member && "roles" in interaction.member ? (interaction.member as any) : null;
        if (!member || !interaction.guild) {
          await interaction.editReply({ content: "❌ Perintah hanya dapat dijalankan di dalam server." });
          return;
        }

        const role = interaction.guild.roles.cache.get(roleId) || await interaction.guild.roles.fetch(roleId).catch(() => null);
        if (!role) {
          await interaction.editReply({ content: "❌ Role tidak ditemukan di server." });
          return;
        }

        const hasRole = member.roles.cache.has(role.id);
        try {
          if (hasRole) {
            await member.roles.remove(role);
            await interaction.editReply({ content: `ℹ️ Role **${role.name}** berhasil dilepaskan!` });
          } else {
            await member.roles.add(role);
            await interaction.editReply({ content: `✅ Role **${role.name}** berhasil ditambahkan!` });
          }
        } catch (err: any) {
          logger.error(`Error toggling reaction role ${role.name}:`, err);
          await interaction.editReply({ content: `❌ Bot tidak memiliki izin untuk mengelola role **${role.name}**. (Pastikan posisi role bot lebih tinggi di server).` });
        }
        return;
      }
    }

    if (interaction.isAutocomplete()) {
      const client = interaction.client as MayaClient;
      const command = client.commands.get(interaction.commandName);
      if (command && typeof command.autocomplete === "function") {
        try {
          await command.autocomplete(interaction);
        } catch (error: any) {
          if (error?.code !== 10062) {
            logger.error(`Error saat autocomplete command /${interaction.commandName}:`, error);
          }
        }
      }
      return;
    }

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
