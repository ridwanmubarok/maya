import { Guild, EmbedBuilder, TextChannel } from "discord.js";
import { prisma } from "../services/database";
import { logger } from "./logger";

export async function logModeration(
  guild: Guild,
  action: "WARN" | "KICK" | "BAN" | "AUTOMOD_MUTE" | "AUTOMOD_WARN",
  targetUser: { id: string; tag: string },
  moderator: { id: string; tag: string },
  reason: string,
  extraInfo?: string
) {
  try {
    const config = await prisma.guildConfig.findUnique({
      where: { guildId: guild.id }
    });

    if (!config || !config.moderationLogChannelId) return;

    const channel = guild.channels.cache.get(config.moderationLogChannelId);
    if (!channel || !channel.isTextBased()) return;

    const textChannel = channel as TextChannel;

    let color = 0x5865F2; // Default blurple
    let emoji = "🛡️";

    if (action === "WARN" || action === "AUTOMOD_WARN") {
      color = 0xFEE75C; // Amber
      emoji = "⚠️";
    } else if (action === "KICK") {
      color = 0xED4245; // Crimson
      emoji = "👢";
    } else if (action === "BAN") {
      color = 0xED4245;
      emoji = "🔨";
    } else if (action === "AUTOMOD_MUTE") {
      color = 0xED4245;
      emoji = "🔇";
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`${emoji} Moderation Log - ${action}`)
      .addFields(
        { name: "Target Member", value: `${targetUser.tag} (${targetUser.id})`, inline: true },
        { name: "Moderator / Operator", value: `${moderator.tag} (${moderator.id})`, inline: true },
        { name: "Reason / Alasan", value: reason }
      )
      .setTimestamp();

    if (extraInfo) {
      embed.addFields({ name: "Detail Tambahan", value: extraInfo });
    }

    await textChannel.send({ embeds: [embed] });
  } catch (error) {
    logger.error("Gagal mengirim moderation log:", error);
  }
}
