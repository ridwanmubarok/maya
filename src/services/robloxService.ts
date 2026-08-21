import { Client, TextChannel, EmbedBuilder } from "discord.js";
import crypto from "crypto";
import axios from "axios";
import { prisma } from "./database";
import { logger } from "../utils/logger";
import { uploadBase64ToS3, deleteObjectFromS3 } from "./storageService";

export interface RobloxPhotoPayload {
  playerName: string;
  playerUserId?: string | number;
  caption?: string;
  gameName?: string;
  placeId?: string | number;
  imageBase64?: string;
  imageUrl?: string;
}

/**
 * Fetch official Roblox player headshot avatar thumbnail
 */
export async function getRobloxAvatarUrl(userId?: string | number): Promise<string | undefined> {
  if (!userId) return undefined;
  try {
    const res = await axios.get(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`,
      { timeout: 3000 }
    );
    if (res.data && res.data.data && res.data.data.length > 0) {
      return res.data.data[0].imageUrl;
    }
  } catch (err) {
    logger.debug(`RobloxService: Failed to fetch avatar thumbnail for userId ${userId}:`, err);
  }
  return `https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=420&height=420&format=png`;
}

/**
 * Handle incoming photo snapshot request from Roblox game
 */
export async function handleIncomingRobloxPhoto(
  client: Client,
  apiKey: string,
  payload: RobloxPhotoPayload
): Promise<{ success: boolean; message: string; photoUrl?: string; messageId?: string }> {
  try {
    if (!apiKey) {
      return { success: false, message: "API Key tidak disertakan dalam header request (x-api-key)." };
    }

    const config = await prisma.guildConfig.findFirst({
      where: { robloxApiKey: apiKey }
    });

    if (!config) {
      return { success: false, message: "API Key tidak valid atau tidak cocok dengan server manapun." };
    }

    if (config.robloxEnabled === false) {
      return { success: false, message: "Fitur Roblox Photo Snap dinonaktifkan di server ini." };
    }

    if (!config.robloxChannelId) {
      return { success: false, message: "Target channel Discord untuk foto Roblox belum diatur di dashboard." };
    }

    const guild = client.guilds.cache.get(config.guildId) || await client.guilds.fetch(config.guildId).catch(() => null);
    if (!guild) {
      return { success: false, message: "Server Discord tidak ditemukan atau bot tidak terhubung." };
    }

    const channel = (guild.channels.cache.get(config.robloxChannelId) || await guild.channels.fetch(config.robloxChannelId).catch(() => null)) as TextChannel;
    if (!channel || !channel.isTextBased() || !("send" in channel)) {
      return { success: false, message: "Channel target Discord tidak valid atau bot tidak memiliki izin mengirim pesan." };
    }

    const { playerName, playerUserId, caption, gameName, placeId, imageBase64, imageUrl } = payload;

    if (!playerName) {
      return { success: false, message: "Field 'playerName' wajib disertakan." };
    }

    if (!imageBase64 && !imageUrl) {
      return { success: false, message: "Harus menyertakan salah satu dari 'imageBase64' atau 'imageUrl'." };
    }

    // 1. Process Image Upload to SeaweedFS S3
    let finalImageUrl: string = "";
    if (imageBase64) {
      try {
        finalImageUrl = await uploadBase64ToS3(imageBase64, "roblox/photos", "png");
      } catch (uploadErr) {
        logger.error("RobloxService: Failed to upload base64 image to SeaweedFS S3:", uploadErr);
        return { success: false, message: "Gagal mengunggah gambar ke penyimpanan S3." };
      }
    } else if (imageUrl) {
      finalImageUrl = imageUrl;
    }

    // 2. Fetch Player Avatar Thumbnail
    const avatarUrl = await getRobloxAvatarUrl(playerUserId);

    // 3. Construct Clean, Aesthetic Discord Embed
    const embed = new EmbedBuilder()
      .setColor("#00A2FF")
      .setImage(finalImageUrl)
      .setFooter({ text: "Roblox In-Game Snapshot" })
      .setTimestamp();

    if (playerName) {
      embed.setAuthor({
        name: playerName,
        iconURL: avatarUrl,
        url: playerUserId ? `https://www.roblox.com/users/${playerUserId}/profile` : undefined
      });
    }

    if (gameName) {
      embed.setTitle(gameName);
      if (placeId) {
        embed.setURL(`https://www.roblox.com/games/${placeId}`);
      }
    }

    if (caption && caption.trim()) {
      embed.setDescription(`> *"${caption.trim()}"*`);
    }

    // 4. Send Message to Discord Channel
    const discordMessage = await channel.send({ embeds: [embed] });

    // 5. Save Record in Database
    await prisma.robloxPhotoLog.create({
      data: {
        guildId: config.guildId,
        playerName,
        playerUserId: playerUserId ? String(playerUserId) : null,
        imageUrl: finalImageUrl,
        caption: caption || null,
        gameName: gameName || null,
        placeId: placeId ? String(placeId) : null,
        discordMsgId: discordMessage.id
      }
    });

    logger.info(`RobloxService: Successfully posted photo from player ${playerName} in guild ${guild.name}`);

    return {
      success: true,
      message: "Foto berhasil diposting ke Discord channel!",
      photoUrl: finalImageUrl,
      messageId: discordMessage.id
    };
  } catch (error: any) {
    logger.error("RobloxService: Error handling incoming Roblox photo:", error);
    return { success: false, message: error.message || "Terjadi kesalahan internal server." };
  }
}

/**
 * Generate or regenerate a unique Roblox API key for a guild
 */
export async function generateRobloxApiKey(guildId: string): Promise<string> {
  const apiKey = `rbx_${crypto.randomBytes(16).toString("hex")}`;
  await prisma.guildConfig.upsert({
    where: { guildId },
    update: { robloxApiKey: apiKey },
    create: { guildId, robloxApiKey: apiKey }
  });
  return apiKey;
}

/**
 * Get recent Roblox photos for a guild
 */
export async function getRobloxPhotosForGuild(guildId: string, limit: number = 24) {
  return await prisma.robloxPhotoLog.findMany({
    where: { guildId },
    orderBy: { createdAt: "desc" },
    take: limit
  });
}

/**
 * Delete a single Roblox photo by ID and remove from S3 & Discord if possible
 */
export async function deleteRobloxPhoto(client: Client, guildId: string, photoId: number): Promise<boolean> {
  try {
    const photo = await prisma.robloxPhotoLog.findFirst({
      where: { id: photoId, guildId }
    });

    if (!photo) return false;

    // 1. Delete image from SeaweedFS S3
    if (photo.imageUrl) {
      await deleteObjectFromS3(photo.imageUrl).catch(() => {});
    }

    // 2. Delete Discord message if channel & msgId available
    try {
      const config = await prisma.guildConfig.findUnique({ where: { guildId } });
      if (config && config.robloxChannelId && photo.discordMsgId) {
        const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
        if (guild) {
          const channel = (guild.channels.cache.get(config.robloxChannelId) || await guild.channels.fetch(config.robloxChannelId).catch(() => null)) as TextChannel;
          if (channel && channel.isTextBased()) {
            const msg = await channel.messages.fetch(photo.discordMsgId).catch(() => null);
            if (msg) await msg.delete().catch(() => {});
          }
        }
      }
    } catch (_) {}

    // 3. Delete database record
    await prisma.robloxPhotoLog.delete({
      where: { id: photoId }
    });

    logger.info(`RobloxService: Deleted photo ID #${photoId} for guild ${guildId}`);
    return true;
  } catch (error) {
    logger.error(`RobloxService: Error deleting photo #${photoId}:`, error);
    return false;
  }
}

/**
 * Clear all Roblox photos for a guild
 */
export async function clearAllRobloxPhotos(client: Client, guildId: string): Promise<number> {
  try {
    const photos = await prisma.robloxPhotoLog.findMany({ where: { guildId } });
    for (const photo of photos) {
      if (photo.imageUrl) {
        await deleteObjectFromS3(photo.imageUrl).catch(() => {});
      }
    }

    const deleteResult = await prisma.robloxPhotoLog.deleteMany({ where: { guildId } });
    logger.info(`RobloxService: Cleared all (${deleteResult.count}) photos for guild ${guildId}`);
    return deleteResult.count;
  } catch (error) {
    logger.error(`RobloxService: Error clearing photos for guild ${guildId}:`, error);
    return 0;
  }
}
