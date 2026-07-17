import { Events, GuildMember, TextChannel } from "discord.js";
import { BotEvent } from "../types";
import { prisma } from "../services/database";
import { createEmbed } from "../utils/embeds";
import { logger } from "../utils/logger";

const event: BotEvent = {
  name: Events.GuildMemberAdd,
  async execute(member: GuildMember) {
    const { guild } = member;

    try {
      // Find if there is a welcome channel configured for this guild
      const config = await prisma.guildConfig.findUnique({
        where: { guildId: guild.id }
      });

      if (!config || !config.welcomeChannelId) {
        logger.debug(`GuildMemberAdd: Tidak ada channel welcome yang dikonfigurasi untuk guild ${guild.id}`);
        return;
      }

      const channel = guild.channels.cache.get(config.welcomeChannelId) as TextChannel;
      if (!channel) {
        logger.warn(`GuildMemberAdd: Channel welcome dengan ID ${config.welcomeChannelId} tidak ditemukan.`);
        return;
      }

      // Create a premium welcome message embed
      const welcomeEmbed = createEmbed.info(
        `👋 Selamat Datang!`,
        `Selamat datang **${member.user.username}** di **${guild.name}**!\n\n` +
        `Kamu adalah member ke-**${guild.memberCount}** di server ini.\n` +
        `Jangan lupa untuk membaca aturan server dan bersenang-senang!`
      )
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .setImage("https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1000&auto=format&fit=crop&q=80"); // Nice aesthetic banner

      await channel.send({ 
        content: `Halo ${member}, selamat datang!`,
        embeds: [welcomeEmbed] 
      });
      logger.info(`Welcomed ${member.user.tag} in ${guild.name}`);
    } catch (error) {
      logger.error("Error pada event guildMemberAdd:", error);
    }
  }
};

export default event;
