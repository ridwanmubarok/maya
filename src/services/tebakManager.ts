import {
  TextChannel,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonInteraction,
  ModalSubmitInteraction,
  Message,
  MessageFlags,
  ChatInputCommandInteraction,
} from "discord.js";
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
  sessionId: string;
  guildId: string;
  channelId: string;
  messageId?: string;
  question: TebakQuestion;
  startTime: number;
  timer?: NodeJS.Timeout;
  isDaily: boolean;
  answeredUserIds?: Set<string>;
}

const QUESTION_BANK: TebakQuestion[] = [
  {
    id: "q1",
    category: "Tebak-Tebakan Kekinian",
    question: "Kenapa HP Android kalau lagi charging tidak bisa diajak jalan-jalan?",
    answer: "Kabelan",
    acceptableAnswers: ["kabelan", "karena kabelan", "ke kabelan"],
    clue: "Plesetan kata kesebelasan...",
  },
  {
    id: "q2",
    category: "Teka-Teki Lucu",
    question: "Pintu apa yang tidak bisa didorong oleh 10 orang kuat sekalipun?",
    answer: "Pintu Geser",
    acceptableAnswers: ["pintu geser", "geser", "sliding door"],
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
];

export class TebakManager {
  private static instance: TebakManager;
  private activeSessions: Map<string, ActiveSession> = new Map(); // key: sessionId

  private constructor() {}

  public static getInstance(): TebakManager {
    if (!TebakManager.instance) {
      TebakManager.instance = new TebakManager();
    }
    return TebakManager.instance;
  }

  public isChannelActive(channelId: string): boolean {
    return Array.from(this.activeSessions.values()).some((s) => s.channelId === channelId);
  }

  /**
   * Start Instant Riddle Session
   */
  public async startRiddleSession(interaction: ChatInputCommandInteraction): Promise<boolean> {
    const channel = interaction.channel;
    if (!channel) return false;

    if (this.isChannelActive(channel.id)) {
      await interaction.editReply({
        content: "Sesi tebak-tebakan masih berlangsung di channel ini! Selesaikan pertanyaan yang ada terlebih dahulu.",
      });
      return false;
    }

    const sessionId = `tbk-${Date.now()}`;
    let question = await this.generateAiTebakQuestion();
    if (!question) {
      question = QUESTION_BANK[Math.floor(Math.random() * QUESTION_BANK.length)];
    }

    const embed = new EmbedBuilder()
      .setTitle(`Game Tebak-Tebakan (${question.category})`)
      .setDescription(
        `**Pertanyaan**:\n> ${question.question}\n\n` +
        `💡 **Petunjuk**: ${question.clue || "Gunakan logika gaul!"}\n\n` +
        `Klik tombol **Jawab Tebak-Tebakan** di bawah ini untuk mengisi jawaban kamu!\nBatas waktu: **45 detik**.`
      )
      .setColor("#2563EB")
      .setFooter({ text: "Maya AI Trivia Engine • Mode Instant" })
      .setTimestamp();

    const answerButton = new ButtonBuilder()
      .setCustomId(`tebak_answer:${sessionId}`)
      .setLabel("Jawab Tebak-Tebakan")
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(answerButton);

    const message = await interaction.editReply({ embeds: [embed], components: [row] });

    const timer = setTimeout(async () => {
      await this.handleTimeout(sessionId, channel as any, message);
    }, 45000);

    const session: ActiveSession = {
      sessionId,
      guildId: interaction.guildId!,
      channelId: channel.id,
      messageId: message.id,
      question,
      startTime: Date.now(),
      timer,
      isDaily: false,
    };

    this.activeSessions.set(sessionId, session);
    return true;
  }

  /**
   * Start Daily Riddle Session (@everyone Broadcast)
   */
  public async startDailyRiddleSession(channel: TextChannel, guildId: string): Promise<boolean> {
    if (this.isChannelActive(channel.id)) {
      return false;
    }

    const sessionId = `daily-${Date.now()}`;
    let question = await this.generateAiTebakQuestion();
    if (!question) {
      question = QUESTION_BANK[Math.floor(Math.random() * QUESTION_BANK.length)];
    }

    const embed = new EmbedBuilder()
      .setTitle(`📢 TEBAK-TEBAKAN HARIAN MAYA AI (${question.category})`)
      .setDescription(
        `**Pertanyaan Hari Ini**:\n> ${question.question}\n\n` +
        `💡 **Petunjuk**: ${question.clue || "Gunakan logika gaul & out of the box!"}\n\n` +
        `Setiap anggota server dapat menjawab 1x hari ini untuk mengumpulkan **Poin Harian**!\n` +
        `Klik tombol **Jawab Tebak-Tebakan Harian** di bawah ini!`
      )
      .setColor("#9333EA") // Purple Indigo
      .setFooter({ text: "Maya Daily Trivia Engine • Broadcast Harian Server" })
      .setTimestamp();

    const answerButton = new ButtonBuilder()
      .setCustomId(`tebak_answer:${sessionId}`)
      .setLabel("Jawab Tebak-Tebakan Harian")
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(answerButton);

    const message = await channel.send({
      content: "@everyone @here **Tebak-Tebakan Harian Maya AI telah rilis!** Ayo jawab dan kumpulkan poin harian kamu!",
      embeds: [embed],
      components: [row],
    });

    const session: ActiveSession = {
      sessionId,
      guildId,
      channelId: channel.id,
      messageId: message.id,
      question,
      startTime: Date.now(),
      isDaily: true,
      answeredUserIds: new Set<string>(),
    };

    this.activeSessions.set(sessionId, session);
    return true;
  }

  /**
   * Handle Button Click -> Open Modal Window
   */
  public async handleButton(interaction: ButtonInteraction, sessionId: string) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      await interaction.reply({
        content: "Sesi tebak-tebakan ini telah berakhir atau waktu telah habis.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // For daily riddles, check if user already answered today
    if (session.isDaily && session.answeredUserIds?.has(interaction.user.id)) {
      await interaction.reply({
        content: "Kamu sudah berhasil menjawab Tebak-Tebakan Harian hari ini! Kembali lagi besok untuk tantangan berikutnya.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`modal_tebak:${sessionId}`)
      .setTitle(session.isDaily ? "Jawab Tebak-Tebakan Harian" : "Jawab Tebak-Tebakan");

    const answerInput = new TextInputBuilder()
      .setCustomId("jawaban_user")
      .setLabel("Jawaban Kamu")
      .setPlaceholder("Ketik jawaban kamu di sini...")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(answerInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
  }

  /**
   * Handle Modal Submit -> Check Answer
   */
  public async handleModalSubmit(interaction: ModalSubmitInteraction, sessionId: string) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      await interaction.reply({
        content: "Sesi tebak-tebakan ini telah selesai.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const userAnswer = interaction.fields.getTextInputValue("jawaban_user").trim().toLowerCase();
    const isCorrect = session.question.acceptableAnswers.some(
      (ans) => ans.toLowerCase() === userAnswer || userAnswer.includes(ans.toLowerCase())
    );

    if (isCorrect) {
      if (session.isDaily) {
        // Daily Mode: Multi-user participation!
        session.answeredUserIds?.add(interaction.user.id);

        const newDailyScore = await this.addDailyScore(
          session.guildId,
          interaction.user.id,
          interaction.user.displayName || interaction.user.username,
          10
        );

        await interaction.reply({
          content: `Jawaban kamu **${session.question.answer}** BENAR! 🎉 Selamat, **+10 🪙 Rogatekno Cash** telah ditambahkan ke dompet kamu!\nTotal Harian Kamu: **${newDailyScore} 🪙 Rogatekno Cash**.`,
          flags: MessageFlags.Ephemeral,
        });
      } else {
        // Instant Mode: Single winner closes session
        if (session.timer) clearTimeout(session.timer);
        this.activeSessions.delete(sessionId);

        const newScore = await this.addScore(
          session.guildId,
          interaction.user.id,
          interaction.user.displayName || interaction.user.username,
          10
        );

        if (session.messageId && interaction.channel) {
          try {
            const channel = interaction.channel as TextChannel;
            const msg = await channel.messages.fetch(session.messageId);
            if (msg) {
              const winnerEmbed = new EmbedBuilder()
                .setTitle(`Tebak-Tebakan Selesai! (Dijawab Benar)`)
                .setDescription(
                  `**Pertanyaan**:\n> ${session.question.question}\n\n` +
                  `Pemenang: <@${interaction.user.id}> (+10 🪙 Rogatekno Cash)\n` +
                  `Jawaban Benar: **${session.question.answer}**\n` +
                  `Total Saldo <@${interaction.user.id}>: **${newScore} 🪙 Rogatekno Cash**`
                )
                .setColor("#10B981")
                .setFooter({ text: "Maya Trivia Engine • Gunakan /tebak leaderboard untuk lihat peringkat" })
                .setTimestamp();

              const disabledButton = new ButtonBuilder()
                .setCustomId(`disabled_${sessionId}`)
                .setLabel("Tebak-Tebakan Selesai")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true);

              const row = new ActionRowBuilder<ButtonBuilder>().addComponents(disabledButton);
              await msg.edit({ embeds: [winnerEmbed], components: [row] });
            }
          } catch (e: any) {
            if (e?.code !== 10008) {
              logger.error("Error updating message on correct answer:", e);
            }
          }
        }

        await interaction.reply({
          content: `Jawaban kamu **${session.question.answer}** BENAR! 🎉 Selamat, **+10 🪙 Rogatekno Cash** telah ditambahkan ke dompet kamu!`,
          flags: MessageFlags.Ephemeral,
        });
      }
    } else {
      await interaction.reply({
        content: `Jawaban kamu "${userAnswer}" belum tepat. Silakan coba tebak lagi!`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  /**
   * Handle Timeout for Instant mode
   */
  private async handleTimeout(sessionId: string, channel: TextChannel, message: Message) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    this.activeSessions.delete(sessionId);

    const timeoutEmbed = new EmbedBuilder()
      .setTitle("Waktu Menjawab Habis!")
      .setDescription(
        `Waktu 45 detik telah habis dan tidak ada yang menjawab dengan benar.\n\n` +
        `Jawaban yang benar adalah: **${session.question.answer}**.`
      )
      .setColor("#EF4444")
      .setFooter({ text: "Maya AI Trivia Engine • Gunakan /tebak main untuk mencoba lagi" })
      .setTimestamp();

    const disabledButton = new ButtonBuilder()
      .setCustomId(`disabled_${sessionId}`)
      .setLabel("Waktu Habis")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(disabledButton);

    try {
      await message.edit({ embeds: [timeoutEmbed], components: [row] });
    } catch (e: any) {
      if (e?.code !== 10008) {
        logger.error("Error editing timeout message:", e);
      }
    }
  }

  /**
   * Generate dynamic AI riddle
   */
  private async generateAiTebakQuestion(): Promise<TebakQuestion | null> {
    const prompt = `
Buatkan 1 pertanyaan tebak-tebakan bahasa Indonesia yang SANGAT LUCU, KEKINIAN (Gen-Z / Gaul / Plesetan Cerdas), dan TIDAK GARING!
Jawab dalam format JSON persis seperti berikut tanpa teks tambahan apapun:
{
  "category": "Tebak-Tebakan Kekinian",
  "question": "Pertanyaan tebak-tebakan lucu di sini...",
  "answer": "Jawaban utama singkat",
  "acceptableAnswers": ["jawaban utama", "kata kunci singkat"],
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

  /**
   * Add total score in DB
   */
  public async addScore(guildId: string, userId: string, username: string, points: number): Promise<number> {
    try {
      const existing = await prisma.triviaScore.findUnique({
        where: { guildId_userId: { guildId, userId } },
      });

      if (existing) {
        const updated = await prisma.triviaScore.update({
          where: { id: existing.id },
          data: { score: existing.score + points, username },
        });
        return updated.score;
      } else {
        const created = await prisma.triviaScore.create({
          data: { guildId, userId, username, score: points, dailyScore: points },
        });
        return created.score;
      }
    } catch (error) {
      logger.error("TebakManager: Error adding score to DB:", error);
      return points;
    }
  }

  /**
   * Add daily score in DB
   */
  public async addDailyScore(guildId: string, userId: string, username: string, points: number): Promise<number> {
    try {
      const todayStr = new Date().toISOString().split("T")[0];
      const existing = await prisma.triviaScore.findUnique({
        where: { guildId_userId: { guildId, userId } },
      });

      if (existing) {
        const isNewDay = existing.lastDailyDate !== todayStr;
        const newDaily = isNewDay ? points : existing.dailyScore + points;

        const updated = await prisma.triviaScore.update({
          where: { id: existing.id },
          data: {
            score: existing.score + points,
            dailyScore: newDaily,
            lastDailyDate: todayStr,
            username,
          },
        });
        return updated.dailyScore;
      } else {
        const created = await prisma.triviaScore.create({
          data: {
            guildId,
            userId,
            username,
            score: points,
            dailyScore: points,
            lastDailyDate: todayStr,
          },
        });
        return created.dailyScore;
      }
    } catch (error) {
      logger.error("TebakManager: Error adding daily score to DB:", error);
      return points;
    }
  }

  /**
   * Get Top 10 All-Time Leaderboard
   */
  public async getLeaderboard(guildId: string): Promise<{ userId: string; username: string; score: number }[]> {
    try {
      const scores = await prisma.triviaScore.findMany({
        where: { guildId },
        orderBy: { score: "desc" },
        take: 10,
      });

      return scores.map((s) => ({ userId: s.userId, username: s.username, score: s.score }));
    } catch (error) {
      logger.error("TebakManager: Error getting leaderboard:", error);
      return [];
    }
  }

  /**
   * Get Top 10 Daily Leaderboard
   */
  public async getDailyLeaderboard(guildId: string): Promise<{ userId: string; username: string; dailyScore: number }[]> {
    try {
      const todayStr = new Date().toISOString().split("T")[0];
      const scores = await prisma.triviaScore.findMany({
        where: { guildId, lastDailyDate: todayStr, dailyScore: { gt: 0 } },
        orderBy: { dailyScore: "desc" },
        take: 10,
      });

      return scores.map((s) => ({ userId: s.userId, username: s.username, dailyScore: s.dailyScore }));
    } catch (error) {
      logger.error("TebakManager: Error getting daily leaderboard:", error);
      return [];
    }
  }
}

export const tebakManager = TebakManager.getInstance();
