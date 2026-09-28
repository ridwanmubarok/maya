import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder, 
  GuildMember, 
  AttachmentBuilder 
} from "discord.js";
import { Command } from "../../types";
import { generateRankCard, getUserRank } from "../../services/levelingManager";
import { logger } from "../../utils/logger";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Tampilkan kartu peringkat Level & XP kamu atau member lain")
    .addUserOption(opt =>
      opt
        .setName("user")
        .setDescription("Member yang ingin dicek rank-nya (opsional)")
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const guild = interaction.guild;
    if (!guild) {
      await interaction.editReply("❌ Perintah ini hanya dapat digunakan di dalam server Discord.");
      return;
    }

    const targetUser = interaction.options.getUser("user") || interaction.user;
    let member: GuildMember | null = null;
    try {
      member = await guild.members.fetch(targetUser.id);
    } catch (_) {
      member = null;
    }

    const rankData = await getUserRank(guild.id, targetUser.id);

    try {
      const cardBuffer = await generateRankCard(targetUser, rankData, member);

      if (cardBuffer) {
        const attachment = new AttachmentBuilder(cardBuffer, { name: `rank-${targetUser.id}.png` });
        await interaction.editReply({
          files: [attachment],
        });
        return;
      }
    } catch (err) {
      logger.error(`Error generating rank card image for ${targetUser.id}:`, err);
    }

    // Embed fallback if image generation fails
    const progressBarLength = 16;
    const filledBars = Math.round((rankData.progressPercent / 100) * progressBarLength);
    const emptyBars = progressBarLength - filledBars;
    const progressBar = "█".repeat(Math.max(0, filledBars)) + "░".repeat(Math.max(0, emptyBars));

    const fallbackEmbed = new EmbedBuilder()
      .setColor("#6366F1")
      .setAuthor({
        name: `Level & XP — ${member?.displayName || targetUser.displayName || targetUser.username}`,
        iconURL: targetUser.displayAvatarURL(),
      })
      .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
      .setDescription(
        `🏆 **Peringkat Server:** **#${rankData.rank}**\n` +
        `⭐ **Level Saat Ini:** **Level ${rankData.level}**\n\n` +
        `**Progress Level:**\n` +
        `\`${progressBar}\` **${rankData.progressPercent}%**\n` +
        `> **XP Level:** ${rankData.currentLevelXp.toLocaleString("id-ID")} / ${rankData.nextLevelXp.toLocaleString("id-ID")} XP\n` +
        `> **Total Akumulasi XP:** ${rankData.totalXp.toLocaleString("id-ID")} XP\n\n` +
        `*Catatan: XP dan Level adalah progres permanen server dan terpisah dari Rogatekno Koin (RTK).*`
      )
      .setFooter({
        text: `Maya Leveling System • ${guild.name}`,
        iconURL: interaction.client.user?.displayAvatarURL(),
      })
      .setTimestamp();

    await interaction.editReply({
      embeds: [fallbackEmbed],
    });
  },
};

export default command;
