import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, GuildMember } from "discord.js";
import { Command } from "../../types";
import { prisma } from "../../services/database";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("Tampilkan profil kartu member server")
    .addUserOption(opt =>
      opt
        .setName("user")
        .setDescription("Member yang ingin dilihat profilnya (opsional)")
        .setRequired(false)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const targetUser = interaction.options.getUser("user") || interaction.user;
    const guild = interaction.guild;

    if (!guild) {
      await interaction.editReply("❌ Perintah ini hanya dapat digunakan di dalam server.");
      return;
    }

    let member: GuildMember | null = null;
    try {
      member = await guild.members.fetch(targetUser.id);
    } catch (e) {
      member = null;
    }

    // Fetch strike warnings count for this user
    let strikeCount = 0;
    try {
      strikeCount = await prisma.warnLog.count({
        where: {
          guildId: guild.id,
          userId: targetUser.id
        }
      });
    } catch (e) {
      strikeCount = 0;
    }

    // Fetch Rogatekno Koin (RTK) / Cash Balance & Server Rank
    let totalScore = 0;
    let dailyScore = 0;
    let rank = 1;
    try {
      const scoreRecord = await prisma.triviaScore.findUnique({
        where: { guildId_userId: { guildId: guild.id, userId: targetUser.id } }
      });

      totalScore = scoreRecord?.score ?? 0;
      dailyScore = scoreRecord?.dailyScore ?? 0;

      const higherCount = await prisma.triviaScore.count({
        where: { guildId: guild.id, score: { gt: totalScore } }
      });
      rank = higherCount + 1;
    } catch (e) {
      totalScore = 0;
      dailyScore = 0;
    }

    const joinedAtText = member?.joinedAt 
      ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:f> (<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>)`
      : "Tidak diketahui";

    const createdAtText = `<t:${Math.floor(targetUser.createdAt.getTime() / 1000)}:f> (<t:${Math.floor(targetUser.createdAt.getTime() / 1000)}:R>)`;

    // Format roles list
    let rolesString = "Tidak ada peran khusus";
    if (member) {
      const roles = member.roles.cache
        .filter(r => r.id !== guild.id) // Exclude @everyone
        .sort((a, b) => b.position - a.position)
        .map(r => `<@&${r.id}>`);

      if (roles.length > 0) {
        rolesString = roles.slice(0, 10).join(" ") + (roles.length > 10 ? ` +${roles.length - 10} lainnya` : "");
      }
    }

    // Strike status indicator
    let strikeStatus = "Bersih (0 Peringatan)";
    if (strikeCount === 1) {
      strikeStatus = "1 Peringatan Aktif";
    } else if (strikeCount >= 2) {
      strikeStatus = `${strikeCount} Peringatan Aktif`;
    }

    const highestRole = member?.roles.highest;
    const embedColor = highestRole && highestRole.color !== 0 ? highestRole.color : 0x5865F2;

    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setAuthor({ 
        name: `Profil Member — ${targetUser.displayName || targetUser.username}`, 
        iconURL: targetUser.displayAvatarURL({ size: 256 }) 
      })
      .setThumbnail(targetUser.displayAvatarURL({ size: 512 }))
      .setDescription(
        `### Informasi Pengguna\n` +
        `> **Nama**: ${targetUser} (\`${targetUser.username}\`)\n` +
        `> **User ID**: \`${targetUser.id}\`\n` +
        `> **Status Moderasi**: \`${strikeStatus}\`\n\n` +
        `### Ekonomi & Saldo RTK\n` +
        `> **Total Saldo**: **${totalScore.toLocaleString('id-ID')} RTK**\n` +
        `> **Peringkat Server**: **Rank #${rank}**\n` +
        `> **Perolehan Hari Ini**: **+${dailyScore.toLocaleString('id-ID')} RTK**\n\n` +
        `### Waktu & Keanggotaan\n` +
        `> **Bergabung Server**: ${joinedAtText}\n` +
        `> **Akun Terdaftar**: ${createdAtText}\n\n` +
        `### Peran Member\n` +
        `${rolesString}`
      )
      .setFooter({ text: `Maya System • Server ${guild.name}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};

export default command;
