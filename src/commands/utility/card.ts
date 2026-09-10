import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder, 
  Guild, 
  User, 
  AttachmentBuilder 
} from "discord.js";
import { Command } from "../../types";
import { generateMemberCard, getMemberNumber } from "../../services/memberCardService";
import { logger } from "../../utils/logger";

/**
 * Helper terpadu untuk membuat payload kartu member (dapat digunakan oleh slash command maupun text trigger)
 */
export async function buildMemberCardPayload(guild: Guild, targetUser: User, requesterUser?: User) {
  const member = await guild.members.fetch(targetUser.id).catch(() => null);

  if (!member) {
    const errorEmbed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle("❌ Member Tidak Ditemukan")
      .setDescription(`User ${targetUser} (\`${targetUser.username}\`) tidak ditemukan sebagai member aktif di server ini.`);
    return { embeds: [errorEmbed], files: [] };
  }

  const memberNumber = await getMemberNumber(guild, targetUser.id);
  const cardBuffer = await generateMemberCard({ member, memberNumber });
  const cardAttachment = new AttachmentBuilder(cardBuffer, { name: "checkpoint-member-card.png" });

  const joinedAtText = member.joinedAt 
    ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:D> (<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>)`
    : "Tidak diketahui";

  const isSelf = requesterUser ? requesterUser.id === targetUser.id : false;
  const highestRole = member.roles.highest;
  const embedColor = highestRole && highestRole.color !== 0 ? highestRole.color : 0x00E5FF;

  const cardEmbed = new EmbedBuilder()
    .setColor(embedColor)
    .setAuthor({
      name: `The Checkpoint — Official Member Card`,
      iconURL: guild.iconURL({ size: 128 }) || undefined
    })
    .setTitle(`🪪 Kartu Identitas: ${member.displayName || targetUser.displayName || targetUser.username}`)
    .setDescription(
      (isSelf 
        ? `Berikut adalah kartu identitas resmi **The Checkpoint** milik Anda:` 
        : `Berikut adalah kartu identitas resmi **The Checkpoint** milik <@${targetUser.id}>:`) +
      `\n\n` +
      `> 🆔 **Member No**: **#${memberNumber.toString().padStart(3, "0")}** *(Member ke-${memberNumber.toLocaleString("id-ID")})*\n` +
      `> 👤 **User**: ${targetUser} (\`${targetUser.username}\`)\n` +
      `> 📅 **Joined**: ${joinedAtText}\n` +
      `> ⚡ **Roles**: ${highestRole && highestRole.id !== guild.id ? `<@&${highestRole.id}>` : "Member"}\n\n` +
      `*Scan QR Code di sudut kanan bawah kartu untuk membuka profil Discord secara instan.*`
    )
    .setImage("attachment://checkpoint-member-card.png")
    .setFooter({ 
      text: requesterUser ? `Diminta oleh ${requesterUser.displayName || requesterUser.username}` : `Maya System • The Checkpoint`,
      iconURL: requesterUser?.displayAvatarURL({ size: 64 })
    })
    .setTimestamp();

  return {
    embeds: [cardEmbed],
    files: [cardAttachment]
  };
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("card")
    .setDescription("Lihat kartu identitas member The Checkpoint (diri sendiri atau orang lain)")
    .addUserOption(opt =>
      opt
        .setName("user")
        .setDescription("Pilih member yang ingin dilihat kartunya (opsional, default: diri sendiri)")
        .setRequired(false)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const guild = interaction.guild;
    if (!guild) {
      await interaction.editReply("❌ Perintah ini hanya dapat digunakan di dalam server.");
      return;
    }

    const targetUser = interaction.options.getUser("user") || interaction.user;

    try {
      const payload = await buildMemberCardPayload(guild, targetUser, interaction.user);
      await interaction.editReply(payload);
    } catch (error) {
      logger.error(`Error saat mengeksekusi /card untuk user ${targetUser.id}:`, error);
      await interaction.editReply({
        content: "❌ Terjadi kesalahan saat memproses pembuatan kartu member."
      });
    }
  }
};

export default command;
