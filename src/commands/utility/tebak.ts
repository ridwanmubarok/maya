import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, TextChannel } from "discord.js";
import { Command } from "../../types";
import { tebakManager } from "../../services/tebakManager";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("tebak")
    .setDescription("Game Tebak-Tebakan & Papan Peringkat (Leaderboard)")
    .addSubcommand((sub) =>
      sub
        .setName("main")
        .setDescription("Mulai sesi game tebak-tebakan baru di channel ini")
    )
    .addSubcommand((sub) =>
      sub
        .setName("leaderboard")
        .setDescription("Tampilkan papan peringkat skor tebak-tebakan server")
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({
        content: "Perintah ini hanya dapat dijalankan di dalam server Discord.",
        ephemeral: true,
      });
      return;
    }

    if (subcommand === "main") {
      const channel = interaction.channel;
      if (!channel || !(channel instanceof TextChannel)) {
        await interaction.reply({
          content: "Perintah ini hanya dapat dijalankan di channel teks server.",
          ephemeral: true,
        });
        return;
      }

      if (tebakManager.isChannelActive(channel.id)) {
        await interaction.reply({
          content: "Sesi tebak-tebakan masih berlangsung di channel ini! Jawab pertanyaan yang ada terlebih dahulu.",
          ephemeral: true,
        });
        return;
      }

      await interaction.reply({
        content: "Memulai sesi game tebak-tebakan...",
        ephemeral: true,
      });

      await tebakManager.startRiddleSession(channel, guildId);
    } else if (subcommand === "leaderboard") {
      await interaction.deferReply();

      const leaderboard = await tebakManager.getLeaderboard(guildId);

      if (!leaderboard || leaderboard.length === 0) {
        await interaction.editReply({
          content: "Belum ada skor tebak-tebakan di server ini. Jalankan `/tebak main` untuk menjadi yang pertama mendapatkan poin!",
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`Papan Peringkat Tebak-Tebakan • ${interaction.guild?.name || "Server"}`)
        .setDescription("Daftar 10 besar anggota server dengan skor tebak-tebakan tertinggi:")
        .setColor("#2563EB")
        .setFooter({
          text: `Maya Trivia Leaderboard • Diperbarui Real-Time`,
          iconURL: interaction.client.user?.displayAvatarURL(),
        })
        .setTimestamp();

      let leaderboardText = "";
      leaderboard.forEach((entry, index) => {
        const rank = index + 1;
        const rankPrefix = rank === 1 ? "1 (Juara 1)" : rank === 2 ? "2 (Juara 2)" : rank === 3 ? "3 (Juara 3)" : `${rank}`;
        leaderboardText += `**${rankPrefix}**. <@${entry.userId}> — **${entry.score} Poin**\n`;
      });

      embed.addFields({
        name: "Peringkat",
        value: leaderboardText,
        inline: false,
      });

      await interaction.editReply({ embeds: [embed] });
    }
  },
};

export default command;
