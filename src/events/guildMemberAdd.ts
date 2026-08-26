import { Events, GuildMember, TextChannel } from "discord.js";
import { BotEvent } from "../types";
import { prisma } from "../services/database";
import { createEmbed } from "../utils/embeds";
import { logger } from "../utils/logger";
import { trackAnalyticsEvent } from "../services/analyticsTracker";

const event: BotEvent = {
  name: Events.GuildMemberAdd,
  async execute(member: GuildMember) {
    const { guild } = member;

    // Track analytics event for member join
    trackAnalyticsEvent(guild.id, "MEMBER_JOIN").catch(() => {});

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

      // Award 50 RTK Points Welcome Bonus to new member
      const todayStr = new Date().toISOString().split("T")[0];
      const startingBonus = 50;
      try {
        await prisma.triviaScore.upsert({
          where: { guildId_userId: { guildId: guild.id, userId: member.user.id } },
          update: {
            score: { increment: startingBonus },
            dailyScore: { increment: startingBonus },
            lastDailyDate: todayStr,
            username: member.user.displayName || member.user.username
          },
          create: {
            guildId: guild.id,
            userId: member.user.id,
            username: member.user.displayName || member.user.username,
            score: startingBonus,
            dailyScore: startingBonus,
            lastDailyDate: todayStr
          }
        });
        logger.info(`GuildMemberAdd: Menghadiahkan +${startingBonus} RTK Points welcome bonus kepada member baru ${member.user.tag}`);
      } catch (err) {
        logger.error("GuildMemberAdd: Gagal menambahkan welcome RTK bonus:", err);
      }

      // Try sending friendly welcome DM with bonus notification
      member.send({
        content: `👋 Selamat datang di **${guild.name}**, ${member.user.username}!\n\n` +
          `🎁 Sebagai hadiah selamat datang, kamu telah menerima bonus **+50 RTK Points** (Rogatekno Koin) di dompetmu!\n` +
          `Gunakan perintah \`/cash saldo\` di server untuk melihat dompetmu, dan nikmati berbagai fitur seru seperti Pantun Harian, Tebak-Tebakan, Voice Cash, dan Penukaran Hadiah di \`/shop\`!`
      }).catch(() => {});

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
        .replace(/{memberCount}/g, guild.memberCount.toString())
        .replace(/{rtkBonus}/g, startingBonus.toString());

      // Create dynamic welcome embed
      const welcomeEmbed = createEmbed.info(welcomeTitle, welcomeMessage);
      
      // Add Welcome Bonus Field to Embed
      welcomeEmbed.addFields({
        name: "🎁 Bonus Selamat Datang",
        value: `Selamat! Kamu mendapatkan bonus modal awal **+50 RTK Points**! Cek saldomu dengan perintah \`/cash saldo\`.`,
        inline: false
      });

      if (config.welcomeThumbnail) {
        welcomeEmbed.setThumbnail(member.user.displayAvatarURL({ size: 256 }));
      }
      
      if (config.welcomeImage) {
        welcomeEmbed.setImage(config.welcomeImage);
      }

      await channel.send({ 
        content: `Halo ${member}, selamat datang! Kamu mendapatkan **+50 RTK Points**! 🎉`,
        embeds: [welcomeEmbed] 
      });
      logger.info(`Welcomed ${member.user.tag} in ${guild.name} with 50 RTK points`);
    } catch (error) {
      logger.error("Error pada event guildMemberAdd:", error);
    }
  }
};

export default event;
