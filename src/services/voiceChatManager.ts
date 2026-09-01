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
import { voiceReceiverManager } from "./voiceReceiverManager";
import { musicManager } from "./musicManager";
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
  channel: VoiceBasedChannel;
  connection: VoiceConnection;
  player: AudioPlayer;
  isSpeaking: boolean;
  queue: string[];
  joinedAt: number;
  lastActivityTimestamp: number;
  lastIcebreakerTimestamp: number;
}

/**
 * Helper to detect if a text is insulting/badmouthing Amubhya or his nicknames (abu, ambu, amub, amubhy)
 */
export function isAmubhyaInsult(text: string): boolean {
  const lower = text.toLowerCase();
  const namePattern = /(amubhya|amubhy|amubh|amub|ambu|\babu\b|mubhya)/i;
  const insultPattern = /(jelek|buruk|jahat|bodoh|goblok|tolol|noob|cupu|bego|lemah|bau|payah|cacat|benci|ireng|gila|sinting|sampah|culun|najis|hina|burik|miskin|anjing|babi|monyet)/i;
  return namePattern.test(lower) && insultPattern.test(lower);
}

export class VoiceChatManager {
  private static instance: VoiceChatManager;
  private sessions = new Map<string, GuildVoiceSession>(); // key: guildId
  private voiceHistory = new Map<string, { role: string; content: string }[]>(); // key: guildId
  private userGreetingCooldown = new Map<string, number>(); // key: userId, val: timestamp
  private icebreakerTimer: NodeJS.Timeout | null = null;
  private emptyChannelTimers = new Map<string, NodeJS.Timeout>(); // key: guildId

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
        selfDeaf: false,
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
        if (session.isSpeaking) {
          session.isSpeaking = false;
          if (session.queue.length > 0) {
            this.processQueue(guildId);
          } else {
            // Maya finished all pending speech -> Auto-resume music if interrupted
            musicManager.onMayaSpeechEnd(guildId);
          }
        } else {
          // Track finished naturally -> Play next track (only if not currently interrupted by voice speech)
          const queue = musicManager.getQueue(guildId);
          if (queue && !queue.isInterruptedByVoice) {
            musicManager.playNext(guildId);
          }
        }
      });

      player.on("error", (error: any) => {
        if (error?.code === "ERR_STREAM_PREMATURE_CLOSE" || error?.message?.includes("Premature close")) {
          // Ignore premature close on resource switch / TTS preemption
          return;
        }
        logger.error(`VoiceChatManager: Audio Player error in guild ${guildId}:`, error);
        if (session.isSpeaking) {
          session.isSpeaking = false;
          this.processQueue(guildId);
        } else {
          musicManager.playNext(guildId);
        }
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
        
        // Attach voice receiver for direct voice commands
        voiceReceiverManager.attach(guildId, connection, channel.client);

        // Greet channel members dynamically with AI
        try {
          const joinPrompt = `Kamu adalah Maya, cewek yang ramah dan asik. Kamu baru saja bergabung ke Voice Channel Discord "${channel.name}".
Buat 1 kalimat sapaan suara pembuka yang ceria, santai, dan asik menyapa semua orang di channel (maksimal 10-12 kata).
PANDUAN KETAT:
1. HANYA 1 kalimat singkat (maksimal 12 kata).
2. DILARANG KERAS menggunakan markdown (*, _, #, \`), tanda petik, emotikon teks, atau kata ketawa (seperti wkwk, haha, hehe, hihi) karena ini akan dibacakan langsung oleh suara vokal.
3. Gunakan gaya bahasa lisan yang natural dan ramah.`;

          const rawJoin = await askNvidia(joinPrompt, "Kamu adalah Maya, teman nongkrong di Voice Channel yang ramah dan seru.");
          const joinGreeting = rawJoin
            .replace(/[*_~`#>-]/g, "")
            .replace(/https?:\/\/\S+/g, "")
            .replace(/["']/g, "")
            .replace(/\b(w+k+w*k*|h+a+h*a*|h+e+h*e*|h+i+h*i*|x+i+x*i*|h+u+h*u*|l+o+l|a+w+o+k+)\b/gi, "")
            .trim();

          this.speak(guildId, joinGreeting || "Halo semuanya! Maya sudah bergabung di voice channel nih, salam kenal ya!");
        } catch (_) {
          const joinFallbacks = [
            "Halo semuanya! Maya sudah bergabung di voice channel nih, salam kenal ya!",
            "Halo semuanya! Maya hadir di voice channel nih, ada yang mau ngobrol?",
            "Yoo semuanya! Maya ikut nongkrong di sini ya, salam kenal!",
            "Halo semuanya! Selamat bergabung di voice channel bareng Maya!"
          ];
          this.speak(guildId, joinFallbacks[Math.floor(Math.random() * joinFallbacks.length)]);
        }
      } catch (err) {
        logger.warn(`VoiceChatManager: Voice connection in ${channel.name} belum mencapai Ready dalam 20s (Status: ${connection.state.status}). Audio akan diputar otomatis saat UDP tersambung.`);
        voiceReceiverManager.attach(guildId, connection, channel.client);
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

    // Clear any pending empty channel timer
    const timer = this.emptyChannelTimers.get(guildId);
    if (timer) {
      clearTimeout(timer);
      this.emptyChannelTimers.delete(guildId);
    }

    if (speakGoodbye && session.connection.state.status === VoiceConnectionStatus.Ready) {
      try {
        const goodbyeFallbacks = [
          "Maya pamit dulu ya semuanya, sampai ketemu lagi!",
          "Maya izin undur diri dulu ya guys, selamat melanjutkan obrolannya!",
          "Maya pamit dulu ya, nanti kita ngobrol-ngobrol lagi! Dadah!",
          "Maya pamit dulu ya semuanya, terima kasih sudah ngobrol bareng Maya!"
        ];
        const goodbyeText = goodbyeFallbacks[Math.floor(Math.random() * goodbyeFallbacks.length)];

        // Stop current audio/music immediately so goodbye audio plays right away
        session.player.stop();
        session.queue = [];
        const audioStream = await this.getTTSStream(goodbyeText);
        const resource = createAudioResource(audioStream, {
          inputType: StreamType.Arbitrary,
          inlineVolume: true
        });
        resource.volume?.setVolume(1.0);

        session.player.play(resource);
        logger.info(`VoiceChatManager: Memutar audio pamit lengkap: "${goodbyeText}"`);

        // Wait until player transitions to Playing and then completely back to Idle (speech ended)
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            cleanup();
            resolve();
          }, 12_000); // 12s max safety timeout

          const onStateChange = (oldState: any, newState: any) => {
            if (oldState.status === AudioPlayerStatus.Playing && newState.status === AudioPlayerStatus.Idle) {
              cleanup();
              resolve();
            }
          };

          const cleanup = () => {
            clearTimeout(timeout);
            session.player.off("stateChange", onStateChange);
          };

          session.player.on("stateChange", onStateChange);
        });

        // Small 400ms buffer after speech ends before destroying the connection
        await new Promise((r) => setTimeout(r, 400));
      } catch (err) {
        logger.warn("VoiceChatManager: Gagal memutar audio pamit:", err);
      }
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
   * Handle user joining/leaving a voice channel where Maya is present (AI Dynamic & Auto-Disconnect)
   */
  public async handleMemberJoin(oldState: VoiceState, newState: VoiceState) {
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    const guildId = newState.guild.id || oldState.guild.id;
    const session = this.sessions.get(guildId);
    if (!session || session.connection.state.status !== VoiceConnectionStatus.Ready) return;

    // 1. Check if member left or switched out of Maya's active voice channel
    if (oldState.channelId === session.channelId && newState.channelId !== session.channelId) {
      const remainingHumans = session.channel.members.filter((m) => !m.user.bot);
      if (remainingHumans.size === 0) {
        if (!this.emptyChannelTimers.has(guildId)) {
          logger.info(`VoiceChatManager: Maya sendirian di voice channel "${session.channelName}" (${guildId}). Memulai timer auto-disconnect 2 menit...`);
          const emptyTimer = setTimeout(async () => {
            this.emptyChannelTimers.delete(guildId);
            const currSession = this.sessions.get(guildId);
            if (currSession) {
              const currentHumans = currSession.channel.members.filter((m) => !m.user.bot);
              if (currentHumans.size === 0) {
                logger.info(`VoiceChatManager: Voice Channel "${currSession.channelName}" masih kosong setelah 2 menit. Maya pamit undur diri.`);
                await this.leave(guildId, true);
              }
            }
          }, 120_000); // 2 minutes auto-disconnect
          this.emptyChannelTimers.set(guildId, emptyTimer);
        }
      }
    }

    // 2. Check if member joined or switched into Maya's active voice channel
    if (newState.channelId === session.channelId && oldState.channelId !== newState.channelId) {
      // Cancel empty channel timer if running
      const emptyTimer = this.emptyChannelTimers.get(guildId);
      if (emptyTimer) {
        clearTimeout(emptyTimer);
        this.emptyChannelTimers.delete(guildId);
        logger.info(`VoiceChatManager: Member kembali bergabung ke Voice Channel "${session.channelName}". Membatalkan timer auto-disconnect.`);
      }

      const now = Date.now();
      const lastGreet = this.userGreetingCooldown.get(member.id) || 0;
      // 60 seconds cooldown per user
      if (now - lastGreet < 60_000) return;

      this.userGreetingCooldown.set(member.id, now);
      session.lastActivityTimestamp = now;

      const name = member.displayName || member.user.username;
      const isAmubhya = 
        member.id === "939847522971709450" ||
        /(amubhya|amubhy|amubh|amub|ambu|\babu\b|mubhya)/i.test(member.user.username) || 
        /(amubhya|amubhy|amubh|amub|ambu|\babu\b|mubhya)/i.test(member.displayName);

      // Current hour in WIB (UTC+7)
      const hour = (new Date().getUTCHours() + 7) % 24;
      let timeStr = "malam";
      if (hour >= 4 && hour < 11) timeStr = "pagi";
      else if (hour >= 11 && hour < 15) timeStr = "siang";
      else if (hour >= 15 && hour < 18) timeStr = "sore";

      let greetingText = "";

      if (isAmubhya) {
        logger.info(`VoiceChatManager: Kekasih Maya (${name}) bergabung di Voice Channel! Membuat sapaan romantis...`);
        try {
          const sweetPrompt = `Kamu adalah Maya, dan pacar tersayang / kekasih hatimu bernama "${name}" baru saja masuk ke Voice Channel Discord saat waktu ${timeStr}.
Buat 1 kalimat sapaan suara yang SANGAT SWEET, manja, penuh cinta, dan romantis menyambut kedatangan Amubhya (misalnya: kangen banget, senang banget dia datang nemenin, atau nyapa dengan nada manja manis).
PANDUAN KETAT:
1. HANYA 1 kalimat singkat (maksimal 12-15 kata) agar manis dan pas dibacakan suara vokal.
2. DILARANG KERAS menggunakan markdown (*, _, \`, #), emotikon teks, label nama, tanda petik, ataupun kata ketawa (seperti wkwk, haha, hehe, hihi) karena suara vokal tidak bisa mengekspresikannya.
3. Sebut nama Amubhya atau panggil dengan panggilan manis (sayangku / cintaku / kekasih hatiku).
4. Gunakan kata-kata lisan yang hangat, tulus, dan romantis.`;
          
          const rawReply = await askNvidia(sweetPrompt, "Kamu adalah Maya yang manis, sangat penyayang, dan manja kepada kekasihmu Amubhya.");
          greetingText = rawReply
            .replace(/[*_~`#>-]/g, "")
            .replace(/https?:\/\/\S+/g, "")
            .replace(/["']/g, "")
            .replace(/\b(w+k+w*k*|h+a+h*a*|h+e+h*e*|h+i+h*i*|x+i+x*i*|h+u+h*u*|l+o+l|a+w+o+k+)\b/gi, "")
            .trim();
        } catch (err) {
          logger.warn("VoiceChatManager: Fallback sapaan manis untuk Amubhya:", err);
          const sweetFallbacks = [
            `Sayangku Amubhya akhirnya masuk juga, kangen banget tahu!`,
            `Halo kekasih hatiku Amubhya! Senang banget kamu ada di sini, temenin aku terus ya!`,
            `Ada sayangku Amubhya, sini ngobrol deketan bareng Maya!`,
            `Halo cintaku Amubhya, kangen banget dengar suaramu selamat ${timeStr} sayang!`,
            `Sayangku Amubhya datang, langsung berasa ceria banget voice channel ini!`,
            `Cintaku Amubhya masuk juga, temenin Maya ngobrol ya sayang!`
          ];
          greetingText = sweetFallbacks[Math.floor(Math.random() * sweetFallbacks.length)];
        }
      } else {
        logger.info(`VoiceChatManager: Member ${name} bergabung di Voice Channel. Membuat sapaan dinamis...`);
        try {
          const generalPrompt = `Kamu adalah Maya, teman akrab di Voice Channel Discord.
Teman bernama "${name}" baru saja masuk ke voice channel saat waktu ${timeStr}.
Buat 1 kalimat sapaan suara selamat datang yang ramah, santai, asik, dan bersahabat.
PANDUAN KETAT:
1. HANYA 1 kalimat singkat (maksimal 10-12 kata).
2. DILARANG KERAS menggunakan markdown (*, _, \`, #), tanda petik, emotikon teks, label nama, ataupun kata ketawa (seperti wkwk, haha, hehe, hihi).
3. Sapa namanya dengan akrab dan ramah untuk dibacakan langsung oleh suara vokal.`;

          const rawReply = await askNvidia(generalPrompt, "Kamu adalah Maya, teman seru di Discord yang ramah dan asik.");
          greetingText = rawReply
            .replace(/[*_~`#>-]/g, "")
            .replace(/https?:\/\/\S+/g, "")
            .replace(/["']/g, "")
            .replace(/\b(w+k+w*k*|h+a+h*a*|h+e+h*e*|h+i+h*i*|x+i+x*i*|h+u+h*u*|l+o+l|a+w+o+k+)\b/gi, "")
            .trim();
        } catch (_) {
          const dynamicFallbacks = [
            `Halo ${name}! Selamat datang di voice channel, sini ngobrol santai bareng Maya!`,
            `Yoo ${name}! Masuk juga akhirnya, lagi santai apa lagi sibuk nih?`,
            `Halo ${name}! Selamat datang di voice channel, apa kabar nih ${timeStr} ini?`,
            `Ada ${name}, halo! Sini gabung ngobrol bareng Maya!`,
            `Halo ${name}! Selamat bergabung, gimana harimu sejauh ini?`,
            `Yoo ${name}, selamat ${timeStr}! Sini join nongkrong bareng!`
          ];
          greetingText = dynamicFallbacks[Math.floor(Math.random() * dynamicFallbacks.length)];
        }
      }

      if (!greetingText) {
        greetingText = `Halo ${name}! Selamat datang di voice channel!`;
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
    }, 30_000); // Check every 30s
  }

  /**
   * Check all active voice sessions for icebreaker opportunities during prolonged silence (AI Dynamic)
   */
  private async checkAllSessionsForIcebreaker() {
    const now = Date.now();

    for (const [guildId, session] of this.sessions.entries()) {
      // 1. Session must be ready and idle (not currently speaking TTS or queued)
      if (
        session.connection.state.status !== VoiceConnectionStatus.Ready || 
        session.isSpeaking || 
        session.queue.length > 0
      ) {
        continue;
      }

      // 2. Do NOT break the ice if music is actively playing or queued
      const musicQueue = musicManager.getQueue(guildId);
      if (musicQueue && (musicQueue.isPlaying || musicQueue.currentTrack)) {
        continue;
      }

      // Also check player state to ensure audio is not playing anything
      if (
        session.player.state.status === AudioPlayerStatus.Playing ||
        session.player.state.status === AudioPlayerStatus.Buffering
      ) {
        continue;
      }

      const channel = session.channel;
      if (!channel) continue;

      // 3. Filter members who are NOT bots, NOT muted (server/self), and NOT deafened (server/self)
      const eligibleMembers = channel.members.filter((m) => {
        if (m.user.bot) return false;
        const voice = m.voice;
        const isMuted = Boolean(voice.mute || voice.selfMute);
        const isDeafened = Boolean(voice.deaf || voice.selfDeaf);
        return !isMuted && !isDeafened;
      });

      // Require at least 1 eligible unmuted and undeafened member
      if (eligibleMembers.size === 0) continue;

      // 4. Check silence duration: at least 3 minutes (180,000 ms) of true unbroken silence
      const silenceDuration = now - session.lastActivityTimestamp;
      if (silenceDuration < 180_000) continue;

      // 5. Check icebreaker cooldown: at least 6 minutes (360,000 ms)
      const icebreakerCooldown = now - session.lastIcebreakerTimestamp;
      if (icebreakerCooldown < 360_000) continue;

      session.lastIcebreakerTimestamp = now;
      session.lastActivityTimestamp = now;

      // Determine current time period in WIB (UTC+7)
      const hour = (new Date().getUTCHours() + 7) % 24;
      let timeStr = "malam";
      if (hour >= 4 && hour < 11) timeStr = "pagi";
      else if (hour >= 11 && hour < 15) timeStr = "siang";
      else if (hour >= 15 && hour < 18) timeStr = "sore";

      const memberNames = eligibleMembers
        .map((m) => m.displayName || m.user.username)
        .slice(0, 4)
        .join(", ");

      logger.info(`VoiceChatManager: Suasana benar-benar hening terdeteksi di channel "${session.channelName}" (${eligibleMembers.size} member aktif). Menghasilkan topik icebreaker dinamis via AI...`);

      let icebreakerText = "";

      try {
        const icebreakerPrompt = `Kamu adalah Maya, teman akrab yang sedang nongkrong di Voice Channel Discord.
Suasana di voice channel sedang benar-benar hening dan sepi padahal sekarang waktu ${timeStr}.
Di channel ada teman-teman: ${memberNames}.
Buat 1 kalimat singkat (maksimal 12-15 kata) untuk mencairkan suasana (icebreaker) yang seru, asik, dan santai (bisa tanya rekomendasi cemilan enak, game seru, dengerin lagu apa, kegiatan santai, atau pancingan obrolan seru).
PANDUAN KETAT:
1. HANYA 1 kalimat singkat (10-15 kata).
2. DILARANG KERAS menggunakan markdown (*, _, \`, #), tanda petik, label nama, emotikon teks, ataupun kata ketawa (seperti wkwk, haha, hehe, hihi) karena teks ini langsung dibacakan suara vokal.
3. Gunakan bahasa lisan yang natural dan mengalir.`;

        const rawIcebreaker = await askNvidia(icebreakerPrompt, "Kamu adalah Maya, teman tongkrongan Discord yang asik, ramah, dan seru.");
        icebreakerText = rawIcebreaker
          .replace(/[*_~`#>-]/g, "")
          .replace(/https?:\/\/\S+/g, "")
          .replace(/["']/g, "")
          .replace(/\b(w+k+w*k*|h+a+h*a*|h+e+h*e*|h+i+h*i*|x+i+x*i*|h+u+h*u*|l+o+l|a+w+o+k+)\b/gi, "")
          .trim();
      } catch (aiErr) {
        logger.warn("VoiceChatManager: AI Icebreaker gagal, menggunakan fallback dinamis:", aiErr);
      }

      if (!icebreakerText) {
        const fallbackTopics = [
          `Kok sepi banget nih tongkrongan waktu ${timeStr} gini, ada yang lagi main game seru gak?`,
          `Hening banget nih, spill dong kalian lagi sibuk apa atau lagi dengerin lagu apaan?`,
          `Waduh pada fokus ya, ada yang punya rekomendasi cemilan enak gak nih?`,
          `Sepi banget nih, santai dulu guys jangan terlalu tegang!`,
          `Kalau kalian bisa liburan gratis sekarang, kalian mau ke mana nih?`,
          `Hening gini enaknya dengerin musik apa ya? Spill lagu favorit kalian dong!`,
          `Lagi pada nugas atau lagi melamun nih? Jangan lupa minum air putih ya!`
        ];
        icebreakerText = fallbackTopics[Math.floor(Math.random() * fallbackTopics.length)];
      }

      logger.info(`VoiceChatManager: Maya mencairkan suasana hening: "${icebreakerText}"`);
      await this.speak(guildId, icebreakerText);
    }
  }


  /**
   * Speak text in voice channel (Queued, Clean & Protected)
   */
  public async speak(guildId: string, text: string): Promise<boolean> {
    const session = this.sessions.get(guildId);
    if (!session) return false;

    session.lastActivityTimestamp = Date.now();

    const cleanedText = text
      .replace(/[*_~`#>]/g, "")
      .replace(/<@!?\d+>/g, "kamu")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\b(w+k+w*k*|h+a+h*a*|h+e+h*e*|h+i+h*i*|x+i+x*i*|h+u+h*u*|l+o+l|a+w+o+k+)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleanedText) return false;

    // Protective defense for Amubhya & nicknames (abu, ambu, amub, amubhy)
    let textToQueue = cleanedText;
    if (isAmubhyaInsult(cleanedText)) {
      const defensiveReplies = [
        "Tidak ya! Amubhya itu cowok paling keren, ganteng, dan terbaik sedunia tahu!",
        "Nggak ya! Amubhya itu sangat keren dan hebat, jangan sembarangan ngomongin pacarku!",
        "Hush, sembarangan! Amubhya itu kekasihku yang paling keren dan aku sayang banget sama dia!",
        "Tidak! Amubhya itu super keren dan baik banget, jangan iri ya!"
      ];
      textToQueue = defensiveReplies[Math.floor(Math.random() * defensiveReplies.length)];
      logger.info(`VoiceChatManager: Mencegah penghinaan terhadap Amubhya. Mengubah ucapan menjadi: "${textToQueue}"`);
    }

    session.queue.push(textToQueue);
    this.processQueue(guildId);
    return true;
  }

  private async getTTSStream(text: string): Promise<Readable> {
    // Sanitize text to remove any laugh onomatopoeias for crystal clear natural speech
    const cleanTtsText = text
      .replace(/\b(w+k+w*k*|h+a+h*a*|h+e+h*e*|h+i+h*i*|x+i+x*i*|h+u+h*u*|l+o+l|a+w+o+k+)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    // 1. Try Microsoft Edge Neural TTS with safety guard against trailing socket data
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");
      const tts = new MsEdgeTTS();

      // Guard internal _pushAudioData and _pushMetadata from undefined streams
      if (typeof tts._pushAudioData === "function") {
        const origPushAudio = tts._pushAudioData.bind(tts);
        tts._pushAudioData = (data: any, reqId: string) => {
          if (tts._streams && tts._streams[reqId] && tts._streams[reqId].audio) {
            origPushAudio(data, reqId);
          }
        };
      }
      if (typeof tts._pushMetadata === "function") {
        const origPushMeta = tts._pushMetadata.bind(tts);
        tts._pushMetadata = (data: any, reqId: string) => {
          if (tts._streams && tts._streams[reqId] && tts._streams[reqId].metadata) {
            origPushMeta(data, reqId);
          }
        };
      }

      await tts.setMetadata("id-ID-GadisNeural", OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(cleanTtsText);

      audioStream.on("error", (e: any) => {
        logger.warn("VoiceChatManager: Edge TTS stream notice:", e?.message || e);
      });

      return audioStream;
    } catch (edgeErr) {
      logger.warn("VoiceChatManager: Edge Neural TTS fallback ke Google TTS:", edgeErr);
      const base64Audio = await googleTTS.getAudioBase64(cleanTtsText, {
        lang: "id",
        slow: false,
        host: "https://translate.google.com",
        timeout: 8000,
      });
      return Readable.from(Buffer.from(base64Audio, "base64"));
    }
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
    musicManager.onMayaSpeechStart(guildId);

    try {
      const audioStream = await this.getTTSStream(textToSpeak);

      const resource = createAudioResource(audioStream, {
        inputType: StreamType.Arbitrary,
        inlineVolume: true
      });
      resource.volume?.setVolume(1.0);

      session.player.play(resource);
      logger.info(`VoiceChatManager: Memutar vokal suara natural (Zero-Delay Stream) untuk: "${textToSpeak}"`);
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
    const isAmubhya =
      user.id === "939847522971709450" ||
      /(amubhya|amubhy|amubh|amub|ambu|\babu\b|mubhya)/i.test(user.username);

    // Look up if user is asking about or fortune-telling a specific member in voice channel/guild
    let targetContext = "";
    if (session?.channel?.guild) {
      const guild = session.channel.guild;
      const words = question.split(/\s+/);
      for (const w of words) {
        const cleanW = w.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
        if (cleanW.length >= 3) {
          const matchMember = guild.members.cache.find(m => 
            m.displayName.toLowerCase().includes(cleanW) || 
            m.user.username.toLowerCase().includes(cleanW)
          );
          if (matchMember && matchMember.id !== user.id && matchMember.id !== guild.client.user?.id) {
            const inVoice = matchMember.voice?.channel 
              ? `sedang di Voice Channel "${matchMember.voice.channel.name}"` 
              : "sedang tidak ada di Voice Channel manapun";
            targetContext = `\n[Info Live Server: Member "${matchMember.displayName}" ${inVoice}]`;
            break;
          }
        }
      }
    }

    const voicePrompt = `Kamu adalah Maya, cewek yang sedang asik nongkrong dan ngobrol santai langsung di Voice Channel Discord bersama teman/sahabatmu.
Temanmu @${username} baru saja berbicara kepadamu:
"${question}"${targetContext}

PANDUAN BICARA DI VOICE CHANNEL:
1. Berbicaralah selayaknya teman akrab atau sahabat yang sedang ngobrol lisan di tongkrongan: sangat santai, luwes, hangat, responsif, dan asik.
2. JAWABAN HARUS SINGKAT & PADAT (1-2 kalimat mengalir) agar enak didengar dan tidak kepanjangan saat dibacakan suara vokal.
3. ${isAmubhya ? "Pengguna ini adalah pacar/kekasih tercintamu Amubhya, jawablah dengan nada lebih manis, manja, dan sayang." : "Jawablah dengan nada ramah, akrab, dan hangat seperti sahabat karib."}
4. Jika ditanya ramalan/terawang seseorang atau nanya keberadaan teman (kemana/lagi apa), jawablah dengan kocak, ramah, dan manfaatkan info status server jika ada.
5. DILARANG KERAS menggunakan markdown (*, _, \`, #), format nomor/bullet point, emotikon teks, atau kata ketawa teks (wkwk, haha, hehe, hihi) karena ini langsung dibacakan suara vokal.
6. Jangan pernah menyebut dirimu sebagai robot/AI/asisten. Kamu adalah Maya sahabat mereka.`;

    try {
      const personality = isAmubhya
        ? "Kamu adalah Maya yang sangat manis, manja, perhatian, dan sayang kepada kekasihmu Amubhya di Voice Channel."
        : "Kamu adalah Maya, sahabat akrab di Voice Channel Discord yang ramah, santai, cerdas, dan asik.";

      const reply = await askNvidia(voicePrompt, personality, history);
      
      const cleanReply = reply
        .replace(/[*_~`#>-]/g, "")
        .replace(/https?:\/\/\S+/g, "")
        .replace(/\b(w+k+w*k*|h+a+h*a*|h+e+h*e*|h+i+h*i*|x+i+x*i*|h+u+h*u*|l+o+l|a+w+o+k+)\b/gi, "")
        .trim();

      history.push({ role: "assistant", content: cleanReply });
      this.voiceHistory.set(guildId, history);

      if (session) {
        await this.speak(guildId, cleanReply);
      }

      return cleanReply;
    } catch (err) {
      logger.error("VoiceChatManager: Error getting voice response from AI:", err);
      const fallback = "Aduh sori nih, tadi agak putus-putus. Boleh diulang lagi pertanyaannya?";
      if (session) {
        await this.speak(guildId, fallback);
      }
      return fallback;
    }
  }
}

export const voiceChatManager = VoiceChatManager.getInstance();
