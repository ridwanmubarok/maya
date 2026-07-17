import { Events, Message, TextChannel } from "discord.js";
import { BotEvent } from "../types";
import { prisma } from "../services/database";
import { createEmbed } from "../utils/embeds";
import { logger } from "../utils/logger";

// Daftar kata kasar sederhana untuk demo Automod
const BANNED_WORDS = [
  "anjing",
  "babi",
  "bangsat",
  "kontol",
  "memek",
  "goblok",
  "tolol",
  "bajingan"
];

const event: BotEvent = {
  name: Events.MessageCreate,
  async execute(message: Message) {
    // Abaikan pesan dari bot
    if (message.author.bot || !message.guild || !message.channel.isTextBased()) return;

    const contentLower = message.content.toLowerCase();
    const containsBannedWord = BANNED_WORDS.some(word => 
      // Menggunakan regex sederhana atau pencarian substring agar mendeteksi kata kotor
      new RegExp(`\\b${word}\\b`, "i").test(contentLower)
    );

    if (containsBannedWord) {
      try {
        const channel = message.channel as TextChannel;

        // Hapus pesan pelanggar
        if (message.deletable) {
          await message.delete();
        }

        // Catat strike ke database
        const strike = await prisma.warnLog.create({
          data: {
            userId: message.author.id,
            guildId: message.guild.id,
            reason: `Automod: Menggunakan kata kasar/banned word`,
            moderatorId: message.client.user?.id || "AUTOMOD"
          }
        });

        // Hitung total strike user tersebut
        const strikeCount = await prisma.warnLog.count({
          where: {
            userId: message.author.id,
            guildId: message.guild.id
          }
        });

        const warningEmbed = createEmbed.warning(
          "Automod - Kata Kasar Terdeteksi",
          `Halo ${message.author}, pesan Anda telah dihapus karena mengandung kata-kata kasar.\n\n` +
          `**Pelanggaran Anda:** ${strike.reason}\n` +
          `**Total Strike:** \`${strikeCount}/3\`\n\n` +
          `*Peringatan: Mencapai 3 strike dapat mengakibatkan tindakan moderasi lanjutan.*`
        );

        const replyMsg = await channel.send({ embeds: [warningEmbed] });
        
        // Hapus bot warning message setelah 10 detik agar chat tetap bersih
        setTimeout(() => {
          replyMsg.delete().catch(() => {});
        }, 10000);

        logger.info(`Automod: Memberikan strike ke ${message.author.tag} di guild ${message.guild.id} (Total: ${strikeCount})`);

        // Tindakan otomatis jika melebihi 3 strike
        if (strikeCount >= 3) {
          const member = message.member;
          if (member && member.moderatable) {
            // Berikan timeout selama 10 menit (600,000 milidetik)
            await member.timeout(600_000, "Automod: Melebihi 3 kali strike kata kasar");
            
            const timeoutEmbed = createEmbed.error(
              "Muted Secara Otomatis",
              `${member} telah di-mute (timeout) selama 10 menit karena melanggar aturan kata kasar sebanyak 3 kali atau lebih.`
            );
            await channel.send({ embeds: [timeoutEmbed] });
          }
        }
      } catch (error) {
        logger.error("Error pada event messageCreate (Automod):", error);
      }
    }
  }
};

export default event;
