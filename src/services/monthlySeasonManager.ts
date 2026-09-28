import { Client, EmbedBuilder, Guild, GuildMember, TextChannel } from "discord.js";
import { prisma } from "./database";
import { logger } from "../utils/logger";
import { findHistoryChannel } from "../utils/historyLogger";

const REGULAR_MEMBER_MAX_POINTS = 20000;
const GOLDEN_MEMBER_MAX_POINTS = 50000;
const MONTHLY_REDEEM_QUOTA = 3;

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
 * Pick 3 Random Active Candidates who can reach up to 50k points this month
 * (Excludes previous month's winners who are in cooldown)
 */
export async function pickMonthlyGoldenCandidates(client: Client, guildId: string, force = false): Promise<string[]> {
  try {
    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    if (!config) return [];

    let currentCandidates: string[] = [];
    try {
      currentCandidates = JSON.parse(config.goldenCandidateIds || "[]");
    } catch (_) {
      currentCandidates = [];
    }

    if (!force && currentCandidates.length === 3) {
      return currentCandidates;
    }

    let cooldownUsers: string[] = [];
    try {
      cooldownUsers = JSON.parse(config.cooldownUserIds || "[]");
    } catch (_) {
      cooldownUsers = [];
    }

    // 1. Find active members in TriviaScore who are NOT in cooldown
    const activeScores = await prisma.triviaScore.findMany({
      where: {
        guildId,
        userId: { notIn: cooldownUsers },
        OR: [
          { participatedVoice: true },
          { participatedTrivia: true },
          { participatedPoll: true },
          { participatedStory: true },
          { participatedPantun: true },
          { score: { gt: 0 } },
        ],
      },
    });

    let eligibleUserIds = activeScores.map((s) => s.userId);

    // Fallback: If not enough active users in DB, pick from server members (non-bot, non-cooldown)
    const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (guild && eligibleUserIds.length < 3) {
      await guild.members.fetch().catch(() => {});
      const fallbackMembers = guild.members.cache.filter((m) => !m.user.bot && !cooldownUsers.includes(m.id));
      const combined = new Set([...eligibleUserIds, ...fallbackMembers.map((m) => m.id)]);
      eligibleUserIds = Array.from(combined);
    }

    // Shuffle array (Fisher-Yates)
    for (let i = eligibleUserIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [eligibleUserIds[i], eligibleUserIds[j]] = [eligibleUserIds[j], eligibleUserIds[i]];
    }

    const pickedCandidates = eligibleUserIds.slice(0, 3);

    await prisma.guildConfig.update({
      where: { guildId },
      data: { goldenCandidateIds: JSON.stringify(pickedCandidates) },
    });

    logger.info(`MonthlySeason: Terpilih 3 Golden Candidates untuk guild ${guildId}: ${pickedCandidates.join(", ")}`);
    return pickedCandidates;
  } catch (error) {
    logger.error(`MonthlySeason: Gagal memilih golden candidates untuk guild ${guildId}:`, error);
    return [];
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

    let cooldownUsers: string[] = [];
    try {
      cooldownUsers = JSON.parse(config?.cooldownUserIds || "[]");
    } catch (_) {}

    let currentRedeemed: string[] = [];
    try {
      currentRedeemed = JSON.parse(config?.currentMonthRedeemedUsers || "[]");
    } catch (_) {}

    // 1. Check cooldown from previous month
    if (cooldownUsers.includes(userId)) {
      return {
        canRedeem: false,
        reason: "Kamu telah menukarkan hadiah di bulan lalu. Nikmati masa istirahat season ini agar member lain kebagian ya!",
        currentQuota: currentRedeemed.length,
        maxQuota,
      };
    }

    // 2. Check if already redeemed this month
    if (currentRedeemed.includes(userId)) {
      return {
        canRedeem: false,
        reason: "Kamu sudah menukarkan 1 hadiah di bulan ini (Maksimal 1 transaksi per member per bulan). Berikan kesempatan bagi temanmu!",
        currentQuota: currentRedeemed.length,
        maxQuota,
      };
    }

    // 3. Check quota limit (max 3 users)
    if (currentRedeemed.length >= maxQuota) {
      return {
        canRedeem: false,
        reason: `Kuota penukaran hadiah bulan ini sudah terpenuhi (${currentRedeemed.length}/${maxQuota} pemenang). Silakan bersiap untuk season depan!`,
        currentQuota: currentRedeemed.length,
        maxQuota,
      };
    }

    // 4. Check flexible activity (Voice OR any community feature)
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
 * Send H-5 Warning Notification to @amubhya, the 3 Golden Candidates, and channel #history
 */
export async function sendH5Notification(client: Client, guildId: string) {
  try {
    const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) return;

    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    if (!config || config.monthlyResetEnabled === false) return;

    const dateInfo = getWibDateInfo();

    // Ensure 3 candidates are picked
    const candidates = await pickMonthlyGoldenCandidates(client, guildId);
    if (!candidates || candidates.length === 0) return;

    const amubhya = await getAmubhyaMember(guild);
    const candidateMentions = candidates.map((id, idx) => `${idx + 1}. <@${id}>`).join("\n");
    const pingMentions = [
      amubhya ? `<@${amubhya.id}>` : "",
      ...candidates.map((id) => `<@${id}>`),
    ].filter(Boolean).join(" ");

    const embed = new EmbedBuilder()
      .setColor("#EF4444")
      .setTitle(`🔔 PEMBERITAHUAN MASA REDEEM H-5 • SEASON ${dateInfo.monthName.toUpperCase()} ${dateInfo.year}`)
      .setDescription(
        `Halo ${amubhya ? `<@${amubhya.id}>` : "Admin"} dan seluruh warga **${guild.name}**!\n\n` +
        `Sisa waktu menuju akhir bulan tinggal **5 HARI LAGI**! Berdasarkan seleksi keaktifan komunitas server, terdapat **3 member terpilih** yang memiliki tiket emas untuk menukarkan poin Rogatekno Koin (RTK) di \`/shop\`:\n\n` +
        `${candidateMentions}\n\n` +
        `⚠️ **PERINGATAN PENTING — SALDO AKAN HANGUS!**\n` +
        `> Batas akhir penukaran hadiah di \`/shop\` adalah **${dateInfo.daysInMonth} ${dateInfo.monthName} ${dateInfo.year} pukul 23:59 WIB**.\n` +
        `> **Jika terlambat menukarkan poin sebelum akhir bulan, maka seluruh saldo poin akan HANGUS & DIRESET KEMBALI KE 0** demi pembukaan season baru!\n\n` +
        `Gunakan perintah \`/shop\` sekarang untuk memilih hadiah kamu!`
      )
      .addFields(
        { name: "🎟️ Kuota Pemenang Redeem", value: `Maksimal **3 Orang** per bulan`, inline: true },
        { name: "⏳ Waktu Tersisa", value: `**5 Hari** (s.d. tgl ${dateInfo.daysInMonth} jam 23:59 WIB)`, inline: true }
      )
      .setFooter({
        text: `Maya Season Engine • Peringatan H-5 • Jangan sampai koinmu hangus!`,
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
        content: `🚨 **PENGUMUMAN PENTING SEASON AKHIR BULAN!** ${pingMentions}`,
        embeds: [embed],
      });
      logger.info(`MonthlySeason: Berhasil mengirim notifikasi H-5 ke channel #${targetChannel.name} di guild ${guild.name}`);
    }

    // 2. Send to #history channel permanently
    const historyChannel = findHistoryChannel(guild);
    if (historyChannel && historyChannel.id !== targetChannel?.id) {
      await historyChannel.send({
        embeds: [embed],
        allowedMentions: { parse: [] },
      });
      logger.info(`MonthlySeason: Berhasil mencatat notifikasi H-5 ke #${historyChannel.name} di guild ${guild.name}`);
    }

    // Record date
    await prisma.guildConfig.update({
      where: { guildId },
      data: { lastMonthlyWarningH5Date: dateInfo.dateStr },
    });
  } catch (error) {
    logger.error(`MonthlySeason: Error sending H-5 notification for guild ${guildId}:`, error);
  }
}

/**
 * Send H-3 General Announcement to server and #history
 */
export async function sendH3Notification(client: Client, guildId: string) {
  try {
    const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) return;

    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    if (!config || config.monthlyResetEnabled === false) return;

    const dateInfo = getWibDateInfo();
    let currentRedeemed: string[] = [];
    try {
      currentRedeemed = JSON.parse(config.currentMonthRedeemedUsers || "[]");
    } catch (_) {}

    const remainingQuota = Math.max(0, (config.monthlyRedeemQuota || MONTHLY_REDEEM_QUOTA) - currentRedeemed.length);

    const embed = new EmbedBuilder()
      .setColor("#F59E0B")
      .setTitle(`🔥 PERIODE REDEEM HADIAH RESMI DIBUKA (H-3) • ${dateInfo.monthName.toUpperCase()}`)
      .setDescription(
        `Waktu semakin mendekat! Sisa **3 HARI** lagi sebelum seluruh saldo koin RTK di server **${guild.name}** direset ke 0!\n\n` +
        `📦 **Status Kuota Penukaran Bulan Ini:**\n` +
        `> Terisi: **${currentRedeemed.length}/${config.monthlyRedeemQuota || MONTHLY_REDEEM_QUOTA} Pemenang** (Sisa ${remainingQuota} slot lagi!)\n\n` +
        `⚠️ **Peringatan Poin Hangus:**\n` +
        `Seluruh saldo RTK yang tidak dibelanjakan sebelum **${dateInfo.daysInMonth} ${dateInfo.monthName} pukul 23:59 WIB** akan otomatis hangus saat season baru dimulai.\n\n` +
        `Gunakan perintah \`/shop\` untuk menukarkan hadiahmu sekarang!`
      )
      .setFooter({
        text: `Maya Season Engine • Peringatan H-3`,
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
      await targetChannel.send({ embeds: [embed] });
    }

    const historyChannel = findHistoryChannel(guild);
    if (historyChannel && historyChannel.id !== targetChannel?.id) {
      await historyChannel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    }

    await prisma.guildConfig.update({
      where: { guildId },
      data: { lastMonthlyWarningH3Date: dateInfo.dateStr },
    });
  } catch (error) {
    logger.error(`MonthlySeason: Error sending H-3 notification for guild ${guildId}:`, error);
  }
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
      .setTitle(`🏆 SEASON BERAKHIR & SALDO DIRESET • ${seasonName.toUpperCase()}`)
      .setDescription(
        `Selamat kepada seluruh anggota **${guild.name}** atas partisipasinya sepanjang bulan **${seasonName}**!\n\n` +
        `🎖️ **Pemenang Redeem Hadiah Bulan Ini (Maks 3):**\n${redeemedList}\n\n` +
        `🌟 **Top 10 Hall of Fame Saldo Tertinggi Bulan Ini:**\n${winnersList}\n\n` +
        `🔄 **RESET SALDO KE 0 TELAH DILAKUKAN!**\n` +
        `Seluruh saldo RTK telah dinolkan kembali untuk menyambut season bulan baru. Tiga member yang telah redeem bulan ini akan beristirahat (cooldown) agar rekan-rekan lain berkesempatan menang!\n\n` +
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
        goldenCandidateIds: "[]",
        lastMonthlyResetDate: dateInfo.dateStr,
      },
    });

    // 7. Pick 3 new Golden Candidates for the new month immediately
    await pickMonthlyGoldenCandidates(client, guildId, true);

    logger.info(`MonthlySeason: Season ${seasonName} di guild ${guild.name} berhasil diarsipkan dan direset.`);
  } catch (error) {
    logger.error(`MonthlySeason: Error archiving and resetting season for guild ${guildId}:`, error);
  }
}
