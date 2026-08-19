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

const QUESTION_BANK: TebakQuestion[] = [
  { id: "q1", category: "Tebak-Tebakan Kekinian", question: "Kenapa HP Android kalau lagi charging tidak bisa diajak jalan-jalan?", answer: "Kabelan", acceptableAnswers: ["kabelan", "karena kabelan", "ke kabelan"], clue: "Plesetan kata kesebelasan..." },
  { id: "q2", category: "Teka-Teki Lucu", question: "Pintu apa yang tidak bisa didorong oleh 10 orang kuat sekalipun?", answer: "Pintu Geser", acceptableAnswers: ["pintu geser", "geser", "sliding door"], clue: "Bukan didorong, tapi..." },
  { id: "q3", category: "Asah Otak Kocak", question: "Makin diisi makin ringan, apakah itu?", answer: "Balon", acceptableAnswers: ["balon", "balon gas"], clue: "Diisi gas/udara ringan." },
  { id: "q4", category: "Plesetan Gaool", question: "Buah apa yang kalau dimakan bikin orang jadi jutawan?", answer: "Buah Pikiran", acceptableAnswers: ["buah pikiran", "pikiran"], clue: "Ide cemerlang menghasilkan bisnis jutaan..." },
  { id: "q5", category: "Tebak-Tebakan Gaul", question: "Mobil apa yang paling panjang di dunia?", answer: "Mobil Antrean", acceptableAnswers: ["mobil antrean", "antrean", "antri"], clue: "Bisa berderet sampai berjam-jam..." },
  { id: "q6", category: "Teka-Teki Santai", question: "Lampu apa yang kalau dipecahkan justru keluar orangnya?", answer: "Lampu Tetangga", acceptableAnswers: ["lampu tetangga", "tetangga"], clue: "Tetangganya pasti keluar marah-marah!" },
  { id: "q7", category: "Plesetan Kopi", question: "Kopi apa yang bikin orang capek?", answer: "Kopian", acceptableAnswers: ["kopian", "ngopi sambil lari"], clue: "Plesetan dari kegiatan memfotokopi rute berulang kali..." },
  { id: "q8", category: "Tebak-Tebakan Hewan", question: "Gajah apa yang belalainya pendek?", answer: "Gajah Pesek", acceptableAnswers: ["gajah pesek", "pesek"], clue: "Beda nasib sama gajah normal..." },
  { id: "q9", category: "Asah Otak", question: "Benda apa yang punya banyak mata tapi tidak bisa melihat?", answer: "Dadu", acceptableAnswers: ["dadu", "dadu kocok"], clue: "Titik-titik di sisinya disebut mata dadu." },
  { id: "q10", category: "Teka-Teki Lucu", question: "Penyanyi luar negeri yang suka belanja di pasar tradisional?", answer: "Justin Beli-ber", acceptableAnswers: ["justin beliber", "justin bieber", "beliber"], clue: "Justin Bieber versi emak-emak..." },
  { id: "q11", category: "Plesetan Makanan", question: "Nasi apa yang paling menakutkan di dunia?", answer: "Nasib", acceptableAnswers: ["nasib", "nasib buruk"], clue: "Bikin kepikiran terus..." },
  { id: "q12", category: "Tebak-Tebakan Gaul", question: "Kenapa mata pencaharian itu disebut pencaharian?", answer: "Karena Terang", acceptableAnswers: ["karena terang", "terang", "pencahayaan"], clue: "Kalau gelap jadi penutup..." },
  { id: "q13", category: "Teka-Teki Santai", question: "Telor apa yang kalau diinjak tidak pecah?", answer: "Telor Tato", acceptableAnswers: ["telor tato", "tato"], clue: "Karena digambar di kulit preman!" },
  { id: "q14", category: "Tebak-Tebakan Hewan", question: "Kucing apa yang paling ditakuti oleh tikus?", answer: "Kucing Beneran", acceptableAnswers: ["kucing beneran", "kucing asli", "kucing"], clue: "Bukan kucing gambar atau mainan." },
  { id: "q15", category: "Asah Otak Kocak", question: "Benda apa yang selalu di depan mata tapi tidak bisa dilihat?", answer: "Bulu Mata", acceptableAnswers: ["bulu mata", "alis"], clue: "Coba tatap tanpa cermin..." },
  { id: "q16", category: "Tebak-Tebakan Gaul", question: "Orang apa yang kalau berenang rambutnya tidak basah?", answer: "Orang Botak", acceptableAnswers: ["orang botak", "botak"], clue: "Karena tidak punya rambut..." },
  { id: "q17", category: "Plesetan Musik", question: "Band apa yang paling tidak suka hujan?", answer: "Slank", acceptableAnswers: ["slank", "selang"], clue: "Plesetan dari selang air..." },
  { id: "q18", category: "Teka-Teki Lucu", question: "Kenapa saat lampu merah kendaraan harus berhenti?", answer: "Karena Direm", acceptableAnswers: ["karena direm", "direm", "rem"], clue: "Kalau tidak direm ya nabrak!" },
  { id: "q19", category: "Tebak-Tebakan AI", question: "Sayur apa yang jago bela diri?", answer: "Bayam Choke", acceptableAnswers: ["bayam choke", "bayam", "kangkung kungfu"], clue: "Plesetan dari martial art..." },
  { id: "q20", category: "Asah Otak", question: "Benda apa yang kalau dipotong malah makin tinggi?", answer: "Celana Panjang", acceptableAnswers: ["celana panjang", "celana"], clue: "Dipotong bagian bawahnya jadi celana pendek/tinggi..." }
];

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

  private async getUniqueQuestion(): Promise<TebakQuestion> {
    let question = await this.generateAiTebakQuestion();
    if (!question) {
      const unused = QUESTION_BANK.filter((q) => !this.askedQuestionHistory.has(q.question.toLowerCase()));
      const pool = unused.length > 0 ? unused : QUESTION_BANK;
      question = pool[Math.floor(Math.random() * pool.length)];
    }
    this.askedQuestionHistory.add(question.question.toLowerCase());
    return question;
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
    const question = await this.getUniqueQuestion();

    const embed = new EmbedBuilder()
      .setTitle(`🧩 TEBAK-TEBAKAN MAYA AI (${question.category})`)
      .setDescription(
        `**Pertanyaan**:\n> ${question.question}\n\n` +
        `💡 **Petunjuk**: ${question.clue || "Gunakan logika gaul & out of the box!"}\n\n` +
        `Waktu menjawab: **45 detik**. Setiap member memiliki **3x kesempatan** untuk menjawab!\n` +
        `Klik tombol **Jawab Tebak-Tebakan** di bawah ini!`
      )
      .setColor("#3B82F6")
      .setFooter({ text: "Maya Trivia Engine • Tekan tombol untuk menjawab" })
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
    const question = await this.getUniqueQuestion();

    const embed = new EmbedBuilder()
      .setTitle(`📢 TEBAK-TEBAKAN HARIAN MAYA AI (${question.category})`)
      .setDescription(
        `**Pertanyaan Hari Ini**:\n> ${question.question}\n\n` +
        `💡 **Petunjuk**: ${question.clue || "Gunakan logika gaul & out of the box!"}\n\n` +
        `Setiap anggota server memiliki **3x kesempatan** untuk menjawab tebakan hari ini & mendapatkan koin RTK!\n` +
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

    // Call NVIDIA AI for Fuzzy / Semantic Similarity Evaluation
    const systemPrompt =
      "Anda adalah juri kuis tebak-tebakan Bahasa Indonesia yang cerdas. Tugas Anda adalah menilai apakah jawaban peserta BENAR (tepat/sinonim jelas), MENDEKATI (hampir tepat/plesetan mirip/ide pokok sama), atau SALAH (berbeda jauh). Jawab HANYA JSON valid.";

    const prompt = `
Pertanyaan Kuis: "${question.question}"
Jawaban Kunci: "${question.answer}"
Kata Kunci Lain Yang Diterima: ${JSON.stringify(question.acceptableAnswers)}

Jawaban Diinput Peserta: "${userAnswer}"

Tugas Evaluasi:
- "BENAR": jika persis/sinonim jelas.
- "MENDEKATI": jika hampir tepat, typo ringan, plesetan mirip, atau bermaksud sama.
- "SALAH": jika berbeda jauh.

Format JSON wajib:
{
  "status": "BENAR" / "MENDEKATI" / "SALAH",
  "reason": "Alasan singkat 1 kalimat..."
}
`.trim();

    try {
      const raw = await askNvidia(prompt, systemPrompt);
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
          reason: data.reason || (isAccepted ? "Jawaban mendekati kebenaran." : "Jawaban belum tepat."),
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

      // Base reward points:
      // 1. First correct answer in daily quiz: 150 points
      // 2. Subsequent correct answer: 120 points
      const baseReward = isFirstDailyWinner ? 150 : 120;

      // Deduct 15 points per previous wrong attempt (if answered on 2nd or 3rd try)
      const wrongAttemptDeduction = (newAttempts - 1) * 15;
      const earnedPoints = Math.max(15, baseReward - wrongAttemptDeduction);

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
   * Generate dynamic AI riddle using NVIDIA AI with random themes & history tracking
   */
  private async generateAiTebakQuestion(): Promise<TebakQuestion | null> {
    const themes = [
      "Plesetan Nama Artis & Tokoh Dunia",
      "Plesetan Makanan & Minuman Kekinian",
      "Tebak-Tebakan Teknologi & HP",
      "Teka-Teki Logika Out of the Box",
      "Plesetan Hewan & Alam",
      "Tebak-Tebakan Gaul Gen-Z & Tongkrongan",
      "Plesetan Judul Lagu & Film Populer",
      "Tebak-Tebakan Kehidupan Sehari-hari",
    ];
    const randomTheme = themes[Math.floor(Math.random() * themes.length)];
    const historyList = Array.from(this.askedQuestionHistory).slice(-20).join("; ");

    const prompt = `
Buatkan 1 pertanyaan tebak-tebakan bahasa Indonesia bertema "${randomTheme}" yang SANGAT LUCU, KEKINIAN (Gen-Z / Gaul / Plesetan Cerdas), dan TIDAK GARING!
PENTING: Pertanyaan HARUS BARU & UNIK! JANGAN gunakan tebakan yang pernah dipakai baru-baru ini berikut:
[${historyList || "Belum ada"}]

Jawab dalam format JSON persis seperti berikut tanpa teks tambahan apapun:
{
  "category": "${randomTheme}",
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
            category: data.category || randomTheme,
            question: data.question,
            answer: data.answer,
            acceptableAnswers: acceptable,
            clue: data.clue || "Gunakan logika gaul & out of the box!",
          };
        }
      }
    } catch (error) {
      logger.error("TebakManager: Error generating AI riddle via NVIDIA:", error);
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
   * Get Top 10 Daily Leaderboard
   */
  public async getDailyLeaderboard(guildId: string): Promise<{ userId: string; username: string; dailyScore: number }[]> {
    try {
      const todayStr = new Date().toISOString().split("T")[0];
      const scores = await prisma.triviaScore.findMany({
        where: { guildId, lastDailyDate: todayStr, dailyScore: { gt: 0 } },
        orderBy: [
          { dailyScore: "desc" },
          { updatedAt: "asc" }
        ],
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
