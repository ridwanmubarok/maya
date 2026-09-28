import { Client, EmbedBuilder, Guild, GuildMember, TextChannel } from "discord.js";
import { prisma } from "./database";
import { logger } from "../utils/logger";
import { findHistoryChannel } from "../utils/historyLogger";

const REGULAR_MEMBER_MAX_POINTS = 20000;
const GOLDEN_MEMBER_MAX_POINTS = 50000;
const MONTHLY_REDEEM_QUOTA = 2;

let globalDiscordClient: Client | null = null;

export function setSeasonManagerClient(client: Client) {
  globalDiscordClient = client;
}

export interface WibDateInfo {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dateStr: string;
  monthName: string;
  daysInMonth: number;
  daysRemaining: number;
  isDay1: boolean;
  isDay3: boolean;
  isDay5: boolean;
  isRedeemPeriod: boolean; // day >= 3 && day <= 5
  isH5: boolean;
  isH3: boolean;
  isH1: boolean;
  isLastDay: boolean;
}

const MONTH_NAMES_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

/**
 * Get accurate date information in WIB (Asia/Jakarta, UTC+7)
 */
export function getWibDateInfo(): WibDateInfo {
  const now = new Date();
  const jakartaDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);
  const [yearStr, monthStr, dayStr] = jakartaDateStr.split("-");

  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10); // 1 - 12
  const day = parseInt(dayStr, 10);

  const hour = parseInt(
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", hour: "numeric", hour12: false }).format(now),
    10
  );
  const minute = parseInt(
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", minute: "numeric", hour12: false }).format(now),
    10
  );

  const daysInMonth = new Date(year, month, 0).getDate();
  const daysRemaining = Math.max(0, daysInMonth - day);

  const isDay1 = day === 1;
  const isDay3 = day === 3;
  const isDay5 = day === 5;
  const isRedeemPeriod = day >= 3 && day <= 5;

  return {
    year,
    month,
    day,
    hour,
    minute,
    dateStr: jakartaDateStr,
    monthName: MONTH_NAMES_ID[month - 1] || `Bulan ${month}`,
    daysInMonth,
    daysRemaining,
    isDay1,
    isDay3,
    isDay5,
    isRedeemPeriod,
    isH5: daysRemaining === 5,
    isH3: daysRemaining === 3,
    isH1: daysRemaining === 1,
    isLastDay: daysRemaining === 0,
  };
}

/**
 * Locate @amubhya in guild (by username pattern or fallback to server owner)
 */
export async function getAmubhyaMember(guild: Guild): Promise<GuildMember | null> {
  try {
    await guild.members.fetch().catch(() => {});
    const amubhyaMember = guild.members.cache.find(
      (m) => /(amubhya|amubhy|amubh|amub|ambu|\babu\b|mubhya)/i.test(m.user.username) ||
             /(amubhya|amubhy|amubh|amub|ambu|\babu\b|mubhya)/i.test(m.displayName)
    );
    if (amubhyaMember) return amubhyaMember;

    // Fallback to guild owner
    if (guild.ownerId) {
      return guild.members.cache.get(guild.ownerId) || (await guild.members.fetch(guild.ownerId).catch(() => null));
    }
  } catch (error) {
    logger.error("getAmubhyaMember: Error locating @amubhya:", error);
  }
  return null;
}

/**
 * Check if a userId is @amubhya or the server owner
 */
export async function isAmubhyaOrOwner(guild: Guild, userId: string): Promise<boolean> {
  if (guild.ownerId && guild.ownerId === userId) return true;
  const amubhya = await getAmubhyaMember(guild);
  if (amubhya && amubhya.id === userId) return true;
  return false;
}

/**
 * Check if a user meets the flexible activity requirement:
 * Active in Voice OR any of the community features (Trivia, Poll, Story, Pantun)
 */
export function isUserActiveInMonth(record: any): boolean {
  if (!record) return false;
  return Boolean(
    record.participatedVoice ||
    record.participatedTrivia ||
    record.participatedPoll ||
    record.participatedStory ||
    record.participatedPantun
  );
}

/**
 * Get active feature checklist for user
 */
export function getUserActivityChecklist(record: any): { name: string; completed: boolean }[] {
  return [
    { name: "Voice Nongkrong", completed: Boolean(record?.participatedVoice) },
    { name: "Tebak-Tebakan", completed: Boolean(record?.participatedTrivia) },
    { name: "Daily AI Poll", completed: Boolean(record?.participatedPoll) },
    { name: "Story Chain", completed: Boolean(record?.participatedStory) },
    { name: "Lanjutkan Pantun", completed: Boolean(record?.participatedPantun) },
  ];
}

/**
 * Pick 2 Random Active Candidates who can reach up to 50k points this month
 * Evaluates active members who have actually participated in server activities (Voice, Trivia, Poll, Story, Pantun)
 * (Excludes previous month's winners who are in cooldown)
 */
export async function pickMonthlyGoldenCandidates(client: Client, guildId: string, force = false): Promise<string[]> {
  try {
    globalDiscordClient = client;
    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    if (!config) return [];

    let currentCandidates: string[] = [];
    try {
      currentCandidates = JSON.parse(config.goldenCandidateIds || "[]");
    } catch (_) {
      currentCandidates = [];
    }

    if (!force && currentCandidates.length === 2) {
      return currentCandidates;
    }

    let cooldownUsers: string[] = [];
    try {
      cooldownUsers = JSON.parse(config.cooldownUserIds || "[]");
    } catch (_) {
      cooldownUsers = [];
    }

    // Identify user IDs to exclude: cooldown users, guild owner, and @amubhya
    const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    const excludedUserIds = new Set<string>(cooldownUsers);

    if (guild) {
      if (guild.ownerId) excludedUserIds.add(guild.ownerId);
      const amubhya = await getAmubhyaMember(guild);
      if (amubhya) excludedUserIds.add(amubhya.id);
    }

    const excludedList = Array.from(excludedUserIds);

    // 1. Find genuinely active members in TriviaScore who are NOT in cooldown, NOT owner/amubhya, and have score > 0
    const activeScores = await prisma.triviaScore.findMany({
      where: {
        guildId,
        userId: { notIn: excludedList },
        score: { gt: 0 },
        OR: [
          { participatedVoice: true },
          { participatedTrivia: true },
          { participatedPoll: true },
          { participatedStory: true },
          { participatedPantun: true },
        ],
      },
      orderBy: { score: "desc" },
    });

    let eligibleUserIds = activeScores.map((s) => s.userId);

    // Fallback: If not enough active users in DB, pick from any eligible members with score > 0
    if (eligibleUserIds.length < 2) {
      const anyScoreUsers = await prisma.triviaScore.findMany({
        where: {
          guildId,
          userId: { notIn: excludedList },
          score: { gt: 0 },
        },
        orderBy: { score: "desc" },
      });
      const combined = new Set([...eligibleUserIds, ...anyScoreUsers.map((s) => s.userId)]);
      eligibleUserIds = Array.from(combined);
    }

    // Fallback 2: Server members (non-bot, non-excluded) if completely empty
    if (guild && eligibleUserIds.length < 2) {
      await guild.members.fetch().catch(() => {});
      const fallbackMembers = guild.members.cache.filter((m) => !m.user.bot && !excludedUserIds.has(m.id));
      const combined = new Set([...eligibleUserIds, ...fallbackMembers.map((m) => m.id)]);
      eligibleUserIds = Array.from(combined);
    }

    // Shuffle array (Fisher-Yates) among eligible active participants
    for (let i = eligibleUserIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [eligibleUserIds[i], eligibleUserIds[j]] = [eligibleUserIds[j], eligibleUserIds[i]];
    }

    const pickedCandidates = eligibleUserIds.slice(0, 2);

    await prisma.guildConfig.update({
      where: { guildId },
      data: { goldenCandidateIds: JSON.stringify(pickedCandidates) },
    });

    logger.info(`MonthlySeason: Terpilih 2 Golden Candidates aktif untuk guild ${guildId} (mengecualikan Owner/@amubhya): ${pickedCandidates.join(", ")}`);
    return pickedCandidates;
  } catch (error) {
    logger.error(`MonthlySeason: Gagal memilih golden candidates untuk guild ${guildId}:`, error);
    return [];
  }
}

/**
 * Inactivity threshold in milliseconds: 3 days (72 hours)
 */
export const INACTIVITY_ROTATION_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Silently evaluate and rotate inactive Golden Candidates (Threshold: 3 days / 72 hours of zero activity).
 * If a candidate has not earned points for 3 days, their slot is transferred to the most active eligible member.
 * Runs completely in the background with zero public messages and zero user DMs.
 */
export async function evaluateAndRotateGoldenCandidates(
  client: Client,
  guildId: string
): Promise<{ rotated: boolean; currentCandidates: string[] }> {
  try {
    globalDiscordClient = client;
    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    if (!config || config.monthlyResetEnabled === false) {
      return { rotated: false, currentCandidates: [] };
    }

    let candidates: string[] = [];
    try {
      candidates = JSON.parse(config.goldenCandidateIds || "[]");
    } catch (_) {
      candidates = [];
    }

    // If fewer than 2 candidates, pick initial candidates quietly
    if (candidates.length < 2) {
      candidates = await pickMonthlyGoldenCandidates(client, guildId, false);
      return { rotated: true, currentCandidates: candidates };
    }

    const now = Date.now();
    const activeCandidates: string[] = [];
    const inactiveCandidates: string[] = [];

    for (const userId of candidates) {
      const scoreRecord = await prisma.triviaScore.findUnique({
        where: { guildId_userId: { guildId, userId } },
      });

      if (!scoreRecord || scoreRecord.score <= 0) {
        inactiveCandidates.push(userId);
        continue;
      }

      const lastActivityTime = scoreRecord.updatedAt.getTime();
      const timeSinceLastActivity = now - lastActivityTime;

      if (timeSinceLastActivity >= INACTIVITY_ROTATION_THRESHOLD_MS) {
        logger.info(
          `MonthlySeason: Golden Candidate ${scoreRecord.username} (${userId}) inaktif selama ${(timeSinceLastActivity / (1000 * 60 * 60 * 24)).toFixed(1)} hari (>= 3 hari). Merotasi slot hening...`
        );
        inactiveCandidates.push(userId);
      } else {
        activeCandidates.push(userId);
      }
    }

    // If no candidate is inactive, no rotation is needed
    if (inactiveCandidates.length === 0) {
      return { rotated: false, currentCandidates: candidates };
    }

    // Collect excluded IDs (cooldown winners, server owner, @amubhya, and currently active candidates)
    let cooldownUsers: string[] = [];
    try {
      cooldownUsers = JSON.parse(config.cooldownUserIds || "[]");
    } catch (_) {}

    const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    const excludedUserIds = new Set<string>([...cooldownUsers, ...activeCandidates, ...inactiveCandidates]);

    if (guild) {
      if (guild.ownerId) excludedUserIds.add(guild.ownerId);
      const amubhya = await getAmubhyaMember(guild);
      if (amubhya) excludedUserIds.add(amubhya.id);
    }

    const excludedList = Array.from(excludedUserIds);
    const slotsNeeded = 2 - activeCandidates.length;

    // Pick replacements: active in the last 48 hours with highest score
    const recentActivityThreshold = new Date(now - 48 * 60 * 60 * 1000);
    const topContenders = await prisma.triviaScore.findMany({
      where: {
        guildId,
        userId: { notIn: excludedList },
        score: { gt: 0 },
        updatedAt: { gte: recentActivityThreshold },
      },
      orderBy: { score: "desc" },
      take: slotsNeeded,
    });

    let replacementIds = topContenders.map((c) => c.userId);

    // Fallback: If not enough active in 48h, pick highest scoring members with any activity this month
    if (replacementIds.length < slotsNeeded) {
      const remainingNeeded = slotsNeeded - replacementIds.length;
      const fallbackContenders = await prisma.triviaScore.findMany({
        where: {
          guildId,
          userId: { notIn: [...excludedList, ...replacementIds] },
          score: { gt: 0 },
        },
        orderBy: { score: "desc" },
        take: remainingNeeded,
      });
      replacementIds.push(...fallbackContenders.map((c) => c.userId));
    }

    const newCandidatesList = [...activeCandidates, ...replacementIds].slice(0, 2);

    await prisma.guildConfig.update({
      where: { guildId },
      data: { goldenCandidateIds: JSON.stringify(newCandidatesList) },
    });

    logger.info(
      `MonthlySeason: Rotasi hening Golden Candidates guild ${guildId} selesai. ` +
      `Kandidat inaktif dilepas: [${inactiveCandidates.join(", ")}], ` +
      `Kandidat baru: [${replacementIds.join(", ")}]. ` +
      `Daftar kandidat aktif: [${newCandidatesList.join(", ")}]`
    );

    return { rotated: true, currentCandidates: newCandidatesList };
  } catch (error) {
    logger.error(`MonthlySeason: Gagal mengevaluasi rotasi Golden Candidates untuk guild ${guildId}:`, error);
    return { rotated: false, currentCandidates: [] };
  }
}

/**
 * Calculate allowed incoming points respecting regular (20k) and golden (50k) ceiling
 */
export async function calculateAllowedEarnedPoints(
  guildId: string,
  userId: string,
  currentScore: number,
  incomingPoints: number
): Promise<number> {
  try {
    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    let goldenCandidates: string[] = [];
    try {
      goldenCandidates = JSON.parse(config?.goldenCandidateIds || "[]");
    } catch (_) {}

    const isGolden = goldenCandidates.includes(userId);
    const maxCeiling = isGolden ? GOLDEN_MEMBER_MAX_POINTS : REGULAR_MEMBER_MAX_POINTS;

    if (currentScore >= maxCeiling) {
      return 0; // Already reached monthly ceiling
    }

    if (currentScore + incomingPoints > maxCeiling) {
      return maxCeiling - currentScore; // Grant up to ceiling
    }

    return incomingPoints;
  } catch (error) {
    return incomingPoints;
  }
}

/**
 * Validate whether a user can redeem in /shop
 */
export async function canUserRedeemShop(guildId: string, userId: string) {
  try {
    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    const maxQuota = config?.monthlyRedeemQuota || MONTHLY_REDEEM_QUOTA;
    const dateInfo = getWibDateInfo();

    let cooldownUsers: string[] = [];
    try {
      cooldownUsers = JSON.parse(config?.cooldownUserIds || "[]");
    } catch (_) {}

    let currentRedeemed: string[] = [];
    try {
      currentRedeemed = JSON.parse(config?.currentMonthRedeemedUsers || "[]");
    } catch (_) {}

    let goldenCandidates: string[] = [];
    try {
      goldenCandidates = JSON.parse(config?.goldenCandidateIds || "[]");
    } catch (_) {}

    // 0. Exclude server owner / @amubhya from redeeming
    if (globalDiscordClient) {
      const guild = globalDiscordClient.guilds.cache.get(guildId);
      if (guild && (await isAmubhyaOrOwner(guild, userId))) {
        return {
          canRedeem: false,
          reason: "Sebagai pemilik server (@amubhya), akun kamu dikecualikan dari penukaran hadiah /shop agar seluruh hadiah dinikmati oleh member komunitas!",
          currentQuota: currentRedeemed.length,
          maxQuota,
        };
      }
    }

    // 1. Check if we are within the redeem window (Tanggal 3 s.d. 5)
    if (!dateInfo.isRedeemPeriod) {
      if (dateInfo.day < 3) {
        return {
          canRedeem: false,
          reason: `Periode penukaran hadiah /shop belum dibuka! Penukaran baru dibuka pada tanggal 3 s.d. 5 ${dateInfo.monthName} untuk 2 Golden Candidates terpilih. Kumpulkan koinmu sekarang!`,
          currentQuota: currentRedeemed.length,
          maxQuota,
        };
      } else {
        return {
          canRedeem: false,
          reason: `Periode penukaran hadiah /shop bulan ini telah berakhir pada tanggal 5 ${dateInfo.monthName} pukul 23:59 WIB. Penukaran berikutnya dibuka pada tanggal 3 bulan depan!`,
          currentQuota: currentRedeemed.length,
          maxQuota,
        };
      }
    }

    // 2. Check if user is one of the 2 Golden Candidates
    if (goldenCandidates.length > 0 && !goldenCandidates.includes(userId)) {
      return {
        canRedeem: false,
        reason: "Penukaran hadiah /shop periode ini (tgl 3–5) dikhususkan untuk 2 akun member terpilih (Golden Candidates). Terus aktif di komunitas agar terpilih di season depan!",
        currentQuota: currentRedeemed.length,
        maxQuota,
      };
    }

    // 3. Check cooldown from previous month
    if (cooldownUsers.includes(userId)) {
      return {
        canRedeem: false,
        reason: "Kamu telah menukarkan hadiah di bulan lalu. Nikmati masa istirahat season ini agar member lain kebagian ya!",
        currentQuota: currentRedeemed.length,
        maxQuota,
      };
    }

    // 4. Check if already redeemed this month
    if (currentRedeemed.includes(userId)) {
      return {
        canRedeem: false,
        reason: "Kamu sudah menukarkan 1 hadiah di bulan ini (Maksimal 1 transaksi per member per bulan). Berikan kesempatan bagi temanmu!",
        currentQuota: currentRedeemed.length,
        maxQuota,
      };
    }

    // 5. Check quota limit (max 3 users)
    if (currentRedeemed.length >= maxQuota) {
      return {
        canRedeem: false,
        reason: `Kuota penukaran hadiah bulan ini sudah terpenuhi (${currentRedeemed.length}/${maxQuota} pemenang). Silakan bersiap untuk season depan!`,
        currentQuota: currentRedeemed.length,
        maxQuota,
      };
    }

    // 6. Check flexible activity (Voice OR any community feature)
    const scoreRecord = await prisma.triviaScore.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });

    if (!scoreRecord || !isUserActiveInMonth(scoreRecord)) {
      return {
        canRedeem: false,
        reason: "Kamu belum memenuhi syarat keaktifan komunitas bulan ini. Minimal aktif nongkrong di Voice Channel atau berpartisipasi di salah satu fitur (Tebak-Tebakan, Daily Poll, Story Chain, atau Pantun)!",
        currentQuota: currentRedeemed.length,
        maxQuota,
      };
    }

    return {
      canRedeem: true,
      currentQuota: currentRedeemed.length,
      maxQuota,
    };
  } catch (error) {
    logger.error("canUserRedeemShop: Error validating redeem:", error);
    return { canRedeem: true, currentQuota: 0, maxQuota: MONTHLY_REDEEM_QUOTA };
  }
}

/**
 * Release redemption slot when an order is cancelled or refunded
 */
export async function releaseShopRedemption(guildId: string, userId: string) {
  try {
    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    let currentRedeemed: string[] = [];
    try {
      currentRedeemed = JSON.parse(config?.currentMonthRedeemedUsers || "[]");
    } catch (_) {}

    const filtered = currentRedeemed.filter((id) => id !== userId);
    await prisma.guildConfig.update({
      where: { guildId },
      data: { currentMonthRedeemedUsers: JSON.stringify(filtered) },
    });
    logger.info(`MonthlySeason: User ${userId} dihapus dari currentMonthRedeemedUsers di guild ${guildId} (Order Refunded/Rejected).`);
  } catch (error) {
    logger.error("releaseShopRedemption: Error releasing redemption:", error);
  }
}

/**
 * Record a successful shop redemption
 */
export async function recordShopRedemption(guildId: string, userId: string) {
  try {
    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    let currentRedeemed: string[] = [];
    try {
      currentRedeemed = JSON.parse(config?.currentMonthRedeemedUsers || "[]");
    } catch (_) {}

    if (!currentRedeemed.includes(userId)) {
      currentRedeemed.push(userId);
      await prisma.guildConfig.update({
        where: { guildId },
        data: { currentMonthRedeemedUsers: JSON.stringify(currentRedeemed) },
      });
      logger.info(`MonthlySeason: User ${userId} berhasil menukarkan hadiah (${currentRedeemed.length}/${config?.monthlyRedeemQuota || MONTHLY_REDEEM_QUOTA}) di guild ${guildId}`);
    }
  } catch (error) {
    logger.error("recordShopRedemption: Error recording redemption:", error);
  }
}

/**
 * Send Day 1 Golden Candidate Announcement (Evaluates and locks 2 candidates from previous month)
 */
export async function sendDay1Announcement(client: Client, guildId: string) {
  try {
    globalDiscordClient = client;
    const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) return;

    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    if (!config || config.monthlyResetEnabled === false) return;

    const dateInfo = getWibDateInfo();

    // Ensure 2 initial candidates are picked quietly in the background
    const candidates = await pickMonthlyGoldenCandidates(client, guildId, false);

    const amubhya = await getAmubhyaMember(guild);
    const candidateMentions = candidates.map((id, idx) => `${idx + 1}. <@${id}>`).join("\n");

    const embed = new EmbedBuilder()
      .setColor("#F59E0B")
      .setTitle(`🚀 MUSIM BARU ROGATEKNO KOIN (RTK) • BULAN ${dateInfo.monthName.toUpperCase()} ${dateInfo.year}`)
      .setDescription(
        `Halo seluruh warga **${guild.name}**!\n\n` +
        `Musim baru **Rogatekno Koin (RTK)** resmi dimulai! Kumpulkan poin sebanyak-banyaknya melalui aktivitas harian server:\n` +
        `> 🎙️ **Voice Channel** (Nongkrong & ngobrol santai)\n` +
        `> 💡 **Tebak-Tebakan / Trivia & Kuis Harian**\n` +
        `> 🎭 **Maya Lanjutkan Pantun**\n` +
        `> 📖 **Maya Story Chain (Cerita Sambung)**\n` +
        `> 📊 **Daily AI Poll (Polling Harian)**\n\n` +
        `🌟 **Sistem Plafon Poin:**\n` +
        `> Member yang paling konsisten dan rajin aktif akan secara otomatis terbuka plafonnya hingga **50.000 RTK** untuk penukaran hadiah di katalog \`/shop\`!\n\n` +
        `📅 **Jadwal Musim Ini:**\n` +
        `> • **Periode Pengumpulan Poin:** Tanggal 1 s.d. Akhir Bulan\n` +
        `> • **Pembukaan Jendela Redeem:** Tanggal **3 ${dateInfo.monthName} pukul 00:00 WIB**\n` +
        `> • **Batas Akhir Penukaran Hadiah:** Tanggal **5 ${dateInfo.monthName} pukul 23:59 WIB**\n` +
        `> • ⚠️ **Reset Poin ke 0:** Tepat tanggal **5 ${dateInfo.monthName} pukul 23:59 WIB**, seluruh saldo poin RTK akan direset ke 0 demi pembukaan musim berikutnya!`
      )
      .addFields(
        { name: "🎟️ Kuota Pemenang", value: `Maksimal **2 Orang**`, inline: true },
        { name: "🗓️ Periode Redeem", value: `**Tgl 3 s.d. 5 ${dateInfo.monthName}**`, inline: true },
        { name: "🔄 Reset Poin ke 0", value: `**5 ${dateInfo.monthName} 23:59 WIB**`, inline: true }
      )
      .setFooter({
        text: `Maya Season Engine • Musim Baru Resmi Dimulai!`,
        iconURL: client.user?.displayAvatarURL(),
      })
      .setTimestamp();

    // 1. Send to target announcement channel or general channel
    let targetChannel: TextChannel | null = null;
    if (config.monthlyResetChannelId) {
      targetChannel = (guild.channels.cache.get(config.monthlyResetChannelId) as TextChannel) || null;
    }
    if (!targetChannel && config.welcomeChannelId) {
      targetChannel = (guild.channels.cache.get(config.welcomeChannelId) as TextChannel) || null;
    }
    if (!targetChannel) {
      targetChannel = (guild.channels.cache.find((c) => c.isTextBased() && /chat|general|umum|announcement|pengumuman/i.test(c.name)) as TextChannel) || null;
    }

    if (targetChannel) {
      await targetChannel.send({
        content: `📢 **MUSIM BARU ROGATEKNO KOIN (RTK) RESMI DIMULAI!**`,
        embeds: [embed],
      });
      logger.info(`MonthlySeason: Berhasil mengirim pengumuman Day 1 ke #${targetChannel.name} di guild ${guild.name}`);
    }

    // 2. Send to #history channel permanently
    const historyChannel = findHistoryChannel(guild);
    if (historyChannel && historyChannel.id !== targetChannel?.id) {
      await historyChannel.send({
        embeds: [embed],
        allowedMentions: { parse: [] },
      });
      logger.info(`MonthlySeason: Berhasil mencatat pengumuman Day 1 ke #${historyChannel.name} di guild ${guild.name}`);
    }

    // 3. Send direct DM notification only to @amubhya (Server Owner)
    if (amubhya) {
      try {
        await amubhya.send({
          content: `🔔 **Laporan Musim Maya Bot ke Server Owner (${guild.name})**:\nMusim baru telah dimulai. Kandidat plafon 50k saat ini aktif (rotasi hening jika inaktif >= 3 hari):\n${candidateMentions}`,
          embeds: [embed],
        }).catch(() => {});
      } catch (_) {}
    }

    // Record date
    await prisma.guildConfig.update({
      where: { guildId },
      data: { lastMonthlyAnnouncementDate: dateInfo.dateStr },
    });
  } catch (error) {
    logger.error(`MonthlySeason: Error sending Day 1 announcement for guild ${guildId}:`, error);
  }
}

/**
 * Send Day 3 Redeem Open Notification (General announcement to server, private report to @amubhya only)
 * Zero candidate pings/DMs so candidates compete naturally.
 */
export async function sendDay3RedeemOpenNotification(client: Client, guildId: string) {
  try {
    globalDiscordClient = client;
    const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) return;

    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    if (!config || config.monthlyResetEnabled === false) return;

    const dateInfo = getWibDateInfo();

    // Silently evaluate and ensure candidates are fresh
    await evaluateAndRotateGoldenCandidates(client, guildId);

    const freshConfig = await prisma.guildConfig.findUnique({ where: { guildId } });
    let candidates: string[] = [];
    try {
      candidates = JSON.parse(freshConfig?.goldenCandidateIds || "[]");
    } catch (_) {}

    const amubhya = await getAmubhyaMember(guild);
    const candidateMentions = candidates.length > 0
      ? candidates.map((id, idx) => `${idx + 1}. <@${id}>`).join("\n")
      : "Belum ada kandidat terpilih.";

    const embed = new EmbedBuilder()
      .setColor("#10B981")
      .setTitle(`🎉 PERIODE REDEEM HADIAH RESMI DIBUKA (TGL 3–5) • BULAN ${dateInfo.monthName.toUpperCase()}`)
      .setDescription(
        `Halo seluruh warga **${guild.name}**!\n\n` +
        `Katalog penukaran hadiah \`/shop\` resmi **DIBUKA HARI INI** (Tanggal 3 s.d. 5 ${dateInfo.monthName})!\n\n` +
        `Bagi kamu yang aktif berpartisipasi dan mengumpulkan Rogatekno Koin (RTK), segera cek \`/shop\` untuk menukarkan koinmu dengan hadiah menarik sebelum kuota bulanan habis!\n\n` +
        `⚠️ **PERINGATAN PENTING — SALDO AKAN HANGUS!**\n` +
        `> Batas akhir penukaran hadiah di \`/shop\` adalah **5 ${dateInfo.monthName} pukul 23:59 WIB**.\n` +
        `> **Jika terlambat menukarkan poin sebelum batas waktu, maka seluruh saldo poin akan HANGUS & DIRESET KEMBALI KE 0** demi pembukaan season baru!\n\n` +
        `Gunakan perintah \`/shop\` sekarang!`
      )
      .addFields(
        { name: "🎟️ Kuota Pemenang Redeem", value: `Maksimal **2 Orang** per bulan`, inline: true },
        { name: "⏳ Batas Akhir Redeem", value: `**5 ${dateInfo.monthName} jam 23:59 WIB**`, inline: true }
      )
      .setFooter({
        text: `Maya Season Engine • Periode Redeem Resmi Dibuka!`,
        iconURL: client.user?.displayAvatarURL(),
      })
      .setTimestamp();

    // 1. Send to target announcement channel or general channel
    let targetChannel: TextChannel | null = null;
    if (config.monthlyResetChannelId) {
      targetChannel = (guild.channels.cache.get(config.monthlyResetChannelId) as TextChannel) || null;
    }
    if (!targetChannel && config.welcomeChannelId) {
      targetChannel = (guild.channels.cache.get(config.welcomeChannelId) as TextChannel) || null;
    }
    if (!targetChannel) {
      targetChannel = (guild.channels.cache.find((c) => c.isTextBased() && /chat|general|umum|announcement|pengumuman/i.test(c.name)) as TextChannel) || null;
    }

    if (targetChannel) {
      await targetChannel.send({
        content: `🚨 **PERIODE REDEEM HADIAH RESMI DIBUKA!**`,
        embeds: [embed],
      });
      logger.info(`MonthlySeason: Berhasil mengirim notifikasi Day 3 ke #${targetChannel.name} di guild ${guild.name}`);
    }

    // 2. Send to #history channel permanently
    const historyChannel = findHistoryChannel(guild);
    if (historyChannel && historyChannel.id !== targetChannel?.id) {
      await historyChannel.send({
        embeds: [embed],
        allowedMentions: { parse: [] },
      });
      logger.info(`MonthlySeason: Berhasil mencatat notifikasi Day 3 ke #${historyChannel.name} di guild ${guild.name}`);
    }

    // 3. Send direct DM notification ONLY to @amubhya (Server Owner) with current candidate details
    if (amubhya) {
      try {
        await amubhya.send({
          content: `🔔 **Laporan Season Maya Bot ke Server Owner (${guild.name})**:\nPeriode redeem hadiah tanggal 3 telah resmi DIBUKA.\n\nKandidat aktif 50k saat ini:\n${candidateMentions}`,
          embeds: [embed],
        }).catch(() => {});
      } catch (_) {}
    }

    // Record date
    await prisma.guildConfig.update({
      where: { guildId },
      data: {
        lastMonthlyRedeemOpenDate: dateInfo.dateStr,
        lastMonthlyWarningH5Date: dateInfo.dateStr,
      },
    });
  } catch (error) {
    logger.error(`MonthlySeason: Error sending Day 3 notification for guild ${guildId}:`, error);
  }
}

/**
 * Send Day 5 Closing Warning to server, @amubhya, and #history (Zero candidate spam)
 */
export async function sendDay5LastCallNotification(client: Client, guildId: string) {
  try {
    globalDiscordClient = client;
    const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) return;

    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    if (!config || config.monthlyResetEnabled === false) return;

    const dateInfo = getWibDateInfo();
    let currentRedeemed: string[] = [];
    try {
      currentRedeemed = JSON.parse(config.currentMonthRedeemedUsers || "[]");
    } catch (_) {}

    let goldenCandidates: string[] = [];
    try {
      goldenCandidates = JSON.parse(config.goldenCandidateIds || "[]");
    } catch (_) {}

    const remainingQuota = Math.max(0, (config.monthlyRedeemQuota || MONTHLY_REDEEM_QUOTA) - currentRedeemed.length);
    const unredeemedCandidates = goldenCandidates.filter((id) => !currentRedeemed.includes(id));

    const amubhya = await getAmubhyaMember(guild);

    const embed = new EmbedBuilder()
      .setColor("#EF4444")
      .setTitle(`🔥 HARI TERAKHIR PENUKARAN HADIAH & PERSIAPAN RESET SALDO • TGL 5 ${dateInfo.monthName.toUpperCase()}`)
      .setDescription(
        `Perhatian seluruh warga **${guild.name}**!\n\n` +
        `Hari ini adalah **HARI TERAKHIR** kesempatan menukarkan poin di \`/shop\`!\n\n` +
        `📦 **Status Kuota Penukaran:**\n` +
        `> Terisi: **${currentRedeemed.length}/${config.monthlyRedeemQuota || MONTHLY_REDEEM_QUOTA} Pemenang** (Sisa ${remainingQuota} slot lagi!)\n\n` +
        `⚠️ **PERINGATAN POIN HANGUS MALAM INI:**\n` +
        `Tepat pukul **23:59 WIB malam ini**, jendela penukaran resmi ditutup dan **SELURUH SALDO RTK AKAN DIRESET KEMBALI KE 0**!\n\n` +
        `Segera buka \`/shop\` sebelum koinmu hangus!`
      )
      .setFooter({
        text: `Maya Season Engine • Peringatan Hari Terakhir Penukaran`,
        iconURL: client.user?.displayAvatarURL(),
      })
      .setTimestamp();

    let targetChannel: TextChannel | null = null;
    if (config.monthlyResetChannelId) {
      targetChannel = (guild.channels.cache.get(config.monthlyResetChannelId) as TextChannel) || null;
    }
    if (!targetChannel && config.welcomeChannelId) {
      targetChannel = (guild.channels.cache.get(config.welcomeChannelId) as TextChannel) || null;
    }

    if (targetChannel) {
      await targetChannel.send({
        content: `🚨 **PERINGATAN HARI TERAKHIR PENUKARAN HADIAH!**`,
        embeds: [embed],
      });
    }

    const historyChannel = findHistoryChannel(guild);
    if (historyChannel && historyChannel.id !== targetChannel?.id) {
      await historyChannel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    }

    // Direct DM ONLY to @amubhya (Server Owner) with report on who hasn't redeemed
    if (amubhya) {
      try {
        const unredeemedList = unredeemedCandidates.length > 0
          ? unredeemedCandidates.map((id) => `<@${id}>`).join(", ")
          : "Semua kandidat sudah redeem.";
        await amubhya.send({
          content: `🔥 **Laporan Hari Terakhir Season (${guild.name})**:\nSisa kuota: ${remainingQuota} slot.\nKandidat yang belum redeem: ${unredeemedList}`,
          embeds: [embed],
        }).catch(() => {});
      } catch (_) {}
    }

    await prisma.guildConfig.update({
      where: { guildId },
      data: {
        lastMonthlyRedeemClosingDate: dateInfo.dateStr,
        lastMonthlyWarningH3Date: dateInfo.dateStr,
      },
    });
  } catch (error) {
    logger.error(`MonthlySeason: Error sending Day 5 notification for guild ${guildId}:`, error);
  }
}

/**
 * Backward compatibility alias for H-5 (maps to Day 3 Redeem Open)
 */
export async function sendH5Notification(client: Client, guildId: string) {
  return sendDay3RedeemOpenNotification(client, guildId);
}

/**
 * Backward compatibility alias for H-3 (maps to Day 5 Last Call)
 */
export async function sendH3Notification(client: Client, guildId: string) {
  return sendDay5LastCallNotification(client, guildId);
}

/**
 * Execute Season Archive and Reset at the end of the month
 */
export async function archiveAndResetSeason(client: Client, guildId: string) {
  try {
    const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) return;

    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    if (!config || config.monthlyResetEnabled === false) return;

    const dateInfo = getWibDateInfo();
    const seasonName = `${dateInfo.monthName} ${dateInfo.year}`;

    // 1. Fetch Top 10 Leaderboard before reset
    const topScores = await prisma.triviaScore.findMany({
      where: { guildId },
      orderBy: [{ score: "desc" }, { updatedAt: "asc" }],
      take: 10,
    });

    const totalStats = await prisma.triviaScore.aggregate({
      where: { guildId },
      _sum: { score: true },
      _count: { id: true },
    });

    let currentRedeemed: string[] = [];
    try {
      currentRedeemed = JSON.parse(config.currentMonthRedeemedUsers || "[]");
    } catch (_) {}

    let goldenCandidates: string[] = [];
    try {
      goldenCandidates = JSON.parse(config.goldenCandidateIds || "[]");
    } catch (_) {}

    // 2. Save Season Archive
    await prisma.monthlySeasonArchive.create({
      data: {
        guildId,
        seasonName,
        month: dateInfo.month,
        year: dateInfo.year,
        goldenCandidates: JSON.stringify(goldenCandidates),
        redeemedWinners: JSON.stringify(currentRedeemed),
        topWinners: JSON.stringify(
          topScores.map((s, idx) => ({
            rank: idx + 1,
            userId: s.userId,
            username: s.username,
            score: s.score,
          }))
        ),
        totalCirculating: totalStats._sum.score || 0,
        totalParticipants: totalStats._count.id || 0,
      },
    });

    // 3. Construct Hall of Fame Announcement Embed
    const winnersList = topScores.length > 0
      ? topScores.map((s, idx) => {
          const rankPrefix = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`;
          return `**${rankPrefix}** <@${s.userId}> — **${s.score.toLocaleString("id-ID")} RTK**`;
        }).join("\n")
      : "Belum ada saldo koin yang tercatat.";

    const redeemedList = currentRedeemed.length > 0
      ? currentRedeemed.map((id, idx) => `• <@${id}> (Pemenang Redeem #${idx + 1})`).join("\n")
      : "Tidak ada penukaran hadiah yang selesai bulan ini.";

    const embed = new EmbedBuilder()
      .setColor("#10B981")
      .setTitle(`🏆 PERIODE REDEEM SELESAI & SALDO DIRESET • TGL 5 ${seasonName.toUpperCase()}`)
      .setDescription(
        `Masa penukaran hadiah /shop tanggal 3–5 ${seasonName} telah resmi ditutup!\n\n` +
        `🎖️ **Pemenang Redeem Hadiah Season Ini (Maks 2):**\n${redeemedList}\n\n` +
        `🌟 **Top 10 Hall of Fame Saldo Tertinggi:**\n${winnersList}\n\n` +
        `🔄 **RESET SALDO KE 0 TELAH DILAKUKAN!**\n` +
        `Seluruh saldo RTK telah dinolkan kembali untuk menyambut season kompetisi baru. Dua member yang telah redeem bulan ini akan beristirahat (cooldown) agar rekan-rekan lain berkesempatan menang!\n\n` +
        `Golden Candidates berikutnya akan dievaluasi dan diumumkan pada Tanggal 1 bulan depan berdasarkan keaktifan kalian di server!\n\n` +
        `Mari mulai kumpulkan Rogatekno Koin (RTK) kembali dari Voice, Tebak-Tebakan, Pantun, Story, dan Poll!`
      )
      .setFooter({
        text: `Maya Season Engine • Welcome to New Season!`,
        iconURL: client.user?.displayAvatarURL(),
      })
      .setTimestamp();

    // 4. Send to announcement & #history
    let targetChannel: TextChannel | null = null;
    if (config.monthlyResetChannelId) {
      targetChannel = (guild.channels.cache.get(config.monthlyResetChannelId) as TextChannel) || null;
    }
    if (!targetChannel && config.welcomeChannelId) {
      targetChannel = (guild.channels.cache.get(config.welcomeChannelId) as TextChannel) || null;
    }

    if (targetChannel) {
      await targetChannel.send({ embeds: [embed] });
    }

    const historyChannel = findHistoryChannel(guild);
    if (historyChannel && historyChannel.id !== targetChannel?.id) {
      await historyChannel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    }

    // 5. Reset all scores & activity flags in database to 0
    await prisma.triviaScore.updateMany({
      where: { guildId },
      data: {
        score: 0,
        dailyScore: 0,
        participatedVoice: false,
        participatedTrivia: false,
        participatedPoll: false,
        participatedStory: false,
        participatedPantun: false,
      },
    });

    // 6. Update GuildConfig: Move redeemed users to cooldown, clear redeemed, clear candidates, update lastMonthlyResetDate
    await prisma.guildConfig.update({
      where: { guildId },
      data: {
        cooldownUserIds: JSON.stringify(currentRedeemed), // previous winners enter 1-month cooldown
        currentMonthRedeemedUsers: "[]",
        goldenCandidateIds: "[]", // Reset candidates; will be evaluated from active users at next H-5
        lastMonthlyResetDate: dateInfo.dateStr,
      },
    });

    logger.info(`MonthlySeason: Season ${seasonName} di guild ${guild.name} berhasil diarsipkan dan direset.`);
  } catch (error) {
    logger.error(`MonthlySeason: Error archiving and resetting season for guild ${guildId}:`, error);
  }
}
