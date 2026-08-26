import { 
  VoiceBasedChannel, 
  User 
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
  StreamType
} from "@discordjs/voice";
import axios from "axios";
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
        adapterCreator: channel.guild.voiceAdapterCreator as any,
        selfDeaf: false,
        selfMute: false
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

      // Handle Connection state
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

      // Wait until connection reaches Ready state (UDP socket established)
      try {
        await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
      } catch (err) {
        logger.warn(`VoiceChatManager: Voice connection in ${channel.name} took too long to become Ready, continuing...`);
      }

      connection.subscribe(player);

      logger.info(`VoiceChatManager: Maya berhasil bergabung di Voice Channel "${channel.name}" (${guildId})`);

      // Greet channel members
      setTimeout(() => {
        this.speak(guildId, "Halo semuanya, Maya udah gabung di voice channel nih! Ada yang mau ngobrol?");
      }, 500);

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

    const textToSpeak = session.queue.shift();
    if (!textToSpeak) return;

    session.isSpeaking = true;

    try {
      const url = googleTTS.getAudioUrl(textToSpeak, {
        lang: "id",
        slow: false,
        host: "https://translate.google.com",
        timeout: 10000,
      });

      const response = await axios.get(url, { 
        responseType: "stream", 
        timeout: 10000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });

      const resource = createAudioResource(response.data, {
        inputType: StreamType.Arbitrary,
        inlineVolume: true
      });
      resource.volume?.setVolume(1.0);

      session.player.play(resource);
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
