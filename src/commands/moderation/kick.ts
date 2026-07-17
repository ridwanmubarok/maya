import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction, GuildMember } from "discord.js";
import { Command } from "../../types";
import { createEmbed } from "../../utils/embeds";
import { logModeration } from "../../utils/moderationLogger";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Mengeluarkan member dari server")
    .addUserOption(opt =>
      opt
        .setName("member")
        .setDescription("Member yang ingin dikick")
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName("alasan")
        .setDescription("Alasan mengeluarkan member")
        .setRequired(false)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const executorMember = interaction.member as GuildMember;
    const isServerOwner = interaction.user.id === interaction.guild?.ownerId;
    const hasOwnerRole = executorMember?.roles.cache.some(role => role.name.toLowerCase() === "owner");

    if (!isServerOwner && !hasOwnerRole) {
      await interaction.reply({
        embeds: [createEmbed.error("Akses Ditolak", "Maaf, perintah ini hanya dapat dijalankan oleh pemilik server (Owner) atau anggota dengan role **Owner**.")],
        ephemeral: true
      });
      return;
    }

    const targetMember = interaction.options.getMember("member") as GuildMember | null;
    const reason = interaction.options.getString("alasan") || "Tidak ada alasan yang diberikan";

    if (!targetMember) {
      await interaction.reply({
        embeds: [createEmbed.error("Kesalahan", "Member tidak ditemukan atau berada di luar jangkauan.")],
        ephemeral: true
      });
      return;
    }

    if (!targetMember.kickable) {
      await interaction.reply({
        embeds: [createEmbed.error("Gagal", "Saya tidak memiliki izin untuk menendang member ini (posisi role mungkin lebih tinggi).")],
        ephemeral: true
      });
      return;
    }

    // Direct message the kicked member
    try {
      await targetMember.send({
        embeds: [createEmbed.warning(
          "Anda Dikeluarkan",
          `Anda telah dikeluarkan dari server **${interaction.guild?.name}**.\n**Alasan:** ${reason}`
        )]
      });
    } catch (e) {}

    await targetMember.kick(reason);

    // Kirim moderation log channel
    if (interaction.guild) {
      await logModeration(
        interaction.guild,
        "KICK",
        { id: targetMember.user.id, tag: targetMember.user.tag },
        { id: interaction.user.id, tag: interaction.user.tag },
        reason
      );
    }

    const embed = createEmbed.success(
      "Member Berhasil Dikeluarkan",
      `**Member:** ${targetMember.user.tag} (${targetMember.id})\n` +
      `**Moderator:** ${interaction.user.tag}\n` +
      `**Alasan:** ${reason}`
    );

    await interaction.reply({ embeds: [embed] });
  }
};

export default command;
