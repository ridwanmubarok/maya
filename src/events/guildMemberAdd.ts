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
      // Automatically assign the "Rotasi" role if it exists
      try {
        const roles = await guild.roles.fetch();
        const rotasiRole = roles.find(r => r.name.toLowerCase() === "rotasi");
        if (rotasiRole) {
          await member.roles.add(rotasiRole);
          logger.info(`Auto-role: Menambahkan role "Rotasi" ke member ${member.user.tag} di guild ${guild.id}`);
        } else {
          logger.warn(`Auto-role: Role dengan nama "Rotasi" tidak ditemukan di server ${guild.name}`);
        }
      } catch (roleErr) {
        logger.error(`Auto-role: Gagal menambahkan role "Rotasi" ke member ${member.user.tag}:`, roleErr);
      }

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

      const welcomeTitle = config.welcomeTitle || "👋 Selamat Datang!";
      const rawMessage = config.welcomeMessage || "Selamat datang **{username}** di **{guildName}**!\n\nKamu adalah member ke-**{memberCount}** di server ini.";
      
      const welcomeMessage = rawMessage
        .replace(/{username}/g, member.user.username)
        .replace(/{guildName}/g, guild.name)
        .replace(/{memberCount}/g, guild.memberCount.toString());

      // Create dynamic welcome embed
      const welcomeEmbed = createEmbed.info(welcomeTitle, welcomeMessage);
      
      if (config.welcomeThumbnail) {
        welcomeEmbed.setThumbnail(member.user.displayAvatarURL({ size: 256 }));
      }
      
      if (config.welcomeImage) {
        welcomeEmbed.setImage(config.welcomeImage);
      }

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
