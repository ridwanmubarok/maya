import { Events, Message, TextChannel } from "discord.js";
import { BotEvent } from "../types";
import { prisma } from "../services/database";
import { createEmbed } from "../utils/embeds";
import { logModeration } from "../utils/moderationLogger";
import { logger } from "../utils/logger";
import { trackAnalyticsEvent } from "../services/analyticsTracker";

const event: BotEvent = {
  name: Events.MessageCreate,
  async execute(message: Message) {
    // Abaikan pesan dari bot
    if (message.author.bot || !message.guild || !message.channel.isTextBased()) return;

    try {
      const guildId = message.guild.id;
      // Track analytics event for message sent
      trackAnalyticsEvent(guildId, "MESSAGE_SENT").catch(() => {});
      // Fetch server configuration
      const config = await prisma.guildConfig.findUnique({
        where: { guildId }
      });

      const bannedWordsStr = config?.bannedWords || "anjing,babi,bangsat,kontol,memek,goblok,tolol,bajingan";
      const maxStrikes = config?.maxStrikes ?? 3;
      const muteDuration = config?.muteDuration ?? 10;

      const bannedWords = bannedWordsStr.split(",").map(w => w.trim().toLowerCase()).filter(Boolean);
      const contentLower = message.content.toLowerCase();
      
      const containsBannedWord = bannedWords.some(word => 
        new RegExp(`\\b${word}\\b`, "i").test(contentLower)
      );

      if (containsBannedWord) {
        const channel = message.channel as TextChannel;

        // Hapus pesan pelanggar
        if (message.deletable) {
          await message.delete();
        }

        // Catat strike ke database
        const strike = await prisma.warnLog.create({
          data: {
            userId: message.author.id,
            guildId,
            reason: `Automod: Menggunakan kata kasar/banned word`,
            moderatorId: message.client.user?.id || "AUTOMOD"
          }
        });

        // Hitung total strike user tersebut
        const strikeCount = await prisma.warnLog.count({
          where: {
            userId: message.author.id,
            guildId
          }
        });

        const warningEmbed = createEmbed.warning(
          "Automod - Kata Kasar Terdeteksi",
          `Halo ${message.author}, pesan Anda telah dihapus karena mengandung kata-kata kasar.\n\n` +
          `**Pelanggaran Anda:** ${strike.reason}\n` +
          `**Total Strike:** \`${strikeCount}/${maxStrikes}\`\n\n` +
          `*Peringatan: Mencapai ${maxStrikes} strike dapat mengakibatkan tindakan timeout.*`
        );

        const replyMsg = await channel.send({ embeds: [warningEmbed] });
        
        // Hapus bot warning message setelah 10 detik agar chat tetap bersih
        setTimeout(() => {
          replyMsg.delete().catch(() => {});
        }, 10000);

        logger.info(`Automod: Memberikan strike ke ${message.author.tag} di guild ${guildId} (Total: ${strikeCount})`);

        // Kirim moderation log
        await logModeration(
          message.guild,
          "AUTOMOD_WARN",
          { id: message.author.id, tag: message.author.tag },
          { id: message.client.user?.id || "AUTOMOD", tag: "Automod 🤖" },
          strike.reason,
          `Total Strike: ${strikeCount}/${maxStrikes}\nKonten pesan: "${message.content.substring(0, 100)}"`
        );

        // Tindakan otomatis jika melebihi maxStrikes
        if (strikeCount >= maxStrikes) {
          const member = message.member;
          if (member && member.moderatable) {
            // Berikan timeout selama muteDuration menit
            await member.timeout(muteDuration * 60_000, `Automod: Melebihi ${maxStrikes} kali strike kata kasar`);
            
            const timeoutEmbed = createEmbed.error(
              "Muted Secara Otomatis",
              `${member} telah di-mute (timeout) selama ${muteDuration} menit karena melanggar aturan kata kasar sebanyak ${maxStrikes} kali atau lebih.`
            );
            await channel.send({ embeds: [timeoutEmbed] });

            // Kirim moderation log mute
            await logModeration(
              message.guild,
              "AUTOMOD_MUTE",
              { id: member.user.id, tag: member.user.tag },
              { id: message.client.user?.id || "AUTOMOD", tag: "Automod 🤖" },
              `Melebihi ${maxStrikes} kali strike kata kasar`,
              `Di-mute (timeout) selama ${muteDuration} menit`
            );
          }
        }
      }
    } catch (error) {
      logger.error("Error pada event messageCreate (Automod):", error);
    }
  }
};

export default event;
