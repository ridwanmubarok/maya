import { 
  VoiceBasedChannel, 
  User,
  Client,
  Guild,
  GatewayDispatchEvents,
  GatewayVoiceServerUpdateDispatchData,
  GatewayVoiceStateUpdateDispatchData,
  Status
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
  connection: VoiceConnection;
  player: AudioPlayer;
  isSpeaking: boolean;
  queue: string[];
  joinedAt: number;
}

export class VoiceChatManager {
  private static instance: VoiceChatManager;
  private sessions = new Map<string, GuildVoiceSession>(); // key: guildId
  private voiceHistory = new Map<string, { role: string; content: string }[]>(); // key: guildId

  private constructor() {}

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
        connection,
        player,
        isSpeaking: false,
        queue: [],
        joinedAt: Date.now()
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
   * Speak text in voice channel (Queued & Clean)
   */
  public async speak(guildId: string, text: string): Promise<boolean> {
    const session = this.sessions.get(guildId);
    if (!session) return false;

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
