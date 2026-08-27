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
import { voiceChatManager } from "./voiceChatManager";
import { spotifyClient, SpotifyTrackInfo } from "./spotifyClient";
import { audioStreamer } from "./audioStreamer";
import { logger } from "../utils/logger";

export type LoopMode = "off" | "track" | "queue";

export interface SongTrack {
  title: string;
  artist?: string;
  url: string;
  duration: string;
  thumbnail?: string;
  requestedBy: string;
  channelTitle?: string;
  sourceType?: "spotify" | "youtube";
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
   * Search and enqueue a song (Spotify Priority, Full Audio Streaming)
   */
  public async play(
    guildId: string, 
    query: string, 
    user: User, 
    voiceChannel?: VoiceBasedChannel
  ): Promise<{ success: boolean; message: string; track?: SongTrack; queue?: GuildMusicQueue; playlistCount?: number }> {
    const queue = this.getOrCreateQueue(guildId);

    // If bot not connected and voice channel provided, join
    if (!voiceChatManager.isConnected(guildId) && voiceChannel) {
      const joined = await voiceChatManager.join(voiceChannel);
      if (!joined) {
        return { success: false, message: "Maya gagal bergabung ke Voice Channel!" };
      }
    }

    try {
      const trimmed = query.trim();

      // 1. Handle Spotify Playlist / Album / Track URLs
      if (trimmed.includes("spotify.com/playlist/")) {
        const match = trimmed.match(/playlist\/([a-zA-Z0-9]+)/);
        if (match) {
          const pl = await spotifyClient.getPlaylist(match[1]);
          if (!pl || pl.tracks.length === 0) {
            return { success: false, message: "Playlist Spotify tidak ditemukan atau kosong!" };
          }

          const addedTracks: SongTrack[] = pl.tracks.map((t) => ({
            title: t.name,
            artist: t.artists,
            url: t.url,
            duration: t.durationRaw,
            thumbnail: t.albumArt,
            requestedBy: user.displayName || user.username,
            channelTitle: t.artists,
            sourceType: "spotify"
          }));

          const first = addedTracks.shift()!;
          for (const track of addedTracks) {
            queue.tracks.push(track);
          }

          if (queue.isPlaying || queue.currentTrack) {
            queue.tracks.unshift(first);
            return {
              success: true,
              message: `Memuat playlist Spotify **${pl.title}** (${pl.tracks.length} lagu) ke antrean! 🎵`,
              track: first,
              queue,
              playlistCount: pl.tracks.length
            };
          } else {
            queue.currentTrack = first;
            await this.streamTrack(guildId, first);
            return {
              success: true,
              message: `Memutar playlist Spotify **${pl.title}** (${pl.tracks.length} lagu)! 🎵`,
              track: first,
              queue,
              playlistCount: pl.tracks.length
            };
          }
        }
      }

      if (trimmed.includes("spotify.com/album/")) {
        const match = trimmed.match(/album\/([a-zA-Z0-9]+)/);
        if (match) {
          const album = await spotifyClient.getAlbum(match[1]);
          if (!album || album.tracks.length === 0) {
            return { success: false, message: "Album Spotify tidak ditemukan atau kosong!" };
          }

          const addedTracks: SongTrack[] = album.tracks.map((t) => ({
            title: t.name,
            artist: t.artists,
            url: t.url,
            duration: t.durationRaw,
            thumbnail: t.albumArt,
            requestedBy: user.displayName || user.username,
            channelTitle: t.artists,
            sourceType: "spotify"
          }));

          const first = addedTracks.shift()!;
          for (const track of addedTracks) {
            queue.tracks.push(track);
          }

          if (queue.isPlaying || queue.currentTrack) {
            queue.tracks.unshift(first);
            return {
              success: true,
              message: `Memuat album Spotify **${album.title}** (${album.tracks.length} lagu) ke antrean! 🎵`,
              track: first,
              queue,
              playlistCount: album.tracks.length
            };
          } else {
            queue.currentTrack = first;
            await this.streamTrack(guildId, first);
            return {
              success: true,
              message: `Memutar album Spotify **${album.title}** (${album.tracks.length} lagu)! 🎵`,
              track: first,
              queue,
              playlistCount: album.tracks.length
            };
          }
        }
      }

      if (trimmed.includes("spotify.com/track/")) {
        const match = trimmed.match(/track\/([a-zA-Z0-9]+)/);
        if (match) {
          const t = await spotifyClient.getTrack(match[1]);
          if (t) {
            const trackInfo: SongTrack = {
              title: t.name,
              artist: t.artists,
              url: t.url,
              duration: t.durationRaw,
              thumbnail: t.albumArt,
              requestedBy: user.displayName || user.username,
              channelTitle: t.artists,
              sourceType: "spotify"
            };

            if (queue.isPlaying || queue.currentTrack) {
              queue.tracks.push(trackInfo);
              return {
                success: true,
                message: `Lagu **${trackInfo.title}** oleh **${trackInfo.artist}** berhasil ditambahkan ke antrean! (Posisi: #${queue.tracks.length})`,
                track: trackInfo,
                queue
              };
            }

            queue.currentTrack = trackInfo;
            await this.streamTrack(guildId, trackInfo);
            return {
              success: true,
              message: `Memutar lagu Spotify: **${trackInfo.title}** - ${trackInfo.artist} 🎶`,
              track: trackInfo,
              queue
            };
          }
        }
      }

      // 2. Search via Spotify Web API
      const spotifyResults = await spotifyClient.searchTracks(trimmed, 5);
      let trackInfo: SongTrack | null = null;

      if (spotifyResults.length > 0) {
        const sp = spotifyResults[0];
        trackInfo = {
          title: sp.name,
          artist: sp.artists,
          url: sp.url,
          duration: sp.durationRaw,
          thumbnail: sp.albumArt,
          requestedBy: user.displayName || user.username,
          channelTitle: sp.artists,
          sourceType: "spotify"
        };
      } else {
        // Fallback title query
        trackInfo = {
          title: trimmed,
          url: trimmed,
          duration: "Unknown",
          requestedBy: user.displayName || user.username,
          sourceType: "spotify"
        };
      }

      if (!trackInfo) {
        return { success: false, message: `Lagu "${query}" tidak ditemukan di Spotify!` };
      }

      // If already playing, add to queue
      if (queue.isPlaying || queue.currentTrack) {
        queue.tracks.push(trackInfo);
        logger.info(`MusicManager: Menambahkan ke antrean (${guildId}): "${trackInfo.title}" - ${trackInfo.artist || ""}`);
        return { 
          success: true, 
          message: `Lagu **${trackInfo.title}** ${trackInfo.artist ? `oleh **${trackInfo.artist}**` : ""} berhasil ditambahkan ke antrean! (Posisi: #${queue.tracks.length})`, 
          track: trackInfo,
          queue
        };
      }

      // Start playing immediately
      queue.currentTrack = trackInfo;
      await this.streamTrack(guildId, trackInfo);

      return { 
        success: true, 
        message: `Memutar lagu: **${trackInfo.title}** ${trackInfo.artist ? `- ${trackInfo.artist}` : ""} 🎶`, 
        track: trackInfo,
        queue
      };
    } catch (err: any) {
      logger.error(`MusicManager: Error saat memutar lagu di guild ${guildId}:`, err);
      return { success: false, message: `Gagal memutar lagu: ${err.message || "Error tidak diketahui"}` };
    }
  }

  /**
   * Stream audio track to Discord Voice with volume control
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

    try {
      const searchTarget = track.artist ? `${track.title} ${track.artist}` : track.title;
      const audioStream = await audioStreamer.getAudioStream(searchTarget);

      const resource = createAudioResource(audioStream, {
        inputType: StreamType.Arbitrary,
        inlineVolume: true,
      });
      resource.volume?.setVolume(queue.volume / 100);

      queue.currentResource = resource;
      queue.isPlaying = true;
      queue.isPaused = false;
      queue.isInterruptedByVoice = false;

      session.player.play(resource);
      logger.info(`MusicManager: Memutar "${track.title}" [Spotify Engine | Vol: ${queue.volume}%] di guild ${guildId}`);
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
      logger.info(`MusicManager: Memutar lagu berikutnya dari antrean: "${nextTrack.title}"`);
      await this.streamTrack(guildId, nextTrack);
    } else {
      logger.info(`MusicManager: Antrean musik selesai di guild ${guildId}`);
      queue.currentTrack = null;
      queue.isPlaying = false;
      queue.isPaused = false;
      queue.currentResource = null;
    }
  }

  /**
   * Pause music
   */
  public pause(guildId: string): boolean {
    const queue = this.queues.get(guildId);
    const session = voiceChatManager.getSession(guildId);
    if (!queue || !session || !queue.isPlaying || queue.isPaused) return false;

    session.player.pause();
    queue.isPaused = true;
    logger.info(`MusicManager: Musik dijeda di guild ${guildId}`);
    return true;
  }

  /**
   * Resume music
   */
  public resume(guildId: string): boolean {
    const queue = this.queues.get(guildId);
    const session = voiceChatManager.getSession(guildId);
    if (!queue || !session || !queue.isPaused) return false;

    session.player.unpause();
    queue.isPaused = false;
    logger.info(`MusicManager: Musik dilanjutkan di guild ${guildId}`);
    return true;
  }

  /**
   * Skip current song
   */
  public async skip(guildId: string): Promise<boolean> {
    const queue = this.queues.get(guildId);
    const session = voiceChatManager.getSession(guildId);
    if (!queue || !session || !queue.currentTrack) return false;

    logger.info(`MusicManager: Melewati lagu "${queue.currentTrack.title}" di guild ${guildId}`);
    const tempLoop = queue.loopMode;
    if (queue.loopMode === "track") queue.loopMode = "off";

    session.player.stop();
    await this.playNext(guildId);

    if (tempLoop === "track") queue.loopMode = "track";
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
    queue.currentResource = null;

    if (session) {
      session.player.stop();
    }
    logger.info(`MusicManager: Musik dihentikan & antrean dikosongkan di guild ${guildId}`);
    return true;
  }

  /**
   * Set volume (1 - 100)
   */
  public setVolume(guildId: string, volume: number): number {
    const queue = this.getOrCreateQueue(guildId);
    const safeVol = Math.max(1, Math.min(100, Math.round(volume)));
    queue.volume = safeVol;

    if (queue.currentResource && queue.currentResource.volume) {
      queue.currentResource.volume.setVolume(safeVol / 100);
    }
    logger.info(`MusicManager: Volume diatur ke ${safeVol}% di guild ${guildId}`);
    return safeVol;
  }

  /**
   * Increment or decrement volume by delta (e.g. +10 or -10)
   */
  public changeVolume(guildId: string, delta: number): number {
    const queue = this.getOrCreateQueue(guildId);
    return this.setVolume(guildId, queue.volume + delta);
  }

  /**
   * Set loop mode (off, track, queue)
   */
  public setLoopMode(guildId: string, mode: LoopMode): LoopMode {
    const queue = this.getOrCreateQueue(guildId);
    queue.loopMode = mode;
    logger.info(`MusicManager: Loop mode diatur ke "${mode}" di guild ${guildId}`);
    return mode;
  }

  public setLoop(guildId: string, mode?: LoopMode): LoopMode {
    const queue = this.getOrCreateQueue(guildId);
    if (!mode) {
      const cycle: Record<LoopMode, LoopMode> = {
        off: "track",
        track: "queue",
        queue: "off"
      };
      mode = cycle[queue.loopMode] || "off";
    }
    return this.setLoopMode(guildId, mode);
  }

  /**
   * Duck/pause music when Maya starts speaking in voice
   */
  public onMayaSpeechStart(guildId: string) {
    const queue = this.queues.get(guildId);
    const session = voiceChatManager.getSession(guildId);
    if (queue && queue.isPlaying && !queue.isPaused && session) {
      queue.isInterruptedByVoice = true;
      session.player.pause();
      logger.info(`MusicManager: Musik dijeda sementara karena Maya berbicara di guild ${guildId}`);
    }
  }

  /**
   * Resume music when Maya finishes speaking
   */
  public onMayaSpeechEnd(guildId: string) {
    const queue = this.queues.get(guildId);
    const session = voiceChatManager.getSession(guildId);
    if (queue && queue.isPlaying && queue.isInterruptedByVoice && session) {
      queue.isInterruptedByVoice = false;
      session.player.unpause();
      logger.info(`MusicManager: Musik dilanjutkan kembali setelah Maya selesai berbicara di guild ${guildId}`);
    }
  }

  /**
   * Shuffle remaining queue
   */
  public shuffle(guildId: string): boolean {
    const queue = this.queues.get(guildId);
    if (!queue || queue.tracks.length < 2) return false;

    for (let i = queue.tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue.tracks[i], queue.tracks[j]] = [queue.tracks[j], queue.tracks[i]];
    }
    logger.info(`MusicManager: Antrean musik diacak di guild ${guildId} (${queue.tracks.length} lagu)`);
    return true;
  }
}

export const musicManager = MusicManager.getInstance();

/**
 * Helper to create Now Playing Embed with Spotify Branding
 */
export function createNowPlayingEmbed(queue: GuildMusicQueue, trackParam?: SongTrack): EmbedBuilder {
  const track = trackParam || queue.currentTrack;
  if (!track) {
    return new EmbedBuilder()
      .setColor(0x1DB954)
      .setTitle("🎵 Pemutar Musik Spotify Maya")
      .setDescription("Tidak ada lagu yang sedang diputar saat ini.\nGunakan `/music play [judul]` untuk memutar lagu!");
  }

  const loopIcons = {
    off: "❌ Nonaktif",
    track: "🔂 Ulang Lagu (Track)",
    queue: "🔁 Ulang Antrean (Queue)"
  };

  const statusText = queue.isPaused 
    ? "⏸️ Dijeda (Paused)" 
    : (queue.isInterruptedByVoice ? "🎙️ Sedang Maya Berbicara" : "▶️ Sedang Diputar");

  const embed = new EmbedBuilder()
    .setColor(0x1DB954)
    .setTitle("🟢 SPOTIFY • Sedang Diputar")
    .setDescription(
      `### [${track.title}](${track.url})\n` +
      (track.artist ? `**Artis:** \`${track.artist}\`\n` : "") +
      `**Durasi:** \`${track.duration}\` • **Status:** \`${statusText}\`\n` +
      `**Dipinta oleh:** <@${track.requestedBy}> • **Volume:** \`${queue.volume}%\`\n` +
      `**Mode Loop:** \`${loopIcons[queue.loopMode]}\``
    )
    .addFields({
      name: "📋 Antrean Berikutnya",
      value: queue.tracks.length > 0 
        ? `**${queue.tracks.length} lagu** menunggu di antrean (Ketik \`/music queue\` untuk melihat daftar)` 
        : "*Antrean kosong. Lagu ini adalah yang terakhir.*"
    })
    .setFooter({ text: "Maya Spotify Player • High-Fidelity Audio Stream" })
    .setTimestamp();

  if (track.thumbnail) {
    embed.setThumbnail(track.thumbnail);
  }

  return embed;
}

/**
 * Helper to create Interactive Button Controls
 */
export function createMusicControlButtons(queue: GuildMusicQueue): ActionRowBuilder<ButtonBuilder>[] {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("music_btn:pause_resume")
      .setEmoji(queue.isPaused ? "▶️" : "⏸️")
      .setLabel(queue.isPaused ? "Resume" : "Pause")
      .setStyle(queue.isPaused ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("music_btn:skip")
      .setEmoji("⏭️")
      .setLabel("Skip")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("music_btn:loop")
      .setEmoji("🔁")
      .setLabel(`Loop: ${queue.loopMode.toUpperCase()}`)
      .setStyle(queue.loopMode !== "off" ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("music_btn:shuffle")
      .setEmoji("🔀")
      .setLabel("Shuffle")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("music_btn:stop")
      .setEmoji("⏹️")
      .setLabel("Stop")
      .setStyle(ButtonStyle.Danger)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("music_btn:vol_down")
      .setEmoji("🔉")
      .setLabel("-10%")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("music_btn:vol_up")
      .setEmoji("🔊")
      .setLabel("+10%")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("music_btn:queue")
      .setEmoji("📜")
      .setLabel("Lihat Antrean")
      .setStyle(ButtonStyle.Secondary)
  );

  return [row1, row2];
}
