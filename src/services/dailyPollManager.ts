import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, TextChannel, ButtonInteraction } from "discord.js";
import { prisma } from "./database";
import { askNvidia } from "./aiClient";
import { logger } from "../utils/logger";

interface PollTopicData {
  topic: string;
  description: string;
  optionA: string;
  optionB: string;
  optionC?: string;
  optionD?: string;
}

const TOPIC_CATEGORIES = [
  "Kuliner & Makanan Indonesia (misal: bubur, mie instan, bakso, es teh)",
  "Gaya Hidup & Kebiasaan Sehari-hari (misal: jam tidur, mandi air hangat, tipe belajar)",
  "Gaming & Pop Culture (misal: mobile game vs PC, anime, genre musik, film)",
  "Dilema Seru & Pengalaman Lucu (misal: hp lowbat vs dompet ketinggalan, introvert vs ekstrover)",
  "Teknologi & Media Sosial (misal: Instagram vs TikTok, dark mode vs light mode)"
];

/**
 * Generate a fun, engaging, and random debate topic using Gemini / NVIDIA AI
 */
export async function generateAIPollTopic(): Promise<PollTopicData> {
  const categorySeed = TOPIC_CATEGORIES[Math.floor(Math.random() * TOPIC_CATEGORIES.length)];

  const prompt = `Buatkan 1 topik polling debat harian yang baru, seru, acak/random, dan kontroversial ala Gen-Z Indonesia dengan fokus kategori: "${categorySeed}".
Berikan 2 sampai 4 pilihan jawaban yang sangat menarik dengan emoji di setiap pilihan.

PENTING: Output HARUS dalam format JSON murni tanpa markdown/codeblock dengan kunci berikut:
{
  "topic": "Judul Topik Debat",
  "description": "Deskripsi singkat yang memicu perdebatan di kolom komentar",
  "optionA": "Emoji + Pilihan A",
  "optionB": "Emoji + Pilihan B",
  "optionC": "Emoji + Pilihan C (Opsional, tinggalkan kosong jika hanya 2 pilihan)",
  "optionD": "Emoji + Pilihan D (Opsional, tinggalkan kosong jika hanya 2 atau 3 pilihan)"
}`;

  try {
    const rawAiResponse = await askNvidia(prompt, "Kamu adalah Maya, AI pembuat polling kuis harian yang sangat seru, kreatif, dan selalu mempunyai ide-ide obrolan baru yang fresh.");
    
    // Clean response from markdown codeblocks if present
    const cleaned = rawAiResponse
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    if (parsed.topic && parsed.optionA && parsed.optionB) {
      return {
        topic: parsed.topic,
        description: parsed.description || "Tentukan pilihanmu sekarang dan klaim reward RTK Point!",
        optionA: parsed.optionA,
        optionB: parsed.optionB,
        optionC: parsed.optionC || undefined,
        optionD: parsed.optionD || undefined,
      };
    }
  } catch (err) {
    logger.error("Error generating AI Poll Topic, using fallback:", err);
  }

  // Fallback preset topics if AI call fails
  const fallbacks: PollTopicData[] = [
    {
      topic: "🔥 Debat Abadi: Bubur Ayam",
      description: "Mana cara makan bubur ayam yang paling bermartabat menurut kalian?",
      optionA: "🥣 Diaduk (Rasa menyatu sempurna)",
      optionB: "🍲 Tidak Diaduk (Estetik & rapi)",
      optionC: "🥤 Diminum pake sedotan (Anti mainstream)",
      optionD: "❌ Nggak suka bubur ayam"
    },
    {
      topic: "🎮 Gamer Sejati: Main PC vs Console vs Mobile",
      description: "Platform mana yang paling fleksibel & asik buat mabar bareng teman?",
      optionA: "💻 PC Master Race",
      optionB: "🎮 Console (PS/Xbox/Switch)",
      optionC: "📱 Mobile Gamer (Praktis di mana aja)",
      optionD: "🛋️ Cuma penonton streamer"
    },
    {
      topic: "☕ Kopi Pagi vs Teh Pagi",
      description: "Apa minuman wajib pembuka hari kalian biar nggak ngantuk?",
      optionA: "☕ Kopi Hitam / Latte",
      optionB: "🍵 Teh Manis Warm/Es",
      optionC: "🥛 Milk / Matcha",
      optionD: "💧 Air Putih aja sehat"
    },
    {
      topic: "🌙 Mode Tampilan: Dark Mode vs Light Mode",
      description: "Tema tampilan mana yang terpasang di semua aplikasi & HP kalian?",
      optionA: "🌙 Dark Mode (Hemat baterai & adem di mata)",
      optionB: "☀️ Light Mode (Cerah & jelas di luar ruangan)",
      optionC: "🔄 Otomatis ikuti jadwal matahari"
    }
  ];

  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

/**
 * Generate Visual Bar (Progress bar) for vote percentage
 */
function createProgressBar(percentage: number, length: number = 10): string {
  const filledCount = Math.round((percentage / 100) * length);
  const emptyCount = length - filledCount;
  return `[${"█".repeat(filledCount)}${"░".repeat(emptyCount)}]`;
}

/**
 * Build Discord Embed and Buttons for a Daily Poll
 */
export function buildPollEmbedAndComponents(
  topic: string,
  description: string,
  options: { key: string; text: string }[],
  votes: { optionChosen: string }[],
  pollId: string,
  rewardAmount: number = 5
) {
  const totalVotes = votes.length;

  const countMap: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const v of votes) {
    if (countMap[v.optionChosen] !== undefined) {
      countMap[v.optionChosen]++;
    }
  }

  let optionsText = "";
  for (const opt of options) {
    const count = countMap[opt.key] || 0;
    const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
    const bar = createProgressBar(pct);
    optionsText += `**${opt.key}. ${opt.text}**\n${bar} **${pct}%** (${count} vote)\n\n`;
  }

  const embed = new EmbedBuilder()
    .setTitle(`📊 DAILY AI POLL & DEBAT SERU • MAYA`)
    .setColor("#5865F2")
    .setDescription(
      `### ${topic}\n*${description}*\n\n` +
      `📌 **Pilihan Voting:**\n${optionsText}` +
      `🎁 **Reward Vote**: **+${rewardAmount} RTK Point** per partisipasi!\n` +
      `👥 **Total Partisipan**: **${totalVotes} Member**`
    )
    .setFooter({ text: "Maya Daily Poll Engine • Klik tombol di bawah untuk memberikan suaramu!" })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>();
  for (const opt of options) {
    const btnStyle =
      opt.key === "A" ? ButtonStyle.Primary :
      opt.key === "B" ? ButtonStyle.Success :
      opt.key === "C" ? ButtonStyle.Secondary : ButtonStyle.Danger;

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`poll_vote:${pollId}:${opt.key}`)
        .setLabel(`${opt.key}. ${opt.text.substring(0, 70)}`)
        .setStyle(btnStyle)
    );
  }

  return { embed, row };
}

/**
 * Start and post a Daily Poll for a specific guild
 */
export async function startDailyPollForGuild(guild: any, configuredChannelId?: string): Promise<boolean> {
  try {
    let targetChannel: TextChannel | null = null;

    if (configuredChannelId) {
      targetChannel = (guild.channels.cache.get(configuredChannelId) || (await guild.channels.fetch(configuredChannelId).catch(() => null))) as TextChannel;
    }

    if (!targetChannel) {
      try {
        const fetchedChannels = await guild.channels.fetch();
        targetChannel = (fetchedChannels.find(
          (c: any) => c && c.isTextBased() && !c.isThread() && (c.name.includes("poll") || c.name.includes("debat") || c.name.includes("general") || c.name.includes("chat") || c.name.includes("main"))
        ) || guild.systemChannel) as TextChannel;
      } catch (_) {
        targetChannel = guild.systemChannel as TextChannel;
      }
    }

    if (!targetChannel || !("send" in targetChannel)) {
      logger.warn(`DailyPollManager: Target channel daily poll tidak ditemukan di ${guild.name}`);
      return false;
    }

    const config = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });
    const rewardAmount = config?.dailyPollRewardAmount ?? 5;

    // Generate AI Poll topic
    const topicData = await generateAIPollTopic();

    const options: { key: string; text: string }[] = [
      { key: "A", text: topicData.optionA },
      { key: "B", text: topicData.optionB },
    ];
    if (topicData.optionC) options.push({ key: "C", text: topicData.optionC });
    if (topicData.optionD) options.push({ key: "D", text: topicData.optionD });

    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];

    // Create placeholder DB record to generate pollId
    const pollRecord = await prisma.dailyPoll.create({
      data: {
        guildId: guild.id,
        channelId: targetChannel.id,
        messageId: "PENDING_" + Date.now(),
        topic: topicData.topic,
        description: topicData.description,
        optionA: topicData.optionA,
        optionB: topicData.optionB,
        optionC: topicData.optionC || null,
        optionD: topicData.optionD || null,
        dateStr,
      }
    });

    const { embed, row } = buildPollEmbedAndComponents(
      topicData.topic,
      topicData.description,
      options,
      [],
      pollRecord.id,
      rewardAmount
    );

    const sentMessage = await targetChannel.send({
      content: "📢 @everyone **DAILY AI POLL & DEBAT SERU HARI INI TELAH DIBUKA!** 🎉\n*Tentukan pilihanmu dan dapatkan RTK Point gratis!*",
      embeds: [embed],
      components: [row]
    });

    // Update messageId in DB
    await prisma.dailyPoll.update({
      where: { id: pollRecord.id },
      data: { messageId: sentMessage.id }
    });

    logger.info(`DailyPollManager: Berhasil memposting Daily Poll ke ${guild.name} (#${targetChannel.name})`);
    return true;
  } catch (err) {
    logger.error(`DailyPollManager: Error starting poll for guild ${guild.name}:`, err);
    return false;
  }
}

/**
 * Handle Member Button Click on Daily Poll
 */
export async function handlePollVoteInteraction(interaction: ButtonInteraction, pollId: string, optionKey: string) {
  try {
    const poll = await prisma.dailyPoll.findUnique({
      where: { id: pollId },
      include: { votes: true }
    });

    if (!poll) {
      await interaction.reply({
        content: "Maaf, polling ini tidak ditemukan di database.",
        ephemeral: true
      });
      return;
    }

    const guildId = interaction.guildId!;
    const userId = interaction.user.id;
    const username = interaction.user.displayName || interaction.user.username;

    const existingVote = poll.votes.find(v => v.userId === userId);
    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    const rewardAmount = config?.dailyPollRewardAmount ?? 5;

    let isNewVoter = false;

    if (existingVote) {
      if (existingVote.optionChosen === optionKey) {
        await interaction.reply({
          content: `Kamu sudah memilih pilihan **${optionKey}** pada polling ini!`,
          ephemeral: true
        });
        return;
      }

      // Update vote choice
      await prisma.dailyPollVote.update({
        where: { id: existingVote.id },
        data: { optionChosen: optionKey }
      });
    } else {
      isNewVoter = true;
      // Record new vote
      await prisma.dailyPollVote.create({
        data: {
          pollId,
          userId,
          username,
          optionChosen: optionKey
        }
      });

      // Award RTK Point
      if (rewardAmount > 0) {
        await prisma.triviaScore.upsert({
          where: { guildId_userId: { guildId, userId } },
          update: {
            score: { increment: rewardAmount },
            dailyScore: { increment: rewardAmount }
          },
          create: {
            guildId,
            userId,
            username,
            score: rewardAmount,
            dailyScore: rewardAmount
          }
        });
      }
    }

    // Get updated votes
    const updatedVotes = await prisma.dailyPollVote.findMany({ where: { pollId } });

    // Get option text chosen
    const optionTextMap: Record<string, string> = {
      A: poll.optionA,
      B: poll.optionB,
      C: poll.optionC || "",
      D: poll.optionD || ""
    };
    const chosenText = optionTextMap[optionKey] || optionKey;

    const options: { key: string; text: string }[] = [
      { key: "A", text: poll.optionA },
      { key: "B", text: poll.optionB },
    ];
    if (poll.optionC) options.push({ key: "C", text: poll.optionC });
    if (poll.optionD) options.push({ key: "D", text: poll.optionD });

    const { embed, row } = buildPollEmbedAndComponents(
      poll.topic,
      poll.description,
      options,
      updatedVotes,
      poll.id,
      rewardAmount
    );

    // Update message embed live
    await interaction.message.edit({
      embeds: [embed],
      components: [row]
    }).catch(() => {});

    // Fetch user current balance
    const userScore = await prisma.triviaScore.findUnique({
      where: { guildId_userId: { guildId, userId } }
    });
    const currentBalance = userScore?.score ?? rewardAmount;

    let responseMsg = `🎉 **Suaramu berhasil dicatat!** Kamu memilih **${optionKey}. ${chosenText}**.`;
    if (isNewVoter && rewardAmount > 0) {
      responseMsg += `\n💰 Kamu mendapatkan **+${rewardAmount} RTK Point**! Saldo RTK kamu saat ini: **${currentBalance} RTK**.`;
    } else {
      responseMsg += `\n🔄 Pilihan suaramu telah berhasil diperbarui. Saldo RTK kamu saat ini: **${currentBalance} RTK**.`;
    }

    await interaction.reply({
      content: responseMsg,
      ephemeral: true
    });
  } catch (err: any) {
    logger.error("Error handling poll vote interaction:", err);
    await interaction.reply({
      content: "Terjadi kesalahan saat mencatat suaramu. Silakan coba lagi.",
      ephemeral: true
    }).catch(() => {});
  }
}

/**
 * Fetch latest poll data & member voting list for Web Dashboard Live Backoffice
 */
export async function getLatestPollData(guildId: string) {
  try {
    const poll = await prisma.dailyPoll.findFirst({
      where: { guildId },
      orderBy: { createdAt: "desc" },
      include: {
        votes: {
          orderBy: { createdAt: "desc" }
        }
      }
    });

    if (!poll) {
      return { active: false };
    }

    const optionTextMap: Record<string, string> = {
      A: poll.optionA,
      B: poll.optionB,
      C: poll.optionC || "",
      D: poll.optionD || ""
    };

    const countMap: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
    for (const v of poll.votes) {
      if (countMap[v.optionChosen] !== undefined) {
        countMap[v.optionChosen]++;
      }
    }

    return {
      active: true,
      pollId: poll.id,
      topic: poll.topic,
      description: poll.description,
      dateStr: poll.dateStr,
      createdAt: poll.createdAt,
      optionA: poll.optionA,
      optionB: poll.optionB,
      optionC: poll.optionC,
      optionD: poll.optionD,
      totalVotes: poll.votes.length,
      counts: countMap,
      votes: poll.votes.map((v) => ({
        id: v.id,
        userId: v.userId,
        username: v.username,
        optionChosen: v.optionChosen,
        optionText: optionTextMap[v.optionChosen] || v.optionChosen,
        createdAt: v.createdAt
      }))
    };
  } catch (err) {
    logger.error(`Error fetching latest poll data for ${guildId}:`, err);
    return { active: false };
  }
}
