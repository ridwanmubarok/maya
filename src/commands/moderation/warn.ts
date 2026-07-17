import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction } from "discord.js";
import { Command } from "../../types";
import { prisma } from "../../services/database";
import { createEmbed } from "../../utils/embeds";
import { logModeration } from "../../utils/moderationLogger";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Memberikan strike/peringatan resmi kepada user")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(opt =>
      opt
        .setName("user")
        .setDescription("User yang ingin diperingatkan")
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName("alasan")
        .setDescription("Alasan pemberian peringatan")
        .setRequired(true)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const targetUser = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("alasan", true);
    const guildId = interaction.guildId!;

    if (targetUser.bot) {
      await interaction.reply({
        embeds: [createEmbed.error("Gagal", "Anda tidak bisa memberikan peringatan kepada bot.")],
        ephemeral: true
      });
      return;
    }

    // Save warning log to PostgreSQL via Prisma
    const log = await prisma.warnLog.create({
      data: {
        userId: targetUser.id,
        guildId,
        reason,
        moderatorId: interaction.user.id
      }
    });

    // Get current total warnings for target
    const totalWarns = await prisma.warnLog.count({
      where: {
        userId: targetUser.id,
        guildId
      }
    });

    const embed = createEmbed.warning(
      "Peringatan Diberikan",
      `**User:** ${targetUser} (${targetUser.tag})\n` +
      `**Moderator:** ${interaction.user}\n` +
      `**Alasan:** ${reason}\n` +
      `**Total Warning:** \`${totalWarns}\` strike(s)\n\n` +
      `*Pesan ini tercatat di database.*`
    );

    // Kirim moderation log channel
    if (interaction.guild) {
      await logModeration(
        interaction.guild,
        "WARN",
        { id: targetUser.id, tag: targetUser.tag },
        { id: interaction.user.id, tag: interaction.user.tag },
        reason,
        `Total Strike Sekarang: ${totalWarns}`
      );
    }

    // Send warnings in DM to user, safely catching if DMs are closed
    try {
      await targetUser.send({
        embeds: [createEmbed.warning(
          "Anda Menerima Peringatan",
          `Anda telah diperingatkan di server **${interaction.guild?.name}**.\n` +
          `**Alasan:** ${reason}\n` +
          `**Total Strike:** \`${totalWarns}\``
        )]
      });
    } catch (e) {
      // DMs are closed, ignore
    }

    await interaction.reply({ embeds: [embed] });
  }
};

export default command;
