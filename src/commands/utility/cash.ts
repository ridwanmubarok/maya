import { 
  ChatInputCommandInteraction, 
  EmbedBuilder, 
  MessageFlags, 
  SlashCommandBuilder 
} from "discord.js";
import { Command } from "../../types";
import { prisma } from "../../services/database";
import { tebakManager } from "../../services/tebakManager";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("cash")
    .setDescription("Kelola dompet saldo & transfer Rogatekno Koin (RTK)")
    .addSubcommand((sub) =>
      sub
        .setName("saldo")
        .setDescription("Lihat saldo Rogatekno Koin (RTK) milik kamu atau member lain")
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("Member yang ingin dicek saldonya (Default: Diri sendiri)")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("pay")
        .setDescription("Transfer Rogatekno Koin (RTK) ke member lain di server ini")
        .addUserOption((opt) =>
          opt
            .setName("penerima")
            .setDescription("Member yang akan menerima transfer koin")
            .setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("jumlah")
            .setDescription("Jumlah Rogatekno Koin (RTK) yang ingin ditransfer")
            .setMinValue(1)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("leaderboard")
        .setDescription("Tampilkan daftar member dengan saldo Rogatekno Koin (RTK) terbanyak")
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({ content: "Perintah ini hanya dapat dijalankan di dalam server.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (subcommand === "saldo") {
      const targetUser = interaction.options.getUser("user") || interaction.user;
      
      const record = await prisma.triviaScore.findUnique({
        where: { guildId_userId: { guildId, userId: targetUser.id } }
      });

      const totalScore = record?.score ?? 0;
      const dailyScore = record?.dailyScore ?? 0;

      // Hitung rank posisi di server
      const higherCount = await prisma.triviaScore.count({
        where: { guildId, score: { gt: totalScore } }
      });
      const rank = higherCount + 1;

      const embed = new EmbedBuilder()
        .setTitle(`👛 Dompet Rogatekno Koin (RTK)`)
        .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
        .setColor("#F59E0B")
        .addFields(
          { name: "Pemilik Dompet", value: `<@${targetUser.id}>`, inline: true },
          { name: "Peringkat Server", value: `**#${rank}**`, inline: true },
          { name: "Total Saldo", value: `**${totalScore} RTK**`, inline: false },
          { name: "Perolehan Harian Hari Ini", value: `**${dailyScore} RTK**`, inline: false },
          { name: "💡 Catatan", value: `> *Ke depannya Rogatekno Koin (RTK) akan bisa ditukarkan ke item-item menarik!*` }
        )
        .setFooter({ text: "Rogatekno Economy Engine • Kumpulkan koin dari Tebak-Tebakan & Nongkrong di Voice!" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } 
    else if (subcommand === "pay") {
      const recipient = interaction.options.getUser("penerima", true);
      const amount = interaction.options.getInteger("jumlah", true);

      if (recipient.id === interaction.user.id) {
        await interaction.reply({ content: "Kamu tidak bisa mentransfer RTK ke diri sendiri!", flags: MessageFlags.Ephemeral });
        return;
      }

      if (recipient.bot) {
        await interaction.reply({ content: "Kamu tidak bisa mentransfer RTK ke akun bot!", flags: MessageFlags.Ephemeral });
        return;
      }

      const senderRecord = await prisma.triviaScore.findUnique({
        where: { guildId_userId: { guildId, userId: interaction.user.id } }
      });

      const senderBalance = senderRecord?.score ?? 0;

      if (senderBalance < amount) {
        await interaction.reply({
          content: `Transfer gagal! Saldo kamu saat ini adalah **${senderBalance} RTK**, tidak cukup untuk mentransfer **${amount} RTK**.`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // Kurangi dari pengirim
      await prisma.triviaScore.update({
        where: { id: senderRecord!.id },
        data: { score: senderBalance - amount }
      });

      // Tambahkan ke penerima
      await tebakManager.addScore(guildId, recipient.id, recipient.displayName || recipient.username, amount);

      const embed = new EmbedBuilder()
        .setTitle("💸 Transfer Rogatekno Koin (RTK) Berhasil!")
        .setDescription(
          `Pengirim: <@${interaction.user.id}>\n` +
          `Penerima: <@${recipient.id}>\n` +
          `Jumlah Transfer: **${amount} RTK**`
        )
        .setColor("#10B981")
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
    else if (subcommand === "leaderboard") {
      await interaction.deferReply();
      const leaderboard = await tebakManager.getLeaderboard(guildId);

      if (!leaderboard || leaderboard.length === 0) {
        await interaction.editReply({ content: "Belum ada saldo Rogatekno Koin (RTK) tercatat di server ini." });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`🏆 Leaderboard Rogatekno Koin (RTK) Sepanjang Masa • ${interaction.guild?.name || "Server"}`)
        .setDescription("Daftar 10 besar anggota server dengan akumulasi **Rogatekno Koin (RTK)** terbanyak:")
        .setColor("#F59E0B")
        .setFooter({ text: "Rogatekno Economy Engine" })
        .setTimestamp();

      let text = "";
      leaderboard.forEach((entry, index) => {
        const rank = index + 1;
        const rankPrefix = rank === 1 ? "🥇 Peringkat 1" : rank === 2 ? "🥈 Peringkat 2" : rank === 3 ? "🥉 Peringkat 3" : `#${rank}`;
        text += `**${rankPrefix}**. <@${entry.userId}> — **${entry.score} RTK**\n`;
      });

      embed.addFields(
        { name: "Peringkat Saldo Terbanyak", value: text },
        { name: "💡 Catatan", value: `> *Ke depannya Rogatekno Koin (RTK) akan bisa ditukarkan ke item-item menarik!*` }
      );
      await interaction.editReply({ embeds: [embed] });
    }
  }
};

export default command;
