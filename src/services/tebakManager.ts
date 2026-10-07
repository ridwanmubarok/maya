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
import { askGemini, askAI } from "./aiClient";
import { logger } from "../utils/logger";
import { calculateAllowedEarnedPoints } from "./monthlySeasonManager";
import { addTriviaXp } from "./levelingManager";
import { CURATED_TEBAK_BANK } from "./tebakBank";

export interface TebakQuestion {
  id: string;
  category: string;
  question: string;
  answer: string;
  acceptableAnswers: string[];
  clue?: string;
}

export interface UserAnswerLog {
  userId: string;
  username: string;
  avatarUrl?: string;
  userAnswer: string;
  evalStatus: "BENAR" | "MENDEKATI" | "SALAH";
  attemptNumber: number;
  aiReason?: string;
  timestamp: string;
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
  userAttempts?: Map<string, number>;
  logs?: UserAnswerLog[];
}

export class TebakManager {
  private static instance: TebakManager;
  private activeSessions: Map<string, ActiveSession> = new Map(); // key: sessionId
  private askedQuestionHistory: Set<string> = new Set();

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

  public clearChannelSession(channelId: string) {
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (session.channelId === channelId) {
        if (session.timer) clearTimeout(session.timer);
        this.activeSessions.delete(sessionId);
      }
    }
  }

  /**
   * Hybrid Riddle Selector:
   * - Daily Quiz (isDaily = true): Prioritizes curated dad jokes bank (guaranteed 100% authentic, hilarious & non-repetitive).
   * - Instant /tebak (isDaily = false): Uses upgraded Gemini AI with strict phonetic pun few-shots, with fallback to curated bank.
   */
  public async getUniqueQuestion(isDaily: boolean = false): Promise<TebakQuestion> {
    // 1. If daily riddle, prioritize curated dad jokes bank
    if (isDaily) {
      const unusedCurated = CURATED_TEBAK_BANK.filter(
        (q) => !this.askedQuestionHistory.has(q.id) && !this.askedQuestionHistory.has(q.question.trim().toLowerCase())
      );

      // If all curated questions have been asked, cycle back through the bank
      const availableBank = unusedCurated.length > 0 ? unusedCurated : CURATED_TEBAK_BANK;
      const picked = availableBank[Math.floor(Math.random() * availableBank.length)];

      this.recordQuestionHistory(picked.id, picked.question);
      logger.info(`TebakManager: Memilih tebakan dari CURATED BANK untuk Daily Quiz: "${picked.question}" -> "${picked.answer}"`);
      return picked;
    }

    // 2. For instant /tebak command: Try AI generation first up to 3 times
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const question = await this.generateAiTebakQuestion(attempt);
        if (question && question.question && question.answer) {
          const key = question.question.trim().toLowerCase();
          if (!this.askedQuestionHistory.has(key)) {
            this.recordQuestionHistory(question.id, question.question);
            logger.info(`TebakManager: Berhasil men-generate tebakan receh AI Gemini (attempt ${attempt}): "${question.question}" -> "${question.answer}"`);
            return question;
          } else {
            logger.info(`TebakManager: Soal duplikat terdeteksi pada attempt ${attempt}, mencoba generasi topik baru...`);
          }
        }
      } catch (err) {
        logger.warn(`TebakManager: Attempt ${attempt} gagal generate AI question:`, err);
      }
    }

    // 3. Fallback to curated bank if AI fails or duplicates
    logger.info("TebakManager: AI generation gagal/duplikat, menggunakan fallback dari Curated Bank.");
    const unusedCurated = CURATED_TEBAK_BANK.filter(
      (q) => !this.askedQuestionHistory.has(q.id) && !this.askedQuestionHistory.has(q.question.trim().toLowerCase())
    );
    const availableBank = unusedCurated.length > 0 ? unusedCurated : CURATED_TEBAK_BANK;
    const picked = availableBank[Math.floor(Math.random() * availableBank.length)];

    this.recordQuestionHistory(picked.id, picked.question);
    return picked;
  }

  private recordQuestionHistory(id: string, questionText: string) {
    this.askedQuestionHistory.add(id);
    this.askedQuestionHistory.add(questionText.trim().toLowerCase());
    if (this.askedQuestionHistory.size > 300) {
      const firstKey = this.askedQuestionHistory.values().next().value;
      if (firstKey) this.askedQuestionHistory.delete(firstKey);
    }
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
    const question = await this.getUniqueQuestion(false);

    const embed = new EmbedBuilder()
      .setTitle(`🤣 TEBAK-TEBAKAN RECEH MAYA (${question.category})`)
      .setDescription(
        `**Tebakan Humor**:\n> ${question.question}\n\n` +
        `💡 **Petunjuk**: ${question.clue || "Gunakan logika receh ala jokes bapak-bapak!"}\n\n` +
        `Waktu menjawab: **45 detik**. Setiap member memiliki **3x kesempatan** untuk menjawab!\n` +
        `Klik tombol **Jawab Tebak-Tebakan** di bawah ini!`
      )
      .setColor("#3B82F6")
      .setFooter({ text: "Maya Humor & Trivia Engine • Tekan tombol untuk menjawab" })
      .setTimestamp();

    const answerButton = new ButtonBuilder()
      .setCustomId(`tebak_answer:${sessionId}`)
      .setLabel("💬 Jawab Tebak-Tebakan")
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
      answeredUserIds: new Set<string>(),
      userAttempts: new Map<string, number>(),
    };

    this.activeSessions.set(sessionId, session);
    return true;
  }

  /**
   * Start Daily Riddle Session (@everyone Broadcast)
   */
  public async startDailyRiddleSession(channel: TextChannel, guildId: string): Promise<boolean> {
    if (this.isChannelActive(channel.id)) {
      this.clearChannelSession(channel.id);
    }

    const sessionId = `daily-${Date.now()}`;
    const question = await this.getUniqueQuestion(true);

    const embed = new EmbedBuilder()
      .setTitle(`📢 TEBAK-TEBAKAN RECEH HARIAN MAYA (${question.category})`)
      .setDescription(
        `**Tebakan Hari Ini**:\n> ${question.question}\n\n` +
        `💡 **Petunjuk**: ${question.clue || "Gunakan logika receh ala jokes bapak-bapak!"}\n\n` +
        `Setiap anggota server memiliki **3x kesempatan** untuk menjawab tebakan hari ini & mendapatkan koin RTK!\n` +
        `Klik tombol **Jawab Tebak-Tebakan Harian** di bawah ini!`
      )
      .setColor("#9333EA") // Purple Indigo
      .setFooter({ text: "Maya Daily Humor & Trivia Engine • Broadcast Harian Server" })
      .setTimestamp();

    const answerButton = new ButtonBuilder()
      .setCustomId(`tebak_answer:${sessionId}`)
      .setLabel("Jawab Tebak-Tebakan Harian")
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(answerButton);

    const message = await channel.send({
      content: "@everyone @here **Tebak-Tebakan Receh Harian Maya telah rilis!** 😂 Ayo tebak jokes bapak-bapak ini dan kumpulkan koin RTK kamu!",
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
      userAttempts: new Map<string, number>(),
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

    // 1. Check if user already answered correctly
    if (session.answeredUserIds?.has(interaction.user.id)) {
      await interaction.reply({
        content: session.isDaily
          ? "Kamu sudah berhasil menjawab Tebak-Tebakan Harian hari ini! 🎉 Kembali lagi besok untuk tantangan berikutnya."
          : "Kamu sudah berhasil menjawab tebak-tebakan ini! 🎉",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // 2. Check if user used all 3 attempts
    const currentAttempts = session.userAttempts?.get(interaction.user.id) ?? 0;
    if (currentAttempts >= 3) {
      await interaction.reply({
        content: "Kesempatan kamu untuk menjawab tebakan ini sudah habis (**3/3**). Coba lagi di tebakan berikutnya!",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const remaining = 3 - currentAttempts;
    const modal = new ModalBuilder()
      .setCustomId(`modal_tebak:${sessionId}`)
      .setTitle(session.isDaily ? `Jawab Tebakan Harian (Sisa: ${remaining}/3)` : `Jawab Tebakan (Sisa: ${remaining}/3)`);

    const answerInput = new TextInputBuilder()
      .setCustomId("jawaban_user")
      .setLabel(`Jawaban Kamu (Kesempatan ${currentAttempts + 1}/3)`)
      .setPlaceholder("Ketik jawaban kamu di sini...")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(answerInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
  }

  /**
   * Evaluate answer using NVIDIA AI (Supports Exact, Close/Fuzzy, and Wrong answers)
   */
  private async evaluateAnswerWithAi(
    question: TebakQuestion,
    userAnswer: string
  ): Promise<{ isAccepted: boolean; evalStatus: "BENAR" | "MENDEKATI" | "SALAH"; reason: string }> {
    const cleanUser = userAnswer.trim().toLowerCase();
    const cleanAnswer = question.answer.trim().toLowerCase();

    // Quick exact / keyword check
    if (
      cleanUser === cleanAnswer ||
      question.acceptableAnswers.some((a) => a.toLowerCase() === cleanUser || cleanUser.includes(a.toLowerCase()))
    ) {
      return { isAccepted: true, evalStatus: "BENAR", reason: "Jawaban tepat sesuai kunci jawaban." };
    }

    // Call Gemini AI for Fuzzy / Semantic Similarity Evaluation
    const systemPrompt =
      "Anda adalah juri kuis tebak-tebakan receh dan jokes bapak-bapak (dad jokes) Bahasa Indonesia yang santai, apresiatif, dan humoris. Tugas Anda adalah menilai apakah jawaban peserta BENAR (punchline tepat atau semakna), MENDEKATI (hampir tepat, plesetan mirip, ide punchline tertangkap, atau tebakan alternatif yang kreatif), atau SALAH (tidak nyambung sama sekali). Jika salah, berikan alasan/feedback receh santai yang menghibur. Jawab HANYA JSON valid.";

    const prompt = `
Pertanyaan Kuis / Tebak-Tebakan Receh: "${question.question}"
Jawaban Kunci / Punchline: "${question.answer}"
Kata Kunci Lain Yang Diterima: ${JSON.stringify(question.acceptableAnswers)}

Jawaban Diinput Peserta: "${userAnswer}"

Tugas Evaluasi (Konteks Humor / Jokes Bapak-Bapak):
- "BENAR": jika punchline tepat, variasi semakna, atau menangkap maksud tebakan dengan tepat.
- "MENDEKATI": jika hampir tepat, menangkap inti plesetan, typo ringan, atau tebakan alternatif yang masih nyambung secara humor.
- "SALAH": jika berbeda jauh atau tidak nyambung sama sekali.

Format JSON wajib:
{
  "status": "BENAR" / "MENDEKATI" / "SALAH",
  "reason": "Alasan singkat santai & humoris (1 kalimat)..."
}
`.trim();

    try {
      const raw = await askGemini(prompt, systemPrompt);
      const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        const status: "BENAR" | "MENDEKATI" | "SALAH" =
          data.status === "BENAR" || data.status === "MENDEKATI" ? data.status : "SALAH";
        const isAccepted = status === "BENAR" || status === "MENDEKATI";

        return {
          isAccepted,
          evalStatus: status,
          reason: data.reason || (isAccepted ? "Jawaban mendekati kebenaran!" : "Belum nyambung ke punchline-nya nih, coba yang lebih receh!"),
        };
      }
    } catch (e) {
      logger.error("TebakManager: Error evaluating answer with AI:", e);
    }

    // Fallback word overlap check if AI fails
    const isClose = cleanUser.includes(cleanAnswer) || cleanAnswer.includes(cleanUser);
    if (isClose) {
      return { isAccepted: true, evalStatus: "MENDEKATI", reason: "Jawaban mengandung kata kunci yang mirip." };
    }

    return { isAccepted: false, evalStatus: "SALAH", reason: "Jawaban belum tepat." };
  }

  /**
   * Get Active Riddle Session & Live User Answer Logs for Web Dashboard Backoffice
   */
  public getActiveRiddleSession(guildId: string) {
    for (const session of this.activeSessions.values()) {
      if (session.guildId === guildId) {
        return {
          active: true,
          sessionId: session.sessionId,
          question: session.question,
          isDaily: session.isDaily,
          startTime: session.startTime,
          answeredUserCount: session.answeredUserIds?.size || 0,
          totalAttemptsCount: session.userAttempts?.size || 0,
          logs: session.logs || [],
        };
      }
    }
    return { active: false, question: null, logs: [] };
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

    // 1. Check if user already answered correctly
    if (session.answeredUserIds?.has(interaction.user.id)) {
      await interaction.reply({
        content: session.isDaily
          ? "Kamu sudah berhasil menjawab Tebak-Tebakan Harian hari ini! 🎉 Kembali lagi besok untuk tantangan berikutnya."
          : "Kamu sudah berhasil menjawab tebak-tebakan ini! 🎉",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // 2. Check attempts limit
    const currentAttempts = session.userAttempts?.get(interaction.user.id) ?? 0;
    if (currentAttempts >= 3) {
      await interaction.reply({
        content: "Kesempatan kamu untuk menjawab tebakan ini sudah habis (**3/3**). Coba lagi di tebakan berikutnya!",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const userAnswerRaw = interaction.fields.getTextInputValue("jawaban_user").trim();
    const newAttempts = currentAttempts + 1;
    if (!session.userAttempts) session.userAttempts = new Map<string, number>();
    session.userAttempts.set(interaction.user.id, newAttempts);

    // AI Fuzzy / Semantic Evaluation
    const evalResult = await this.evaluateAnswerWithAi(session.question, userAnswerRaw);

    // Record log for Web Dashboard Backoffice
    if (!session.logs) session.logs = [];
    const userAvatar = interaction.user.displayAvatarURL({ extension: "png", size: 128 });
    session.logs.unshift({
      userId: interaction.user.id,
      username: interaction.user.displayName || interaction.user.username,
      avatarUrl: userAvatar,
      userAnswer: userAnswerRaw,
      evalStatus: evalResult.evalStatus,
      attemptNumber: newAttempts,
      aiReason: evalResult.reason,
      timestamp: new Date().toISOString(),
    });

    if (evalResult.isAccepted) {
      const isFirstDailyWinner = session.isDaily && (!session.answeredUserIds || session.answeredUserIds.size === 0);

      if (!session.answeredUserIds) session.answeredUserIds = new Set<string>();
      session.answeredUserIds.add(interaction.user.id);

      // Base reward points from GuildConfig:
      // 1. First correct answer in daily quiz: 400 points (default)
      // 2. Subsequent correct answer: 300 points (default)
      const config = await prisma.guildConfig.findUnique({ where: { guildId: session.guildId } }).catch(() => null);
      const firstReward = config?.dailyRiddleRewardAmount ?? 400;
      const closeReward = config?.dailyRiddleCloseRewardAmount ?? 300;
      const baseReward = isFirstDailyWinner ? firstReward : closeReward;

      // Deduct 25 points per previous wrong attempt (if answered on 2nd or 3rd try)
      const wrongAttemptDeduction = (newAttempts - 1) * 25;
      const earnedPoints = Math.max(50, baseReward - wrongAttemptDeduction);

      if (session.isDaily) {
        // Daily Mode: Multi-user participation!
        const newDailyScore = await this.addDailyScore(
          session.guildId,
          interaction.user.id,
          interaction.user.displayName || interaction.user.username,
          earnedPoints
        );

        const statusTitle = evalResult.evalStatus === "BENAR" ? "BENAR! 🎉" : "MENDEKATI BENAR! 🎯";
        const positionTitle = isFirstDailyWinner ? "🥇 (Juara 1 Tercepat Hari Ini!)" : "🎯";

        let responseContent = `Jawaban kamu "**${userAnswerRaw}**" ${statusTitle}\n*(Kunci Jawaban: **${session.question.answer}**)*\n\n` +
          `Selamat, **+${earnedPoints} RTK** (Rogatekno Koin) telah ditambahkan ke dompet kamu! ${positionTitle}\n`;

        if (wrongAttemptDeduction > 0) {
          responseContent += `*(Potongan -${wrongAttemptDeduction} RTK karena ${newAttempts - 1}x percobaan salah sebelumnya)*\n`;
        }

        responseContent += `Total Saldo Harian Kamu: **${newDailyScore} RTK**.`;

        await interaction.editReply({ content: responseContent });
      } else {
        // Instant Mode: Single winner closes session
        if (session.timer) clearTimeout(session.timer);
        this.activeSessions.delete(sessionId);

        const newScore = await this.addScore(
          session.guildId,
          interaction.user.id,
          interaction.user.displayName || interaction.user.username,
          earnedPoints
        );

        if (session.messageId && interaction.channel) {
          try {
            const channel = interaction.channel as TextChannel;
            const msg = await channel.messages.fetch(session.messageId);
            if (msg) {
              const statusTitle = evalResult.evalStatus === "BENAR" ? "Dijawab Benar" : "Dijawab Mendekati Benar";
              const winnerEmbed = new EmbedBuilder()
                .setTitle(`Tebak-Tebakan Selesai! (${statusTitle})`)
                .setDescription(
                  `**Pertanyaan**:\n> ${session.question.question}\n\n` +
                  `Pemenang: <@${interaction.user.id}> (+${earnedPoints} RTK)\n` +
                  `Jawaban Kunci: **${session.question.answer}**\n` +
                  `Total Saldo <@${interaction.user.id}>: **${newScore} RTK**`
                )
                .setColor(evalResult.evalStatus === "BENAR" ? "#10B981" : "#F59E0B")
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

        const statusTitle = evalResult.evalStatus === "BENAR" ? "BENAR! 🎉" : "MENDEKATI BENAR! 🎯";
        await interaction.editReply({
          content: `Jawaban kamu "**${userAnswerRaw}**" ${statusTitle}\nSelamat, **+${earnedPoints} RTK** (Rogatekno Koin) telah ditambahkan ke dompet kamu!`,
        });
      }
    } else {
      const remaining = 3 - newAttempts;
      if (remaining > 0) {
        await interaction.editReply({
          content: `Jawaban kamu "**${userAnswerRaw}**" SALAH! ❌ (${evalResult.reason})\n(Kesempatan tersisa: **${remaining}/3** attempt - potongan -15 RTK jika jawaban berikutnya benar)`,
        });
      } else {
        // Failed 3 times (salah semua 3x): Give 15 participation points!
        if (session.isDaily) {
          const newDailyScore = await this.addDailyScore(
            session.guildId,
            interaction.user.id,
            interaction.user.displayName || interaction.user.username,
            15
          );

          await interaction.editReply({
            content: `Jawaban kamu "**${userAnswerRaw}**" SALAH! ❌ (${evalResult.reason})\n\n` +
              `Kesempatan kamu untuk menjawab tebakan harian ini telah habis (**3/3**).\n` +
              `🎁 Kamu tetap mendapatkan **+15 RTK Point** bonus partisipasi! Total Saldo Harian Kamu: **${newDailyScore} RTK**.`,
          });
        } else {
          await interaction.editReply({
            content: `Jawaban kamu "**${userAnswerRaw}**" SALAH! ❌ (${evalResult.reason})\nKesempatan kamu untuk menjawab tebakan ini telah habis (**3/3**). Coba lagi di tebakan berikutnya!`,
          });
        }
      }
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
      .setFooter({ text: "Maya Trivia Engine • Gunakan /tebak main untuk mencoba lagi" })
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
   * Generate dynamic AI Daily Quiz / Riddle using Gemini AI adhering strictly to RECEH DAD JOKES & HUMOR
   */
  private async generateAiTebakQuestion(attempt: number = 1): Promise<TebakQuestion | null> {
    const seedTopics = [
      {
        category: "Plesetan Tokoh & Figur",
        examples: "Bambang tabung gas (pemain bola 3kg), Ariana Grande-grande (penyanyi doyan gorengan), Pasrah Ramadhani, Thibaut Ngorok-tois, Jackie Cedera, Pangeran Di-Beng-Beng-oro, Sungkem-son",
        guide: "Plesetan nama atlet, artis, atau pahlawan populer di Indonesia dengan akhiran/nama belakang kocak."
      },
      {
        category: "Plesetan Nama Kota & Tempat",
        examples: "Purwodaddy (kota bapak-bapak), Salatiga (kota penuh kekeliruan), Halo-mahera (pulau ramah), Es-teh-karta (kota dingin manis), Bohlam-dia (negara lampu pijar), Sumbawa",
        guide: "Plesetan nama kota/daerah/pulau/negara nyata yang diplesetkan secara fonetis mirip kata sehari-hari."
      },
      {
        category: "Logika Konyol & Minuman/Makanan",
        examples: "Kenapa air mata bening? Kalau ijo namanya air matcha; Jus-tru kamu pelakunya; Kue permisi; Buah naga-lupa lirik; Kopi-ndah keyakinan",
        guide: "Komparasi warna/logika konyol yang menggelitik atau plesetan nama jajanan/minuman populer."
      },
      {
        category: "Plesetan Hewan Lucu",
        examples: "Katak beradik (hewan bersaudara), Unta-makan keselamatan (hewan taat lalu lintas), Ikan rem, Bebek kunci stang, Gajah pesek, Kambing pembina upacara",
        guide: "Plesetan nama hewan yang membentuk kata atau peribahasa/slogan Indonesia."
      },
      {
        category: "Logika Terbalik Tongkrongan",
        examples: "Ayam berkokok merem karena udah hafal teksnya; Pohon kelapa ditebang karena kalau dicabut keberatan; Matahari tenggelam karena gak bisa renang; Pintu ditarik bukan didorong; Celana dipotong jadi makin tinggi",
        guide: "Teka-teki logika terbalik yang punchline-nya beralasan sederhana dan tak terbantahkan."
      },
      {
        category: "Plesetan Asmara & Benda Sehari-Hari",
        examples: "Kipastian (kipas yang ditunggu cewek), Minyak-sikan kamu bahagia, Kue-miliki kamu selamanya, Gelas pelaminan, Sepatu-tnya kamu gak ikut campur, Sabun colek",
        guide: "Plesetan benda rumah tangga yang disambungkan ke perasaan hati/status hubungan."
      }
    ];

    // Cycle through varied topics based on attempt and random
    const randomSeed = seedTopics[(Math.floor(Math.random() * seedTopics.length) + attempt) % seedTopics.length];
    const historyList = Array.from(this.askedQuestionHistory).slice(-15).join("; ");

    const systemPrompt = `Kamu adalah komedian legendaris dan master jokes bapak-bapak (dad jokes) khas tongkrongan Indonesia yang sangat kreatif.
Tugasmu menciptakan 1 tebak-tebakan receh yang SANGAT LUCU, MENGGELITIK, dan NYAMBUNG SECARA ALAMI.

ATURAN MUTLAK & PANTANGAN:
1. DILARANG KERAS membuat punchline yang hanya menempelkan 2 kata secara harfiah tanpa rima atau plesetan fonetis! (CONTOH BURUK YANG DILARANG: "sayur bela diri = brokoli silat", "buah pinter = apel jenius"). Itu BUKAN tebakan bapak-bapak!
2. PUNCHLINE JOKES BAPAK-BAPAK WAJIB BERBASIS SALAH SATU:
   - Plesetan nama tokoh/atlet/artis (contoh: Bambang Pamungkas -> Bambang tabung gas).
   - Plesetan nama kota/geografi nyata (contoh: Purwodadi -> Purwodaddy).
   - Komparasi warna/logika absurd (contoh: Air mata bening, kalau ijo namanya air matcha).
   - Plesetan kata/istilah baku (contoh: Kakak beradik -> Katak beradik; Kepastian -> Kipastian).
   - Logika terbalik tongkrongan (contoh: Ayam berkokok merem -> Karena udah hafal teksnya).
3. CLUE (PETUNJUK) WAJIB BERBASIS WORDPLAY & KISI-KISI CERDAS:
   - Clue harus memberikan kisi-kisi cerdas ke arah plesetannya (misal: "Nama depan striker legendaris timnas...", "Plesetan nama kota di Jateng, akhiran kata ayah dalam bahasa Inggris..."), BUKAN mendeskripsikan punchline secara mentah.
4. Jawab HANYA format JSON valid tanpa markdown atau teks pengantar.`;

    const prompt = `
Buatlah 1 tebak-tebakan receh bapak-bapak bertema "${randomSeed.category}".
Panduan: ${randomSeed.guide}
Contoh rima/pola yang diinginkan: ${randomSeed.examples}

HINDARI DUPLIKASI DENGAN RIWAYAT BERIKUT:
[${historyList || "Belum ada"}]

FORMAT JSON WAJIB:
{
  "category": "${randomSeed.category}",
  "question": "Pertanyaan tebakan receh yang menggelitik khas bapak-bapak...",
  "answer": "Jawaban punchline humor yang cerdas dan berima",
  "acceptableAnswers": ["punchline utama", "variasi kata kunci 1", "variasi kata kunci 2"],
  "clue": "Petunjuk wordplay cerdas mengarahkan ke plesetan/rima..."
}
`.trim();

    try {
      const raw = await askGemini(prompt, systemPrompt);
      const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        if (data.question && data.answer && typeof data.question === "string" && typeof data.answer === "string") {
          const acceptable = Array.isArray(data.acceptableAnswers) && data.acceptableAnswers.length > 0
            ? data.acceptableAnswers.map((a: string) => String(a).toLowerCase().trim())
            : [data.answer.toLowerCase().trim()];

          if (!acceptable.includes(data.answer.toLowerCase().trim())) {
            acceptable.push(data.answer.toLowerCase().trim());
          }

          logger.info(`TebakManager: Soal receh murni AI berhasil dibuat: "${data.question}" -> "${data.answer}" (Clue: "${data.clue}")`);

          return {
            id: `ai-q-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            category: data.category || randomSeed.category,
            question: data.question.trim(),
            answer: data.answer.trim(),
            acceptableAnswers: acceptable,
            clue: data.clue?.trim() || "Gunakan logika receh ala jokes bapak-bapak!",
          };
        }
      }
    } catch (error) {
      logger.warn(`TebakManager: Error generating AI riddle via Gemini (attempt ${attempt}):`, error);
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

      const currentScore = existing?.score ?? 0;
      const allowed = await calculateAllowedEarnedPoints(guildId, userId, currentScore, points);

      if (existing) {
        const updated = await prisma.triviaScore.update({
          where: { id: existing.id },
          data: {
            score: existing.score + allowed,
            username,
            participatedTrivia: true,
          },
        });
        addTriviaXp(null, guildId, userId, username, false).catch(() => {});
        return updated.score;
      } else {
        const created = await prisma.triviaScore.create({
          data: {
            guildId,
            userId,
            username,
            score: allowed,
            dailyScore: allowed,
            participatedTrivia: true,
          },
        });
        addTriviaXp(null, guildId, userId, username, false).catch(() => {});
        return created.score;
      }
    } catch (error) {
      logger.error("TebakManager: Error adding score to DB:", error);
      return points;
    }
  }

  /**
   * Add daily quiz score in DB
   */
  public async addDailyScore(guildId: string, userId: string, username: string, points: number): Promise<number> {
    try {
      const todayStr = new Date().toISOString().split("T")[0];
      const existing = await prisma.triviaScore.findUnique({
        where: { guildId_userId: { guildId, userId } },
      });

      const currentScore = existing?.score ?? 0;
      const allowed = await calculateAllowedEarnedPoints(guildId, userId, currentScore, points);

      if (existing) {
        const isNewDay = existing.lastDailyDate !== todayStr;
        const newDaily = isNewDay ? allowed : existing.dailyScore + allowed;

        const isNewQuizDay = existing.lastDailyQuizDate !== todayStr;
        const newDailyQuiz = isNewQuizDay ? allowed : existing.dailyQuizScore + allowed;

        const updated = await prisma.triviaScore.update({
          where: { id: existing.id },
          data: {
            score: existing.score + allowed,
            dailyScore: newDaily,
            dailyQuizScore: newDailyQuiz,
            lastDailyDate: todayStr,
            lastDailyQuizDate: todayStr,
            username,
            participatedTrivia: true,
          },
        });
        addTriviaXp(null, guildId, userId, username, true).catch(() => {});
        return updated.dailyQuizScore;
      } else {
        const created = await prisma.triviaScore.create({
          data: {
            guildId,
            userId,
            username,
            score: allowed,
            dailyScore: allowed,
            dailyQuizScore: allowed,
            lastDailyDate: todayStr,
            lastDailyQuizDate: todayStr,
            participatedTrivia: true,
          },
        });
        addTriviaXp(null, guildId, userId, username, true).catch(() => {});
        return created.dailyQuizScore;
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
        orderBy: [
          { score: "desc" },
          { updatedAt: "asc" }
        ],
        take: 10,
      });

      return scores.map((s) => ({ userId: s.userId, username: s.username, score: s.score }));
    } catch (error) {
      logger.error("TebakManager: Error getting leaderboard:", error);
      return [];
    }
  }

  /**
   * Get Top 10 Daily Quiz Leaderboard
   */
  public async getDailyLeaderboard(guildId: string): Promise<{ userId: string; username: string; dailyScore: number }[]> {
    try {
      const todayStr = new Date().toISOString().split("T")[0];
      const scores = await prisma.triviaScore.findMany({
        where: { guildId, lastDailyQuizDate: todayStr, dailyQuizScore: { gt: 0 } },
        orderBy: [
          { dailyQuizScore: "desc" },
          { updatedAt: "asc" }
        ],
        take: 10,
      });

      return scores.map((s) => ({ userId: s.userId, username: s.username, dailyScore: s.dailyQuizScore }));
    } catch (error) {
      logger.error("TebakManager: Error getting daily leaderboard:", error);
      return [];
    }
  }
}

export const tebakManager = TebakManager.getInstance();
