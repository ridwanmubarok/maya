import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember } from "discord.js";
import { Command } from "../../types";
import { getMusicManager } from "../../services/musicManager";
import { createEmbed } from "../../utils/embeds";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("volume")
    .setDescription("Mengatur atau melihat volume musik bot")
    .addIntegerOption(opt =>
      opt
        .setName("persen")
        .setDescription("Nilai volume dalam persen (0 - 100)")
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(100)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const member = interaction.member as GuildMember;
    const manager = getMusicManager(interaction.guildId!);

    const percentage = interaction.options.getInteger("persen");

    // Jika tidak memasukkan opsi persen, tampilkan volume saat ini
    if (percentage === null) {
      const currentVolPercent = Math.round(manager.volume * 100);
      const embed = createEmbed.success(
        "Volume Saat Ini",
        `Volume pemutaran musik saat ini adalah **${currentVolPercent}%**.`
      );
      await interaction.reply({ embeds: [embed] });
      return;
    }

    // Jika ingin merubah volume, pastikan berada di voice channel
    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
      await interaction.reply({
        embeds: [createEmbed.error("Kesalahan", "Anda harus bergabung ke voice channel terlebih dahulu untuk mengatur volume!")],
        ephemeral: true
      });
      return;
    }

    manager.setVolume(percentage / 100);

    const embed = createEmbed.success(
      "Volume Diperbarui",
      `Volume pemutaran musik berhasil diubah menjadi **${percentage}%**.`
    );
    await interaction.reply({ embeds: [embed] });
  }
};

export default command;
