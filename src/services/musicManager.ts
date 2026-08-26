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
  sourceType?: "youtube";
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

  private constructor() {}

  public static getInstance(): MusicManager {
    if (!MusicManager.instance) {
      MusicManager.instance = new MusicManager();
    }
    return MusicManager.instance;
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
   * Search and enqueue a song (YouTube only, highest quality)
   */
  public async play(
    guildId: string, 
    query: string, 
    user: User, 
    voiceChannel?: VoiceBasedChannel
  ): Promise<{ success: boolean; message: string; track?: SongTrack }> {
    const queue = this.getOrCreateQueue(guildId);

    // If bot not connected and voice channel provided, join
    if (!voiceChatManager.isConnected(guildId) && voiceChannel) {
      const joined = await voiceChatManager.join(voiceChannel);
      if (!joined) {
        return { success: false, message: "Maya gagal bergabung ke Voice Channel!" };
      }
    }

    try {
      let trackInfo: SongTrack | null = null;

      // 1. Check if direct YouTube URL
      if (query.startsWith("http://") || query.startsWith("https://")) {
        const validation = await play.validate(query);
        if (validation === "yt_video") {
          const info = await play.video_info(query);
          const videoUrl = info.video_details.url;
          if (!videoUrl || !videoUrl.startsWith("http")) {
            return { success: false, message: "URL YouTube tidak valid atau video tidak tersedia!" };
          }
          trackInfo = {
            title: info.video_details.title || "Unknown Title",
            url: videoUrl,
            duration: info.video_details.durationRaw || "0:00",
            thumbnail: info.video_details.thumbnails[0]?.url,
            requestedBy: user.displayName || user.username,
            channelTitle: info.video_details.channel?.name || "YouTube",
            sourceType: "youtube",
          };
        } else {
          return { success: false, message: "Hanya URL YouTube yang didukung. Masukkan link YouTube yang valid!" };
        }
      }

      // 2. Search YouTube (try up to 5 results to find one with valid URL)
      if (!trackInfo) {
        const ytResults = await play.search(query, { source: { youtube: "video" }, limit: 5 });
        if (ytResults && ytResults.length > 0) {
          for (const res of ytResults) {
            // Validate URL before using — play-dl can return undefined URL on some results
            if (!res.url || !res.url.startsWith("http")) {
              logger.warn(`MusicManager: Hasil pencarian "${res.title}" memiliki URL tidak valid, melewati...`);
              continue;
            }
            trackInfo = {
              title: res.title || query,
              url: res.url,
              duration: res.durationRaw || "0:00",
              thumbnail: res.thumbnails[0]?.url,
              requestedBy: user.displayName || user.username,
              channelTitle: res.channel?.name || "YouTube",
              sourceType: "youtube",
            };
            break;
          }
        }
      }

      if (!trackInfo) {
        return { success: false, message: `Lagu dengan judul "${query}" tidak ditemukan di YouTube!` };
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
   * Stream YouTube audio track with highest quality (quality: 0 = best available)
   */
  private async streamTrack(guildId: string, track: SongTrack) {
    const queue = this.getOrCreateQueue(guildId);
    const session = voiceChatManager.getSession(guildId);

    if (!session) {
      logger.warn(`MusicManager: Sesi voice tidak ditemukan untuk guild ${guildId}`);
      queue.isPlaying = false;
      queue.currentTrack = null;
      return;
    }

    // Guard: URL harus valid sebelum di-stream
    if (!track.url || !track.url.startsWith("http")) {
      logger.error(`MusicManager: URL tidak valid untuk "${track.title}" (url=${track.url}), melewati lagu ini.`);
      queue.currentTrack = null;
      queue.isPlaying = false;
      await this.playNext(guildId);
      return;
    }

    try {
      // quality: 0 = highest quality available (prefers Opus/WebM ~160kbps, falls back to m4a 128kbps)
      const stream = await play.stream(track.url, { quality: 0 });

      const resource = createAudioResource(stream.stream, {
        // If stream is already Opus, pass through directly (no re-encoding = best quality)
        inputType: stream.type === "opus" ? StreamType.Opus : StreamType.Arbitrary,
        inlineVolume: true,
      });
      resource.volume?.setVolume(0.85);

      queue.isPlaying = true;
      queue.isPaused = false;
      queue.isInterruptedByVoice = false;

      session.player.play(resource);
      logger.info(`MusicManager: Memutar "${track.title}" [YouTube HQ] di guild ${guildId}`);
    } catch (err: any) {
      logger.error(`MusicManager: Gagal streaming "${track.title}" — ${err.message}. Melewati lagu...`);
      // Reset state agar tidak stuck, lalu coba lagu berikutnya
      queue.isPlaying = false;
      queue.currentTrack = null;
      await this.playNext(guildId);
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
