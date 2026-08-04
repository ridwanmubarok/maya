import { ActionRowBuilder, Events, Interaction, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { BotEvent, MayaClient } from "../types";
import { logger } from "../utils/logger";
import { createEmbed } from "../utils/embeds";
import { handleMabarJoin, handleMabarLeave } from "../services/mabarManager";
import { tebakManager } from "../services/tebakManager";
import { submitMenfess } from "../services/menfessService";

const event: BotEvent = {
  name: Events.InteractionCreate,
  async execute(interaction: Interaction) {
    // Handle Button Interactions
    if (interaction.isButton()) {
      const { customId } = interaction;

      if (customId.startsWith("menfess_reply:")) {
        const replyToCode = customId.split(":")[1];
        const modal = new ModalBuilder()
          .setCustomId(`modal_menfess:${replyToCode}`)
          .setTitle(`💬 Balas Anonim #${replyToCode}`);

        const contentInput = new TextInputBuilder()
          .setCustomId("input_menfess_content")
          .setLabel(`Balasan Anonim untuk #${replyToCode}`)
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("Tuliskan balasan anonim kamu di sini...")
          .setMinLength(5)
          .setMaxLength(1000)
          .setRequired(true);

        const row = new ActionRowBuilder<TextInputBuilder>().addComponents(contentInput);
        modal.addComponents(row);

        await interaction.showModal(modal);
        return;
      }

      if (customId.startsWith("tebak_answer:")) {
        const sessionId = customId.split(":")[1];
        await tebakManager.handleButton(interaction, sessionId);
        return;
      }

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
          await interaction.editReply({ content: "Perintah hanya dapat dijalankan di dalam server." });
          return;
        }

        const role = interaction.guild.roles.cache.get(roleId) || await interaction.guild.roles.fetch(roleId).catch(() => null);
        if (!role) {
          await interaction.editReply({ content: "Role tidak ditemukan di server." });
          return;
        }

        const hasRole = member.roles.cache.has(role.id);
        try {
          if (hasRole) {
            await member.roles.remove(role);
            await interaction.editReply({ content: `Role **${role.name}** berhasil dilepaskan.` });
          } else {
            await member.roles.add(role);
            await interaction.editReply({ content: `Role **${role.name}** berhasil ditambahkan.` });
          }
        } catch (err: any) {
          logger.error(`Error toggling reaction role ${role.name}:`, err);
          await interaction.editReply({ content: `Bot tidak memiliki izin untuk mengelola role **${role.name}**.` });
        }
        return;
      }
    }

    // Handle Modal Submissions
    if (interaction.isModalSubmit()) {
      const { customId } = interaction;
      if (customId.startsWith("modal_tebak:")) {
        const sessionId = customId.split(":")[1];
        await tebakManager.handleModalSubmit(interaction, sessionId);
        return;
      }

      if (customId.startsWith("modal_menfess:")) {
        const replyToParam = customId.split(":")[1];
        const replyToCode = replyToParam && replyToParam !== "none" ? replyToParam : undefined;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const content = interaction.fields.getTextInputValue("input_menfess_content");
        let overrideReplyTo: string | undefined = replyToCode;
        try {
          const manualReply = interaction.fields.getTextInputValue("input_menfess_reply_to")?.trim().toUpperCase();
          if (manualReply) overrideReplyTo = manualReply;
        } catch (_) {}

        if (!interaction.guildId) {
          await interaction.editReply({ content: "Perintah ini hanya dapat dijalankan di server." });
          return;
        }

        const result = await submitMenfess(
          interaction.client,
          interaction.guildId,
          interaction.user.id,
          content,
          overrideReplyTo
        );

        if (!result.success) {
          const errEmbed = createEmbed.error("Menfess Gagal Diposting", result.reason || "Pesan tidak dapat diposting.");
          await interaction.editReply({ embeds: [errEmbed] });
          return;
        }

        const successEmbed = createEmbed.success(
          "💌 Menfess Berhasil Diposting!",
          `Pesan anonim kamu telah lolos sensor AI dan berhasil diposting ke <#${result.channelId}> dengan kode **#${result.code}**.`
        );

        await interaction.editReply({ embeds: [successEmbed] });
        return;
      }
    }

    // Handle Autocomplete
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

    // Handle Chat Input Commands
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
  },
};

export default event;
