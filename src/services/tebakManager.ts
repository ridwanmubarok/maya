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
  { id: "q1", category: "Benda Sehari-Hari", question: "Benda apa yang selalu dibawa saat hujan agar tubuh tidak basah?", answer: "Payung", acceptableAnswers: ["payung", "jas hujan"], clue: "Bisa dibuka saat hujan dan dilipat saat kering." },
  { id: "q2", category: "Benda Sehari-Hari", question: "Alat makan apa yang biasanya digunakan untuk mengambil kuah atau sup?", answer: "Sendok", acceptableAnswers: ["sendok", "sendok makan", "centong"], clue: "Bentuknya cekung dan memiliki gagang." },
  { id: "q3", category: "Benda Sehari-Hari", question: "Alat apa yang digunakan untuk merapikan dan menyisir rambut setelah mandi?", answer: "Sisir", acceptableAnswers: ["sisir", "sisir rambut"], clue: "Memiliki banyak gerigi rapat untuk merapikan rambut." },
  { id: "q4", category: "Benda Sehari-Hari", question: "Benda apa yang digunakan untuk mengeringkan badan sehabis mandi?", answer: "Handuk", acceptableAnswers: ["handuk", "handuk mandi"], clue: "Terbuat dari kain yang menyerap air." },
  { id: "q5", category: "Benda Sehari-Hari", question: "Benda apa yang menunjukkan waktu dan biasanya dipasang di dinding atau dipakai di pergelangan tangan?", answer: "Jam", acceptableAnswers: ["jam", "jam tangan", "jam dinding", "arloji"], clue: "Memiliki angka dan jarum yang terus berputar." },
  { id: "q6", category: "Makanan & Minuman", question: "Bahan makanan apa yang dihasilkan oleh ayam dan sering digoreng ceplok atau dadar untuk sarapan?", answer: "Telur", acceptableAnswers: ["telur", "telur ayam", "telor"], clue: "Memiliki cangkang, putih telur, dan kuning telur." },
  { id: "q7", category: "Makanan & Minuman", question: "Minuman berwarna hitam dengan aroma khas yang sering diminum di pagi hari untuk menghilangkan rasa kantuk?", answer: "Kopi", acceptableAnswers: ["kopi", "kopi hitam", "espresso"], clue: "Diseduh dari biji yang disangrai dan mengandung kafein." },
  { id: "q8", category: "Makanan & Minuman", question: "Makanan pokok orang Indonesia yang berasal dari beras yang telah dimasak?", answer: "Nasi", acceptableAnswers: ["nasi", "nasi putih"], clue: "Dimasak menggunakan rice cooker atau dandang." },
  { id: "q9", category: "Makanan & Minuman", question: "Buah berwarna kuning berbentuk melengkung yang sangat disukai monyet?", answer: "Pisang", acceptableAnswers: ["pisang", "buah pisang"], clue: "Kulitnya dikupas sebelum dimakan dan dagingnya manis lembut." },
  { id: "q10", category: "Makanan & Minuman", question: "Cairan putih bergizi yang dihasilkan oleh sapi atau kambing dan baik untuk pertumbuhan tulang?", answer: "Susu", acceptableAnswers: ["susu", "susu sapi", "susu murni"], clue: "Kaya akan kalsium dan sering diminum anak-anak." },
  { id: "q11", category: "Hewan & Alam", question: "Hewan mamalia berbelalai panjang dan bertubuh sangat besar yang memiliki gading?", answer: "Gajah", acceptableAnswers: ["gajah", "gajah sumatera"], clue: "Memiliki telinga lebar dan belalai untuk mengambil makanan." },
  { id: "q12", category: "Hewan & Alam", question: "Hewan peliharaan berkaki empat yang suka mengeong dan berburu tikus?", answer: "Kucing", acceptableAnswers: ["kucing", "kucing anggora", "kucing kampung"], clue: "Hewan berbulu dengan cakar tajam dan suara 'meong'." },
  { id: "q13", category: "Hewan & Alam", question: "Hewan yang dijuluki sebagai raja hutan dan memiliki auman yang sangat keras?", answer: "Singa", acceptableAnswers: ["singa", "raja hutan"], clue: "Pejantannya memiliki surai lebat di sekeliling kepala." },
  { id: "q14", category: "Hewan & Alam", question: "Burung malam yang bisa memutar kepalanya hampir 270 derajat dan aktif berburu saat gelap?", answer: "Burung Hantu", acceptableAnswers: ["burung hantu", "hantu"], clue: "Memiliki mata besar yang tajam di malam hari." },
  { id: "q15", category: "Hewan & Alam", question: "Reptil yang bisa mengubah warna kulitnya sesuai dengan lingkungan tempat ia menempel?", answer: "Bunglon", acceptableAnswers: ["bunglon"], clue: "Ahli berkamuflase di dedaunan dan batang pohon." },
  { id: "q16", category: "Profesi & Aktivitas", question: "Profesi seseorang yang bertugas mengemudikan dan menerbangkan pesawat terbang?", answer: "Pilot", acceptableAnswers: ["pilot", "penerbang"], clue: "Bekerja di dalam kokpit pesawat dan memakai seragam khusus." },
  { id: "q17", category: "Profesi & Aktivitas", question: "Profesi medis yang bertugas memeriksa, mengobati pasien yang sakit, dan meresepkan obat?", answer: "Dokter", acceptableAnswers: ["dokter", "dokter umum"], clue: "Bekerja di rumah sakit atau klinik dan sering memakai stetoskop." },
  { id: "q18", category: "Profesi & Aktivitas", question: "Profesi yang bertugas mendidik, mengajar, dan membimbing murid-murid di sekolah?", answer: "Guru", acceptableAnswers: ["guru", "pengajar", "guru sekolah"], clue: "Berdiri di depan kelas menjelaskan materi pelajaran." },
  { id: "q19", category: "Profesi & Aktivitas", question: "Petugas yang bertugas memadamkan api saat terjadi kebakaran besar di pemukiman?", answer: "Pemadam Kebakaran", acceptableAnswers: ["pemadam kebakaran", "pemadam", "damkar"], clue: "Mengendarai mobil merah dengan sirine kencang dan selang air besar." },
  { id: "q20", category: "Profesi & Aktivitas", question: "Aktivitas membersihkan tubuh menggunakan air dan sabun yang dilakukan minimal dua kali sehari?", answer: "Mandi", acceptableAnswers: ["mandi"], clue: "Dilakukan di kamar mandi sehabis bangun tidur atau beraktivitas." },
  { id: "q21", category: "Tempat & Lingkungan", question: "Tempat berisi banyak buku yang dipinjamkan kepada masyarakat atau pelajar untuk dibaca dengan tenang?", answer: "Perpustakaan", acceptableAnswers: ["perpustakaan", "perpus"], clue: "Suasananya harus hening dan rak-raknya penuh dengan buku." },
  { id: "q22", category: "Tempat & Lingkungan", question: "Tempat bertemunya penjual dan pembeli untuk bertransaksi sayuran, buah, daging, dan kebutuhan pokok?", answer: "Pasar", acceptableAnswers: ["pasar", "pasar tradisional", "pasar modern", "supermarket"], clue: "Tempat ramai tawar-menawar bahan makanan." },
  { id: "q23", category: "Tempat & Lingkungan", question: "Tempat tinggal dan habitat alami pohon-pohon lebat tempat hidup berbagai satwa liar?", answer: "Hutan", acceptableAnswers: ["hutan", "rimba"], clue: "Sering disebut sebagai paru-paru dunia karena menghasilkan oksigen." },
  { id: "q24", category: "Tempat & Lingkungan", question: "Hamparan perairan asin sangat luas yang memisahkan pulau-pulau di bumi?", answer: "Laut", acceptableAnswers: ["laut", "lautan", "samudra"], clue: "Airnya berasa asin dan memiliki ombak serta terumbu karang." },
  { id: "q25", category: "Tempat & Lingkungan", question: "Tempat landasan pacu pesawat untuk lepas landas dan mendarat?", answer: "Bandara", acceptableAnswers: ["bandara", "bandar udara", "airport"], clue: "Tempat penumpang naik pesawat terbang." },
  { id: "q26", category: "Pengetahuan Umum", question: "Planet tempat manusia dan makhluk hidup tinggal dalam tata surya kita?", answer: "Bumi", acceptableAnswers: ["bumi", "planet bumi", "earth"], clue: "Planet ketiga dari matahari yang kaya akan air dan oksigen." },
  { id: "q27", category: "Pengetahuan Umum", question: "Bintang terdekat dari bumi yang menjadi sumber utama cahaya dan panas di siang hari?", answer: "Matahari", acceptableAnswers: ["matahari", "surya", "sun"], clue: "Terbit di sebelah timur dan terbenam di sebelah barat." },
  { id: "q28", category: "Pengetahuan Umum", question: "Warna yang melambangkan kesucian pada bendera pusaka Republik Indonesia?", answer: "Putih", acceptableAnswers: ["putih"], clue: "Pasangan dari warna merah yang melambangkan keberanian." },
  { id: "q29", category: "Pengetahuan Umum", question: "Ibu kota negara Indonesia saat ini?", answer: "Jakarta", acceptableAnswers: ["jakarta", "dki jakarta", "ikn", "nusantara"], clue: "Kota metropolitan terbesar tempat berdirinya Monumen Nasional (Monas)." },
  { id: "q30", category: "Pengetahuan Umum", question: "Mata uang resmi yang digunakan di negara Indonesia?", answer: "Rupiah", acceptableAnswers: ["rupiah", "idr"], clue: "Memiliki simbol Rp dan pecahan koin serta kertas." },
  { id: "q31", category: "Teka-Teki Logika", question: "Benda apa yang memiliki lubang kunci dan digunakan untuk membuka gembok atau pintu rumah?", answer: "Kunci", acceptableAnswers: ["kunci", "anak kunci"], clue: "Terbuat dari logam kecil bergerigi dan sering digantung bersama gantungan." },
  { id: "q32", category: "Teka-Teki Logika", question: "Benda apa yang selalu diisi udara, jika diisi terus akan meletus, dan sering ada di pesta ulang tahun?", answer: "Balon", acceptableAnswers: ["balon", "balon karet"], clue: "Bisa ditiup hingga bulat dan melayang jika diisi gas helium." },
  { id: "q33", category: "Teka-Teki Logika", question: "Alat tulis yang tintanya bisa dihapus menggunakan penghapus karet?", answer: "Pensil", acceptableAnswers: ["pensil", "pensil kayu", "pensil 2b"], clue: "Terbuat dari kayu berisi grafit hitam yang harus diraut jika tumpul." },
  { id: "q34", category: "Teka-Teki Logika", question: "Alat pemotong yang terdiri dari dua bilah pisau yang dihubungkan di tengah dan digerakkan dengan jari?", answer: "Gunting", acceptableAnswers: ["gunting", "gunting kertas"], clue: "Digunakan untuk memotong kertas, kain, atau rambut." },
  { id: "q35", category: "Teka-Teki Logika", question: "Benda kaca yang memantulkan bayangan diri kita dengan sangat jelas?", answer: "Cermin", acceptableAnswers: ["cermin", "kaca cermin", "kaca"], clue: "Dipakai saat bersolek atau menyisir rambut untuk melihat wajah sendiri." },
  { id: "q36", category: "Fenomena Alam", question: "Lengkungan warna-warni indah di langit yang sering muncul setelah hujan reda dan terkena sinar matahari?", answer: "Pelangi", acceptableAnswers: ["pelangi", "mejikuhibiniu"], clue: "Terdiri dari spektrum warna merah, jingga, kuning, hijau, biru, nila, dan ungu." },
  { id: "q37", category: "Fenomena Alam", question: "Peristiwa turunnya butiran air dari langit akibat kondensasi uap air di awan?", answer: "Hujan", acceptableAnswers: ["hujan", "gerimis"], clue: "Membuat tanah basah dan udara menjadi dingin." },
  { id: "q38", category: "Fenomena Alam", question: "Cahaya kilat terang yang menyambar di langit saat badai dan disusul suara guntur menggelegar?", answer: "Petir", acceptableAnswers: ["petir", "halilintar", "kilat"], clue: "Aliran listrik alami bertegangan tinggi di langit." },
  { id: "q39", category: "Benda Sehari-Hari", question: "Alat penerangan portabel yang menggunakan baterai dan tombol saklar untuk menerangi jalan saat mati lampu?", answer: "Senter", acceptableAnswers: ["senter", "lampu senter", "flashlight"], clue: "Bisa digenggam di tangan dan mengarahkan sorot cahaya ke depan." },
  { id: "q40", category: "Benda Sehari-Hari", question: "Alat alas kaki yang digunakan untuk melindungi kaki saat berjalan di luar ruangan, biasanya berpasangan dengan kaus kaki?", answer: "Sepatu", acceptableAnswers: ["sepatu", "sneakers"], clue: "Diikat dengan tali sepatu dan dipakai saat ke sekolah atau bekerja." },
  { id: "q41", category: "Makanan & Minuman", question: "Bumbu dapur berwarna putih yang memberikan rasa asin pada masakan dan berasal dari air laut?", answer: "Garam", acceptableAnswers: ["garam", "garam dapur"], clue: "Bumbu utama penambah rasa asin pada makanan." },
  { id: "q42", category: "Makanan & Minuman", question: "Bahan pemanis alami berwarna putih atau kecokelatan yang dibuat dari tebu?", answer: "Gula", acceptableAnswers: ["gula", "gula pasir", "gula tebu"], clue: "Dicampurkan ke dalam teh atau kopi untuk memberikan rasa manis." },
  { id: "q43", category: "Hewan & Alam", question: "Serangga kecil yang hidup berkelompok, sangat rajin bekerja sama, dan suka dengan makanan manis?", answer: "Semut", acceptableAnswers: ["semut", "semut merah", "semut hitam"], clue: "Sering berjalan beriringan di dinding dan mengerubungi gula." },
  { id: "q44", category: "Hewan & Alam", question: "Serangga bersayap indah warna-warni yang bermula dari ulat dan kepompong?", answer: "Kupu-Kupu", acceptableAnswers: ["kupu-kupu", "kupu kupu"], clue: "Suka hinggap di bunga untuk menghisap nektar." },
  { id: "q45", category: "Benda Sehari-Hari", question: "Alat elektronik yang digunakan untuk mendinginkan dan mengawetkan makanan serta membuat es batu?", answer: "Kulkas", acceptableAnswers: ["kulkas", "lemari es", "freezer"], clue: "Memiliki pintu dengan suhu dingin di bagian dalamnya." },
  { id: "q46", category: "Benda Sehari-Hari", question: "Benda empuk yang diletakkan di bawah kepala saat tidur di atas kasur?", answer: "Bantal", acceptableAnswers: ["bantal", "bantal tidur"], clue: "Diberi sarung bantal dan membuat leher nyaman saat tidur." },
  { id: "q47", category: "Benda Sehari-Hari", question: "Alat komunikasi pintar yang dapat digunakan untuk menelepon, berkirim pesan, dan berselancar di internet?", answer: "Handphone", acceptableAnswers: ["handphone", "hp", "smartphone", "ponsel", "telepon genggam"], clue: "Memiliki layar sentuh dan dibawa ke mana-mana di saku." },
  { id: "q48", category: "Profesi & Aktivitas", question: "Orang yang berlayar ke laut untuk menangkap ikan menggunakan jaring atau perahu?", answer: "Nelayan", acceptableAnswers: ["nelayan", "penangkap ikan"], clue: "Bekerja di perahu menjala ikan di laut malam hari." },
  { id: "q49", category: "Profesi & Aktivitas", question: "Orang yang bekerja menanam padi, sayuran, dan mengelola sawah atau ladang?", answer: "Petani", acceptableAnswers: ["petani", "petani sawah"], clue: "Sering memakai caping dan mencangkul di sawah." },
  { id: "q50", category: "Pengetahuan Umum", question: "Gas yang dihirup oleh manusia saat bernapas untuk bertahan hidup?", answer: "Oksigen", acceptableAnswers: ["oksigen", "o2", "udara"], clue: "Dihasilkan oleh tumbuhan melalui proses fotosintesis." }
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
    if (!question || this.askedQuestionHistory.has(question.question.trim().toLowerCase())) {
      const unused = QUESTION_BANK.filter((q) => !this.askedQuestionHistory.has(q.question.trim().toLowerCase()));
      const pool = unused.length > 0 ? unused : QUESTION_BANK;
      // If all questions in pool were exhausted, refresh history
      if (unused.length === 0) {
        this.askedQuestionHistory.clear();
      }
      question = pool[Math.floor(Math.random() * pool.length)];
    }
    this.askedQuestionHistory.add(question.question.trim().toLowerCase());
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
      .setTitle(`🧩 TEBAK-TEBAKAN MAYA (${question.category})`)
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
      .setTitle(`📢 TEBAK-TEBAKAN HARIAN MAYA (${question.category})`)
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
      content: "@everyone @here **Tebak-Tebakan Harian Maya telah rilis!** Ayo jawab dan kumpulkan poin harian kamu!",
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
   * Generate dynamic AI Daily Quiz / Riddle using NVIDIA AI adhering strictly to DAILY QUIZ RULES
   */
  private async generateAiTebakQuestion(): Promise<TebakQuestion | null> {
    const seedTopics = [
      { category: "Alat Dapur & Alat Makan", examples: "garpu, wajan, teko, pisau dapur, mangkuk, blender, parutan kelapa, sendok" },
      { category: "Elektronik & Peralatan Rumah", examples: "kulkas, kipas angin, televisi, setrika, mesin cuci, lampu bohlam, AC" },
      { category: "Peralatan Belajar & Kantor", examples: "penghapus, pulpen, penggaris, buku tulis, stapler, kalkulator, gunting" },
      { category: "Pakaian & Aksesoris", examples: "kacamata, ikat pinggang, topi, jaket, kaus kaki, payung, jam tangan, sepatu" },
      { category: "Bahan Makanan & Sayuran", examples: "wortel, kentang, cabai, bawang merah, bayam, telur, tempe, jagung" },
      { category: "Buah-buahan Populer", examples: "semangka, apel, mangga, jeruk, kelapa, pisang, alpukat, nanas" },
      { category: "Minuman Sehari-Hari", examples: "kopi, teh hangat, susu, jus buah, air kelapa muda, madu" },
      { category: "Dunia Satwa & Hewan", examples: "gajah, kelinci, harimau, kuda, monyet, kucing, lumba-lumba, burung hantu, pinguin" },
      { category: "Profesi & Pekerjaan", examples: "dokter, guru, koki, arsitek, pemadam kebakaran, polisi, nelayan, petani, pilot" },
      { category: "Fenomena Alam & Cuaca", examples: "pelangi, hujan, petir, kabut, gerhana matahari, ombak pantai, embun pagi" },
      { category: "Tempat Umum & Bangunan", examples: "perpustakaan, bandara, stasiun kereta, rumah sakit, museum, pasar, bioskop" }
    ];

    const randomSeed = seedTopics[Math.floor(Math.random() * seedTopics.length)];
    const historyList = Array.from(this.askedQuestionHistory).slice(-25).join("; ");

    const systemPrompt = `Kamu adalah pembuat soal Daily Quiz profesional. Tugasmu membuat soal kuis yang masuk akal, menyenangkan, mudah dipahami, dan dapat ditebak oleh manusia secara logis.
PRINSIP UTAMA:
LOGIKA > KEUNIKAN
KEJELASAN > KERUMITAN
NATURAL > DIPAKSA
COMMON SENSE > ASOSIASI RANDOM`;

    const prompt = `
## DAILY QUIZ — QUESTION GENERATOR RULES

Kamu bertugas membuat 1 soal Daily Quiz bertema "${randomSeed.category}" (Contoh objek seputar: ${randomSeed.examples}) yang **masuk akal, menyenangkan, mudah dipahami, dan dapat ditebak oleh manusia**.

Tujuan utama bukan membuat soal yang terlihat unik, tetapi membuat **pertanyaan, jawaban, dan clue yang memiliki hubungan yang kuat dan natural**.

### 1. ATURAN UTAMA
Setiap soal WAJIB memenuhi hubungan:
**QUESTION → ANSWER → CLUE**
Ketiganya harus saling terhubung secara logis.
Jangan pernah memaksakan hubungan antara pertanyaan, jawaban, dan clue hanya agar soal tetap memiliki jawaban.
Jika sebuah jawaban terasa tidak cocok dengan pertanyaan atau clue, BUANG soal tersebut dan buat soal baru.

### 2. JAWABAN HARUS NATURAL
Jawaban harus merupakan jawaban yang secara wajar akan diberikan manusia ketika membaca pertanyaan.
Prioritaskan: benda sehari-hari, makanan, hewan, tempat, aktivitas, profesi, fenomena umum, istilah populer, fakta ringan, hal yang familiar bagi pengguna.
Hindari jawaban yang:
- tidak berhubungan dengan pertanyaan
- terlalu abstrak
- terlalu dipaksakan
- hanya cocok karena permainan kata
- merupakan asosiasi yang sangat jauh
- muncul hanya karena memiliki satu kata yang mirip dengan clue
- membutuhkan penjelasan panjang agar terlihat benar

### 3. CLUE HARUS BENAR-BENAR MEMBANTU
Clue bukan sekadar kalimat yang mempunyai hubungan samar dengan jawaban.
Clue harus memberikan petunjuk nyata yang mengarah langsung ke jawaban, tanpa menyebut kata kuncinya.

### 4. JANGAN MEMAKSA PLESETAN ATAU PERMAINAN KATA
DILARANG menggunakan plesetan yang tidak wajar, asosiasi kata yang jauh, atau jawaban yang aneh/tidak masuk akal.

### 5. GUNAKAN COMMON-SENSE CHECK (PENTING)
Sebelum soal dibuat, pastikan:
- CHECK A — QUESTION: Pertanyaan jelas, deskriptif, dan tidak ambigu.
- CHECK B — ANSWER: Jawaban benar-benar menjawab pertanyaan secara wajar dan umum.
- CHECK C — CLUE: Clue memberikan petunjuk yang sangat relevan dan membantu.
- CHECK D — CONSISTENCY: Pertanyaan, jawaban, dan clue membentuk satu konteks yang konsisten.
- CHECK E — HUMAN GUESSABILITY: Manusia normal dapat dengan mudah menebak jawabannya begitu membaca pertanyaan dan clue.
- CHECK F — NO FORCING: Jawaban terasa 100% masuk akal tanpa butuh penjelasan tambahan.

### 6. PRIORITASKAN JAWABAN YANG PALING UMUM & FAMILIAR
Pilih objek yang paling umum dijumpai dalam kehidupan sehari-hari.

### 7. JANGAN MENGARANG FAKTA
Gunakan fakta pengetahuan umum yang benar dan dapat diverifikasi.

### 8. HINDARI SOAL DENGAN BANYAK JAWABAN BENAR
JANGAN membuat pertanyaan terbuka yang bisa dijawab dengan ratusan hal berbeda.
BUAT pertanyaan deskriptif yang memiliki 1 target jawaban pasti!

### 9. CARA KERJA DAN URUTAN BERPIKIR (WAJIB DIIKUTI):
1. **Tentukan 1 Target Jawaban Spesifik**: Pilih 1 benda, hewan, makanan, profesi, atau aktivitas yang sangat umum dan familiar (misal: "Gunting", "Handuk", "Kucing", "Dokter", "Telur", "Sepatu", "Kacamata", "Garam").
2. **Buat Pertanyaan Deskriptif**: Tulis deskripsi fungsi, bentuk, atau ciri khas utama objek tersebut secara jelas sehingga pembaca langsung terarah ke objek itu.
3. **Buat Clue Relevan**: Tulis petunjuk tambahan yang nyata membantu mengonfirmasi jawaban tanpa membocorkan kata kuncinya secara langsung.

### 10. CONTOH-CONTOH SOAL VALID (JADIKAN PATOKAN):
- **Contoh 1 (Benda)**:
  - Pertanyaan: "Alat apa yang digunakan untuk mengeringkan badan sehabis mandi?"
  - Jawaban: "Handuk"
  - Clue: "Terbuat dari kain berpori halus yang sangat menyerap air."
- **Contoh 2 (Makanan)**:
  - Pertanyaan: "Bahan makanan bercangkang yang dihasilkan ayam dan sering digoreng dadar atau ceplok?"
  - Jawaban: "Telur"
  - Clue: "Memiliki bagian putih dan kuning di dalamnya."
- **Contoh 3 (Profesi)**:
  - Pertanyaan: "Profesi medis yang memeriksa pasien yang sakit dan memberikan resep obat di rumah sakit?"
  - Jawaban: "Dokter"
  - Clue: "Sering memakai jas putih dan stetoskop di lehernya."
- **Contoh 4 (Benda)**:
  - Pertanyaan: "Alat pemotong yang memiliki dua bilah pisau bertemu di tengah dan digerakkan dengan jari?"
  - Jawaban: "Gunting"
  - Clue: "Sering digunakan untuk memotong kertas, kain, atau rambut."

### 11. ANTI-DUPLIKASI
Hindari pertanyaan yang mirip dengan riwayat ini:
[${historyList || "Belum ada"}]

Jawab HANYA dalam format JSON persis seperti berikut tanpa teks atau markdown tambahan apapun:
{
  "category": "${randomSeed.category}",
  "question": "Pertanyaan deskriptif yang jelas dan mengarah pasti ke target...",
  "answer": "Jawaban natural dan umum",
  "acceptableAnswers": ["jawaban utama", "sinonim wajar 1", "sinonim wajar 2"],
  "clue": "Clue yang relevan dan nyata membantu..."
}
`.trim();

    try {
      const raw = await askNvidia(prompt, systemPrompt);
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        if (data.question && data.answer) {
          // Double-check validation filter with AI (Common-Sense Verification)
          const validationPrompt = `Tinjau apakah soal kuis tebak-tebakan berikut logis, natural, dan masuk akal bagi manusia:
Pertanyaan: "${data.question}"
Jawaban: "${data.answer}"
Clue: "${data.clue}"

Kriteria:
1. Hubungan QUESTION -> ANSWER -> CLUE harus 100% natural, logis, dan saling terhubung.
2. Tidak ada deskripsi aneh, mengada-ada, atau dipaksakan.
3. Jawaban benar-benar tepat untuk menjawab pertanyaan.

Jawab HANYA 1 KATA: "VALID" jika lolos, atau "INVALID" jika aneh/tidak pas.`;

          const checkRes = await askNvidia(validationPrompt, "Kamu adalah juri validator logika kuis yang sangat teliti.");
          const isLogicallyValid = checkRes.toUpperCase().includes("VALID") && !checkRes.toUpperCase().includes("INVALID");

          if (!isLogicallyValid) {
            logger.warn(`TebakManager: Soal AI dibuang karena gagal Common-Sense check: [Q: "${data.question}" | A: "${data.answer}"] -> Validator: "${checkRes.trim()}"`);
            return null;
          }

          const acceptable = Array.isArray(data.acceptableAnswers) && data.acceptableAnswers.length > 0
            ? data.acceptableAnswers.map((a: string) => a.toLowerCase())
            : [data.answer.toLowerCase()];

          if (!acceptable.includes(data.answer.toLowerCase())) {
            acceptable.push(data.answer.toLowerCase());
          }

          logger.info(`TebakManager: Soal AI VALID dibuat: "${data.question}" -> "${data.answer}" (Clue: "${data.clue}")`);

          return {
            id: `ai-q-${Date.now()}`,
            category: data.category || randomSeed.category,
            question: data.question,
            answer: data.answer,
            acceptableAnswers: acceptable,
            clue: data.clue || "Perhatikan petunjuk konteks pertanyaan dengan seksama.",
          };
        }
      }
    } catch (error) {
      logger.error("TebakManager: Error generating AI Daily Quiz via NVIDIA:", error);
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
   * Add daily quiz score in DB
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

        const isNewQuizDay = existing.lastDailyQuizDate !== todayStr;
        const newDailyQuiz = isNewQuizDay ? points : existing.dailyQuizScore + points;

        const updated = await prisma.triviaScore.update({
          where: { id: existing.id },
          data: {
            score: existing.score + points,
            dailyScore: newDaily,
            dailyQuizScore: newDailyQuiz,
            lastDailyDate: todayStr,
            lastDailyQuizDate: todayStr,
            username,
          },
        });
        return updated.dailyQuizScore;
      } else {
        const created = await prisma.triviaScore.create({
          data: {
            guildId,
            userId,
            username,
            score: points,
            dailyScore: points,
            dailyQuizScore: points,
            lastDailyDate: todayStr,
            lastDailyQuizDate: todayStr,
          },
        });
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
