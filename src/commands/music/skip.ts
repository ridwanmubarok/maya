import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember } from "discord.js";
import { Command } from "../../types";
import { getMusicManager } from "../../services/musicManager";
import { createEmbed } from "../../utils/embeds";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Melewati lagu yang sedang diputar"),
  async execute(interaction: ChatInputCommandInteraction) {
    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice.channel;

    if (!voiceChannel) {
      await interaction.reply({
        embeds: [createEmbed.error("Kesalahan", "Anda harus bergabung ke voice channel terlebih dahulu!")],
        ephemeral: true
      });
      return;
    }

    const manager = getMusicManager(interaction.guildId!);
    if (!manager.currentTrack) {
      await interaction.reply({
        embeds: [createEmbed.error("Gagal", "Tidak ada lagu yang sedang diputar untuk dilewati.")],
        ephemeral: true
      });
      return;
    }

    const skipped = manager.skip();

    if (skipped) {
      const embed = createEmbed.success(
        "Lagu Dilewati",
        `Lagu **${manager.currentTrack.title}** berhasil dilewati.`
      );
      await interaction.reply({ embeds: [embed] });
    } else {
      await interaction.reply({
        embeds: [createEmbed.error("Gagal", "Tidak dapat melewati lagu saat ini.")],
        ephemeral: true
      });
    }
  }
};

export default command;
