import { EmbedBuilder, TextChannel } from "discord.js";
import { MayaClient } from "../types";
import { logger } from "./logger";

export interface HistoryAnnouncementOptions {
  title: string;
  description: string;
  fields?: { name: string; value: string; inline?: boolean }[];
  footerText?: string;
}

/**
 * Mencari channel history di dalam guild
 */
export function findHistoryChannel(guild: any): TextChannel | null {
  const channels = guild.channels.cache;

  // 1. Cari exact match channel bernama "history"
  let target = channels.find(
    (c: any) => c.isTextBased() && c.name.toLowerCase() === "history"
  );

  // 2. Jika tidak ada exact match, cari channel yang mengandung kata "history"
  if (!target) {
    target = channels.find(
      (c: any) => c.isTextBased() && c.name.toLowerCase().includes("history")
    );
  }

  // 3. Fallback: cari channel bernama "changelog" atau "update-history"
  if (!target) {
    target = channels.find(
      (c: any) => c.isTextBased() && (
        c.name.toLowerCase().includes("changelog") || 
        c.name.toLowerCase().includes("update-bot")
      )
    );
  }

  return (target as TextChannel) || null;
}

/**
 * Mengirim pengumuman pembaruan/penyesuaian ke channel history di semua server yang terhubung.
 * Dijamin SILENT: allowedMentions { parse: [] } agar tidak mem-ping @everyone, @here, maupun role/user.
 */
export async function sendHistoryAnnouncement(
  client: MayaClient,
  options: HistoryAnnouncementOptions
) {
  try {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(options.title)
      .setDescription(options.description)
      .setTimestamp()
      .setFooter({
        text: options.footerText || "Maya System History • Silent Notification",
        iconURL: client.user?.displayAvatarURL()
      });

    if (options.fields && options.fields.length > 0) {
      embed.addFields(options.fields);
    }

    for (const [guildId, guild] of client.guilds.cache) {
      try {
        const historyChannel = findHistoryChannel(guild);
        if (!historyChannel) {
          logger.info(`HistoryLogger: Tidak menemukan channel #history di server "${guild.name}" (${guildId}).`);
          continue;
        }

        // Kirim embed secara silent (tanpa parsing mention apapun)
        await historyChannel.send({
          embeds: [embed],
          allowedMentions: { parse: [] }
        });

        logger.info(`HistoryLogger: Berhasil mengirim silent history update ke #${historyChannel.name} di server "${guild.name}".`);
      } catch (guildErr) {
        logger.error(`HistoryLogger: Gagal mengirim silent history update ke server ${guildId}:`, guildErr);
      }
    }
  } catch (error) {
    logger.error("HistoryLogger: Gagal memproses pengiriman history announcement:", error);
  }
}

/**
 * Broadcast silent history announcement khusus penyesuaian Maya saat ini
 */
export async function broadcastMayaAdjustmentHistory(client: MayaClient) {
  logger.info("HistoryLogger: Menjalankan broadcast silent history penyesuaian Maya...");
  await sendHistoryAnnouncement(client, {
    title: "📜 Riwayat Penyesuaian & Pembaruan Sistem Maya",
    description: "Halo! Maya telah mendapatkan pembaruan dan penyesuaian sistem terbaru untuk meningkatkan performa dan kemudahan penggunaan:\n",
    fields: [
      {
        name: "🎵 Fitur Musik Ditiadakan",
        value: "Fitur pemutar musik (`/music`, antrean lagu, dan tombol kontrol musik) telah dinonaktifkan sepenuhnya untuk memprioritaskan latensi rendah serta stabilitas interaksi voice & AI.",
        inline: false
      },
      {
        name: "👛 Penyesuaian Rogatekno Koin (RTK)",
        value: "Sub-command `/cash pay` untuk transfer koin antar member telah ditiadakan. Anda tetap dapat memeriksa total saldo dengan `/cash saldo` dan memantau peringkat server dengan `/cash leaderboard`.",
        inline: false
      },
      {
        name: "🔕 Catatan Pengumuman",
        value: "Pemberitahuan riwayat ini dikirimkan secara *silent* ke channel history tanpa menandai/mentag siapapun.",
        inline: false
      }
    ],
    footerText: "Maya System Changelog • Silent History Log"
  });
}
