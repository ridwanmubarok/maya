import { Client, EmbedBuilder, GuildMember, TextChannel, User } from "discord.js";
import sharp from "sharp";
import axios from "axios";
import { prisma } from "./database";
import { logger } from "../utils/logger";

export interface LevelProgress {
  level: number;
  totalXp: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progressPercent: number;
}

export interface UserRankData {
  userId: string;
  username: string;
  rank: number;
  totalMembers: number;
  level: number;
  totalXp: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progressPercent: number;
  messagesCount: number;
  voiceSeconds: number;
  triviaWins: number;
  pantunCount: number;
  storyCount: number;
  pollCount: number;
}

// In-memory chat cooldown cache to minimize DB lookups (key: `${guildId}:${userId}`)
const chatXpCooldowns = new Map<string, number>();

/**
 * XP required to advance from `level` to `level + 1`
 * Formula: 5 * (L^2) + 50 * L + 100
 */
export function getXpRequiredForNextLevel(level: number): number {
  return 5 * Math.pow(level, 2) + 50 * level + 100;
}

/**
 * Calculate level, current level progress, and XP needed from total lifetime XP
 */
export function calculateLevelFromXp(totalXp: number): LevelProgress {
  let level = 0;
  let xpNeeded = getXpRequiredForNextLevel(level);
  let remainingXp = Math.max(0, totalXp);

  while (remainingXp >= xpNeeded) {
    remainingXp -= xpNeeded;
    level++;
    xpNeeded = getXpRequiredForNextLevel(level);
  }

  const progressPercent = Math.min(100, Math.max(0, Math.floor((remainingXp / xpNeeded) * 100)));

  return {
    level,
    totalXp,
    currentLevelXp: remainingXp,
    nextLevelXp: xpNeeded,
    progressPercent,
  };
}

/**
 * Generic core XP awarder with level-up detection and notification
 */
export async function awardActivityXp(
  client: Client | null,
  guildId: string,
  userId: string,
  username: string,
  amount: number,
  source: "CHAT" | "VOICE" | "TRIVIA" | "PANTUN" | "STORY" | "POLL" | "GAME" | "MENFESS" | "ADMIN",
  channel?: TextChannel | null,
  statsDelta?: {
    messagesCount?: number;
    voiceSeconds?: number;
    triviaWins?: number;
    pantunCount?: number;
    storyCount?: number;
    pollCount?: number;
  }
) {
  try {
    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    if (config && config.levelingEnabled === false) {
      return null;
    }

    const existing = await prisma.userLevel.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });

    const oldXp = existing?.xp ?? 0;
    const oldLevel = calculateLevelFromXp(oldXp).level;
    const newXp = oldXp + amount;
    const progress = calculateLevelFromXp(newXp);
    const newLevel = progress.level;

    const dataUpdate: any = {
      xp: newXp,
      level: newLevel,
      username,
    };

    if (statsDelta?.messagesCount) {
      dataUpdate.messagesCount = { increment: statsDelta.messagesCount };
      dataUpdate.lastMessageXpAt = new Date();
    }
    if (statsDelta?.voiceSeconds) {
      dataUpdate.voiceSeconds = { increment: statsDelta.voiceSeconds };
    }
    if (statsDelta?.triviaWins) {
      dataUpdate.triviaWins = { increment: statsDelta.triviaWins };
    }
    if (statsDelta?.pantunCount) {
      dataUpdate.pantunCount = { increment: statsDelta.pantunCount };
    }
    if (statsDelta?.storyCount) {
      dataUpdate.storyCount = { increment: statsDelta.storyCount };
    }
    if (statsDelta?.pollCount) {
      dataUpdate.pollCount = { increment: statsDelta.pollCount };
    }

    let record;
    if (existing) {
      record = await prisma.userLevel.update({
        where: { id: existing.id },
        data: dataUpdate,
      });
    } else {
      record = await prisma.userLevel.create({
        data: {
          guildId,
          userId,
          username,
          xp: newXp,
          level: newLevel,
          messagesCount: statsDelta?.messagesCount || 0,
          voiceSeconds: statsDelta?.voiceSeconds || 0,
          triviaWins: statsDelta?.triviaWins || 0,
          pantunCount: statsDelta?.pantunCount || 0,
          storyCount: statsDelta?.storyCount || 0,
          pollCount: statsDelta?.pollCount || 0,
          lastMessageXpAt: statsDelta?.messagesCount ? new Date() : null,
        },
      });
    }

    // Check level up event
    if (newLevel > oldLevel) {
      logger.info(`LevelingManager: User ${username} (${userId}) LEVEL UP: ${oldLevel} -> ${newLevel} (+${amount} XP from ${source})`);
      // Note: Level-up announcements/notifications to channels/users are disabled to prevent spam.
      // Members can check their level & rank anytime using /leaderboard or /rank.
    }

    return {
      record,
      xpGained: amount,
      oldLevel,
      newLevel,
      leveledUp: newLevel > oldLevel,
    };
  } catch (error) {
    logger.error(`LevelingManager: Error awarding XP for user ${userId} in guild ${guildId}:`, error);
    return null;
  }
}

/**
 * 1. Chat XP (15-25 XP per message with 60-second cooldown)
 */
export async function addChatXp(
  client: Client | null,
  guildId: string,
  userId: string,
  username: string,
  channel?: TextChannel | null
) {
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const lastTime = chatXpCooldowns.get(key) || 0;

  // 60-second cooldown per user
  if (now - lastTime < 60000) {
    return null;
  }

  chatXpCooldowns.set(key, now);

  // Random 15-25 XP
  const xpAmount = Math.floor(Math.random() * (25 - 15 + 1)) + 15;

  return awardActivityXp(client, guildId, userId, username, xpAmount, "CHAT", channel, {
    messagesCount: 1,
  });
}

/**
 * 2. Voice XP (20 XP per minute in Voice Channel)
 */
export async function addVoiceXp(
  client: Client | null,
  guildId: string,
  userId: string,
  username: string,
  minutes = 1
) {
  const xpAmount = minutes * 20;
  return awardActivityXp(client, guildId, userId, username, xpAmount, "VOICE", null, {
    voiceSeconds: minutes * 60,
  });
}

/**
 * 3. Trivia / Riddle XP (+100 XP normal riddle, +150 XP daily quiz)
 */
export async function addTriviaXp(
  client: Client | null,
  guildId: string,
  userId: string,
  username: string,
  isDailyQuiz = false,
  channel?: TextChannel | null
) {
  const xpAmount = isDailyQuiz ? 150 : 100;
  return awardActivityXp(client, guildId, userId, username, xpAmount, "TRIVIA", channel, {
    triviaWins: 1,
  });
}

/**
 * 4. Pantun XP (+50 XP submission, +250 XP MVP)
 */
export async function addPantunXp(
  client: Client | null,
  guildId: string,
  userId: string,
  username: string,
  isMvp = false,
  channel?: TextChannel | null
) {
  const xpAmount = isMvp ? 250 : 50;
  return awardActivityXp(client, guildId, userId, username, xpAmount, "PANTUN", channel, {
    pantunCount: 1,
  });
}

/**
 * 5. Story Chain XP (+40 XP sentence, +250 XP MVP)
 */
export async function addStoryXp(
  client: Client | null,
  guildId: string,
  userId: string,
  username: string,
  isMvp = false,
  channel?: TextChannel | null
) {
  const xpAmount = isMvp ? 250 : 40;
  return awardActivityXp(client, guildId, userId, username, xpAmount, "STORY", channel, {
    storyCount: 1,
  });
}

/**
 * 6. Daily AI Poll XP (+50 XP per vote)
 */
export async function addPollXp(
  client: Client | null,
  guildId: string,
  userId: string,
  username: string
) {
  return awardActivityXp(client, guildId, userId, username, 50, "POLL", null, {
    pollCount: 1,
  });
}

/**
 * 7. Minigames & Werewolf XP (+75 XP per session)
 */
export async function addGameXp(
  client: Client | null,
  guildId: string,
  userId: string,
  username: string,
  channel?: TextChannel | null
) {
  return awardActivityXp(client, guildId, userId, username, 75, "GAME", channel);
}

/**
 * 8. Menfess XP (+30 XP per approved menfess)
 */
export async function addMenfessXp(
  client: Client | null,
  guildId: string,
  userId: string,
  username: string
) {
  return awardActivityXp(client, guildId, userId, username, 30, "MENFESS");
}

/**
 * Retrieve Top Leaderboard members by Level & XP
 */
export async function getGuildLevelLeaderboard(guildId: string, limit = 10, page = 1) {
  const skip = (page - 1) * limit;

  const [scores, total] = await Promise.all([
    prisma.userLevel.findMany({
      where: { guildId },
      orderBy: [{ xp: "desc" }, { updatedAt: "asc" }],
      skip,
      take: limit,
    }),
    prisma.userLevel.count({ where: { guildId } }),
  ]);

  return {
    page,
    totalPages: Math.ceil(total / limit) || 1,
    totalCount: total,
    leaderboard: scores.map((s, index) => {
      const progress = calculateLevelFromXp(s.xp);
      return {
        rank: skip + index + 1,
        userId: s.userId,
        username: s.username,
        level: progress.level,
        totalXp: s.xp,
        currentLevelXp: progress.currentLevelXp,
        nextLevelXp: progress.nextLevelXp,
        progressPercent: progress.progressPercent,
        messagesCount: s.messagesCount,
        voiceMinutes: Math.floor(s.voiceSeconds / 60),
      };
    }),
  };
}

/**
 * Retrieve User Rank and Progress in the Guild
 */
export async function getUserRank(guildId: string, userId: string): Promise<UserRankData> {
  const [record, totalMembers] = await Promise.all([
    prisma.userLevel.findUnique({
      where: { guildId_userId: { guildId, userId } },
    }),
    prisma.userLevel.count({ where: { guildId } }),
  ]);

  const totalXp = record?.xp ?? 0;
  const progress = calculateLevelFromXp(totalXp);

  const higherCount = await prisma.userLevel.count({
    where: { guildId, xp: { gt: totalXp } },
  });

  return {
    userId,
    username: record?.username || "Unknown",
    rank: higherCount + 1,
    totalMembers: Math.max(1, totalMembers),
    level: progress.level,
    totalXp,
    currentLevelXp: progress.currentLevelXp,
    nextLevelXp: progress.nextLevelXp,
    progressPercent: progress.progressPercent,
    messagesCount: record?.messagesCount ?? 0,
    voiceSeconds: record?.voiceSeconds ?? 0,
    triviaWins: record?.triviaWins ?? 0,
    pantunCount: record?.pantunCount ?? 0,
    storyCount: record?.storyCount ?? 0,
    pollCount: record?.pollCount ?? 0,
  };
}

/**
 * Generate a visual Rank Card buffer using Sharp & SVG
 */
export async function generateRankCard(
  user: User,
  rankData: UserRankData,
  member?: GuildMember | null
): Promise<Buffer> {
  const width = 900;
  const height = 280;

  // Fetch avatar image
  let avatarBuffer: Buffer;
  try {
    const avatarUrl = user.displayAvatarURL({ extension: "png", size: 256 });
    const response = await axios.get(avatarUrl, { responseType: "arraybuffer", timeout: 4000 });
    avatarBuffer = Buffer.from(response.data);
  } catch (_) {
    // 1x1 transparent png fallback
    avatarBuffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      "base64"
    );
  }

  // Circular rounded avatar via sharp
  const avatarSize = 140;
  const roundedAvatar = await sharp(avatarBuffer)
    .resize(avatarSize, avatarSize)
    .composite([
      {
        input: Buffer.from(
          `<svg><rect x="0" y="0" width="${avatarSize}" height="${avatarSize}" rx="${avatarSize / 2}" ry="${avatarSize / 2}"/></svg>`
        ),
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();

  const safeUsername = user.displayName || user.username;
  const cleanUsername = safeUsername
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .substring(0, 24);

  const cleanHandle = `@${user.username}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const progressBarWidth = 560;
  const filledBarWidth = Math.max(12, Math.floor((progressBarWidth * rankData.progressPercent) / 100));

  const roleColor = member?.displayHexColor && member.displayHexColor !== "#000000" ? member.displayHexColor : "#6366F1";

  // SVG Artwork Template
  const svgTemplate = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0F172A" />
          <stop offset="50%" stop-color="#1E1B4B" />
          <stop offset="100%" stop-color="#090D16" />
        </linearGradient>

        <linearGradient id="barGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#6366F1" />
          <stop offset="50%" stop-color="#8B5CF6" />
          <stop offset="100%" stop-color="#EC4899" />
        </linearGradient>

        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      <!-- Card Background with Rounded Corners & Glow Border -->
      <rect x="0" y="0" width="${width}" height="${height}" rx="24" ry="24" fill="url(#bgGrad)" />
      <rect x="1.5" y="1.5" width="${width - 3}" height="${height - 3}" rx="23" ry="23" fill="none" stroke="rgba(255, 255, 255, 0.12)" stroke-width="1.5" />

      <!-- Decorative Circles -->
      <circle cx="820" cy="50" r="160" fill="#6366F1" opacity="0.08" filter="blur(40px)" />
      <circle cx="100" cy="220" r="120" fill="#EC4899" opacity="0.06" filter="blur(30px)" />

      <!-- Avatar Outer Ring Glow -->
      <circle cx="110" cy="140" r="${avatarSize / 2 + 5}" fill="none" stroke="${roleColor}" stroke-width="4" opacity="0.8" />

      <!-- Username & Handle -->
      <text x="210" y="85" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="32" font-weight="bold" fill="#FFFFFF">${cleanUsername}</text>
      <text x="210" y="115" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" fill="#94A3B8">${cleanHandle}</text>

      <!-- Level & Rank Badges (Right Top) -->
      <text x="740" y="70" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="bold" fill="#94A3B8" text-anchor="end">RANK</text>
      <text x="785" y="70" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="28" font-weight="900" fill="#F43F5E">#${rankData.rank}</text>

      <text x="740" y="115" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="bold" fill="#94A3B8" text-anchor="end">LEVEL</text>
      <text x="785" y="115" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="32" font-weight="900" fill="#38BDF8">${rankData.level}</text>

      <!-- Progress Numbers & Percentage -->
      <text x="210" y="165" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="600" fill="#CBD5E1">
        <tspan fill="#38BDF8" font-weight="bold">${rankData.currentLevelXp.toLocaleString("id-ID")}</tspan> / ${rankData.nextLevelXp.toLocaleString("id-ID")} XP
      </text>
      <text x="770" y="165" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="bold" fill="#EC4899" text-anchor="end">
        ${rankData.progressPercent}%
      </text>

      <!-- Progress Bar Track -->
      <rect x="210" y="180" width="${progressBarWidth}" height="20" rx="10" ry="10" fill="rgba(255, 255, 255, 0.08)" />

      <!-- Progress Bar Fill -->
      <rect x="210" y="180" width="${filledBarWidth}" height="20" rx="10" ry="10" fill="url(#barGrad)" />

      <!-- Activity Badges (Footer) -->
      <text x="210" y="240" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" fill="#64748B">
        💬 <tspan fill="#94A3B8">${rankData.messagesCount.toLocaleString("id-ID")} Chat</tspan>  •  
        🎙️ <tspan fill="#94A3B8">${Math.floor(rankData.voiceSeconds / 3600)}j ${Math.floor((rankData.voiceSeconds % 3600) / 60)}m Voice</tspan>  •  
        🧠 <tspan fill="#94A3B8">${rankData.triviaWins} Trivia</tspan>  •  
        ✨ <tspan fill="#94A3B8">${rankData.totalXp.toLocaleString("id-ID")} Total XP</tspan>
      </text>
    </svg>
  `;

  // Composite the SVG with the circular avatar
  const cardImage = await sharp(Buffer.from(svgTemplate))
    .composite([
      {
        input: roundedAvatar,
        top: 70,
        left: 40,
      },
    ])
    .png()
    .toBuffer();

  return cardImage;
}
