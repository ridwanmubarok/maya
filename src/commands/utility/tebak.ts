import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, TextChannel, MessageFlags } from "discord.js";
import { Command } from "../../types";
import { tebakManager } from "../../services/tebakManager";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("tebak")
    .setDescription("Game Tebak-Tebakan Harian & Papan Peringkat (Leaderboard)")
    .addSubcommand((sub) =>
      sub
        .setName("main")
        .setDescription("Mulai sesi tebak-tebakan mode instant di channel ini")
    )
    .addSubcommand((sub) =>
      sub
        .setName("daily")
        .setDescription("Mulai Tebak-Tebakan Harian (@everyone Broadcast) di channel ini")
    )
    .addSubcommand((sub) =>
      sub
        .setName("leaderboard")
        .setDescription("Tampilkan papan peringkat skor tebak-tebakan server")
        .addStringOption((opt) =>
          opt
            .setName("tipe")
            .setDescription("Pilih kategori peringkat")
            .setRequired(false)
            .addChoices(
              { name: "Klasemen Harian", value: "harian" },
              { name: "Klasemen Sepanjang Masa", value: "sepanjang_masa" }
            )
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({
        content: "Perintah ini hanya dapat dijalankan di dalam server Discord.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "main") {
      await interaction.deferReply();
      await tebakManager.startRiddleSession(interaction);
    } else if (subcommand === "daily") {
      const channel = interaction.channel as TextChannel;
      if (!channel || !("send" in channel)) {
        await interaction.reply({
          content: "Perintah ini hanya dapat dijalankan di channel teks server.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const success = await tebakManager.startDailyRiddleSession(channel, guildId);

      if (success) {
        await interaction.editReply({
          content: "Tebak-Tebakan Harian berhasil dipublikasikan dan disiarkan ke seluruh member!",
        });
      } else {
        await interaction.editReply({
          content: "Sesi tebak-tebakan masih aktif di channel ini. Selesaikan sesi yang ada terlebih dahulu.",
        });
      }
    } else if (subcommand === "leaderboard") {
      await interaction.deferReply();

      const tipe = interaction.options.getString("tipe") || "sepanjang_masa";
      const isDaily = tipe === "harian";

      if (isDaily) {
        const leaderboard = await tebakManager.getDailyLeaderboard(guildId);

        if (!leaderboard || leaderboard.length === 0) {
          await interaction.editReply({
            content: "Belum ada skor Tebak-Tebakan Harian hari ini. Jalankan `/tebak daily` untuk memulai aktivitas!",
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle(`🪙 Leaderboard Rogatekno Cash Harian • ${interaction.guild?.name || "Server"}`)
          .setDescription("Daftar 10 besar anggota server dengan perolehan **🪙 Rogatekno Cash** tertinggi hari ini:")
          .setColor("#9333EA")
          .setFooter({
            text: `Maya Daily Trivia Leaderboard • Diperbarui Real-Time`,
            iconURL: interaction.client.user?.displayAvatarURL(),
          })
          .setTimestamp();

        let text = "";
        leaderboard.forEach((entry, index) => {
          const rank = index + 1;
          const rankPrefix = rank === 1 ? "🥇 (Juara 1)" : rank === 2 ? "🥈 (Juara 2)" : rank === 3 ? "🥉 (Juara 3)" : `${rank}`;
          text += `**${rankPrefix}**. <@${entry.userId}> — **${entry.dailyScore} 🪙 Rogatekno Cash**\n`;
        });

        embed.addFields({ name: "Peringkat Hari Ini", value: text });
        await interaction.editReply({ embeds: [embed] });
      } else {
        const leaderboard = await tebakManager.getLeaderboard(guildId);

        if (!leaderboard || leaderboard.length === 0) {
          await interaction.editReply({
            content: "Belum ada saldo Rogatekno Cash di server ini. Jalankan `/tebak main` atau `/tebak daily`!",
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle(`🪙 Leaderboard Rogatekno Cash Sepanjang Masa • ${interaction.guild?.name || "Server"}`)
          .setDescription("Daftar 10 besar anggota server dengan total akumulasi **🪙 Rogatekno Cash** tertinggi:")
          .setColor("#2563EB")
          .setFooter({
            text: `Maya All-Time Trivia Leaderboard • Diperbarui Real-Time`,
            iconURL: interaction.client.user?.displayAvatarURL(),
          })
          .setTimestamp();

        let text = "";
        leaderboard.forEach((entry, index) => {
          const rank = index + 1;
          const rankPrefix = rank === 1 ? "🥇 (Juara 1)" : rank === 2 ? "🥈 (Juara 2)" : rank === 3 ? "🥉 (Juara 3)" : `${rank}`;
          text += `**${rankPrefix}**. <@${entry.userId}> — **${entry.score} 🪙 Rogatekno Cash**\n`;
        });

        embed.addFields({ name: "Peringkat Akumulasi", value: text });
        await interaction.editReply({ embeds: [embed] });
      }
    }
  },
};

export default command;
