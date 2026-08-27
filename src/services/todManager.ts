import { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  VoiceBasedChannel, 
  TextBasedChannel, 
  User, 
  GuildMember 
} from "discord.js";
import { voiceChatManager } from "./voiceChatManager";
import { askNvidia } from "./aiClient";
import { logger } from "../utils/logger";

export type TodCategory = "casual" | "crush" | "extreme";

export interface TodSession {
  guildId: string;
  textChannelId: string;
  voiceChannelId: string;
  category: TodCategory;
  targetUserId: string | null;
  targetUsername: string | null;
  currentPromptType: "truth" | "dare" | null;
  currentPromptText: string | null;
  status: "idle" | "awaiting_choice" | "awaiting_completion";
  round: number;
}

export class TodManager {
  private static instance: TodManager;
  private sessions = new Map<string, TodSession>(); // key: guildId

  private constructor() {}

  public static getInstance(): TodManager {
    if (!TodManager.instance) {
      TodManager.instance = new TodManager();
    }
    return TodManager.instance;
  }

  public getSession(guildId: string): TodSession | undefined {
    return this.sessions.get(guildId);
  }

  /**
   * Start Truth or Dare session directly from voice speech command
   */
  public async startSessionFromVoice(
    guildId: string,
    user: User
  ): Promise<boolean> {
    const voiceSession = voiceChatManager.getSession(guildId);
    if (!voiceSession || !voiceSession.channel) {
      voiceChatManager.speak(guildId, "Maya harus berada di Voice Channel dulu untuk main Truth or Dare!");
      return false;
    }

    const voiceChannel = voiceSession.channel;
    const guild = voiceChannel.guild;
    let targetTextChannel: TextBasedChannel | null = null;

    if (voiceChannel.isTextBased && typeof voiceChannel.isTextBased === "function" && voiceChannel.isTextBased()) {
      targetTextChannel = voiceChannel as unknown as TextBasedChannel;
    } else if (guild) {
      targetTextChannel = (guild.systemChannel || 
        guild.channels.cache.find((c: any) => c.isTextBased() && !c.isVoiceBased()) || 
        null) as unknown as TextBasedChannel;
    }

    if (!targetTextChannel) {
      voiceChatManager.speak(guildId, "Maya tidak menemukan text channel untuk menampilkan papan Truth or Dare!");
      return false;
    }

    const res = await this.startSession(
      guildId,
      targetTextChannel,
      voiceChannel,
      "casual",
      user
    );

    if (res.success && res.embed && "send" in targetTextChannel) {
      try {
        await (targetTextChannel as any).send({
          embeds: [res.embed],
          components: res.components || []
        });
      } catch (err) {
        logger.warn("TodManager: Gagal mengirim embed ke text channel:", err);
      }
    }

    return res.success;
  }

  /**
   * Start a new Truth or Dare session in voice channel
   */
  public async startSession(
    guildId: string,
    textChannel: TextBasedChannel,
    voiceChannel: VoiceBasedChannel,
    category: TodCategory = "casual",
    user: User
  ): Promise<{ success: boolean; message: string; embed?: EmbedBuilder; components?: ActionRowBuilder<ButtonBuilder>[] }> {
    // 1. Join voice channel if not connected
    if (!voiceChatManager.isConnected(guildId)) {
      const joined = await voiceChatManager.join(voiceChannel);
      if (!joined) {
        return { success: false, message: "Maya gagal bergabung ke Voice Channel!" };
      }
    }

    const session: TodSession = {
      guildId,
      textChannelId: textChannel.id,
      voiceChannelId: voiceChannel.id,
      category,
      targetUserId: null,
      targetUsername: null,
      currentPromptType: null,
      currentPromptText: null,
      status: "idle",
      round: 0
    };

    this.sessions.set(guildId, session);

    const categoryNames = {
      casual: "🟢 Santai & Lucu",
      crush: "💖 Kepo & Romantis / Crush",
      extreme: "🔥 Gokil & Ekstrem Tongkrongan"
    };

    logger.info(`TodManager: Sesi Truth or Dare dimulai di guild ${guildId} (Kategori: ${category})`);

    // Voice announcement
    voiceChatManager.speak(
      guildId,
      "Asik! Sesi Truth or Dare dimulai nih! Siapa yang mau jadi korban pertama? Yuk klik tombol putar botol!"
    );

    const embed = new EmbedBuilder()
      .setColor(0xF472B6)
      .setTitle("🍾 Maya Voice Truth or Dare")
      .setDescription(
        `Sesi **Truth or Dare** dipandu langsung oleh Maya di Voice Channel <#${voiceChannel.id}>!\n\n` +
        `🏷️ **Mode Permainan**: ${categoryNames[category]}\n` +
        `👤 **Dimulai oleh**: <@${user.id}>\n\n` +
        `*Klik tombol **🎯 Putar Botol** di bawah untuk menentukan giliran pertama!*`
      )
      .setFooter({ text: "Maya Voice Party Games • Bersuara Langsung di Voice Channel" })
      .setTimestamp();

    const components = this.createControlButtons(session);

    return {
      success: true,
      message: "Sesi Truth or Dare berhasil dimulai!",
      embed,
      components
    };
  }

  /**
   * Spin the bottle to pick a random player in voice channel
   */
  public async spinBottle(
    guildId: string,
    initiator: User
  ): Promise<{ success: boolean; message: string; embed?: EmbedBuilder; components?: ActionRowBuilder<ButtonBuilder>[] }> {
    const session = this.sessions.get(guildId);
    if (!session) {
      return { success: false, message: "Tidak ada sesi Truth or Dare yang sedang aktif!" };
    }

    const voiceSession = voiceChatManager.getSession(guildId);
    if (!voiceSession || !voiceSession.channel) {
      return { success: false, message: "Maya tidak sedang berada di Voice Channel!" };
    }

    // Get active human members in voice channel
    const humanMembers = Array.from(voiceSession.channel.members.values()).filter((m) => !m.user.bot);
    if (humanMembers.length === 0) {
      return { success: false, message: "Tidak ada member lain di Voice Channel untuk bermain!" };
    }

    // Pick random target (try to pick someone different if > 1 member)
    let candidates = humanMembers;
    if (humanMembers.length > 1 && session.targetUserId) {
      const filtered = humanMembers.filter((m) => m.id !== session.targetUserId);
      if (filtered.length > 0) candidates = filtered;
    }

    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    const targetName = picked.displayName || picked.user.username;

    session.targetUserId = picked.id;
    session.targetUsername = targetName;
    session.currentPromptType = null;
    session.currentPromptText = null;
    session.status = "awaiting_choice";
    session.round += 1;

    logger.info(`TodManager: Botol berputar (Round #${session.round}) -> Terpilih: ${targetName} (${picked.id})`);

    // Dynamic AI Voice announcement
    let teaseNarration = "";
    try {
      const teasePrompt = `Kamu adalah Maya, cewek Gen-Z asik yang memandu game Truth or Dare di Voice Channel Discord.
Botol baru saja berputar dan berhenti tepat di depan "${targetName}".
Buat 1 kalimat singkat (maksimal 10-12 kata) memanggil dan menantang ${targetName} untuk memilih Truth atau Dare!
DILARANG menggunakan markdown, tanda petik, atau kata ketawa (wkwk, haha).`;

      const rawTease = await askNvidia(teasePrompt, "Kamu adalah Maya, pemandu game Voice yang seru dan usil.");
      teaseNarration = rawTease
        .replace(/[*_~`#>-]/g, "")
        .replace(/https?:\/\/\S+/g, "")
        .replace(/["']/g, "")
        .replace(/\b(w+k+w*k*|h+a+h*a*|h+e+h*e*|h+i+h*i*|x+i+x*i*|h+u+h*u*|l+o+l|a+w+o+k+)\b/gi, "")
        .trim();
    } catch (_) {}

    if (!teaseNarration) {
      teaseNarration = `Botol berputar dan berhenti di ${targetName}! Hayo ${targetName}, kamu pilih Truth atau Dare nih?`;
    }

    voiceChatManager.speak(guildId, teaseNarration);

    const embed = new EmbedBuilder()
      .setColor(0xF59E0B)
      .setTitle(`🍾 Putaran #${session.round} • Giliran ${targetName}!`)
      .setDescription(
        `Botol telah berputar dan berhenti di **<@${picked.id}>**!\n\n` +
        `👉 **<@${picked.id}>**, silakan pilih jalanmu sekarang:\n` +
        `• 📜 **Truth** — Jawab pertanyaan jujur dari Maya\n` +
        `• 🔥 **Dare** — Lakukan tantangan suara seru di voice!`
      )
      .setThumbnail(picked.user.displayAvatarURL())
      .setFooter({ text: "Maya Voice Party Games" })
      .setTimestamp();

    const components = this.createChoiceButtons(session);

    return {
      success: true,
      message: `Giliran jatuh ke ${targetName}!`,
      embed,
      components
    };
  }

  /**
   * Target player chooses Truth or Dare (Generates dynamic AI prompt)
   */
  public async chooseType(
    guildId: string,
    type: "truth" | "dare",
    actor: User
  ): Promise<{ success: boolean; message: string; embed?: EmbedBuilder; components?: ActionRowBuilder<ButtonBuilder>[] }> {
    const session = this.sessions.get(guildId);
    if (!session || !session.targetUserId) {
      return { success: false, message: "Tidak ada giliran pemain yang sedang aktif!" };
    }

    session.currentPromptType = type;
    session.status = "awaiting_completion";

    const targetName = session.targetUsername || "Teman";
    const category = session.category;

    // Generate dynamic prompt with AI
    let promptText = "";

    try {
      let aiInstruction = "";
      if (type === "truth") {
        if (category === "crush") {
          aiInstruction = `Buat 1 pertanyaan TRUTH (jujur) yang kepo tentang asmara/crush/cinta/tipe idaman untuk ditanyakan ke "${targetName}" di tongkrongan Discord.`;
        } else if (category === "extreme") {
          aiInstruction = `Buat 1 pertanyaan TRUTH (jujur) yang sangat usil, kepo, lucu, dan menguji kejujuran untuk "${targetName}" di tongkrongan.`;
        } else {
          aiInstruction = `Buat 1 pertanyaan TRUTH (jujur) yang seru, lucu, santai, dan menghibur untuk "${targetName}" di tongkrongan.`;
        }
      } else {
        if (category === "crush") {
          aiInstruction = `Buat 1 tantangan DARE yang manis/gombal/lucu yang harus dipraktikkan langsung lewat suara di voice channel oleh "${targetName}" (misal: gombalin member lain, nyanyi lagu cinta singkat, dll).`;
        } else if (category === "extreme") {
          aiInstruction = `Buat 1 tantangan DARE yang gokil, lucu, dan menantang yang harus dipraktikkan lewat suara di voice channel oleh "${targetName}" (misal: niruin suara binatang, baca sesuatu dengan gaya reporter dramatis, dll).`;
        } else {
          aiInstruction = `Buat 1 tantangan DARE yang santai dan lucu yang harus dilakukan via suara di voice channel oleh "${targetName}".`;
        }
      }

      const promptRequest = `Kamu adalah Maya, pemandu game Truth or Dare di Voice Channel Discord.
${aiInstruction}
PANDUAN KETAT:
1. HANYA buat 1 kalimat pertanyaan / instruksi tantangan langsung (maksimal 15-18 kata).
2. DILARANG menggunakan markdown, tanda petik, emotikon teks, atau kata ketawa (wkwk, haha, hehe) karena kalimat ini akan langsung dibacakan suara vokal TTS Maya.
3. Buat yang seru, kreatif, tidak pasaran, dan aman untuk komunitas.`;

      const reply = await askNvidia(promptRequest, "Kamu adalah Maya, pemandu game Voice Party di Discord yang seru dan asik.");
      promptText = reply
        .replace(/[*_~`#>-]/g, "")
        .replace(/https?:\/\/\S+/g, "")
        .replace(/["']/g, "")
        .replace(/\b(w+k+w*k*|h+a+h*a*|h+e+h*e*|h+i+h*i*|x+i+x*i*|h+u+h*u*|l+o+l|a+w+o+k+)\b/gi, "")
        .trim();
    } catch (err) {
      logger.warn("TodManager: AI generation failed, using fallback:", err);
    }

    if (!promptText) {
      if (type === "truth") {
        const truthFallbacks = [
          `Kapan terakhir kali kamu bohong ke teman tongkrongan ini dan bohong tentang apa?`,
          `Siapa orang di server ini yang diam-diam sering bikin kamu penasaran?`,
          `Hal paling memalukan apa yang pernah kamu lakukan saat lagi suka sama seseorang?`,
          `Kalau kamu harus memilih satu orang di voice channel ini buat nemenin kamu di pulau terpencil, siapa yang kamu pilih?`
        ];
        promptText = truthFallbacks[Math.floor(Math.random() * truthFallbacks.length)];
      } else {
        const dareFallbacks = [
          `Tirukan suara hewan kucing lagi manja selama sepuluh detik di voice channel sekarang juga!`,
          `Nyanyikan satu reff lagu pop favoritmu dengan gaya penyanyi opera dramatis sekarang!`,
          `Berikan satu gombalan paling maut ke salah satu orang di voice channel ini!`,
          `Baca kalimat apa pun di chat dengan nada presenter berita resmi yang super serius!`
        ];
        promptText = dareFallbacks[Math.floor(Math.random() * dareFallbacks.length)];
      }
    }

    session.currentPromptText = promptText;

    logger.info(`TodManager: Prompt ${type.toUpperCase()} untuk ${targetName}: "${promptText}"`);

    // Voice announcement
    if (type === "truth") {
      voiceChatManager.speak(
        guildId,
        `Pertanyaan Truth untuk ${targetName}: ${promptText}`
      );
    } else {
      voiceChatManager.speak(
        guildId,
        `Tantangan Dare untuk ${targetName}: ${promptText}`
      );
    }

    const typeEmoji = type === "truth" ? "📜 TRUTH" : "🔥 DARE";
    const embedColor = type === "truth" ? 0x3B82F6 : 0xEF4444;

    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setTitle(`🍾 ${typeEmoji} untuk ${targetName}!`)
      .setDescription(
        `**<@${session.targetUserId}>**, dengarkan instruksi dari Maya di voice channel atau baca di bawah ini:\n\n` +
        `> **"${promptText}"**\n\n` +
        `*Silakan jawab atau lakukan tantangan ini langsung lewat mic suara di Voice Channel!*`
      )
      .setFooter({ text: "Maya Voice Party Games • Klik Selesai jika tantangan/jawaban sudah tuntas" })
      .setTimestamp();

    const components = this.createCompletionButtons(session);

    return {
      success: true,
      message: `Tantangan ${type.toUpperCase()} telah diberikan!`,
      embed,
      components
    };
  }

  /**
   * Complete the turn and praise the player
   */
  public async completeTurn(
    guildId: string,
    actor: User
  ): Promise<{ success: boolean; message: string; embed?: EmbedBuilder; components?: ActionRowBuilder<ButtonBuilder>[] }> {
    const session = this.sessions.get(guildId);
    if (!session || !session.targetUserId) {
      return { success: false, message: "Tidak ada giliran yang sedang berlangsung!" };
    }

    const targetName = session.targetUsername || "Teman";
    const type = session.currentPromptType || "tantangan";

    session.status = "idle";

    // Voice praise
    voiceChatManager.speak(
      guildId,
      `Keren banget ${targetName}! Berhasil menyelesaikan ${type}! Yuk kita lanjut putar botol lagi!`
    );

    const embed = new EmbedBuilder()
      .setColor(0x10B981)
      .setTitle(`🎉 ${targetName} Berhasil Menyelesaikan Giliran!`)
      .setDescription(
        `Selamat untuk **<@${session.targetUserId}>** telah menuntaskan ${type === "truth" ? "pertanyaan **Truth**" : "tantangan **Dare**"} dengan mantap!\n\n` +
        `*Siap untuk korban berikutnya? Klik **🎯 Putar Botol** di bawah!*`
      )
      .setFooter({ text: `Maya Voice Party Games • Putaran #${session.round} Selesai` })
      .setTimestamp();

    const components = this.createControlButtons(session);

    return {
      success: true,
      message: `Putaran selesai!`,
      embed,
      components
    };
  }

  /**
   * End Truth or Dare session
   */
  public endSession(guildId: string): boolean {
    const session = this.sessions.get(guildId);
    if (!session) return false;

    this.sessions.delete(guildId);
    voiceChatManager.speak(
      guildId,
      "Sesi Truth or Dare selesai! Terima kasih semuanya sudah seru-seruan bareng Maya ya!"
    );
    logger.info(`TodManager: Sesi Truth or Dare di guild ${guildId} diakhiri.`);
    return true;
  }

  /**
   * Action buttons for idle state (Spin / End)
   */
  private createControlButtons(session: TodSession): ActionRowBuilder<ButtonBuilder>[] {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("tod_btn:spin")
        .setEmoji("🎯")
        .setLabel("Putar Botol (Acak Pemain)")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("tod_btn:end")
        .setEmoji("🛑")
        .setLabel("Akhiri Permainan")
        .setStyle(ButtonStyle.Danger)
    );
    return [row];
  }

  /**
   * Action buttons for choosing Truth or Dare
   */
  private createChoiceButtons(session: TodSession): ActionRowBuilder<ButtonBuilder>[] {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("tod_btn:choice_truth")
        .setEmoji("📜")
        .setLabel("Pilih Truth (Jujur)")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("tod_btn:choice_dare")
        .setEmoji("🔥")
        .setLabel("Pilih Dare (Tantangan)")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("tod_btn:spin")
        .setEmoji("🔄")
        .setLabel("Ganti Pemain (Putar Ulang)")
        .setStyle(ButtonStyle.Secondary)
    );
    return [row];
  }

  /**
   * Action buttons for completion state
   */
  private createCompletionButtons(session: TodSession): ActionRowBuilder<ButtonBuilder>[] {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("tod_btn:done")
        .setEmoji("✅")
        .setLabel("Selesai (Lolos)")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("tod_btn:reroll")
        .setEmoji("🔄")
        .setLabel("Ganti Pertanyaan")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("tod_btn:spin")
        .setEmoji("⏭️")
        .setLabel("Lewati & Putar Lagi")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("tod_btn:end")
        .setEmoji("🛑")
        .setLabel("Selesai Game")
        .setStyle(ButtonStyle.Danger)
    );
    return [row];
  }
}

export const todManager = TodManager.getInstance();
