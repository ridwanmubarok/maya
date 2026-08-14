import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Guild, Client } from "discord.js";
import { prisma } from "./database";
import { logger } from "../utils/logger";

export interface MabarSessionData {
  id: string;
  game: string;
  description: string;
  playTime: string;
  maxPlayers: number | null;
  gameUrl?: string | null;
  creatorId: string;
  participants: string[];
}

/**
 * Generate beautiful mabar embed
 */
export function createMabarEmbed(session: MabarSessionData): EmbedBuilder {
  const currentCount = session.participants.length;
  const maxStr = session.maxPlayers ? `/${session.maxPlayers}` : "";
  const slotsInfo = `${currentCount}${maxStr}`;

  const participantList = session.participants.length > 0
    ? session.participants.map((id, index) => `${index + 1}. <@${id}>`).join("\n")
    : "*Belum ada yang bergabung. Jadilah yang pertama!*";

  const embed = new EmbedBuilder()
    .setTitle(`Jadwal Mabar: ${session.game.toUpperCase()}`)
    .setDescription(session.description)
    .setColor(0x5865F2) // Discord Blurple
    .addFields(
      { name: "Waktu Bermain", value: `**${session.playTime}**`, inline: true },
      { name: "Slot Pemain", value: `**${slotsInfo}**`, inline: true }
    );

  if (session.gameUrl) {
    embed.addFields({
      name: "🔗 Link Game",
      value: `[**Klik untuk Main / Join Game**](${session.gameUrl})`,
      inline: false,
    });
  }

  embed.addFields({ name: "Daftar Peserta", value: participantList });
  embed.setFooter({ text: `Dibuat oleh user ID: ${session.creatorId}` }).setTimestamp();

  return embed;
}

/**
 * Generate Join, Leave, and optional Link buttons
 */
export function createMabarButtons(sessionId: string, gameUrl?: string | null): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();

  const joinButton = new ButtonBuilder()
    .setCustomId(`mabar_join:${sessionId}`)
    .setLabel("Gabung Mabar")
    .setStyle(ButtonStyle.Primary);

  const leaveButton = new ButtonBuilder()
    .setCustomId(`mabar_leave:${sessionId}`)
    .setLabel("Keluar Mabar")
    .setStyle(ButtonStyle.Secondary);

  row.addComponents(joinButton, leaveButton);

  if (gameUrl) {
    const playButton = new ButtonBuilder()
      .setURL(gameUrl)
      .setLabel("🎮 Main Sekarang")
      .setStyle(ButtonStyle.Link);
    row.addComponents(playButton);
  }

  return row;
}

/**
 * Handle user join RSVP request
 */
export async function handleMabarJoin(
  sessionId: string,
  userId: string,
  client: Client
): Promise<{ success: boolean; message: string }> {
  try {
    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId }
    });

    if (!session) {
      return { success: false, message: "Jadwal mabar ini tidak ditemukan di database." };
    }

    if (session.participants.includes(userId)) {
      return { success: false, message: "Anda sudah bergabung dalam mabar ini!" };
    }

    if (session.maxPlayers && session.participants.length >= session.maxPlayers) {
      return { success: false, message: "Maaf, slot mabar sudah penuh!" };
    }

    // Add user to participants list
    const updatedParticipants = [...session.participants, userId];
    const updatedSession = await prisma.gameSession.update({
      where: { id: sessionId },
      data: { participants: updatedParticipants }
    });

    // Update Discord message
    const guild = client.guilds.cache.get(session.guildId);
    if (guild) {
      const channel = guild.channels.cache.get(session.channelId);
      if (channel && channel.isTextBased()) {
        try {
          const msg = await channel.messages.fetch(session.messageId);
          if (msg) {
            const embed = createMabarEmbed(updatedSession);
            const buttons = createMabarButtons(sessionId, session.gameUrl);
            await msg.edit({ embeds: [embed], components: [buttons] });
          }
        } catch (err) {
          logger.error(`Failed to edit mabar message ${session.messageId}:`, err);
        }
      }
    }

    return { success: true, message: "Berhasil bergabung dalam mabar! Persiapkan diri Anda." };
  } catch (error) {
    logger.error("Error joining mabar session:", error);
    return { success: false, message: "Terjadi kesalahan internal saat bergabung." };
  }
}

/**
 * Handle user leave RSVP request
 */
export async function handleMabarLeave(
  sessionId: string,
  userId: string,
  client: Client
): Promise<{ success: boolean; message: string }> {
  try {
    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId }
    });

    if (!session) {
      return { success: false, message: "Jadwal mabar ini tidak ditemukan di database." };
    }

    if (!session.participants.includes(userId)) {
      return { success: false, message: "Anda belum bergabung dalam mabar ini." };
    }

    // Remove user from participants list
    const updatedParticipants = session.participants.filter(id => id !== userId);
    const updatedSession = await prisma.gameSession.update({
      where: { id: sessionId },
      data: { participants: updatedParticipants }
    });

    // Update Discord message
    const guild = client.guilds.cache.get(session.guildId);
    if (guild) {
      const channel = guild.channels.cache.get(session.channelId);
      if (channel && channel.isTextBased()) {
        try {
          const msg = await channel.messages.fetch(session.messageId);
          if (msg) {
            const embed = createMabarEmbed(updatedSession);
            const buttons = createMabarButtons(sessionId, session.gameUrl);
            await msg.edit({ embeds: [embed], components: [buttons] });
          }
        } catch (err) {
          logger.error(`Failed to edit mabar message ${session.messageId}:`, err);
        }
      }
    }

    return { success: true, message: "Berhasil keluar dari daftar peserta mabar." };
  } catch (error) {
    logger.error("Error leaving mabar session:", error);
    return { success: false, message: "Terjadi kesalahan internal saat keluar." };
  }
}
