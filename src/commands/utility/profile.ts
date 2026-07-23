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

    const joinedAt = member?.joinedAt 
      ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>`
      : "Tidak diketahui";

    const createdAt = `<t:${Math.floor(targetUser.createdAt.getTime() / 1000)}:R>`;

    // Format roles list
    let rolesString = "Tidak ada role khusus";
    if (member) {
      const roles = member.roles.cache
        .filter(r => r.id !== guild.id) // Exclude @everyone
        .sort((a, b) => b.position - a.position)
        .map(r => `<@&${r.id}>`);

      if (roles.length > 0) {
        rolesString = roles.slice(0, 8).join(" ") + (roles.length > 8 ? ` ...+${roles.length - 8}` : "");
      }
    }

    // Strike status indicator
    let strikeStatus = "🟢 **Bersih (0 Strike)**";
    if (strikeCount === 1) {
      strikeStatus = "🟡 **1 Strike Warning**";
    } else if (strikeCount >= 2) {
      strikeStatus = `🔴 **${strikeCount} Strike Warning**`;
    }

    const highestRole = member?.roles.highest;
    const embedColor = highestRole && highestRole.color !== 0 ? highestRole.color : 0x5865F2;

    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setAuthor({ 
        name: `Kartu Profil Member • ${targetUser.username}`, 
        iconURL: targetUser.displayAvatarURL({ size: 256 }) 
      })
      .setThumbnail(targetUser.displayAvatarURL({ size: 512 }))
      .addFields(
        { name: "👤 Pengguna", value: `${targetUser} (${targetUser.tag})`, inline: true },
        { name: "🔰 Status Moderasi", value: strikeStatus, inline: true },
        { name: "📅 Bergabung Server", value: joinedAt, inline: true },
        { name: "🎂 Akun Dibuat", value: createdAt, inline: true },
        { name: "🏷️ Roles Member", value: rolesString, inline: false }
      )
      .setFooter({ text: `ID: ${targetUser.id} • Server ${guild.name}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};

export default command;
