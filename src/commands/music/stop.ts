import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember } from "discord.js";
import { Command } from "../../types";
import { getMusicManager } from "../../services/musicManager";
import { createEmbed } from "../../utils/embeds";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Menghentikan pemutaran musik dan mengeluarkan bot dari voice channel"),
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
    manager.stop();

    const embed = createEmbed.success(
      "Musik Berhenti",
      "Pemutaran musik telah dihentikan, antrean dihapus, dan bot telah keluar dari voice channel."
    );

    await interaction.reply({ embeds: [embed] });
  }
};

export default command;
