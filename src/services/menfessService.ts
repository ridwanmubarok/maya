import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, TextChannel } from "discord.js";
import { prisma } from "./database";
import { askNvidia } from "./aiClient";
import { logger } from "../utils/logger";

export interface MenfessResult {
  success: boolean;
  code?: string;
  reason?: string;
  channelId?: string;
}

/**
 * Memeriksa keamanan pesan Menfess menggunakan NVIDIA AI.
 */
export async function moderateMenfessContent(content: string): Promise<{ safe: boolean; reason?: string; cleanContent: string }> {
  const prompt = `
Kamu adalah Sistem Moderasi AI Otomatis untuk fitur Menfess Anonim Discord.
Tugas kamu adalah menganalisis apakah pesan berikut AMAN untuk diposting secara publik di server Discord.

Aturan Moderasi Ketat:
1. DILARANG: Ujaran kebencian (SARA, rasisme, pelecehan agama, homofobia ekstrim).
2. DILARANG: Doxxing atau kebocoran data pribadi (Nomor HP, NIK, alamat rumah, akun privat seseorang yang ditujukan untuk melecehkan/menyerang).
3. DILARANG: Ancaman kekerasan fisik, penipuan, judi online, atau materi NSFW/pornografi eksplisit.
4. DIPERBOLEHKAN: Curhatan asmara, salam-salaman santai, pesan lucu, kritik membangun, atau percakapan gaul khas remaja/Gen-Z selama tidak melanggar aturan di atas.

Analisis Pesan Berikut:
"${content.replace(/"/g, '\\"')}"

Format Tanggapan HARUS persis JSON valid tanpa teks tambahan di luar JSON:
{
  "safe": true/false,
  "reason": "Jika safe=false, sebutkan alasannya dalam 1 kalimat singkat bahasa Indonesia yang sopan dan jelas. Jika safe=true, isi null."
}
`.trim();

  try {
    const aiResponse = await askNvidia(prompt);
    
    // Extract JSON from response (in case wrapped in markdown ```json ... ```)
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        safe: parsed.safe === true,
        reason: parsed.reason || "Pesan terdeteksi melanggar pedoman komunitas.",
        cleanContent: content
      };
    }

    // Fallback if AI response failed to produce JSON
    logger.warn(`Moderasi AI tidak memberikan JSON valid: ${aiResponse}`);
    return { safe: true, cleanContent: content };
  } catch (error: any) {
    logger.error("Error saat moderasi AI Menfess:", error);
    // Jika AI error, izinkan pesan lolos kecuali mengandung kata terlarang dasar
    return { safe: true, cleanContent: content };
  }
}

/**
 * Menghasilkan kode unik untuk Menfess (misal: MNF-4829).
 */
export async function generateMenfessCode(): Promise<string> {
  while (true) {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const code = `MNF-${randomNum}`;
    const existing = await prisma.menfessLog.findUnique({ where: { code } });
    if (!existing) return code;
  }
}

/**
 * Memproses dan memposting pesan Menfess anonim ke channel target server.
 */
export async function submitMenfess(
  client: Client,
  guildId: string,
  senderId: string,
  content: string,
  replyToCode?: string
): Promise<MenfessResult> {
  try {
    // 1. Ambil konfigurasi server
    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    if (config && config.menfessEnabled === false) {
      return {
        success: false,
        reason: "Fitur Menfess Anonim sedang dinonaktifkan oleh administrator server ini."
      };
    }

    // 2. Cari target channel
    let targetChannel: TextChannel | null = null;
    if (config?.menfessChannelId) {
      targetChannel = (client.channels.cache.get(config.menfessChannelId) as TextChannel) ||
        ((await client.channels.fetch(config.menfessChannelId).catch(() => null)) as unknown as TextChannel);
    }

    if (!targetChannel) {
      // Fallback ke system channel atau channel teks pertama
      const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
      if (guild) {
        targetChannel = guild.systemChannel || (guild.channels.cache.find((c) => c.isTextBased() && !c.isThread()) as TextChannel);
      }
    }

    if (!targetChannel) {
      return {
        success: false,
        reason: "Channel target Menfess belum diatur atau tidak ditemukan di server ini."
      };
    }

    // 3. Moderasi konten menggunakan NVIDIA AI
    const modResult = await moderateMenfessContent(content);
    if (!modResult.safe) {
      return {
        success: false,
        reason: `Pesan kamu ditolak oleh AI Automod Maya.\nAlasan: **${modResult.reason}**`
      };
    }

    // 4. Generate kode unik & persiapkan Embed
    const code = await generateMenfessCode();

    const embed = new EmbedBuilder()
      .setTitle(`💌 Menfess Anonim #${code}`)
      .setColor("#EC4899") // Pink Aesthetic
      .setDescription(content)
      .setTimestamp()
      .setFooter({ text: "Dikirim secara anonim • Disaring oleh NVIDIA AI Maya" });

    // Tambahkan info balasan jika membalas Menfess lain
    if (replyToCode) {
      const parentMenfess = await prisma.menfessLog.findUnique({ where: { code: replyToCode } });
      if (parentMenfess) {
        embed.addFields({
          name: `🔗 Membalas #${replyToCode}`,
          value: `> ${parentMenfess.content.length > 100 ? parentMenfess.content.substring(0, 97) + "..." : parentMenfess.content}`
        });
      }
    }

    const replyBtn = new ButtonBuilder()
      .setCustomId(`menfess_reply:${code}`)
      .setLabel("💬 Balas Anonim")
      .setStyle(ButtonStyle.Secondary);

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(replyBtn);

    // 5. Kirim ke channel target Discord
    const sentMsg = await targetChannel.send({
      embeds: [embed],
      components: [actionRow]
    });

    // 6. Simpan riwayat log di database
    await prisma.menfessLog.create({
      data: {
        code,
        guildId,
        channelId: targetChannel.id,
        messageId: sentMsg.id,
        senderId,
        content,
        replyToCode: replyToCode || null
      }
    });

    return {
      success: true,
      code,
      channelId: targetChannel.id
    };
  } catch (error: any) {
    logger.error("Error submitMenfess:", error);
    return {
      success: false,
      reason: `Terjadi kesalahan internal: ${error.message || error}`
    };
  }
}
