import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { Command } from "../../types";
import { getMusicManager } from "../../services/musicManager";
import { createEmbed } from "../../utils/embeds";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Melihat daftar antrean lagu"),
  async execute(interaction: ChatInputCommandInteraction) {
    const manager = getMusicManager(interaction.guildId!);

    if (!manager.currentTrack && manager.queue.length === 0) {
      await interaction.reply({
        embeds: [createEmbed.info("Antrean Kosong", "Tidak ada lagu yang sedang diputar atau mengantre.")],
        ephemeral: true
      });
      return;
    }

    let description = "";

    if (manager.currentTrack) {
      description += `**Sedang Diputar:**\n🎵 [${manager.currentTrack.title}](${manager.currentTrack.url}) | \`${manager.currentTrack.duration}\` (Diminta oleh: ${manager.currentTrack.requestedBy})\n\n`;
    }

    if (manager.queue.length > 0) {
      description += `**Daftar Antrean:**\n`;
      // Show top 10 tracks
      const displayLimit = Math.min(manager.queue.length, 10);
      for (let i = 0; i < displayLimit; i++) {
        const track = manager.queue[i];
        description += `\`${i + 1}.\` [${track.title}](${track.url}) | \`${track.duration}\` (Diminta oleh: ${track.requestedBy})\n`;
      }

      if (manager.queue.length > 10) {
        description += `\n*Dan ${manager.queue.length - 10} lagu lainnya...*`;
      }
    }

    const embed = createEmbed.music(
      `Antrean Lagu Server`,
      description
    );

    await interaction.reply({ embeds: [embed] });
  }
};

export default command;
