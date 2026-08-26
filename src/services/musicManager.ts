import { 
  VoiceBasedChannel,
  User 
} from "discord.js";
import { 
  createAudioResource, 
  StreamType 
} from "@discordjs/voice";
import play from "play-dl";
import { voiceChatManager } from "./voiceChatManager";
import { logger } from "../utils/logger";

export interface SongTrack {
  title: string;
  url: string;
  duration: string;
  thumbnail?: string;
  requestedBy: string;
  channelTitle?: string;
  sourceType?: "youtube" | "soundcloud" | "spotify";
}

export interface GuildMusicQueue {
  guildId: string;
  tracks: SongTrack[];
  currentTrack: SongTrack | null;
  isPlaying: boolean;
  isPaused: boolean;
  isInterruptedByVoice: boolean;
}

export class MusicManager {
  private static instance: MusicManager;
  private queues = new Map<string, GuildMusicQueue>(); // key: guildId
  private soundCloudInitialized = false;

  private constructor() {
    this.initSoundCloud();
  }

  public static getInstance(): MusicManager {
    if (!MusicManager.instance) {
      MusicManager.instance = new MusicManager();
    }
    return MusicManager.instance;
  }

  private async initSoundCloud() {
    if (this.soundCloudInitialized) return;
    try {
      const clientId = await play.getFreeClientID();
      if (clientId) {
        await play.setToken({ soundcloud: { client_id: clientId } });
        this.soundCloudInitialized = true;
        logger.info(`MusicManager: SoundCloud Client ID berhasil diaktifkan: ${clientId}`);
      }
    } catch (err) {
      logger.warn("MusicManager: Gagal inisialisasi SoundCloud Client ID:", err);
    }
  }

  public getQueue(guildId: string): GuildMusicQueue | undefined {
    return this.queues.get(guildId);
  }

  private getOrCreateQueue(guildId: string): GuildMusicQueue {
    let queue = this.queues.get(guildId);
    if (!queue) {
      queue = {
        guildId,
        tracks: [],
        currentTrack: null,
        isPlaying: false,
        isPaused: false,
        isInterruptedByVoice: false,
      };
      this.queues.set(guildId, queue);
    }
    return queue;
  }

  /**
   * Search and enqueue a song (Supports SoundCloud & YouTube)
   */
  public async play(
    guildId: string, 
    query: string, 
    user: User, 
    voiceChannel?: VoiceBasedChannel
  ): Promise<{ success: boolean; message: string; track?: SongTrack }> {
    const queue = this.getOrCreateQueue(guildId);
    await this.initSoundCloud();

    // If bot not connected and voice channel provided, join
    if (!voiceChatManager.isConnected(guildId) && voiceChannel) {
      const joined = await voiceChatManager.join(voiceChannel);
      if (!joined) {
        return { success: false, message: "Maya gagal bergabung ke Voice Channel!" };
      }
    }

    try {
      let trackInfo: SongTrack | null = null;

      // 1. Check if direct URL
      if (query.startsWith("http://") || query.startsWith("https://")) {
        const validation = await play.validate(query);
        if (validation === "yt_video") {
          const info = await play.video_info(query);
          trackInfo = {
            title: info.video_details.title || "Unknown Title",
            url: info.video_details.url,
            duration: info.video_details.durationRaw || "0:00",
            thumbnail: info.video_details.thumbnails[0]?.url,
            requestedBy: user.displayName || user.username,
            channelTitle: info.video_details.channel?.name || "YouTube",
            sourceType: "youtube",
          };
        } else if (validation === "so_track") {
          const info = await play.soundcloud(query) as any;
          trackInfo = {
            title: info.name || info.title || "Unknown Title",
            url: info.url,
            duration: info.durationRaw || "0:00",
            thumbnail: info.thumbnail,
            requestedBy: user.displayName || user.username,
            channelTitle: info.user?.name || "SoundCloud",
            sourceType: "soundcloud",
          };
        }
      }

      // 2. Search SoundCloud first for 100% reliable streaming
      if (!trackInfo) {
        try {
          const scResults = await play.search(query, { source: { soundcloud: "tracks" }, limit: 1 });
          if (scResults && scResults.length > 0) {
            const res = scResults[0] as any;
            trackInfo = {
              title: res.name || res.title || query,
              url: res.url,
              duration: res.durationRaw || "3:30",
              thumbnail: res.thumbnail,
              requestedBy: user.displayName || user.username,
              channelTitle: res.user?.name || "SoundCloud",
              sourceType: "soundcloud",
            };
          }
        } catch (scErr) {
          logger.warn("MusicManager: SoundCloud search failed, falling back to YouTube:", scErr);
        }
      }

      // 3. Fallback to YouTube Search
      if (!trackInfo) {
        const ytResults = await play.search(query, { limit: 1 });
        if (ytResults && ytResults.length > 0) {
          const res = ytResults[0];
          trackInfo = {
            title: res.title || query,
            url: res.url,
            duration: res.durationRaw || "0:00",
            thumbnail: res.thumbnails[0]?.url,
            requestedBy: user.displayName || user.username,
            channelTitle: res.channel?.name || "YouTube",
            sourceType: "youtube",
          };
        }
      }

      if (!trackInfo) {
        return { success: false, message: `Lagu dengan judul "${query}" tidak ditemukan!` };
      }

      // If already playing, add to queue
      if (queue.isPlaying || queue.currentTrack) {
        queue.tracks.push(trackInfo);
        logger.info(`MusicManager: Menambahkan ke antrean (${guildId}): "${trackInfo.title}"`);
        return { 
          success: true, 
          message: `Lagu **${trackInfo.title}** berhasil ditambahkan ke antrean! (Posisi: #${queue.tracks.length})`, 
          track: trackInfo 
        };
      }

      // Start playing immediately
      queue.currentTrack = trackInfo;
      await this.streamTrack(guildId, trackInfo);

      return { 
        success: true, 
        message: `Memutar lagu: **${trackInfo.title}** 🎶`, 
        track: trackInfo 
      };
    } catch (err: any) {
      logger.error(`MusicManager: Error saat memutar lagu di guild ${guildId}:`, err);
      return { success: false, message: `Gagal memutar lagu: ${err.message || "Error tidak diketahui"}` };
    }
  }

  /**
   * Stream audio track to session player with automatic SoundCloud fallback
   */
  private async streamTrack(guildId: string, track: SongTrack) {
    const queue = this.getOrCreateQueue(guildId);
    const session = voiceChatManager.getSession(guildId);

    if (!session) {
      logger.warn(`MusicManager: Sesi voice tidak ditemukan untuk guild ${guildId}`);
      queue.isPlaying = false;
      return;
    }

    try {
      let stream: any = null;

      try {
        stream = await play.stream(track.url);
      } catch (streamErr) {
        logger.warn(`MusicManager: Stream langsung gagal untuk "${track.title}", mencoba fallback SoundCloud...`, streamErr);
        // Search & stream on SoundCloud as resilient fallback
        const scResults = await play.search(track.title, { source: { soundcloud: "tracks" }, limit: 1 });
        if (scResults && scResults.length > 0) {
          stream = await play.stream(scResults[0].url);
        } else {
          throw streamErr;
        }
      }

      const resource = createAudioResource(stream.stream, {
        inputType: stream.type === "opus" ? StreamType.Opus : StreamType.Arbitrary,
        inlineVolume: true,
      });
      resource.volume?.setVolume(0.85);

      queue.isPlaying = true;
      queue.isPaused = false;
      queue.isInterruptedByVoice = false;

      session.player.play(resource);
      logger.info(`MusicManager: Sedang memutar lagu "${track.title}" di guild ${guildId}`);
    } catch (err) {
      logger.error(`MusicManager: Gagal streaming track "${track.title}":`, err);
      this.playNext(guildId);
    }
  }

  /**
   * Play next track in queue
   */
  public async playNext(guildId: string) {
    const queue = this.queues.get(guildId);
    if (!queue) return;

    if (queue.tracks.length > 0) {
      const nextTrack = queue.tracks.shift()!;
      queue.currentTrack = nextTrack;
      await this.streamTrack(guildId, nextTrack);
    } else {
      queue.currentTrack = null;
      queue.isPlaying = false;
      queue.isPaused = false;
      queue.isInterruptedByVoice = false;
      logger.info(`MusicManager: Antrean musik selesai di guild ${guildId}`);
    }
  }

  /**
   * Skip current song
   */
  public async skip(guildId: string): Promise<boolean> {
    const queue = this.queues.get(guildId);
    if (!queue || !queue.currentTrack) return false;

    const skippedTitle = queue.currentTrack.title;
    logger.info(`MusicManager: Melewati lagu "${skippedTitle}" di guild ${guildId}`);
    await this.playNext(guildId);
    return true;
  }

  /**
   * Pause music
   */
  public pause(guildId: string): boolean {
    const queue = this.queues.get(guildId);
    const session = voiceChatManager.getSession(guildId);
    if (!queue || !queue.isPlaying || !session) return false;

    session.player.pause();
    queue.isPaused = true;
    return true;
  }

  /**
   * Resume music
   */
  public resume(guildId: string): boolean {
    const queue = this.queues.get(guildId);
    const session = voiceChatManager.getSession(guildId);
    if (!queue || !queue.isPaused || !session) return false;

    session.player.unpause();
    queue.isPaused = false;
    return true;
  }

  /**
   * Stop music and clear queue
   */
  public stop(guildId: string): boolean {
    const queue = this.queues.get(guildId);
    const session = voiceChatManager.getSession(guildId);
    if (!queue) return false;

    queue.tracks = [];
    queue.currentTrack = null;
    queue.isPlaying = false;
    queue.isPaused = false;
    queue.isInterruptedByVoice = false;

    if (session) {
      session.player.stop();
    }
    return true;
  }

  /**
   * Called when Maya starts speaking TTS (Voice Greeting / Answer / Icebreaker)
   */
  public onMayaSpeechStart(guildId: string) {
    const queue = this.queues.get(guildId);
    if (queue && queue.isPlaying && queue.currentTrack && !queue.isPaused) {
      queue.isInterruptedByVoice = true;
      logger.info(`MusicManager: Maya berbicara. Menjeda musik "${queue.currentTrack.title}" sementara...`);
    }
  }

  /**
   * Called when Maya finishes speaking TTS -> Auto Resume Music
   */
  public async onMayaSpeechEnd(guildId: string) {
    const queue = this.queues.get(guildId);
    if (queue && queue.isInterruptedByVoice && queue.currentTrack) {
      queue.isInterruptedByVoice = false;
      logger.info(`MusicManager: Maya selesai berbicara. Melanjutkan pemutaran musik "${queue.currentTrack.title}"...`);
      await this.streamTrack(guildId, queue.currentTrack);
    }
  }
}

export const musicManager = MusicManager.getInstance();
