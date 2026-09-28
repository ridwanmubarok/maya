import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder 
} from "discord.js";
import { Command } from "../../types";
import { getGuildLevelLeaderboard, getUserRank } from "../../services/levelingManager";
import { prisma } from "../../services/database";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Lihat papan peringkat (Leaderboard) server")
    .addStringOption(opt =>
      opt
        .setName("kategori")
        .setDescription("Pilih kategori leaderboard yang ingin ditampilkan")
        .setRequired(false)
        .addChoices(
          { name: "⭐ Level & XP (Permanen Server)", value: "level" },
          { name: "🪙 Rogatekno Koin / RTK (Musiman Bulanan)", value: "rtk" }
        )
    )
    .addIntegerOption(opt =>
      opt
        .setName("halaman")
        .setDescription("Nomor halaman leaderboard (default: 1)")
        .setMinValue(1)
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const guild = interaction.guild;
    if (!guild) {
      await interaction.editReply("❌ Perintah ini hanya dapat digunakan di dalam server Discord.");
      return;
    }

    const category = interaction.options.getString("kategori") || "level";
    const requestedPage = interaction.options.getInteger("halaman") || 1;
    const pageSize = 10;

    if (category === "level") {
      const { leaderboard, totalCount, totalPages, page } = await getGuildLevelLeaderboard(
        guild.id,
        pageSize,
        requestedPage
      );

      const userRank = await getUserRank(guild.id, interaction.user.id);

      if (leaderboard.length === 0) {
        await interaction.editReply({
          content: "Belum ada data aktivitas Level & XP di server ini. Mulailah mengobrol atau bergabung di Voice!",
        });
        return;
      }

      const medalEmojis = ["🥇", "🥈", "🥉"];
      const lines = leaderboard.map((item, index) => {
        const globalRank = (page - 1) * pageSize + index + 1;
        const medal = globalRank <= 3 ? `${medalEmojis[globalRank - 1]} ` : `\`#${globalRank.toString().padStart(2, " ")}\` `;
        
        // Short visual mini bar (5 blocks)
        const filled = Math.round((item.progressPercent / 100) * 5);
        const miniBar = "■".repeat(filled) + "□".repeat(5 - filled);

        return `${medal}**${item.username}** — **Lv. ${item.level}** (${item.totalXp.toLocaleString("id-ID")} XP)\n` +
               `> \`${miniBar}\` ${item.currentLevelXp.toLocaleString("id-ID")}/${item.nextLevelXp.toLocaleString("id-ID")} XP (${item.progressPercent}%)`;
      });

      const embed = new EmbedBuilder()
        .setColor("#6366F1")
        .setTitle(`🏆 LEADERBOARD LEVEL & XP — ${guild.name}`)
        .setDescription(
          `*Peringkat keaktifan permanen server (Chat, Voice, Trivia, Pantun, Story, Poll, & Games).*\n\n` +
          lines.join("\n\n") +
          `\n\n════════════════════════════\n` +
          `👤 **Peringkat Kamu:** **#${userRank.rank}** • **Level ${userRank.level}** (${userRank.totalXp.toLocaleString("id-ID")} XP)`
        )
        .setFooter({
          text: `Halaman ${page}/${totalPages} • Total ${totalCount} member • Terpisah dari saldo RTK`,
          iconURL: guild.iconURL() || interaction.client.user?.displayAvatarURL(),
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Category: RTK (Rogatekno Koin)
    const [totalRtkUsers, rtkScores] = await Promise.all([
      prisma.triviaScore.count({ where: { guildId: guild.id } }),
      prisma.triviaScore.findMany({
        where: { guildId: guild.id },
        orderBy: { score: "desc" },
        skip: (requestedPage - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalRtkUsers / pageSize));
    const page = Math.min(requestedPage, totalPages);

    if (rtkScores.length === 0) {
      await interaction.editReply({
        content: "Belum ada member yang memiliki saldo Rogatekno Koin (RTK) pada musim ini.",
      });
      return;
    }

    // Get caller's RTK rank
    const callerScore = await prisma.triviaScore.findUnique({
      where: { guildId_userId: { guildId: guild.id, userId: interaction.user.id } },
    });
    const callerPoints = callerScore?.score ?? 0;
    const higherCount = await prisma.triviaScore.count({
      where: { guildId: guild.id, score: { gt: callerPoints } },
    });
    const callerRank = higherCount + 1;

    const medalEmojis = ["🥇", "🥈", "🥉"];
    const lines = rtkScores.map((score, index) => {
      const globalRank = (page - 1) * pageSize + index + 1;
      const medal = globalRank <= 3 ? `${medalEmojis[globalRank - 1]} ` : `\`#${globalRank.toString().padStart(2, " ")}\` `;

      return `${medal}**${score.username}** — **${score.score.toLocaleString("id-ID")} RTK**\n` +
             `> Hari ini: +${score.dailyScore.toLocaleString("id-ID")} RTK`;
    });

    const embed = new EmbedBuilder()
      .setColor("#F59E0B")
      .setTitle(`🪙 LEADERBOARD ROGATEKNO KOIN (RTK) — ${guild.name}`)
      .setDescription(
        `*Saldo koin musiman bulanan. Dapat digunakan untuk redeem di \`/shop\` sebelum reset bulanan.*\n\n` +
        lines.join("\n\n") +
        `\n\n════════════════════════════\n` +
        `👤 **Peringkat Kamu:** **#${callerRank}** • Saldo: **${callerPoints.toLocaleString("id-ID")} RTK**`
      )
      .setFooter({
        text: `Halaman ${page}/${totalPages} • Reset otomatis setiap tgl 5 pkl 23:59 WIB`,
        iconURL: guild.iconURL() || interaction.client.user?.displayAvatarURL(),
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
