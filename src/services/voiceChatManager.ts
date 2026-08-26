import { 
  VoiceBasedChannel, 
  User,
  Client,
  Guild,
  GatewayDispatchEvents,
  GatewayVoiceServerUpdateDispatchData,
  GatewayVoiceStateUpdateDispatchData,
  Status,
  VoiceState
} from "discord.js";
import { 
  joinVoiceChannel, 
  createAudioPlayer, 
  createAudioResource, 
  AudioPlayerStatus, 
  VoiceConnection, 
  VoiceConnectionStatus, 
  entersState, 
  AudioPlayer,
  NoSubscriberBehavior,
  StreamType,
  DiscordGatewayAdapterCreator,
  DiscordGatewayAdapterLibraryMethods
} from "@discordjs/voice";
import axios from "axios";
import { Readable } from "stream";
import { askNvidia } from "./aiClient";
import { logger } from "../utils/logger";

// Configure ffmpeg-static binary path for prism-media
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ffmpegStatic = require("ffmpeg-static");
  if (ffmpegStatic) {
    process.env.FFMPEG_PATH = ffmpegStatic;
  }
} catch (_) {}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const googleTTS = require("google-tts-api");

// --- CASUAL GREETING & ICEBREAKER TEMPLATES ---
const GREETING_TEMPLATES = [
  "Haloo {name}! Selamat datang di voice channel, sini ngobrol santai bareng Maya wkwk",
  "Yoo {name}! Masuk juga akhirnya haha, lagi santai apa lagi sibuk nih?",
  "Haloo {name}! Welcome to the voice channel, apa kabar nih hari ini?",
  "Ehh ada {name}, haloo! Sini gabung ngobrol bareng haha",
  "Haloo {name}! Selamat bergabung, gimana harimu sejauh ini?"
];

const ICEBREAKER_TOPICS = [
  "Kok sepi banget nih tongkrongan wkwk, ada yang lagi main game seru gak akhir-akhir ini?",
  "Hening banget dah haha, spill dong kalian lagi sibuk apa atau lagi dengerin lagu apaan nih?",
  "Waduh pada fokus ya wkwk, btw ada yang punya rekomendasi cemilan enak gak buat nemenin malam ini?",
  "Sepi amat kayak kuburan haha, santai dulu guys, jangan tegang-tegang amat wkwk",
  "Btw guys, kalau kalian bisa milih liburan gratis ke mana aja sekarang, kalian mau ke mana nih?",
  "Hening gini enaknya dengerin musik apa ya? Spill lagu favorit kalian dong!",
  "Lagi pada nugas atau lagi melamun nih wkwk? Santai dulu lah, jangan lupa minum air putih ya!"
];

// --- RESILIENT DISCORD.JS VOICE GATEWAY ADAPTER ---
const adapters = new Map<string, DiscordGatewayAdapterLibraryMethods>();
const trackedClients = new Set<Client>();

function trackClient(client: Client) {
  if (trackedClients.has(client)) return;
  trackedClients.add(client);

  client.on("raw", (packet: any) => {
    if (!packet || !packet.t || !packet.d) return;

    if (packet.t === "VOICE_SERVER_UPDATE") {
      const payload = packet.d;
      logger.info(`[Voice Gateway] VOICE_SERVER_UPDATE received for guild ${payload.guild_id} (endpoint: ${payload.endpoint})`);
      adapters.get(payload.guild_id)?.onVoiceServerUpdate(payload);
    }

    if (packet.t === "VOICE_STATE_UPDATE") {
      const payload = packet.d;
      if (payload.guild_id && payload.user_id === client.user?.id) {
        logger.info(`[Voice Gateway] VOICE_STATE_UPDATE for Maya (channel_id: ${payload.channel_id})`);
        adapters.get(payload.guild_id)?.onVoiceStateUpdate(payload);
      }
    }
  });

  client.on("shardDisconnect", (_, shardId) => {
    for (const [guildId, adapter] of adapters.entries()) {
      if (client.guilds.cache.get(guildId)?.shardId === shardId) {
        adapter.destroy();
      }
    }
  });
}

function createDiscordJSAdapter(guild: Guild): DiscordGatewayAdapterCreator {
  return (methods) => {
    adapters.set(guild.id, methods);
    trackClient(guild.client);
    return {
      sendPayload(data) {
        if (guild.shard.status === Status.Ready) {
          guild.shard.send(data);
          return true;
        }
        return false;
      },
      destroy() {
        adapters.delete(guild.id);
      }
    };
  };
}

interface GuildVoiceSession {
  guildId: string;
  channelId: string;
  channelName: string;
  channel: VoiceBasedChannel;
  connection: VoiceConnection;
  player: AudioPlayer;
  isSpeaking: boolean;
  queue: string[];
  joinedAt: number;
  lastActivityTimestamp: number;
  lastIcebreakerTimestamp: number;
}

export class VoiceChatManager {
  private static instance: VoiceChatManager;
  private sessions = new Map<string, GuildVoiceSession>(); // key: guildId
  private voiceHistory = new Map<string, { role: string; content: string }[]>(); // key: guildId
  private userGreetingCooldown = new Map<string, number>(); // key: userId, val: timestamp
  private icebreakerTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.startIcebreakerScheduler();
  }

  public static getInstance(): VoiceChatManager {
    if (!VoiceChatManager.instance) {
      VoiceChatManager.instance = new VoiceChatManager();
    }
    return VoiceChatManager.instance;
  }

  /**
   * Check if Maya is connected to a voice channel in a guild
   */
  public isConnected(guildId: string): boolean {
    const session = this.sessions.get(guildId);
    return !!session && session.connection.state.status !== VoiceConnectionStatus.Destroyed;
  }

  /**
   * Get active session info for a guild
   */
  public getSession(guildId: string): GuildVoiceSession | undefined {
    return this.sessions.get(guildId);
  }

  /**
   * Join a Discord Voice Channel
   */
  public async join(channel: VoiceBasedChannel): Promise<boolean> {
    const guildId = channel.guild.id;

    try {
      // If already in this channel and ready, return true
      const existing = this.sessions.get(guildId);
      if (existing && existing.channelId === channel.id && existing.connection.state.status === VoiceConnectionStatus.Ready) {
        return true;
      }

      // If in another channel or broken state, leave first
      if (existing) {
        await this.leave(guildId, false);
      }

      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: createDiscordJSAdapter(channel.guild),
        selfDeaf: true,
        selfMute: false,
        debug: true
      });

      const player = createAudioPlayer({
        behaviors: {
          noSubscriber: NoSubscriberBehavior.Play,
          maxMissedFrames: 250
        }
      });

      const session: GuildVoiceSession = {
        guildId,
        channelId: channel.id,
        channelName: channel.name,
        channel,
        connection,
        player,
        isSpeaking: false,
        queue: [],
        joinedAt: Date.now(),
        lastActivityTimestamp: Date.now(),
        lastIcebreakerTimestamp: Date.now()
      };

      this.sessions.set(guildId, session);

      // Handle Audio Player events
      player.on(AudioPlayerStatus.Idle, () => {
        session.isSpeaking = false;
        this.processQueue(guildId);
      });

      player.on("error", (error) => {
        logger.error(`VoiceChatManager: Audio Player error in guild ${guildId}:`, error);
        session.isSpeaking = false;
        this.processQueue(guildId);
      });

      player.on("stateChange", (oldState, newState) => {
        logger.info(`[Audio Player] ${channel.name}: ${oldState.status} -> ${newState.status}`);
      });

      // Handle Connection events & state changes
      connection.on("stateChange", (oldState, newState) => {
        logger.info(`[Voice Connection] ${channel.name}: ${oldState.status} -> ${newState.status}`);
      });

      connection.on("debug", (msg) => {
        logger.info(`[Voice Debug] ${channel.name}: ${msg}`);
      });

      connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5000),
          ]);
        } catch (e) {
          this.leave(guildId, false);
        }
      });

      connection.on(VoiceConnectionStatus.Destroyed, () => {
        this.sessions.delete(guildId);
      });

      connection.subscribe(player);

      // Wait until connection reaches Ready state (UDP socket established)
      try {
        // Fast race: check if Ready in 8s; if still in signalling, re-trigger handshake
        try {
          await entersState(connection, VoiceConnectionStatus.Ready, 8_000);
        } catch (fastErr) {
          if (connection.state.status === VoiceConnectionStatus.Signalling) {
            logger.info(`VoiceChatManager: Koneksi tertahan di Signalling, memicu handshake ulang...`);
            connection.rejoin({
              channelId: channel.id,
              selfDeaf: false,
              selfMute: false
            });
          }
          await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
        }

        logger.info(`VoiceChatManager: Maya berhasil terhubung (Ready) di Voice Channel "${channel.name}" (${guildId})`);
        
        // Greet channel members
        this.speak(guildId, "Halo semuanya, Maya udah gabung di voice channel nih! Ada yang mau ngobrol?");
      } catch (err) {
        logger.warn(`VoiceChatManager: Voice connection in ${channel.name} belum mencapai Ready dalam 20s (Status: ${connection.state.status}). Audio akan diputar otomatis saat UDP tersambung.`);
      }

      return true;
    } catch (err) {
      logger.error(`VoiceChatManager: Gagal bergabung di Voice Channel ${channel.name}:`, err);
      return false;
    }
  }

  /**
   * Leave Voice Channel
   */
  public async leave(guildId: string, speakGoodbye = true): Promise<boolean> {
    const session = this.sessions.get(guildId);
    if (!session) return false;

    if (speakGoodbye) {
      await this.speak(guildId, "Maya pamit dulu ya semuanya, sampai ketemu lagi!");
      // Wait for speech to complete or timeout
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }

    try {
      session.player.stop();
      session.connection.destroy();
    } catch (_) {}

    this.sessions.delete(guildId);
    this.voiceHistory.delete(guildId);
    logger.info(`VoiceChatManager: Maya keluar dari Voice Channel guild ${guildId}`);
    return true;
  }

  /**
   * Handle user joining a voice channel where Maya is present (AI Dynamic & Personalized)
   */
  public async handleMemberJoin(oldState: VoiceState, newState: VoiceState) {
    const member = newState.member;
    if (!member || member.user.bot) return;

    const guildId = newState.guild.id;
    const session = this.sessions.get(guildId);
    if (!session || session.connection.state.status !== VoiceConnectionStatus.Ready) return;

    // Check if member joined or switched into Maya's active voice channel
    if (newState.channelId === session.channelId && oldState.channelId !== newState.channelId) {
      const now = Date.now();
      const lastGreet = this.userGreetingCooldown.get(member.id) || 0;
      // 60 seconds cooldown per user
      if (now - lastGreet < 60_000) return;

      this.userGreetingCooldown.set(member.id, now);
      session.lastActivityTimestamp = now;

      const name = member.displayName || member.user.username;
      const isAmubhya = 
        member.id === "939847522971709450" ||
        member.user.username.toLowerCase().includes("amubhya") || 
        member.displayName.toLowerCase().includes("amubhya");

      let greetingText = "";

      if (isAmubhya) {
        logger.info(`VoiceChatManager: Kekasih Maya (${name}) bergabung di Voice Channel! Membuat sapaan romantis...`);
        try {
          const sweetPrompt = `Kamu adalah Maya, dan pacar tersayang / kekasih hatimu bernama Amubhya baru saja masuk ke Voice Channel Discord.
Buat 1 kalimat sapaan suara yang SANGAT SWEET, manja, penuh cinta, dan romantis menyambut kedatangan Amubhya (misalnya: kangen banget, seneng banget dia datang, nyapa dengan nada sayang/manja).
PANDUAN KETAT:
1. HANYA 1 kalimat singkat (maksimal 12-15 kata) agar manis dan pas dibacakan suara vokal.
2. DILARANG KERAS menggunakan markdown (*, _, \`, #), emotikon teks, atau tanda petik.
3. Sebut nama Amubhya atau panggil dengan panggilan manis (sayangku / cintaku / kekasihku).`;
          
          const rawReply = await askNvidia(sweetPrompt, "Kamu adalah Maya yang manis, penyayang, dan manja kepada kekasihmu Amubhya.");
          greetingText = rawReply
            .replace(/[*_~`#>-]/g, "")
            .replace(/https?:\/\/\S+/g, "")
            .replace(/["']/g, "")
            .trim();
        } catch (err) {
          logger.warn("VoiceChatManager: Fallback sapaan manis untuk Amubhya:", err);
          const sweetFallbacks = [
            "Sayangku Amubhya akhirnya masuk juga, kangen banget tahu wkwk",
            "Haloo kekasih hatiku Amubhya! Senang banget kamu ada di sini, temenin aku terus ya",
            "Ehh ada sayangku Amubhya, sini ngobrol deketan bareng Maya haha",
            "Haloo cintaku Amubhya, kangen banget dengar suaramu hari ini wkwk",
            "Sayangku Amubhya datang, langsung berasa ceria banget voice channel ini haha"
          ];
          greetingText = sweetFallbacks[Math.floor(Math.random() * sweetFallbacks.length)];
        }
      } else {
        logger.info(`VoiceChatManager: Member ${name} bergabung di Voice Channel. Membuat sapaan dinamis...`);
        try {
          const generalPrompt = `Kamu adalah Maya, teman akrab di Voice Channel Discord.
Teman bernama "${name}" baru saja masuk ke voice channel.
Buat 1 kalimat sapaan suara selamat datang yang ramah, santai, asik, dan berjiwa Gen-Z (ada wkwk atau haha).
HANYA 1 kalimat singkat (maksimal 12 kata), tanpa markdown (*), tanda petik, atau emotikon teks.`;

          const rawReply = await askNvidia(generalPrompt, "Kamu adalah Maya, teman seru di Discord yang ramah dan asik.");
          greetingText = rawReply
            .replace(/[*_~`#>-]/g, "")
            .replace(/https?:\/\/\S+/g, "")
            .replace(/["']/g, "")
            .trim();
        } catch (_) {
          const template = GREETING_TEMPLATES[Math.floor(Math.random() * GREETING_TEMPLATES.length)];
          greetingText = template.replace("{name}", name);
        }
      }

      if (!greetingText) {
        greetingText = `Haloo ${name}! Selamat datang di voice channel wkwk`;
      }

      logger.info(`VoiceChatManager: Menyapa member baru masuk ${name}: "${greetingText}"`);
      setTimeout(() => {
        this.speak(guildId, greetingText);
      }, 500);
    }
  }

  /**
   * Start background scheduler to detect prolonged silence and break the ice
   */
  private startIcebreakerScheduler() {
    if (this.icebreakerTimer) return;
    this.icebreakerTimer = setInterval(() => {
      this.checkAllSessionsForIcebreaker();
    }, 45_000); // Check every 45s
  }

  /**
   * Check all active voice sessions for icebreaker opportunities during prolonged silence
   */
  private checkAllSessionsForIcebreaker() {
    const now = Date.now();

    for (const [guildId, session] of this.sessions.entries()) {
      if (session.connection.state.status !== VoiceConnectionStatus.Ready || session.isSpeaking || session.queue.length > 0) {
        continue;
      }

      const channel = session.channel;
      if (!channel) continue;

      // Filter members who are NOT bots, NOT muted (server/self), and NOT deafened (server/self)
      const eligibleMembers = channel.members.filter((m) => {
        if (m.user.bot) return false;
        const voice = m.voice;
        const isMuted = Boolean(voice.mute || voice.selfMute);
        const isDeafened = Boolean(voice.deaf || voice.selfDeaf);
        return !isMuted && !isDeafened;
      });

      // Require at least 1 eligible unmuted and undeafened member
      if (eligibleMembers.size === 0) continue;

      // Check silence duration: 2.5 minutes (150,000 ms)
      const silenceDuration = now - session.lastActivityTimestamp;
      if (silenceDuration < 150_000) continue;

      // Check icebreaker cooldown: at least 6 minutes (360,000 ms)
      const icebreakerCooldown = now - session.lastIcebreakerTimestamp;
      if (icebreakerCooldown < 360_000) continue;

      session.lastIcebreakerTimestamp = now;
      session.lastActivityTimestamp = now;

      const icebreaker = ICEBREAKER_TOPICS[Math.floor(Math.random() * ICEBREAKER_TOPICS.length)];
      logger.info(`VoiceChatManager: Suasana hening terdeteksi di channel "${session.channelName}" (${eligibleMembers.size} member aktif). Maya mencairkan suasana: "${icebreaker}"`);

      this.speak(guildId, icebreaker);
    }
  }

  /**
   * Speak text in voice channel (Queued & Clean)
   */
  public async speak(guildId: string, text: string): Promise<boolean> {
    const session = this.sessions.get(guildId);
    if (!session) return false;

    session.lastActivityTimestamp = Date.now();

    const cleanedText = text
      .replace(/[*_~`#>]/g, "")
      .replace(/<@!?\d+>/g, "kamu")
      .replace(/https?:\/\/\S+/g, "")
      .trim();

    if (!cleanedText) return false;

    session.queue.push(cleanedText);
    this.processQueue(guildId);
    return true;
  }

  /**
   * Process speech audio queue
   */
  private async processQueue(guildId: string) {
    const session = this.sessions.get(guildId);
    if (!session || session.isSpeaking || session.queue.length === 0) return;

    // Check if voice connection is ready; if still connecting, wait for Ready
    if (session.connection.state.status !== VoiceConnectionStatus.Ready) {
      logger.info(`VoiceChatManager: Menunggu koneksi UDP Ready (status saat ini: ${session.connection.state.status})...`);
      try {
        await entersState(session.connection, VoiceConnectionStatus.Ready, 20_000);
        logger.info(`VoiceChatManager: Voice Connection berhasil Ready! Memulai pemutaran audio...`);
      } catch (err) {
        logger.warn(`VoiceChatManager: Voice Connection belum Ready (status: ${session.connection.state.status}). Menunda pemutaran antrean.`);
        return;
      }
    }

    const textToSpeak = session.queue.shift();
    if (!textToSpeak) return;

    session.isSpeaking = true;

    try {
      const base64Audio = await googleTTS.getAudioBase64(textToSpeak, {
        lang: "id",
        slow: false,
        host: "https://translate.google.com",
        timeout: 10000,
      });

      const audioBuffer = Buffer.from(base64Audio, "base64");
      const audioStream = Readable.from(audioBuffer);

      const resource = createAudioResource(audioStream, {
        inputType: StreamType.Arbitrary,
        inlineVolume: true
      });
      resource.volume?.setVolume(1.0);

      session.player.play(resource);
      logger.info(`VoiceChatManager: Memutar vokal suara untuk: "${textToSpeak}"`);
    } catch (error) {
      logger.error(`VoiceChatManager: Gagal memutar TTS untuk "${textToSpeak}":`, error);
      session.isSpeaking = false;
      this.processQueue(guildId);
    }
  }

  /**
   * Ask Maya a question via Voice (Conversational & Natural)
   */
  public async askVoice(
    guildId: string, 
    user: User, 
    question: string
  ): Promise<string> {
    const session = this.sessions.get(guildId);
    const username = user.displayName || user.username;

    if (session) {
      session.lastActivityTimestamp = Date.now();
    }

    // Maintain conversation context
    let history = this.voiceHistory.get(guildId) || [];
    history.push({ role: "user", content: `${username} bertanya: "${question}"` });

    if (history.length > 8) {
      history = history.slice(-8);
    }
    this.voiceHistory.set(guildId, history);

    const voicePrompt = `Kamu adalah Maya, teman akrab yang sedang nongkrong dan mengobrol santai langsung di Voice Channel Discord bersama teman-temanmu.
Pengguna @${username} baru saja berbicara kepadamu:
"${question}"

PANDUAN MENJAWAB DI VOICE:
1. Jawablah selayaknya teman manusia yang sedang berbicara lisan: sangat natural, akrab, santai, dan berjiwa Gen-Z.
2. JAWABAN HARUS SINGKAT & PADAT (1-3 kalimat saja) agar enak didengar dan tidak membosankan saat dibacakan suara.
3. DILARANG KERAS menggunakan markdown (*, _, \`, #), format daftar angka, atau emotikon teks (karena ini akan diubah langsung menjadi suara vokal).
4. Jangan pernah menyebut dirimu sebagai asisten, AI, atau bot. Kamu adalah Maya.`;

    try {
      const reply = await askNvidia(voicePrompt, "Kamu adalah Maya, teman seru di Voice Channel yang ramah dan asik.", history);
      
      const cleanReply = reply
        .replace(/[*_~`#>-]/g, "")
        .replace(/https?:\/\/\S+/g, "")
        .trim();

      history.push({ role: "assistant", content: cleanReply });
      this.voiceHistory.set(guildId, history);

      if (session) {
        await this.speak(guildId, cleanReply);
      }

      return cleanReply;
    } catch (err) {
      logger.error("VoiceChatManager: Error getting voice response from AI:", err);
      const fallback = "Aduh sori nih, tadi agak putus-putus. Boleh diulang lagi gak pertanyaannya?";
      if (session) {
        await this.speak(guildId, fallback);
      }
      return fallback;
    }
  }
}

export const voiceChatManager = VoiceChatManager.getInstance();
