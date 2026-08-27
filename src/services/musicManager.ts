import { 
  VoiceBasedChannel,
  User,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";
import { 
  createAudioResource, 
  StreamType,
  AudioResource
} from "@discordjs/voice";
import play from "play-dl";
import { voiceChatManager } from "./voiceChatManager";
import { logger } from "../utils/logger";

export type LoopMode = "off" | "track" | "queue";

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
  loopMode: LoopMode;
  volume: number; // 1 - 100
  currentResource: AudioResource | null;
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
        loopMode: "off",
        volume: 85,
        currentResource: null
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
  ): Promise<{ success: boolean; message: string; track?: SongTrack; queue?: GuildMusicQueue }> {
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
          track: trackInfo,
          queue
        };
      }

      // Start playing immediately
      queue.currentTrack = trackInfo;
      await this.streamTrack(guildId, trackInfo);

      return { 
        success: true, 
        message: `Memutar lagu: **${trackInfo.title}** 🎶`, 
        track: trackInfo,
        queue
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
      queue.currentResource = null;
      return;
    }

    // Guard: URL harus valid sebelum di-stream
    if (!track.url || !track.url.startsWith("http")) {
      logger.error(`MusicManager: URL tidak valid untuk "${track.title}" (url=${track.url}), melewati lagu ini.`);
      queue.currentTrack = null;
      queue.isPlaying = false;
      queue.currentResource = null;
      await this.playNext(guildId);
      return;
    }

    try {
      // quality: 0 = highest quality available (prefers Opus/WebM ~160kbps, falls back to m4a 128kbps)
      const stream = await play.stream(track.url, { quality: 0 });

      const resource = createAudioResource(stream.stream, {
        inputType: stream.type === "opus" ? StreamType.Opus : StreamType.Arbitrary,
        inlineVolume: true,
      });
      resource.volume?.setVolume(queue.volume / 100);

      queue.currentResource = resource;
      queue.isPlaying = true;
      queue.isPaused = false;
      queue.isInterruptedByVoice = false;

      session.player.play(resource);
      logger.info(`MusicManager: Memutar "${track.title}" [YouTube HQ | Vol: ${queue.volume}%] di guild ${guildId}`);
    } catch (err: any) {
      logger.error(`MusicManager: Gagal streaming "${track.title}" — ${err.message}. Melewati lagu...`);
      queue.isPlaying = false;
      queue.currentTrack = null;
      queue.currentResource = null;
      await this.playNext(guildId);
    }
  }

  /**
   * Play next track in queue with Loop Mode support (track / queue / off)
   */
  public async playNext(guildId: string) {
    const queue = this.queues.get(guildId);
    if (!queue) return;

    // 1. Loop Track: Replay current track indefinitely
    if (queue.loopMode === "track" && queue.currentTrack) {
      logger.info(`MusicManager: Mengulang lagu saat ini "${queue.currentTrack.title}" (Loop: Track)`);
      await this.streamTrack(guildId, queue.currentTrack);
      return;
    }

    // 2. Loop Queue: Re-add finished track to the end of queue
    if (queue.loopMode === "queue" && queue.currentTrack) {
      queue.tracks.push(queue.currentTrack);
    }

    // 3. Normal / Queue progression
    if (queue.tracks.length > 0) {
      const nextTrack = queue.tracks.shift()!;
      queue.currentTrack = nextTrack;
      await this.streamTrack(guildId, nextTrack);
    } else {
      queue.currentTrack = null;
      queue.currentResource = null;
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

    // If loop is "track", temporarily bypass so it plays next track
    if (queue.loopMode === "track") {
      if (queue.tracks.length > 0) {
        const nextTrack = queue.tracks.shift()!;
        queue.currentTrack = nextTrack;
        await this.streamTrack(guildId, nextTrack);
        return true;
      } else {
        queue.currentTrack = null;
        queue.currentResource = null;
        queue.isPlaying = false;
        queue.isPaused = false;
        const session = voiceChatManager.getSession(guildId);
        session?.player.stop();
        return true;
      }
    }

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
    queue.currentResource = null;
    queue.isPlaying = false;
    queue.isPaused = false;
    queue.isInterruptedByVoice = false;

    if (session) {
      session.player.stop();
    }
    return true;
  }

  /**
   * Set or toggle Loop Mode ("off" | "track" | "queue")
   */
  public setLoop(guildId: string, mode?: LoopMode): LoopMode {
    const queue = this.getOrCreateQueue(guildId);
    if (mode) {
      queue.loopMode = mode;
    } else {
      // Cycle: off -> track -> queue -> off
      if (queue.loopMode === "off") queue.loopMode = "track";
      else if (queue.loopMode === "track") queue.loopMode = "queue";
      else queue.loopMode = "off";
    }
    logger.info(`MusicManager: Loop mode guild ${guildId} diubah menjadi: ${queue.loopMode}`);
    return queue.loopMode;
  }

  /**
   * Shuffle queue tracks using Fisher-Yates
   */
  public shuffle(guildId: string): boolean {
    const queue = this.queues.get(guildId);
    if (!queue || queue.tracks.length <= 1) return false;

    for (let i = queue.tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue.tracks[i], queue.tracks[j]] = [queue.tracks[j], queue.tracks[i]];
    }

    logger.info(`MusicManager: Berhasil mengacak ${queue.tracks.length} lagu di antrean guild ${guildId}`);
    return true;
  }

  /**
   * Set volume (1 - 100) with live adjustment
   */
  public setVolume(guildId: string, volume: number): number {
    const queue = this.getOrCreateQueue(guildId);
    const clamped = Math.max(1, Math.min(100, Math.round(volume)));
    queue.volume = clamped;

    if (queue.currentResource && queue.currentResource.volume) {
      queue.currentResource.volume.setVolume(clamped / 100);
    }

    logger.info(`MusicManager: Volume guild ${guildId} diatur ke ${clamped}%`);
    return clamped;
  }

  /**
   * Adjust volume by delta (e.g. +10, -10)
   */
  public changeVolume(guildId: string, delta: number): number {
    const queue = this.getOrCreateQueue(guildId);
    return this.setVolume(guildId, queue.volume + delta);
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

/**
 * Helper to create rich interactive Button Controller ActionRows
 */
export function createMusicControlButtons(queue: GuildMusicQueue): ActionRowBuilder<ButtonBuilder>[] {
  const isPaused = queue.isPaused;
  const loopMode = queue.loopMode;

  const loopLabel = loopMode === "track" ? "🔂 Loop: Track" : loopMode === "queue" ? "🔁 Loop: Queue" : "🔁 Loop: Off";
  const loopStyle = loopMode !== "off" ? ButtonStyle.Success : ButtonStyle.Secondary;

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("music_ctrl:pause_resume")
      .setEmoji(isPaused ? "▶️" : "⏸️")
      .setLabel(isPaused ? "Resume" : "Pause")
      .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("music_ctrl:skip")
      .setEmoji("⏭️")
      .setLabel("Skip")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("music_ctrl:loop")
      .setLabel(loopLabel)
      .setStyle(loopStyle),
    new ButtonBuilder()
      .setCustomId("music_ctrl:shuffle")
      .setEmoji("🔀")
      .setLabel("Shuffle")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("music_ctrl:stop")
      .setEmoji("⏹️")
      .setLabel("Stop")
      .setStyle(ButtonStyle.Danger)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("music_ctrl:vol_down")
      .setEmoji("🔉")
      .setLabel("-10%")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("music_ctrl:vol_up")
      .setEmoji("🔊")
      .setLabel("+10%")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("music_ctrl:queue")
      .setEmoji("📜")
      .setLabel(`Antrean (${queue.tracks.length})`)
      .setStyle(ButtonStyle.Secondary)
  );

  return [row1, row2];
}

/**
 * Helper to create rich Now Playing embed
 */
export function createNowPlayingEmbed(queue: GuildMusicQueue, customMessage?: string): EmbedBuilder {
  const track = queue.currentTrack;

  const loopLabel = queue.loopMode === "track" 
    ? "🔂 Ulang Lagu Ini" 
    : queue.loopMode === "queue" 
    ? "🔁 Ulang Seluruh Antrean" 
    : "❌ Nonaktif";

  const statusLabel = queue.isPaused ? "⏸️ Dijeda" : "▶️ Sedang Memutar";

  const embed = new EmbedBuilder()
    .setColor(0xF472B6)
    .setTitle("🎵 Maya Music Player")
    .setDescription(customMessage || (track ? `[**${track.title}**](${track.url})` : "Tidak ada lagu yang sedang diputar."))
    .setFooter({ text: "Maya Music Companion • YouTube HQ Audio", iconURL: "https://i.imgur.com/8Q5F5W4.png" })
    .setTimestamp();

  if (track) {
    embed.addFields(
      { name: "⏱️ Durasi", value: `\`${track.duration}\``, inline: true },
      { name: "👤 Pemesan", value: track.requestedBy, inline: true },
      { name: "📊 Status", value: statusLabel, inline: true },
      { name: "🔊 Volume", value: `\`${queue.volume}%\``, inline: true },
      { name: "🔁 Mode Loop", value: `\`${loopLabel}\``, inline: true },
      { name: "📋 Sisa Antrean", value: `\`${queue.tracks.length} lagu\``, inline: true }
    );

    if (track.thumbnail) {
      embed.setThumbnail(track.thumbnail);
    }
  }

  return embed;
}
