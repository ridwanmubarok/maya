import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction, TextChannel, MessageFlags } from "discord.js";
import { Command } from "../../types";
import { createEmbed } from "../../utils/embeds";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Menghapus sejumlah pesan dalam channel secara massal")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(opt =>
      opt
        .setName("jumlah")
        .setDescription("Jumlah pesan yang ingin dihapus (1-100)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const amount = interaction.options.getInteger("jumlah", true);
    const channel = interaction.channel as TextChannel;

    if (!channel || !channel.bulkDelete) {
      await interaction.reply({
        embeds: [createEmbed.error("Kesalahan", "Perintah ini hanya bisa digunakan di text channel server.")],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    try {
      const deleted = await channel.bulkDelete(amount, true);

      const embed = createEmbed.success(
        "Pesan Dihapus",
        `Berhasil menghapus **${deleted.size}** pesan dari channel ini.`
      );

      await interaction.reply({ embeds: [embed] });

      // Automatically delete the bot's reply after 4 seconds
      setTimeout(async () => {
        await interaction.deleteReply().catch(() => {});
      }, 4000);
    } catch (error) {
      // Handle messages older than 14 days
      await interaction.reply({
        embeds: [createEmbed.error(
          "Gagal Menghapus Pesan",
          "Pesan yang berusia lebih dari 14 hari tidak dapat dihapus secara massal oleh Discord API."
        )],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

export default command;
