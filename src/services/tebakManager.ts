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
import { calculateAllowedEarnedPoints } from "./monthlySeasonManager";
import { addTriviaXp } from "./levelingManager";

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
  { id: "q1", category: "Jokes Bapak-Bapak", question: "Kenapa ayam kalau berkokok matanya merem?", answer: "Karena udah hafal teksnya", acceptableAnswers: ["hafal teks", "hafal teksnya", "udah hafal teksnya", "karena hafal teks", "karena sudah hafal teks", "udah hafal liriknya", "hafal lirik"], clue: "Coba bayangkan kalau kamu nyanyi lagu yang udah sering banget dinyanyikan." },
  { id: "q2", category: "Plesetan Hewan", question: "Hewan apa yang bersaudara?", answer: "Katak beradik", acceptableAnswers: ["katak beradik", "katak", "kodok beradik"], clue: "Plesetan dari hubungan keluarga: kakak dan..." },
  { id: "q3", category: "Plesetan Hewan", question: "Hewan apa yang paling hening dan gak pernah berisik?", answer: "Semute", acceptableAnswers: ["semute", "semut", "se mute"], clue: "Hewan kecil yang tombol audionya dimatikan di Zoom atau Discord." },
  { id: "q4", category: "Teka-Teki Receh", question: "Pintu apa yang didorong sama 10 orang berotot pun nggak bakal kebuka?", answer: "Pintu yang tulisannya TARIK", acceptableAnswers: ["pintu tarik", "pintu tulisan tarik", "tarik", "pintu geser"], clue: "Lihat instruksi yang tertempel jelas di gagang pintunya!" },
  { id: "q5", category: "Humor Sehari-Hari", question: "Pocong apa yang paling disenangi sama ibu-ibu?", answer: "Pocongan harga", acceptableAnswers: ["pocongan harga", "potongan harga", "diskon"], clue: "Plesetan dari diskon belanja saat ada promo supermarket." },
  { id: "q6", category: "Plesetan Romantis", question: "Kipas apa yang paling ditunggu-tunggu sama cewek?", answer: "Kipastian", acceptableAnswers: ["kipastian", "kepastian", "kepastian hubungan"], clue: "Bukan kipas angin, tapi sesuatu yang bikin hubungan gak digantung!" },
  { id: "q7", category: "Jokes Bapak-Bapak", question: "Lemari apa yang muat dan bisa masuk ke dalam kantong celana?", answer: "Lemaribuan", acceptableAnswers: ["lemaribuan", "lima ribuan", "uang lima ribu", "limaribuan", "uang 5000", "5000"], clue: "Plesetan dari uang kertas pecahan lima ribu rupiah." },
  { id: "q8", category: "Humor Makanan", question: "Sayur apa yang jago bela diri dan jago silat?", answer: "Brokoli", acceptableAnswers: ["brokoli", "bruce lee", "sayur brokoli"], clue: "Nama sayur hijau yang bunyinya mirip aktor laga Bruce Lee." },
  { id: "q9", category: "Plesetan Hewan", question: "Hewan apa yang paling taat peraturan lalu lintas?", answer: "Unta-makan keselamatan", acceptableAnswers: ["unta", "unta makan keselamatan", "utamakan keselamatan"], clue: "Hewan padang pasir yang bunyinya mirip slogan berkendara tertib." },
  { id: "q10", category: "Jokes Bapak-Bapak", question: "Bebek apa yang kalau jalan muter-muter ke kiri terus?", answer: "Bebek dikunci stang", acceptableAnswers: ["bebek dikunci stang", "kunci stang", "dikunci stang", "motor bebek"], clue: "Kendaraan motor bebek yang lagi diparkir di pinggir jalan." },
  { id: "q11", category: "Humor Makanan", question: "Kue apa yang paling tua di dunia?", answer: "Kue serabi", acceptableAnswers: ["kue serabi", "serabi", "seratus ribu tahun"], clue: "Plesetan dari angka seratus ribu tahun yang lalu." },
  { id: "q12", category: "Teka-Teki Receh", question: "Kenapa pohon kelapa di depan rumah harus ditebang?", answer: "Karena kalau dicabut berat", acceptableAnswers: ["kalau dicabut berat", "dicabut berat", "karena kalau dicabut berat", "berat kalau dicabut", "kalo dicabut berat"], clue: "Coba bayangkan kalau kamu cabut akarnya pakai tangan kosong." },
  { id: "q13", category: "Plesetan Hewan", question: "Gajah apa yang belalainya pendek?", answer: "Gajah pesek", acceptableAnswers: ["gajah pesek", "pesek"], clue: "Lawan kata dari hidung mancung." },
  { id: "q14", category: "Jokes Bapak-Bapak", question: "Bulu apa yang berat banget sampai gak bisa diangkat manusia?", answer: "Buludoser", acceptableAnswers: ["buludoser", "buldoser", "bulldozer"], clue: "Alat berat perata tanah di lokasi proyek konstruksi." },
  { id: "q15", category: "Plesetan Hewan", question: "Rusa apa yang gak bisa lari dan gak bisa jalan?", answer: "Rusak", acceptableAnswers: ["rusak", "barang rusak", "mesin rusak"], clue: "Tinggal tambahkan satu huruf 'k' di akhir nama rusanya." },
  { id: "q16", category: "Jokes Bapak-Bapak", question: "Mobil apa yang gasnya selalu ada di belakang?", answer: "Truk gas elpiji", acceptableAnswers: ["truk gas", "truk elpiji", "truk gas elpiji", "mobil elpiji", "truk lpg"], clue: "Kendaraan pengangkut tabung melon hijau isi 3 kg." },
  { id: "q17", category: "Humor Sehari-Hari", question: "Kendaraan apa yang paling imut dan menggemaskan?", answer: "Kereta api", acceptableAnswers: ["kereta api", "kereta", "tut tut tut", "cute cute cute"], clue: "Bunyi suaranya terdengar seperti kata 'cute cute cute'!" },
  { id: "q18", category: "Teka-Teki Receh", question: "Kenapa matahari kalau sore tenggelam ke barat?", answer: "Karena nggak bisa berenang", acceptableAnswers: ["nggak bisa berenang", "karena gak bisa berenang", "tidak bisa berenang", "gabisa renang", "gak bisa renang"], clue: "Pikirkan apa yang terjadi kalau orang nyebur ke air tapi gak bisa renang." },
  { id: "q19", category: "Humor Sehari-Hari", question: "Nasi apa yang nggak bisa dimakan sama sekali?", answer: "Nasihat", acceptableAnswers: ["nasihat", "nasehat"], clue: "Sering diberikan orang tua atau guru agar kita tidak bandel." },
  { id: "q20", category: "Jokes Bapak-Bapak", question: "Kota apa yang paling sabar dan santai, nggak pernah buru-buru?", answer: "Cikarang", acceptableAnswers: ["cikarang", "cikarang atau nanti", "kota cikarang"], clue: "Plesetan dari pilihan waktu: mau sekarang atau..." },
  { id: "q21", category: "Plesetan Romantis", question: "Kopi apa yang bikin hati nyesek dan sedih banget?", answer: "Kopilih dia daripada aku", acceptableAnswers: ["kopilih dia", "kopilih dia daripada aku", "kopilih dia dibanding aku"], clue: "Lagu galau saat pujaan hati ternyata memilih orang ketiga." },
  { id: "q22", category: "Humor Sehari-Hari", question: "Sabun apa yang paling genit dan suka menggoda?", answer: "Sabun colek", acceptableAnswers: ["sabun colek", "colek"], clue: "Sabun cuci tradisional yang cara ambilnya disentuh pakai jari." },
  { id: "q23", category: "Jokes Bapak-Bapak", question: "Gitar apa yang bunyinya bukan jreng, tapi 'aduh'?", answer: "Gitarik rambutnya", acceptableAnswers: ["gitarik rambutnya", "ditarik rambutnya", "tarik rambut"], clue: "Plesetan dari menjambak atau menarik helai rambut seseorang." },
  { id: "q24", category: "Teka-Teki Receh", question: "Kuda apa yang paling capek dan pegal-pegal?", answer: "Kudaki gunung sendirian", acceptableAnswers: ["kudaki gunung", "kudaki gunung sendirian", "kudaki", "kudaki gunung"], clue: "Plesetan dari aktivitas mendaki bukit atau puncak gunung yang tinggi." },
  { id: "q25", category: "Jokes Bapak-Bapak", question: "Artis Hollywood siapa yang hobi banget isi bahan bakar solar?", answer: "Vin Diesel", acceptableAnswers: ["vin diesel", "diesel"], clue: "Bintang utama film Fast & Furious yang namanya mirip jenis solar." },
  { id: "q26", category: "Plesetan Hewan", question: "Ban apa yang posisinya selalu ada di atas pohon atau di udara?", answer: "Bango", acceptableAnswers: ["bango", "burung bango", "bangau"], clue: "Burung rawa berkaki panjang yang juga jadi merk kecap manis terkenal." },
  { id: "q27", category: "Teka-Teki Receh", question: "Jus apa yang turunnya dari langit pas mendung?", answer: "Jus hujan", acceptableAnswers: ["jus hujan", "jas hujan"], clue: "Plesetan dari mantel pelindung air hujan saat naik motor." },
  { id: "q28", category: "Jokes Bapak-Bapak", question: "Batu apa yang bisa melayang dan mengeluarkan suara musik di radio?", answer: "Batu baterai", acceptableAnswers: ["batu baterai", "baterai", "batre"], clue: "Benda silinder kecil sumber daya jam dinding dan remote TV." },
  { id: "q29", category: "Humor Makanan", question: "Sepatu apa yang bisa dimakan dan sering ada di dapur?", answer: "Sepatula", acceptableAnswers: ["sepatula", "spatula"], clue: "Sodet atau alat penggorengan untuk membalik masakan di wajan." },
  { id: "q30", category: "Jokes Bapak-Bapak", question: "Soto apa yang bikin kaget setengah mati?", answer: "Soto gebrak", acceptableAnswers: ["soto gebrak", "sotong", "gebrak"], clue: "Kuliner soto yang penjualnya suka menggebrak meja saat menyiapkan mangkuk." },
  { id: "q31", category: "Teka-Teki Receh", question: "Kenapa suara nyamuk di kuping kita bunyinya 'nging-nging'?", answer: "Karena menghisap darah, kalau menghisap bensin bunyinya ngeng-ngeng", acceptableAnswers: ["kalau hisap bensin bunyinya ngeng", "bukan hisap bensin", "kalau sedot bensin ngeng", "karena hisap darah", "karena sedot darah"], clue: "Coba bayangkan kalau nyamuknya isi bahan bakar bensin motor balap." },
  { id: "q32", category: "Plesetan Hewan", question: "Hewan laut apa yang namanya cuma terdiri dari dua huruf alfabet?", answer: "U dan g", acceptableAnswers: ["udang", "u dan g", "u dan gak"], clue: "Plesetan dari ejaan hewan bercangkang gurih yang dibaca U-dang." },
  { id: "q33", category: "Humor Makanan", question: "Buah apa yang paling jago silat dan berani melawan musuh?", answer: "Buah naga", acceptableAnswers: ["buah naga", "naga"], clue: "Buah berkulit merah bersisik hijau dengan nama makhluk mitologi penyembur api." },
  { id: "q34", category: "Humor Makanan", question: "Ikan apa yang matanya banyak banget sampai ribuan?", answer: "Ikan teri sekilo", acceptableAnswers: ["ikan teri sekilo", "ikan teri", "teri 1 kg", "teri sekilo"], clue: "Ikan asin kecil-kecil yang kalau ditimbang satu kilogram ada ratusan ekor." },
  { id: "q35", category: "Plesetan Hewan", question: "Ular apa yang paling bikin tubuh sehat dan bugar?", answer: "Ularaga teratur", acceptableAnswers: ["ularaga", "olahraga", "olahraga teratur"], clue: "Plesetan dari aktivitas fisik seperti jogging pagi atau senam." },
  { id: "q36", category: "Jokes Bapak-Bapak", question: "Kenapa Batman memakai kostum dan jubah warna hitam?", answer: "Karena kalau pakai warna pink kelucuan", acceptableAnswers: ["kalau pink kelucuan", "kalau warna pink lucu", "biar gak kelucuan", "kelucuan", "warna pink lucu"], clue: "Bayangkan superhero malam garang kalau pakai warna unyu imut." },
  { id: "q37", category: "Plesetan Romantis", question: "Minyak apa yang bikin orang senyum-senyum sendiri dan berbunga-bunga?", answer: "Minyaksikan kamu bahagia", acceptableAnswers: ["minyaksikan kamu bahagia", "minyaksikan kamu", "minyaksikan"], clue: "Plesetan dari kata 'menyaksikan' momen indah bersama orang tersayang." },
  { id: "q38", category: "Plesetan Romantis", question: "Kue apa yang paling bikin baper dan cocok buat melamar pacar?", answer: "Kue-miliki kamu selamanya", acceptableAnswers: ["kuemiliki kamu", "kuemiliki", "kue miliki kamu"], clue: "Plesetan dari lirik lagu 'ku miliki kamu seutuhnya'." },
  { id: "q39", category: "Humor Sehari-Hari", question: "Pohon apa yang paling banyak dicari orang saat hari raya Idul Fitri?", answer: "Pohon maaf lahir dan batin", acceptableAnswers: ["pohon maaf", "pohon maaf lahir batin", "mohon maaf lahir batin", "mohon maaf"], clue: "Plesetan dari ucapan silaturahmi saat sungkeman lebaran." },
  { id: "q40", category: "Jokes Bapak-Bapak", question: "Presiden negara mana yang paling sering kedinginan dan menggigil?", answer: "Presiden Chili", acceptableAnswers: ["presiden chili", "chili", "chile"], clue: "Plesetan nama negara di Amerika Selatan yang mirip kata 'chilly' (dingin)." },
  { id: "q41", category: "Jokes Bapak-Bapak", question: "Penyanyi internasional siapa yang suka banget main layangan di lapangan?", answer: "Ariana Ulur", acceptableAnswers: ["ariana ulur", "ariana grande ulur", "ulur"], clue: "Plesetan nama Ariana Grande saat benang layangan ditarik..." },
  { id: "q42", category: "Teka-Teki Receh", question: "Gajah bisa terbang dengan cara apa?", answer: "Dengan susah payah", acceptableAnswers: ["dengan susah payah", "susah payah", "usaha keras"], clue: "Bayangkan hewan sebesar tronton mencoba terbang ke udara." },
  { id: "q43", category: "Jokes Bapak-Bapak", question: "Kenapa kostum Superman di bagian dadanya ada lambang huruf S besar?", answer: "Karena kalau XL kegedean", acceptableAnswers: ["kalau xl kegedean", "kalau m kekecilan", "ukuran baju", "kegedean", "karena kalau xl kegedean"], clue: "Plesetan dari ukuran baju: S (Small), M (Medium), L, XL." },
  { id: "q44", category: "Plesetan Hewan", question: "Kecoa apa yang bisa masuk dan dirawat di rumah sakit?", answer: "Kecoalakaan", acceptableAnswers: ["kecoalakaan", "kecelakaan"], clue: "Plesetan dari musibah tabrakan di jalan raya." },
  { id: "q45", category: "Teka-Teki Receh", question: "Ditembaknya ke arah bawah, tapi yang kena kok malah hidung?", answer: "Kentut", acceptableAnswers: ["kentut", "buang angin"], clue: "Gas alami yang aromanya semerbak dan bunyinya pret." },
  { id: "q46", category: "Humor Sehari-Hari", question: "Tukang apa yang kalau dipanggil orangnya malah gak noleh dan jalan terus?", answer: "Tukang gali kubur", acceptableAnswers: ["tukang gali kubur", "tukang becak", "gali kubur"], clue: "Orang yang bekerja menggali tanah pemakaman." },
  { id: "q47", category: "Teka-Teki Receh", question: "Benda apa yang kalau bagian bawahnya dipotong malah jadi makin tinggi?", answer: "Celana panjang", acceptableAnswers: ["celana", "celana panjang"], clue: "Pakaian bawahan yang kalau dipotong jadi celana pendek ngatung." },
  { id: "q48", category: "Teka-Teki Receh", question: "Kalau warnanya hitam dibilang bersih, tapi kalau ada putih-putihnya dibilang kotor. Apa itu?", answer: "Papan tulis hitam", acceptableAnswers: ["papan tulis", "papan tulis hitam", "blackboard"], clue: "Alat di depan kelas zaman dulu yang ditulis menggunakan kapur tulis." },
  { id: "q49", category: "Plesetan Hewan", question: "Hewan apa yang punya keahlian serba bisa: bisa bangunan, kayu, sampai ledeng?", answer: "Kukang", acceptableAnswers: ["kukang", "tukang"], clue: "Plesetan dari panggilan profesi 'tukang'." },
  { id: "q50", category: "Plesetan Hewan", question: "Belut apa yang paling berbahaya dan bikin orang ketar-ketir tiap tanggal muda?", answer: "Belutang banyak tapi belum bayar", acceptableAnswers: ["belutang", "belutang banyak", "berutang", "hutang"], clue: "Plesetan dari tagihan pinjol atau kasbon di warung kelontong." },
  { id: "q51", category: "Humor Makanan", question: "Bumi itu bulat, kalau martabak telur itu apa?", answer: "Spesial", acceptableAnswers: ["spesial", "istimewa"], clue: "Pilihan menu martabak dengan ekstra telur bebek dan daging cincang." },
  { id: "q52", category: "Plesetan Hewan", question: "Tentara apa yang ukurannya paling kecil di dunia?", answer: "Tentara sekutu", acceptableAnswers: ["tentara sekutu", "sekutu", "kutu"], clue: "Plesetan dari hewan kecil pengisap darah di sela rambut kepala." },
  { id: "q53", category: "Jokes Bapak-Bapak", question: "Lampu bohlam apa yang kalau dipecahkan langsung keluar orangnya?", answer: "Lampu tetangga", acceptableAnswers: ["lampu tetangga", "tetangga"], clue: "Coba lempar lampu depan rumah sebelah, pasti pemilik rumahnya langsung keluar marah-marah!" },
  { id: "q54", category: "Plesetan Romantis", question: "Gelas apa yang paling bikin grogi dan deg-degan bagi kaum jomblo?", answer: "Gelas pelaminan", acceptableAnswers: ["gelas pelaminan", "pelaminan", "menikah"], clue: "Plesetan dari panggung tempat pengantin bersanding." },
  { id: "q55", category: "Jokes Bapak-Bapak", question: "Kenapa dalang wayang kulit kalau mendongeng selalu bawa keris di punggungnya?", answer: "Karena kalau bawa kompor gas repot masaknya", acceptableAnswers: ["kalau bawa kompor repot", "kalau kompor repot", "bawa kompor repot"], clue: "Alat masak dapur yang gak nyambung kalau dibawa di atas panggung wayang." },
  { id: "q56", category: "Plesetan Hewan", question: "Bebek apa yang paling legendaris di bioskop film Hollywood?", answer: "Bebek to the future", acceptableAnswers: ["bebek to the future", "back to the future"], clue: "Plesetan dari judul film mesin waktu mobil DeLorean karya Steven Spielberg." },
  { id: "q57", category: "Humor Makanan", question: "Telor apa yang paling ditakuti dan dihindari masyarakat?", answer: "Telorasin", acceptableAnswers: ["telorasin", "telur asin", "teror"], clue: "Plesetan dari kata 'teror' atau makanan telur bebek khas Brebes." },
  { id: "q58", category: "Teka-Teki Receh", question: "Kuda apa yang jalannya mundur dan gak mau maju?", answer: "Kuda main catur yang ditarik lagi langkahnya", acceptableAnswers: ["kuda catur", "kuda main catur", "catur"], clue: "Pion hewan berbentuk kepala kuda di atas papan bidak hitam-putih." },
  { id: "q59", category: "Jokes Bapak-Bapak", question: "Daun apa yang gak ada batangnya dan gak boleh disentuh sembarangan?", answer: "Daun touch me", acceptableAnswers: ["daun touch me", "dont touch me", "don't touch me"], clue: "Plesetan dari bahasa Inggris yang artinya 'jangan sentuh aku'." },
  { id: "q60", category: "Jokes Bapak-Bapak", question: "Kipas apa yang bikin kedinginan tapi gak pake listrik?", answer: "Kipas-ang angin di kutub utara", acceptableAnswers: ["kipas kutub", "kutub utara", "di kutub utara"], clue: "Lokasi tempat tinggal beruang kutub es." }
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
    const question = await this.getUniqueQuestion();

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

    // Call NVIDIA AI for Fuzzy / Semantic Similarity Evaluation
    const systemPrompt =
      "Anda adalah juri kuis tebak-tebakan receh dan jokes bapak-bapak (dad jokes) Bahasa Indonesia. Tugas Anda adalah menilai apakah jawaban peserta BENAR (punchline tepat atau semakna), MENDEKATI (hampir tepat, plesetan mirip, ide punchline tertangkap, atau typo ringan), atau SALAH (tidak nyambung sama sekali). Jawab HANYA JSON valid.";

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
  "reason": "Alasan singkat 1 kalimat santai..."
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
   * Generate dynamic AI Daily Quiz / Riddle using NVIDIA AI adhering strictly to DAILY QUIZ RULES
   */
  private async generateAiTebakQuestion(): Promise<TebakQuestion | null> {
    const seedTopics = [
      { category: "Jokes Bapak-Bapak", examples: "ayam berkokok merem hafal teks, bebek kunci stang, gajah pesek, lemari masuk saku, kipas kepastian" },
      { category: "Plesetan Hewan Lucu", examples: "katak beradik, unta-makan keselamatan, semute, ikan teri sekilo, buludoser, kukang serba bisa" },
      { category: "Humor Makanan & Minuman", examples: "kue serabi tua, martabak spesial, sabun colek genit, sayur brokoli silat, jus hujan, telorasin" },
      { category: "Teka-Teki Logika Nyeleneh", examples: "pohon kelapa ditebang karena dicabut berat, matahari tenggelam karena gak bisa renang, celana dipotong jadi tinggi" },
      { category: "Plesetan Romantis & Gaul", examples: "minyak-sikan kamu bahagia, kue-miliki kamu selamanya, kopi-lih dia daripada aku, gelas pelaminan" },
      { category: "Humor Sehari-Hari & Populer", examples: "lampu tetangga dipecahin keluar orangnya, vin diesel isi solar, superman ukuran S, dalang wayang bawa keris bukan kompor" }
    ];

    const randomSeed = seedTopics[Math.floor(Math.random() * seedTopics.length)];
    const historyList = Array.from(this.askedQuestionHistory).slice(-25).join("; ");

    const systemPrompt = `Kamu adalah komedian dan master pembuat tebak-tebakan receh / jokes bapak-bapak (dad jokes) khas tongkrongan Indonesia yang sangat kreatif.
Tugasmu menciptakan 1 tebak-tebakan receh, menggelitik, lucu, dan humoris yang menghibur ("receh banget bapak-bapak!").
PRINSIP UTAMA:
HUMOR & RECEH > FORMAL KAKU
PUNCHLINE JELAS & MASUK AKAL DALAM KONTEKS PLESETAN/HUMOR
PLESETAN KATA CERDAS & FAMILIAR BAGI ORANG INDONESIA
CLUE MEMBANTU MENGARAHKAN PIKIRAN KE JAWABAN TANPA MEMBOCORKAN LANGSUNG`;

    const prompt = `
## PANDUAN TEBAK-TEBAKAN RECEH & JOKES BAPAK-BAPAK

Buatlah 1 tebak-tebakan receh bertema "${randomSeed.category}" (Inspirasi seputar: ${randomSeed.examples}) dengan gaya humor khas bapak-bapak Indonesia yang bikin senyum atau ketawa receh!

### KRITERIA SOAL:
1. **Pertanyaan**: Menarik, menggelitik, tidak kaku/tidak serius, dan khas tebak-tebakan tongkrongan bapak-bapak (Contoh: "Kenapa ayam kalau berkokok matanya merem?", "Hewan apa yang bersaudara?", "Kipas apa yang ditunggu-tunggu cewek?").
2. **Jawaban / Punchline**: Jawaban yang lucu, receh, plesetan kata (pun), atau logika terbalik yang nyambung (Contoh: "Karena udah hafal teksnya", "Katak beradik", "Kipastian").
3. **Acceptable Answers**: Berikan beberapa variasi jawaban yang mungkin diketik oleh pemain (kata kunci inti, variasi kata) agar pemain tidak kesulitan saat menebak.
4. **Clue**: Berikan petunjuk yang cerdas dan mengarahkan ke punchline atau plesetan kata tersebut.

### CONTOH-CONTOH YANG BAGUS:
- Contoh 1:
  - Pertanyaan: "Kenapa pohon kelapa di depan rumah harus ditebang?"
  - Jawaban: "Karena kalau dicabut berat"
  - Clue: "Pikirkan alternatif lain selain menebang menggunakan tangan kosong."
  - AcceptableAnswers: ["karena kalau dicabut berat", "dicabut berat", "kalau dicabut berat", "berat kalau dicabut"]
- Contoh 2:
  - Pertanyaan: "Hewan apa yang paling hening dan gak pernah berisik?"
  - Jawaban: "Semute"
  - Clue: "Hewan kecil yang tombol suaranya dimatikan di Zoom atau Discord."
  - AcceptableAnswers: ["semute", "semut", "se mute"]
- Contoh 3:
  - Pertanyaan: "Pocong apa yang paling disenangi sama ibu-ibu?"
  - Jawaban: "Pocongan harga"
  - Clue: "Plesetan dari diskon belanja saat ada promo supermarket."
  - AcceptableAnswers: ["pocongan harga", "potongan harga", "diskon"]

### ANTI-DUPLIKASI:
Hindari tebakan yang mirip dengan riwayat ini:
[${historyList || "Belum ada"}]

Jawab HANYA dalam format JSON persis seperti berikut tanpa teks atau markdown tambahan apapun:
{
  "category": "${randomSeed.category}",
  "question": "Pertanyaan tebakan receh yang menggelitik...",
  "answer": "Jawaban punchline humor",
  "acceptableAnswers": ["punchline utama", "variasi kata 1", "variasi kata 2"],
  "clue": "Petunjuk receh yang membantu..."
}
`.trim();

    try {
      const raw = await askNvidia(prompt, systemPrompt);
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        if (data.question && data.answer) {
          // Double-check validation filter with AI (Humor & Punchline Verification)
          const validationPrompt = `Tinjau apakah tebak-tebakan receh / jokes bapak-bapak berikut lucu, nyambung plesetannya, dan cocok untuk kuis humor santai di Discord:
Pertanyaan: "${data.question}"
Jawaban: "${data.answer}"
Clue: "${data.clue}"

Kriteria:
1. Soal berupa tebak-tebakan humor / jokes receh / dad joke yang seru dan nyambung punchline-nya.
2. Tidak menyinggung SARA atau hal terlarang.
3. Bisa dimengerti dan ditebak oleh orang Indonesia.

Jawab HANYA 1 KATA: "VALID" jika lolos, atau "INVALID" jika tidak nyambung sama sekali.`;

          const checkRes = await askNvidia(validationPrompt, "Kamu adalah juri validator humor tebak-tebakan receh yang teliti.");
          const isLogicallyValid = checkRes.toUpperCase().includes("VALID") && !checkRes.toUpperCase().includes("INVALID");

          if (!isLogicallyValid) {
            logger.warn(`TebakManager: Soal AI dibuang karena gagal humor check: [Q: "${data.question}" | A: "${data.answer}"] -> Validator: "${checkRes.trim()}"`);
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
