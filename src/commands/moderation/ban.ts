import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction, GuildMember } from "discord.js";
import { Command } from "../../types";
import { createEmbed } from "../../utils/embeds";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Memblokir (ban) member dari server")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(opt =>
      opt
        .setName("member")
        .setDescription("Member yang ingin diblokir")
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName("alasan")
        .setDescription("Alasan memblokir member")
        .setRequired(false)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const targetMember = interaction.options.getMember("member") as GuildMember | null;
    const reason = interaction.options.getString("alasan") || "Tidak ada alasan yang diberikan";

    if (!targetMember) {
      await interaction.reply({
        embeds: [createEmbed.error("Kesalahan", "Member tidak ditemukan atau berada di luar jangkauan.")],
        ephemeral: true
      });
      return;
    }

    if (!targetMember.bannable) {
      await interaction.reply({
        embeds: [createEmbed.error("Gagal", "Saya tidak memiliki izin untuk memblokir member ini (posisi role mungkin lebih tinggi).")],
        ephemeral: true
      });
      return;
    }

    // Direct message the banned member
    try {
      await targetMember.send({
        embeds: [createEmbed.warning(
          "Anda Diblokir",
          `Anda telah diblokir secara permanen dari server **${interaction.guild?.name}**.\n**Alasan:** ${reason}`
        )]
      });
    } catch (e) {}

    await targetMember.ban({ reason });

    const embed = createEmbed.success(
      "Member Berhasil Diblokir",
      `**Member:** ${targetMember.user.tag} (${targetMember.id})\n` +
      `**Moderator:** ${interaction.user.tag}\n` +
      `**Alasan:** ${reason}`
    );

    await interaction.reply({ embeds: [embed] });
  }
};

export default command;
