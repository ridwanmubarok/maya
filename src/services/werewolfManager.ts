import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  VoiceBasedChannel,
  TextBasedChannel,
  User,
  GuildMember,
  Client,
  MessageFlags
} from "discord.js";
import { voiceChatManager } from "./voiceChatManager";
import { askNvidia } from "./aiClient";
import { logger } from "../utils/logger";

export type WerewolfRole = "werewolf" | "seer" | "doctor" | "villager" | "hunter";

export interface WerewolfPlayer {
  userId: string;
  username: string;
  displayName: string;
  role: WerewolfRole;
  isAlive: boolean;
  user: User;
}

export type WerewolfPhase =
  | "lobby"
  | "night"
  | "day_discussion"
  | "day_voting"
  | "game_over";

export interface WerewolfSession {
  guildId: string;
  textChannelId: string;
  voiceChannelId: string;
  hostId: string;
  phase: WerewolfPhase;
  dayNumber: number;
  players: Map<string, WerewolfPlayer>; // key: userId
  nightKills: Map<string, string>; // key: werewolfUserId, value: targetUserId
  nightHeal: string | null; // targetUserId protected by doctor
  nightChecked: string | null; // targetUserId checked by seer
  dayVotes: Map<string, string>; // key: voterUserId, value: targetUserId (or "skip")
  phaseTimer: NodeJS.Timeout | null;
  messageId: string | null;
}

export class WerewolfManager {
  private static instance: WerewolfManager;
  private sessions = new Map<string, WerewolfSession>(); // key: guildId

  private constructor() {}

  public static getInstance(): WerewolfManager {
    if (!WerewolfManager.instance) {
      WerewolfManager.instance = new WerewolfManager();
    }
    return WerewolfManager.instance;
  }

  public getSession(guildId: string): WerewolfSession | undefined {
    return this.sessions.get(guildId);
  }

  /**
   * Start a new Werewolf Game Lobby
   */
  public async createLobby(
    guildId: string,
    textChannel: TextBasedChannel,
    voiceChannel: VoiceBasedChannel,
    host: User
  ): Promise<{ success: boolean; message: string; embed?: EmbedBuilder; components?: ActionRowBuilder<ButtonBuilder>[] }> {
    if (this.sessions.has(guildId)) {
      return { success: false, message: "Sesi Werewolf sudah ada yang aktif di server ini!" };
    }

    if (!voiceChatManager.isConnected(guildId)) {
      const joined = await voiceChatManager.join(voiceChannel);
      if (!joined) {
        return { success: false, message: "Maya gagal bergabung ke Voice Channel!" };
      }
    }

    const session: WerewolfSession = {
      guildId,
      textChannelId: textChannel.id,
      voiceChannelId: voiceChannel.id,
      hostId: host.id,
      phase: "lobby",
      dayNumber: 0,
      players: new Map(),
      nightKills: new Map(),
      nightHeal: null,
      nightChecked: null,
      dayVotes: new Map(),
      phaseTimer: null,
      messageId: null
    };

    // Auto-add host as first player
    session.players.set(host.id, {
      userId: host.id,
      username: host.username,
      displayName: host.displayName || host.username,
      role: "villager",
      isAlive: true,
      user: host
    });

    this.sessions.set(guildId, session);

    logger.info(`WerewolfManager: Lobby game dibuat oleh ${host.username} di guild ${guildId}`);

    // Voice announcement
    voiceChatManager.speak(
      guildId,
      "Panggilan untuk semua warga desa! Sesi Werewolf telah dibuka! Silakan klik tombol gabung di teks chat untuk mendaftar!"
    );

    const embed = this.createLobbyEmbed(session);
    const components = this.createLobbyButtons(session);

    return {
      success: true,
      message: "Lobby Werewolf berhasil dibuat!",
      embed,
      components
    };
  }

  /**
   * Start Werewolf Lobby directly from voice command
   */
  public async startLobbyFromVoice(guildId: string, user: User): Promise<boolean> {
    const voiceSession = voiceChatManager.getSession(guildId);
    if (!voiceSession || !voiceSession.channel) {
      voiceChatManager.speak(guildId, "Maya harus berada di Voice Channel dulu untuk main Werewolf!");
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
      voiceChatManager.speak(guildId, "Maya tidak menemukan text channel untuk menampilkan papan Werewolf!");
      return false;
    }

    const res = await this.createLobby(guildId, targetTextChannel, voiceChannel, user);

    if (res.success && res.embed && "send" in targetTextChannel) {
      try {
        const msg = await (targetTextChannel as any).send({
          embeds: [res.embed],
          components: res.components || []
        });
        const session = this.sessions.get(guildId);
        if (session) session.messageId = msg.id;
      } catch (err) {
        logger.warn("WerewolfManager: Gagal mengirim embed lobby ke text channel:", err);
      }
    }

    return res.success;
  }

  /**
   * Player joins lobby
   */
  public joinLobby(guildId: string, user: User): { success: boolean; message: string; embed?: EmbedBuilder; components?: ActionRowBuilder<ButtonBuilder>[] } {
    const session = this.sessions.get(guildId);
    if (!session || session.phase !== "lobby") {
      return { success: false, message: "Lobby Werewolf tidak sedang membuka pendaftaran!" };
    }

    if (session.players.has(user.id)) {
      return { success: false, message: "Kamu sudah terdaftar di dalam permainan!" };
    }

    if (session.players.size >= 12) {
      return { success: false, message: "Lobby sudah penuh (maksimal 12 pemain)!" };
    }

    session.players.set(user.id, {
      userId: user.id,
      username: user.username,
      displayName: user.displayName || user.username,
      role: "villager",
      isAlive: true,
      user
    });

    logger.info(`WerewolfManager: ${user.username} bergabung ke lobby Werewolf (${session.players.size} pemain)`);

    return {
      success: true,
      message: `${user.displayName || user.username} berhasil bergabung!`,
      embed: this.createLobbyEmbed(session),
      components: this.createLobbyButtons(session)
    };
  }

  /**
   * Player leaves lobby
   */
  public leaveLobby(guildId: string, userId: string): { success: boolean; message: string; embed?: EmbedBuilder; components?: ActionRowBuilder<ButtonBuilder>[] } {
    const session = this.sessions.get(guildId);
    if (!session || session.phase !== "lobby") {
      return { success: false, message: "Lobby Werewolf tidak aktif!" };
    }

    if (!session.players.has(userId)) {
      return { success: false, message: "Kamu belum bergabung di dalam lobby!" };
    }

    if (session.hostId === userId && session.players.size > 1) {
      // Transfer host to next player
      session.players.delete(userId);
      const nextHost = session.players.keys().next().value;
      if (nextHost) session.hostId = nextHost;
    } else {
      session.players.delete(userId);
    }

    if (session.players.size === 0) {
      this.endGame(guildId);
      return { success: true, message: "Lobby dibubarkan karena semua pemain telah keluar." };
    }

    return {
      success: true,
      message: "Kamu telah keluar dari lobby.",
      embed: this.createLobbyEmbed(session),
      components: this.createLobbyButtons(session)
    };
  }

  /**
   * Start the match (Assign roles & enter Night Phase)
   */
  public async startGame(guildId: string, actor: User, client: Client): Promise<{ success: boolean; message: string; embed?: EmbedBuilder; components?: ActionRowBuilder<ButtonBuilder>[] }> {
    const session = this.sessions.get(guildId);
    if (!session || session.phase !== "lobby") {
      return { success: false, message: "Permainan tidak dapat dimulai saat ini!" };
    }

    const playerCount = session.players.size;
    if (playerCount < 4) {
      return {
        success: false,
        message: `Minimal dibutuhkan **4 pemain** untuk memulai permainan! (Saat ini baru ${playerCount} pemain)`
      };
    }

    // Role assignment distribution
    // 4 players: 1 WW, 1 Seer, 1 Doctor, 1 Villager
    // 5 players: 1 WW, 1 Seer, 1 Doctor, 2 Villager
    // 6-7 players: 2 WW, 1 Seer, 1 Doctor, 1 Hunter, 1-2 Villager
    // 8+ players: 2-3 WW, 1 Seer, 1 Doctor, 1 Hunter, 3+ Villager
    const playerArray = Array.from(session.players.values());
    const shuffled = [...playerArray].sort(() => Math.random() - 0.5);

    let wwCount = playerCount >= 6 ? 2 : 1;
    if (playerCount >= 10) wwCount = 3;

    let rolePool: WerewolfRole[] = [];
    for (let i = 0; i < wwCount; i++) rolePool.push("werewolf");
    rolePool.push("seer");
    rolePool.push("doctor");
    if (playerCount >= 6) rolePool.push("hunter");

    while (rolePool.length < playerCount) {
      rolePool.push("villager");
    }

    rolePool = rolePool.sort(() => Math.random() - 0.5);

    // Assign roles & Send Secret Role Cards via DM
    for (let i = 0; i < playerCount; i++) {
      const p = shuffled[i];
      p.role = rolePool[i];
      p.isAlive = true;

      try {
        const roleInfo = this.getRoleDetails(p.role);
        const dmEmbed = new EmbedBuilder()
          .setColor(roleInfo.color)
          .setTitle(`🎭 Peran Rahasiamu: ${roleInfo.name}`)
          .setDescription(
            `Hai **${p.displayName}**, peranmu di desa ini adalah **${roleInfo.name}**!\n\n` +
            `📜 **Tugas Peran:**\n${roleInfo.description}\n\n` +
            `⚠️ *Rahasiakan peran ini dari pemain lain! Maya akan memanggil giliranmu saat malam tiba.*`
          )
          .setFooter({ text: "Maya Werewolf Game Master • Rahasiakan Kartu Ini!" });

        await p.user.send({ embeds: [dmEmbed] });
      } catch (dmErr) {
        logger.warn(`WerewolfManager: Gagal mengirim DM peran ke ${p.username}:`, dmErr);
      }
    }

    session.phase = "night";
    session.dayNumber = 1;
    session.nightKills.clear();
    session.nightHeal = null;
    session.nightChecked = null;

    logger.info(`WerewolfManager: Game dimulai di guild ${guildId} dengan ${playerCount} pemain.`);

    // Voice announcement
    voiceChatManager.speak(
      guildId,
      "Peran telah dibagikan secara rahasia! Malam pertama telah tiba di desa. Semua warga desa, silakan pejamkan mata dan tertidur lelap..."
    );

    const embed = this.createNightEmbed(session);
    const components = this.createNightActionButtons(session);

    return {
      success: true,
      message: "Permainan Werewolf resmi dimulai!",
      embed,
      components
    };
  }

  /**
   * Handle night action (Werewolf Kill, Seer Check, Doctor Heal)
   */
  public async handleNightAction(
    guildId: string,
    actor: User,
    action: "kill" | "check" | "heal",
    targetUserId: string
  ): Promise<{ success: boolean; message: string; privateInfo?: string }> {
    const session = this.sessions.get(guildId);
    if (!session || session.phase !== "night") {
      return { success: false, message: "Aksi malam hanya dapat dilakukan saat fase malam!" };
    }

    const player = session.players.get(actor.id);
    if (!player || !player.isAlive) {
      return { success: false, message: "Kamu tidak berhak melakukan aksi malam!" };
    }

    const target = session.players.get(targetUserId);
    if (!target || !target.isAlive) {
      return { success: false, message: "Target yang kamu pilih tidak valid atau sudah gugur!" };
    }

    if (action === "kill") {
      if (player.role !== "werewolf") {
        return { success: false, message: "Hanya Werewolf yang dapat memilih mangsa!" };
      }
      session.nightKills.set(actor.id, targetUserId);
      return {
        success: true,
        message: `🐺 Kamu memilih **${target.displayName}** sebagai mangsa malam ini.`
      };
    }

    if (action === "heal") {
      if (player.role !== "doctor") {
        return { success: false, message: "Hanya Dokter yang dapat memberikan perlindungan!" };
      }
      session.nightHeal = targetUserId;
      return {
        success: true,
        message: `💉 Kamu memberikan ramuan pelindung kepada **${target.displayName}** malam ini.`
      };
    }

    if (action === "check") {
      if (player.role !== "seer") {
        return { success: false, message: "Hanya Penerawang yang dapat menerawang peran!" };
      }
      session.nightChecked = targetUserId;
      const isWolf = target.role === "werewolf";
      const resultText = isWolf
        ? `🔮 Hasil Terawangan: **${target.displayName}** adalah SEORANG WEREWOLF 🐺!`
        : `🔮 Hasil Terawangan: **${target.displayName}** adalah WARGA BAIK 👤.`;

      return {
        success: true,
        message: resultText,
        privateInfo: resultText
      };
    }

    return { success: false, message: "Aksi tidak dikenali." };
  }

  /**
   * Advance from Night Phase to Day Phase
   */
  public async advanceToDay(guildId: string): Promise<{ success: boolean; message: string; embed?: EmbedBuilder; components?: ActionRowBuilder<ButtonBuilder>[] }> {
    const session = this.sessions.get(guildId);
    if (!session || session.phase !== "night") {
      return { success: false, message: "Tidak dapat berpindah ke siang hari saat ini." };
    }

    // Resolve night kills
    // Majority vote among werewolves
    let victimId: string | null = null;
    if (session.nightKills.size > 0) {
      const voteCounts = new Map<string, number>();
      for (const targetId of session.nightKills.values()) {
        voteCounts.set(targetId, (voteCounts.get(targetId) || 0) + 1);
      }
      let maxVotes = 0;
      for (const [targetId, count] of voteCounts.entries()) {
        if (count > maxVotes) {
          maxVotes = count;
          victimId = targetId;
        }
      }
    }

    // Check if victim was saved by doctor
    let victimDied = false;
    let victimPlayer: WerewolfPlayer | null = null;

    if (victimId && victimId !== session.nightHeal) {
      victimPlayer = session.players.get(victimId) || null;
      if (victimPlayer) {
        victimPlayer.isAlive = false;
        victimDied = true;
      }
    }

    session.phase = "day_discussion";
    session.phase = "day_discussion";
    session.dayVotes.clear();

    const victimName = victimPlayer ? victimPlayer.displayName : "tidak ada";
    const alivePlayers = Array.from(session.players.values()).filter((p) => p.isAlive);
    const randomSuspect = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
    const suspectName = randomSuspect ? randomSuspect.displayName : "kalian";

    // Dynamic AI Morning Narration & Interrogation by Maya Game Master
    let morningNarration = "";
    try {
      const prompt = `Kamu adalah Maya, Game Master dan Narator permainan Werewolf di Voice Channel Discord.
Kondisi Pagi Hari ke-${session.dayNumber}: ${victimDied ? `Korban bernama "${victimPlayer?.displayName}" tewas dimangsa Werewolf semalam` : "Dokter berhasil menyelamatkan warga semalam sehingga tidak ada korban yang gugur"}.
Pemain yang masih hidup: ${alivePlayers.map((p) => p.displayName).join(", ")}.
Buat narasi pagi hari yang seru dan pancing diskusi dengan mengajukan 1 pertanyaan interogasi kecurigaan langsung ke "${suspectName}"!
PANDUAN KETAT:
1. HANYA 2 kalimat singkat (maksimal 20-25 kata).
2. Kalimat 1: Pengumuman pagi hari dan status korban semalam.
3. Kalimat 2: Pertanyaan interogasi / pancingan kecurigaan langsung menyebut nama "${suspectName}" (misal: semalam kamu ngapain aja di desa?).
4. DILARANG menggunakan markdown (*, _), tanda petik, atau kata ketawa (wkwk, haha).`;

      const rawNarration = await askNvidia(prompt, "Kamu adalah Maya, Game Master Werewolf yang dramatis, asik, dan suka memancing perdebatan seru.");
      morningNarration = rawNarration
        .replace(/[*_~`#>-]/g, "")
        .replace(/https?:\/\/\S+/g, "")
        .replace(/["']/g, "")
        .replace(/\b(w+k+w*k*|h+a+h*a*|h+e+h*e*|h+i+h*i*|x+i+x*i*|h+u+h*u*|l+o+l|a+w+o+k+)\b/gi, "")
        .trim();
    } catch (_) {}

    if (!morningNarration) {
      if (victimDied && victimPlayer) {
        morningNarration = `Pagi telah tiba! Semalam ${victimPlayer.displayName} gugur dimangsa Werewolf. Maya curiga nih sama ${suspectName}, semalam kamu ngapain aja di desa?`;
      } else {
        morningNarration = `Pagi telah tiba! Kabar baik, Dokter berhasil melindungi warga semalam! Tapi Maya perhatiin ${suspectName} mencurigakan banget, apa alibimu?`;
      }
    }

    voiceChatManager.speak(guildId, morningNarration);

    // Check win condition
    const win = this.checkWinCondition(session);
    if (win) {
      return this.endGameWithWinner(session, win);
    }

    const embed = new EmbedBuilder()
      .setColor(0xF59E0B)
      .setTitle(`☀️ Hari Ke-${session.dayNumber} • Diskusi & Voting Warga`)
      .setDescription(
        victimDied
          ? `🩸 **Kabar Duka:** Semalam **${victimPlayer?.displayName}** telah gugur dimangsa Werewolf!\n\n` +
            `🔍 **Interogasi Maya:** *"Maya curiga nih sama **${suspectName}**, apa alibimu semalam?"*\n\n` +
            `🗣️ **Fase Diskusi:** Bicarakan kecurigaan kalian di Voice Channel, lalu berikan suara voting untuk mengeliminasi tersangka!`
          : `✨ **Kabar Gembira:** Dokter berhasil melindungi warga! **Tidak ada yang gugur semalam.**\n\n` +
            `🔍 **Interogasi Maya:** *"Maya perhatiin gerak-gerik **${suspectName}** mencurigakan, apa alibimu?"*\n\n` +
            `🗣️ **Fase Diskusi:** Bicarakan petunjuk di Voice Channel dan voting siapa yang dicurigai!`
      )
      .addFields({
        name: `👥 Warga yang Masih Hidup (${Array.from(session.players.values()).filter((p) => p.isAlive).length})`,
        value: Array.from(session.players.values())
          .filter((p) => p.isAlive)
          .map((p) => `• <@${p.userId}> (${p.displayName})`)
          .join("\n") || "Tidak ada"
      })
      .setFooter({ text: "Maya Werewolf Game Master • Klik tombol untuk voting tersangka" })
      .setTimestamp();

    const components = this.createVotingButtons(session);

    return {
      success: true,
      message: `Hari ke-${session.dayNumber} dimulai!`,
      embed,
      components
    };
  }

  /**
   * Handle Day Vote
   */
  public castVote(
    guildId: string,
    voter: User,
    targetUserId: string
  ): { success: boolean; message: string; allVoted?: boolean } {
    const session = this.sessions.get(guildId);
    if (!session || (session.phase !== "day_discussion" && session.phase !== "day_voting")) {
      return { success: false, message: "Voting hanya dapat dilakukan pada fase siang hari!" };
    }

    const voterPlayer = session.players.get(voter.id);
    if (!voterPlayer || !voterPlayer.isAlive) {
      return { success: false, message: "Hanya pemain yang masih hidup yang dapat memberikan suara!" };
    }

    session.dayVotes.set(voter.id, targetUserId);

    const aliveCount = Array.from(session.players.values()).filter((p) => p.isAlive).length;
    const votesCount = session.dayVotes.size;

    return {
      success: true,
      message: `Suara voting kamu telah tercatat! (${votesCount}/${aliveCount} pemain telah vote)`,
      allVoted: votesCount >= aliveCount
    };
  }

  /**
   * Execute Day Vote results with Dynamic AI Reveal
   */
  public async executeVoteResults(guildId: string): Promise<{ success: boolean; message: string; embed?: EmbedBuilder; components?: ActionRowBuilder<ButtonBuilder>[] }> {
    const session = this.sessions.get(guildId);
    if (!session) {
      return { success: false, message: "Sesi tidak ditemukan." };
    }

    const voteTally = new Map<string, number>();
    for (const targetId of session.dayVotes.values()) {
      voteTally.set(targetId, (voteTally.get(targetId) || 0) + 1);
    }

    let executedId: string | null = null;
    let maxVotes = 0;
    let isTie = false;

    for (const [targetId, count] of voteTally.entries()) {
      if (count > maxVotes) {
        maxVotes = count;
        executedId = targetId;
        isTie = false;
      } else if (count === maxVotes) {
        isTie = true;
      }
    }

    let executedPlayer: WerewolfPlayer | null = null;
    if (executedId && executedId !== "skip" && !isTie) {
      executedPlayer = session.players.get(executedId) || null;
      if (executedPlayer) {
        executedPlayer.isAlive = false;
      }
    }

    // Dynamic AI Voice announcement
    let executionNarration = "";
    if (executedPlayer) {
      const roleDetails = this.getRoleDetails(executedPlayer.role);
      try {
        const prompt = `Kamu adalah Maya, Game Master Werewolf di Voice Channel Discord.
Warga desa baru saja sepakat mengeksekusi "${executedPlayer.displayName}".
Peran aslinya ternyata adalah "${roleDetails.name}".
Buat 1-2 kalimat singkat (maksimal 18-20 kata) mengumumkan eksekusi ${executedPlayer.displayName} dan mengungkap peran aslinya dengan nada dramatis!
DILARANG menggunakan markdown, tanda petik, atau kata ketawa.`;

        const rawExec = await askNvidia(prompt, "Kamu adalah Maya, Game Master Werewolf yang dramatis dan seru.");
        executionNarration = rawExec
          .replace(/[*_~`#>-]/g, "")
          .replace(/https?:\/\/\S+/g, "")
          .replace(/["']/g, "")
          .replace(/\b(w+k+w*k*|h+a+h*a*|h+e+h*e*|h+i+h*i*|x+i+x*i*|h+u+h*u*|l+o+l|a+w+o+k+)\b/gi, "")
          .trim();
      } catch (_) {}

      if (!executionNarration) {
        executionNarration = `Berdasarkan hasil voting warga, ${executedPlayer.displayName} resmi dieksekusi! Peran aslinya adalah ${roleDetails.name}! Malam telah kembali tiba di desa.`;
      }
    } else {
      executionNarration = "Hasil voting seimbang atau warga memutuskan skip! Tidak ada yang dieksekusi hari ini. Malam telah kembali tiba di desa.";
    }

    voiceChatManager.speak(guildId, executionNarration);

    // Check win condition
    const win = this.checkWinCondition(session);
    if (win) {
      return this.endGameWithWinner(session, win);
    }

    // Move to next night
    session.phase = "night";
    session.dayNumber += 1;
    session.nightKills.clear();
    session.nightHeal = null;
    session.nightChecked = null;
    session.dayVotes.clear();

    const embed = this.createNightEmbed(session);
    const components = this.createNightActionButtons(session);

    return {
      success: true,
      message: `Eksekusi selesai, malam ke-${session.dayNumber} tiba!`,
      embed,
      components
    };
  }

  /**
   * Check Win Condition
   */
  private checkWinCondition(session: WerewolfSession): "villagers" | "werewolves" | null {
    const alivePlayers = Array.from(session.players.values()).filter((p) => p.isAlive);
    const aliveWW = alivePlayers.filter((p) => p.role === "werewolf").length;
    const aliveVillagers = alivePlayers.length - aliveWW;

    if (aliveWW === 0) return "villagers";
    if (aliveWW >= aliveVillagers) return "werewolves";
    return null;
  }

  /**
   * End game with winner
   */
  private endGameWithWinner(session: WerewolfSession, winner: "villagers" | "werewolves") {
    session.phase = "game_over";

    const isVillagerWin = winner === "villagers";
    const winText = isVillagerWin
      ? "🏆 WARGA DESA MENANG! Semua Werewolf telah berhasil disingkirkan!"
      : "🐺 WEREWOLF MENANG! Serigala telah menguasai seluruh desa!";

    voiceChatManager.speak(
      session.guildId,
      isVillagerWin
        ? "Permainan selesai! Selamat untuk Warga Desa, kalian berhasil mengeliminasi semua Werewolf!"
        : "Permainan selesai! Werewolf berhasil menguasai desa dan memenangkan pertarungan!"
    );

    const embed = new EmbedBuilder()
      .setColor(isVillagerWin ? 0x10B981 : 0xEF4444)
      .setTitle("🎮 Permainan Selesai!")
      .setDescription(`## ${winText}\n\n**Daftar Peran Semua Pemain:**\n` +
        Array.from(session.players.values())
          .map((p) => `• <@${p.userId}> (${p.displayName}): **${this.getRoleDetails(p.role).name}** ${p.isAlive ? "✅ Hidup" : "💀 Gugur"}`)
          .join("\n")
      )
      .setFooter({ text: "Maya Werewolf Game Master • Terima kasih sudah bermain!" })
      .setTimestamp();

    this.sessions.delete(session.guildId);

    return {
      success: true,
      message: winText,
      embed,
      components: []
    };
  }

  /**
   * Force End Game
   */
  public endGame(guildId: string): boolean {
    const session = this.sessions.get(guildId);
    if (!session) return false;

    this.sessions.delete(guildId);
    voiceChatManager.speak(guildId, "Permainan Werewolf telah dihentikan.");
    return true;
  }

  // --- Embed & Button Helper Generators ---

  public createLobbyEmbed(session: WerewolfSession): EmbedBuilder {
    const playersList = Array.from(session.players.values())
      .map((p, idx) => `**${idx + 1}.** <@${p.userId}> (${p.displayName}) ${p.userId === session.hostId ? "👑 *Host*" : ""}`)
      .join("\n") || "*Belum ada pemain*";

    return new EmbedBuilder()
      .setColor(0x8B5CF6)
      .setTitle("🐺 Maya Werewolf • Lobby Pendaftaran")
      .setDescription(
        `Selamat datang di permainan **Werewolf** yang dipandu oleh Maya di Voice Channel!\n\n` +
        `👑 **Host:** <@${session.hostId}>\n` +
        `👥 **Jumlah Pemain:** **${session.players.size}/12** *(Minimal 4 pemain)*\n\n` +
        `**Daftar Pemain:**\n${playersList}\n\n` +
        `*Klik tombol **🎮 Gabung Game** untuk ikut bermain! Host dapat menekan **▶️ Mulai Game** jika sudah siap.*`
      )
      .setFooter({ text: "Maya Werewolf Game Master • Dipandu Langsung di Voice Channel" })
      .setTimestamp();
  }

  public createLobbyButtons(session: WerewolfSession): ActionRowBuilder<ButtonBuilder>[] {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("ww_btn:join")
        .setEmoji("🎮")
        .setLabel("Gabung Game")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("ww_btn:leave")
        .setEmoji("🚪")
        .setLabel("Keluar")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("ww_btn:start")
        .setEmoji("▶️")
        .setLabel("Mulai Game")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("ww_btn:end")
        .setEmoji("🛑")
        .setLabel("Batalkan")
        .setStyle(ButtonStyle.Danger)
    );
    return [row];
  }

  public createNightEmbed(session: WerewolfSession): EmbedBuilder {
    const aliveCount = Array.from(session.players.values()).filter((p) => p.isAlive).length;
    return new EmbedBuilder()
      .setColor(0x1E1B4B)
      .setTitle(`🌙 Malam Ke-${session.dayNumber} • Desa Tertidur Lelap`)
      .setDescription(
        `Seluruh warga desa sedang tertidur lelap di malam hari...\n\n` +
        `🐺 **Werewolf**, 🔮 **Seer**, dan 💉 **Doctor** silakan klik tombol rahasia di bawah untuk menjalankan peran masing-masing!\n\n` +
        `👥 **Warga yang Masih Hidup:** ${aliveCount} orang`
      )
      .setFooter({ text: "Maya Werewolf Game Master • Klik tombol aksi sesuai peranmu!" })
      .setTimestamp();
  }

  public createNightActionButtons(session: WerewolfSession): ActionRowBuilder<ButtonBuilder>[] {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("ww_btn:night_action_menu")
        .setEmoji("✨")
        .setLabel("Jalankan Aksi Malamku (Rahasia)")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("ww_btn:advance_day")
        .setEmoji("☀️")
        .setLabel("Lanjut ke Pagi Hari (Host/Next)")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("ww_btn:end")
        .setEmoji("🛑")
        .setLabel("Hentikan Game")
        .setStyle(ButtonStyle.Danger)
    );
    return [row];
  }

  public createVotingButtons(session: WerewolfSession): ActionRowBuilder<ButtonBuilder>[] {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("ww_btn:vote_menu")
        .setEmoji("🗳️")
        .setLabel("Beri Suara Voting (Vote Tersangka)")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("ww_btn:execute_votes")
        .setEmoji("⚖️")
        .setLabel("Hitung Hasil Voting (Eksekusi)")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("ww_btn:end")
        .setEmoji("🛑")
        .setLabel("Hentikan Game")
        .setStyle(ButtonStyle.Secondary)
    );
    return [row];
  }

  private getRoleDetails(role: WerewolfRole): { name: string; description: string; color: number } {
    switch (role) {
      case "werewolf":
        return {
          name: "Werewolf (Serigala) 🐺",
          description: "Membunuh 1 warga setiap malam bersama serigala lainnya. Menangkan game dengan menyamakan jumlah serigala dan warga!",
          color: 0xDC2626
        };
      case "seer":
        return {
          name: "Seer (Penerawang) 🔮",
          description: "Menerawang identitas asli 1 pemain setiap malam (apakah ia Werewolf atau Warga Baik). Bantu warga tanpa membocorkan posisimu!",
          color: 0x9333EA
        };
      case "doctor":
        return {
          name: "Doctor (Dokter) 💉",
          description: "Memilih 1 warga untuk diselamatkan dari serangan Werewolf setiap malam. Lindungi aset berharga desa!",
          color: 0x059669
        };
      case "hunter":
        return {
          name: "Hunter (Pemburu) 🏹",
          description: "Warga tangguh bersenjata. Jika kamu terbunuh atau dieksekusi, kamu berhak menembak mati 1 pemain pilihanmu!",
          color: 0xD97706
        };
      case "villager":
      default:
        return {
          name: "Villager (Warga Desa) 👤",
          description: "Warga biasa tanpa kekuatan supranatural. Gunakan logika, deduksi, dan instingmu saat diskusi siang hari untuk membasmi Werewolf!",
          color: 0x3B82F6
        };
    }
  }
}

export const werewolfManager = WerewolfManager.getInstance();
