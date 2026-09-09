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
    title: "📜 Riwayat Pembaruan Sistem Maya: Peningkatan Mesin AI",
    description: "Halo! Maya telah mendapatkan pembaruan sistem dan peningkatan mesin AI terbaru:\n",
    fields: [
      {
        name: "🧠 Peningkatan Model AI (DeepSeek V4 Flash 0731)",
        value: "Maya kini ditenagai model utama **DeepSeek V4 Flash** (`deepseek-ai/deepseek-v4-flash-0731`) dengan arsitektur 304B MoE (13B aktif), kapasitas konteks 1M token, serta penalaran bahasa Indonesia yang lebih cerdas, mengalir, dan ekspresif.",
        inline: false
      },
      {
        name: "🛡️ Multi-Level Fallback Otomatis & Pembersihan EOL",
        value: "Model lama yang telah End of Life (`nvidia/nemotron-3-nano-30b-a3b`) telah dibersihkan. Maya kini dilengkapi mekanisme cadangan bertingkat super cepat jika model utama sedang mengalami antrean server agar respon obrolan tetap lancar.",
        inline: false
      },
      {
        name: "⚡ Optimasi Kecepatan & Stabilitas Respon",
        value: "Peningkatan manajemen request AI serta penanganan timeout dinamis untuk memastikan Maya selalu sigap dan stabil saat berinteraksi di Discord.",
        inline: false
      },
      {
        name: "🔕 Catatan Pengumuman",
        value: "Pemberitahuan riwayat sistem ini dikirimkan secara *silent* ke channel history tanpa menandai/mentag siapapun.",
        inline: false
      }
    ],
    footerText: "Maya System Changelog • Silent History Log"
  });
}
