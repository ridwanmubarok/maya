import { TextChannel, EmbedBuilder } from "discord.js";
import { prisma } from "./database";
import { askNvidia } from "./aiClient";
import { logger } from "../utils/logger";

export interface TebakQuestion {
  id: string;
  category: string;
  question: string;
  answer: string;
  acceptableAnswers: string[];
  clue?: string;
}

export interface ActiveSession {
  guildId: string;
  channelId: string;
  question: TebakQuestion;
  startTime: number;
  timer: NodeJS.Timeout;
}

const QUESTION_BANK: TebakQuestion[] = [
  {
    id: "q1",
    category: "Tebak-Tebakan Kekinian",
    question: "Kenapa HP Android kalau lagi charging tidak bisa diajak jalan-jalan?",
    answer: "Karena Kabelan",
    acceptableAnswers: ["kabelan", "ke kabelan", "kebatasan kabel"],
    clue: "Plesetan kata kesebelasan / kabel...",
  },
  {
    id: "q2",
    category: "Teka-Teki Lucu",
    question: "Pintu apa yang tidak bisa didorong oleh 10 orang kuat sekalipun?",
    answer: "Pintu Geser",
    acceptableAnswers: ["pintu geser", "geser", "pintu sliding"],
    clue: "Bukan didorong, tapi...",
  },
  {
    id: "q3",
    category: "Asah Otak Kocak",
    question: "Makin diisi makin ringan, apakah itu?",
    answer: "Balon",
    acceptableAnswers: ["balon", "balon gas"],
    clue: "Diisi gas/udara ringan.",
  },
  {
    id: "q4",
    category: "Tebak-Tebakan Gaul",
    question: "Kera apa yang kalau dipeluk malah bikin hangat?",
    answer: "Kerajinan Tangan",
    acceptableAnswers: ["keranjang", "kerajinan", "keramaian"],
    clue: "Kera yang kreatif...",
  },
  {
    id: "q5",
    category: "Teka-Teki Lucu",
    question: "Hewan apa yang paling hemat listrik dan tidak suka kepanasan?",
    answer: "Kuda Laut",
    acceptableAnswers: ["kuda laut", "kudalaut"],
    clue: "Tinggal di air...",
  },
  {
    id: "q6",
    category: "Tebak Plesetan",
    question: "Susu apa yang tidak bisa diminum?",
    answer: "Susah Ditebak",
    acceptableAnswers: ["susah ditebak", "susah"],
    clue: "Plesetan kata susah...",
  },
];

/**
 * Generate dynamic, hilarious riddle using NVIDIA AI LLM Engine
 */
async function generateAiTebakQuestion(): Promise<TebakQuestion | null> {
  const prompt = `
Buatkan 1 pertanyaan tebak-tebakan bahasa Indonesia yang SANGAT LUCU, KEKINIAN (Gen-Z / Gaul / Plesetan Cerdas / Out of the Box), dan TIDAK GARING!
Jawab dalam format JSON persis seperti berikut tanpa teks tambahan apapun:
{
  "category": "Tebak-Tebakan Kekinian",
  "question": "Pertanyaan tebak-tebakan lucu di sini...",
  "answer": "Jawaban utama singkat",
  "acceptableAnswers": ["jawaban utama", "kata kunci singkat", "variasi"],
  "clue": "Petunjuk kocak..."
}
`.trim();

  try {
    const raw = await askNvidia(prompt);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      if (data.question && data.answer) {
        const acceptable = Array.isArray(data.acceptableAnswers) && data.acceptableAnswers.length > 0
          ? data.acceptableAnswers.map((a: string) => a.toLowerCase())
          : [data.answer.toLowerCase()];
        
        // Ensure main answer is included
        if (!acceptable.includes(data.answer.toLowerCase())) {
          acceptable.push(data.answer.toLowerCase());
        }

        return {
          id: `ai-q-${Date.now()}`,
          category: data.category || "Tebak-Tebakan AI Kekinian",
          question: data.question,
          answer: data.answer,
          acceptableAnswers: acceptable,
          clue: data.clue || "Gunakan logika gaul & out of the box!",
        };
      }
    }
  } catch (error) {
    logger.error("TebakManager: Error generating AI riddle:", error);
  }
  return null;
}

export class TebakManager {
  private static instance: TebakManager;
  private activeSessions: Map<string, ActiveSession> = new Map();

  private constructor() {}

  public static getInstance(): TebakManager {
    if (!TebakManager.instance) {
      TebakManager.instance = new TebakManager();
    }
    return TebakManager.instance;
  }

  public isSessionActive(channelId: string): boolean {
    return this.activeSessions.has(channelId);
  }

  public getActiveSession(channelId: string): ActiveSession | undefined {
    return this.activeSessions.get(channelId);
  }

  /**
   * Start a new riddle session in channel
   */
  public async startRiddleSession(channel: TextChannel, guildId: string): Promise<boolean> {
    if (this.activeSessions.has(channel.id)) {
      return false; // Session already running
    }

    // Try dynamic NVIDIA AI generator first, fallback to bank if offline
    let question = await generateAiTebakQuestion();
    if (!question) {
      question = QUESTION_BANK[Math.floor(Math.random() * QUESTION_BANK.length)];
    }

    const embed = new EmbedBuilder()
      .setTitle(`Game Tebak-Tebakan (${question.category})`)
      .setDescription(
        `**Pertanyaan**:\n> ${question.question}\n\n` +
        `💡 **Petunjuk**: ${question.clue || "Gunakan logika gaul!"}\n\n` +
        `Ketik jawaban kamu langsung di channel chat ini!\nBatas waktu menjawab: **30 detik**.`
      )
      .setColor("#2563EB")
      .setFooter({ text: "Maya AI Trivia Engine • NVIDIA LLM Dynamic Riddles" })
      .setTimestamp();

    await channel.send({ embeds: [embed] });

    // Set 30s timeout handler
    const timer = setTimeout(async () => {
      await this.handleTimeout(channel.id, channel);
    }, 30000);

    const session: ActiveSession = {
      guildId,
      channelId: channel.id,
      question,
      startTime: Date.now(),
      timer,
    };

    this.activeSessions.set(channel.id, session);

    // Create Message Collector to listen for correct answer in channel
    const collector = channel.createMessageCollector({
      filter: (m) => !m.author.bot,
      time: 30000,
    });

    collector.on("collect", async (message) => {
      const userText = message.content.trim().toLowerCase();
      const isCorrect = question.acceptableAnswers.some(
        (ans) => ans.toLowerCase() === userText || userText.includes(ans.toLowerCase())
      );

      if (isCorrect) {
        collector.stop("answered");
        clearTimeout(timer);
        this.activeSessions.delete(channel.id);

        // Add 10 points to DB
        const newScore = await this.addScore(guildId, message.author.id, message.author.displayName || message.author.username, 10);

        const winnerEmbed = new EmbedBuilder()
          .setTitle("Jawaban Benar!")
          .setDescription(
            `Selamat <@${message.author.id}>! Jawaban kamu **${question.answer}** tepat sekali!\n\n` +
            `**+10 Poin** ditambahkan ke skor kamu.\n` +
            `Total Skor Kamu: **${newScore} Poin**`
          )
          .setColor("#10B981")
          .setFooter({ text: "Maya Trivia Engine • Gunakan /tebak leaderboard untuk lihat peringkat" })
          .setTimestamp();

        await channel.send({ embeds: [winnerEmbed] });
      }
    });

    return true;
  }

  /**
   * Handle timeout when no one answers correctly
   */
  private async handleTimeout(channelId: string, channel: TextChannel) {
    const session = this.activeSessions.get(channelId);
    if (!session) return;

    this.activeSessions.delete(channelId);

    const timeoutEmbed = new EmbedBuilder()
      .setTitle("Waktu Menjawab Habis!")
      .setDescription(
        `Waktu 30 detik telah habis dan tidak ada yang menjawab dengan benar.\n\n` +
        `Jawaban yang benar adalah: **${session.question.answer}**.`
      )
      .setColor("#EF4444")
      .setFooter({ text: "Maya AI Trivia Engine • Gunakan /tebak main untuk mencoba lagi" })
      .setTimestamp();

    try {
      await channel.send({ embeds: [timeoutEmbed] });
    } catch (e) {
      logger.error("Error sending timeout embed:", e);
    }
  }

  /**
   * Add score to user in Prisma DB
   */
  public async addScore(guildId: string, userId: string, username: string, points: number): Promise<number> {
    try {
      const existing = await prisma.triviaScore.findUnique({
        where: {
          guildId_userId: { guildId, userId },
        },
      });

      if (existing) {
        const updated = await prisma.triviaScore.update({
          where: { id: existing.id },
          data: {
            score: existing.score + points,
            username,
          },
        });
        return updated.score;
      } else {
        const created = await prisma.triviaScore.create({
          data: {
            guildId,
            userId,
            username,
            score: points,
          },
        });
        return created.score;
      }
    } catch (error) {
      logger.error("TebakManager: Error adding score to DB:", error);
      return points;
    }
  }

  /**
   * Get Top 10 Leaderboard for a guild
   */
  public async getLeaderboard(guildId: string): Promise<{ userId: string; username: string; score: number }[]> {
    try {
      const scores = await prisma.triviaScore.findMany({
        where: { guildId },
        orderBy: { score: "desc" },
        take: 10,
      });

      return scores.map((s) => ({
        userId: s.userId,
        username: s.username,
        score: s.score,
      }));
    } catch (error) {
      logger.error("TebakManager: Error getting leaderboard:", error);
      return [];
    }
  }
}

export const tebakManager = TebakManager.getInstance();
