import { 
  ChatInputCommandInteraction, 
  EmbedBuilder, 
  MessageFlags, 
  SlashCommandBuilder 
} from "discord.js";
import { Command } from "../../types";
import { prisma } from "../../services/database";
import { tebakManager } from "../../services/tebakManager";
import { 
  getWibDateInfo, 
  isUserActiveInMonth, 
  getUserActivityChecklist 
} from "../../services/monthlySeasonManager";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("cash")
    .setDescription("Lihat dompet saldo, status season bulanan & leaderboard Rogatekno Koin (RTK)")
    .addSubcommand((sub) =>
      sub
        .setName("saldo")
        .setDescription("Lihat saldo Rogatekno Koin (RTK) & status kelayakan redeem kamu atau member lain")
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("Member yang ingin dicek saldonya (Default: Diri sendiri)")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("leaderboard")
        .setDescription("Tampilkan daftar member dengan saldo Rogatekno Koin (RTK) terbanyak bulan ini")
    )
    .addSubcommand((sub) =>
      sub
        .setName("season")
        .setDescription("Lihat status season berjalan, kandidat emas 50k, kuota redeem, & arsip juara lalu")
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({ content: "Perintah ini hanya dapat dijalankan di dalam server.", flags: MessageFlags.Ephemeral });
      return;
    }

    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    const dateInfo = getWibDateInfo();

    let goldenCandidates: string[] = [];
    try {
      goldenCandidates = JSON.parse(config?.goldenCandidateIds || "[]");
    } catch (_) {}

    let currentRedeemed: string[] = [];
    try {
      currentRedeemed = JSON.parse(config?.currentMonthRedeemedUsers || "[]");
    } catch (_) {}

    let cooldownUsers: string[] = [];
    try {
      cooldownUsers = JSON.parse(config?.cooldownUserIds || "[]");
    } catch (_) {}

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

      const isGolden = goldenCandidates.includes(targetUser.id);
      const isCooldown = cooldownUsers.includes(targetUser.id);
      const hasRedeemed = currentRedeemed.includes(targetUser.id);
      const isActive = isUserActiveInMonth(record);

      const maxCeiling = isGolden ? "50.000 RTK (Golden Candidate)" : "20.000 RTK (Member Reguler)";
      const quotaMax = config?.monthlyRedeemQuota || 3;

      let redeemEligibility = "✅ Memenuhi Syarat";
      if (isCooldown) {
        redeemEligibility = "⏳ Masa Istirahat (Pemenang Bulan Lalu)";
      } else if (hasRedeemed) {
        redeemEligibility = "✅ Sudah Klaim Hadiah Bulan Ini";
      } else if (currentRedeemed.length >= quotaMax) {
        redeemEligibility = "❌ Kuota Habis (3/3 Pemenang)";
      } else if (!isActive) {
        redeemEligibility = "❌ Belum Memenuhi (Minimal aktif di 1 fitur/voice)";
      }

      const checklist = getUserActivityChecklist(record);
      const checklistStr = checklist
        .map((c) => `${c.completed ? "✅" : "⬜"} ${c.name}`)
        .join("\n");

      const embed = new EmbedBuilder()
        .setTitle(`👛 Dompet Rogatekno Koin (RTK) • Season ${dateInfo.monthName}`)
        .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
        .setColor(isGolden ? "#F59E0B" : "#3B82F6")
        .addFields(
          { name: "👤 Pemilik Dompet", value: `<@${targetUser.id}>`, inline: true },
          { name: "🏆 Peringkat Server", value: `**#${rank}**`, inline: true },
          { name: "💰 Total Saldo RTK", value: `**${totalScore.toLocaleString("id-ID")} RTK**`, inline: true },
          { name: "🎯 Plafon Poin Season Ini", value: `**${maxCeiling}**`, inline: false },
          { name: "📋 Keaktifan Komunitas Bulan Ini", value: checklistStr, inline: false },
          { name: "🎟️ Status Kelayakan Redeem Toko", value: `> **${redeemEligibility}**\n> Kuota Server: **${currentRedeemed.length}/${quotaMax} Terisi**`, inline: false },
          { name: "⏳ Siklus Reset Akhir Bulan", value: `Sisa **${dateInfo.daysRemaining} Hari** (Reset tgl ${dateInfo.daysInMonth} ${dateInfo.monthName} pukul 23:59 WIB)\n*⚠️ Poin akan direset ke 0 & hangus jika tidak ditukarkan sebelum akhir bulan!*`, inline: false }
        )
        .setFooter({ text: "Rogatekno Economy Engine • Gunakan /shop untuk belanja!" })
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
        .setTitle(`🏆 Leaderboard Rogatekno Koin (RTK) • Season ${dateInfo.monthName} ${dateInfo.year}`)
        .setDescription(
          `Daftar 10 besar anggota server dengan akumulasi **Rogatekno Koin (RTK)** terbanyak:\n` +
          `*Poin akan direset ke 0 pada akhir bulan ${dateInfo.monthName}! Kuota redeem: **${currentRedeemed.length}/${config?.monthlyRedeemQuota || 3} Pemenang**.*`
        )
        .setColor("#F59E0B")
        .setFooter({ text: "Rogatekno Economy Engine • Belanja di /shop sebelum akhir bulan!" })
        .setTimestamp();

      let text = "";
      leaderboard.forEach((entry, index) => {
        const rank = index + 1;
        const rankPrefix = rank === 1 ? "🥇 Peringkat 1" : rank === 2 ? "🥈 Peringkat 2" : rank === 3 ? "🥉 Peringkat 3" : `#${rank}`;
        const isGold = goldenCandidates.includes(entry.userId) ? " 🌟 (Golden 50k)" : "";
        text += `**${rankPrefix}**. <@${entry.userId}> — **${entry.score.toLocaleString("id-ID")} RTK**${isGold}\n`;
      });

      embed.addFields(
        { name: "Peringkat Saldo Terbanyak", value: text },
        { name: "💡 Tips Season", value: `> *Hanya 3 orang random aktif yang dapat menembus 50.000 RTK per season! Member lain memiliki batas 20.000 RTK.*` }
      );
      await interaction.editReply({ embeds: [embed] });
    }
    else if (subcommand === "season") {
      await interaction.deferReply();

      const quotaMax = config?.monthlyRedeemQuota || 3;
      const candidatesStr = goldenCandidates.length > 0 
        ? goldenCandidates.map((id, i) => `${i + 1}. <@${id}>`).join("\n") 
        : "*Belum ditentukan*";

      const redeemedStr = currentRedeemed.length > 0
        ? currentRedeemed.map((id, i) => `${i + 1}. <@${id}> (Sudah Redeem)`).join("\n")
        : "*Belum ada yang menukarkan koin bulan ini*";

      const cooldownStr = cooldownUsers.length > 0
        ? cooldownUsers.map((id) => `<@${id}>`).join(", ")
        : "*Tidak ada member dalam cooldown*";

      const embed = new EmbedBuilder()
        .setTitle(`🌟 STATUS SEASON BULANAN • ${dateInfo.monthName.toUpperCase()} ${dateInfo.year}`)
        .setColor("#6366F1")
        .setDescription(
          `Sistem ekonomi Maya berputar secara musiman setiap bulan. Seluruh poin direset ke 0 di akhir bulan demi keadilan rotasi hadiah!\n\n` +
          `⏳ **Sisa Waktu Season**: **${dateInfo.daysRemaining} Hari** (s.d. ${dateInfo.daysInMonth} ${dateInfo.monthName} 23:59 WIB)\n` +
          `🎟️ **Kuota Pemenang Redeem /shop**: **${currentRedeemed.length}/${quotaMax} Slot Terisi**\n\n` +
          `⚠️ **Peringatan Poin Hangus**:\n` +
          `> Jika terlambat menukarkan poin sebelum akhir bulan, maka seluruh saldo poin akan **HANGUS & DIRESET KE 0**!`
        )
        .addFields(
          {
            name: "✨ 3 Golden Candidates Season Ini (Cap 50.000 RTK)",
            value: candidatesStr,
            inline: false
          },
          {
            name: "🎁 Pemenang Redeem Bulan Ini",
            value: redeemedStr,
            inline: false
          },
          {
            name: "⏸️ Member Masa Istirahat (Cooldown Pemenang Lalu)",
            value: cooldownStr,
            inline: false
          }
        )
        .setFooter({ text: "Maya Monthly Season Engine • Fair, Rotational, & Rewarding!" })
        .setTimestamp();

      // Ambil arsip season sebelumnya jika ada
      const lastArchive = await prisma.monthlySeasonArchive.findFirst({
        where: { guildId },
        orderBy: { createdAt: "desc" }
      });

      if (lastArchive) {
        let topList: any[] = [];
        try {
          topList = JSON.parse(lastArchive.topWinners || "[]");
        } catch (_) {}

        let topWinnersStr = "*Tidak ada data*";
        if (topList.length > 0) {
          topWinnersStr = topList.slice(0, 3).map((w, idx) => {
            const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉";
            return `${medal} <@${w.userId}> — **${Number(w.score).toLocaleString("id-ID")} RTK**`;
          }).join("\n");
        }

        embed.addFields({
          name: `🏛️ Hall of Fame Season Sebelumnya (${lastArchive.seasonName})`,
          value: `Top Juara:\n${topWinnersStr}\nTotal Sirkulasi: **${lastArchive.totalCirculating.toLocaleString("id-ID")} RTK** (${lastArchive.totalParticipants} Peserta)`,
          inline: false
        });
      }

      await interaction.editReply({ embeds: [embed] });
    }
  }
};

export default command;
