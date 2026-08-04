import { Client, VoiceState } from "discord.js";
import { prisma } from "./database";
import { logger } from "../utils/logger";

interface VoiceJoinInfo {
  guildId: string;
  userId: string;
  username: string;
  joinedAt: number;
}

const voiceSessions = new Map<string, VoiceJoinInfo>(); // key: `${guildId}:${userId}`
let voiceTickerInitialized = false;

/**
 * Tangani perubahan status Voice State (Join, Leave, Move)
 */
export function handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;

  const guildId = (newState.guild || oldState.guild).id;
  const userId = member.user.id;
  const username = member.user.displayName || member.user.username;
  const key = `${guildId}:${userId}`;

  // Member join Voice Channel
  if (!oldState.channelId && newState.channelId) {
    // Abaikan jika di AFK channel
    if (newState.guild.afkChannelId && newState.channelId === newState.guild.afkChannelId) {
      return;
    }
    voiceSessions.set(key, {
      guildId,
      userId,
      username,
      joinedAt: Date.now()
    });
    logger.debug(`VoiceRewardManager: Member ${username} bergabung di Voice Channel server ${newState.guild.name}`);
  }
  // Member leave Voice Channel
  else if (oldState.channelId && !newState.channelId) {
    voiceSessions.delete(key);
    logger.debug(`VoiceRewardManager: Member ${username} keluar dari Voice Channel`);
  }
  // Member pindah ke AFK Channel
  else if (newState.channelId && newState.guild.afkChannelId && newState.channelId === newState.guild.afkChannelId) {
    voiceSessions.delete(key);
  }
}

/**
 * Inisialisasi Ticker Otomatis Penambahan Rogatekno Cash untuk Voice Channel
 */
export function initVoiceRewardTicker(client: Client) {
  if (voiceTickerInitialized) return;
  voiceTickerInitialized = true;

  logger.info("VoiceRewardManager: Inisialisasi background ticker Voice Rewards (1 menit precision).");

  // Sync ulang status member yang sudah berada di Voice Channel saat bot baru restart
  client.guilds.cache.forEach((guild) => {
    guild.channels.cache.forEach((channel) => {
      if (channel.isVoiceBased() && channel.id !== guild.afkChannelId) {
        channel.members.forEach((member) => {
          if (!member.user.bot) {
            const key = `${guild.id}:${member.user.id}`;
            if (!voiceSessions.has(key)) {
              voiceSessions.set(key, {
                guildId: guild.id,
                userId: member.user.id,
                username: member.user.displayName || member.user.username,
                joinedAt: Date.now()
              });
            }
          }
        });
      }
    });
  });

  // Ticker berjalan setiap 1 menit
  setInterval(async () => {
    await processVoiceRewards();
  }, 60000);
}

async function processVoiceRewards() {
  const now = Date.now();
  const guildConfigsMap = new Map<string, any>();

  for (const [key, info] of voiceSessions.entries()) {
    try {
      // Ambil konfigurasi guild dari cache atau DB
      if (!guildConfigsMap.has(info.guildId)) {
        const config = await prisma.guildConfig.findUnique({ where: { guildId: info.guildId } });
        guildConfigsMap.set(info.guildId, config);
      }

      const config = guildConfigsMap.get(info.guildId);
      if (config && config.voiceRewardEnabled === false) {
        continue;
      }

      const intervalMin = config?.voiceRewardIntervalMin ?? 10;
      const rewardAmount = config?.voiceRewardAmount ?? 5;
      const intervalMs = intervalMin * 60 * 1000;

      const elapsedMs = now - info.joinedAt;

      // Jika durasi nongkrong sudah memenuhi interval minimal
      if (elapsedMs >= intervalMs) {
        // Tambahkan saldo Rogatekno Cash ke database
        await addVoiceRewardCash(info.guildId, info.userId, info.username, rewardAmount);

        // Reset timestamp joinedAt untuk siklus berikutnya
        info.joinedAt = now;
        voiceSessions.set(key, info);

        logger.info(
          `VoiceRewardManager: Menghadiahkan +${rewardAmount} 🪙 Rogatekno Cash ke ${info.username} (Nongkrong di Voice ${intervalMin} menit)`
        );
      }
    } catch (err) {
      logger.error(`VoiceRewardManager: Error processing reward for ${info.username}:`, err);
    }
  }
}

async function addVoiceRewardCash(guildId: string, userId: string, username: string, points: number) {
  try {
    const existing = await prisma.triviaScore.findUnique({
      where: { guildId_userId: { guildId, userId } }
    });

    if (existing) {
      await prisma.triviaScore.update({
        where: { id: existing.id },
        data: {
          score: existing.score + points,
          username
        }
      });
    } else {
      await prisma.triviaScore.create({
        data: {
          guildId,
          userId,
          username,
          score: points,
          dailyScore: 0
        }
      });
    }
  } catch (err) {
    logger.error("Error adding Voice Reward Cash to DB:", err);
  }
}
