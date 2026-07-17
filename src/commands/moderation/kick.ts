import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction, GuildMember } from "discord.js";
import { Command } from "../../types";
import { createEmbed } from "../../utils/embeds";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Mengeluarkan member dari server")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
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
