import { 
  AudioPlayer, 
  AudioPlayerStatus, 
  AudioResource,
  createAudioPlayer, 
  createAudioResource, 
  DiscordGatewayAdapterCreator, 
  joinVoiceChannel, 
  VoiceConnection, 
  VoiceConnectionStatus 
} from "@discordjs/voice";
import { StageChannel, VoiceChannel } from "discord.js";
import play from "play-dl";
import { logger } from "../utils/logger";

export interface Track {
  title: string;
  url: string;
  duration: string;
  requestedBy: string;
}

export class GuildMusicManager {
  public readonly guildId: string;
  public connection: VoiceConnection | null = null;
  public readonly player: AudioPlayer;
  public queue: Track[] = [];
  public currentTrack: Track | null = null;
  public volume: number = 0.5; // Default volume 50%
  private activeResource: AudioResource | null = null;

  constructor(guildId: string) {
    this.guildId = guildId;
    this.player = createAudioPlayer();

    // Setup player event listeners
    this.player.on(AudioPlayerStatus.Idle, () => {
      this.playNext();
    });

    this.player.on("stateChange", (oldState, newState) => {
      logger.debug(`AudioPlayer status di server ${this.guildId}: ${oldState.status} -> ${newState.status}`);
    });

    this.player.on("error", (error) => {
      logger.error(`AudioPlayer error in guild ${this.guildId}:`, error);
      this.playNext();
    });
  }

  public join(channel: VoiceChannel | StageChannel) {
    this.connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: this.guildId,
      adapterCreator: channel.guild.voiceAdapterCreator as DiscordGatewayAdapterCreator,
    });

    this.connection.subscribe(this.player);

    this.connection.on("stateChange", (oldState, newState) => {
      logger.debug(`VoiceConnection status di server ${this.guildId}: ${oldState.status} -> ${newState.status}`);
    });

    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        // Try to reconnect if temporarily disconnected, otherwise destroy after 2 seconds
        await Promise.race([
          new Promise((resolve) => this.connection?.once(VoiceConnectionStatus.Signalling, resolve)),
          new Promise((resolve) => this.connection?.once(VoiceConnectionStatus.Connecting, resolve)),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2000))
        ]);
      } catch (error) {
        // Real disconnect
        this.destroy();
      }
    });

    this.connection.on("error", (error) => {
      logger.error(`VoiceConnection error in guild ${this.guildId}:`, error);
    });
  }

  public addTrack(track: Track) {
    this.queue.push(track);
    if (!this.currentTrack) {
      this.playNext();
    }
  }

  public async playNext() {
    if (this.queue.length === 0) {
      this.currentTrack = null;
      this.player.stop();
      return;
    }

    this.currentTrack = this.queue.shift() || null;
    if (!this.currentTrack) {
      this.activeResource = null;
      return;
    }

    try {
      // Get audio stream from youtube via play-dl
      const stream = await play.stream(this.currentTrack.url);
      const resource = createAudioResource(stream.stream, {
        inputType: stream.type,
        inlineVolume: true
      });

      resource.volume?.setVolume(this.volume);
      this.activeResource = resource;

      this.player.play(resource);
    } catch (error) {
      logger.error(`Gagal memutar track "${this.currentTrack?.title}":`, error);
      this.activeResource = null;
      this.playNext();
    }
  }

  public skip() {
    if (this.player.state.status !== AudioPlayerStatus.Idle) {
      this.player.stop(); // This triggers playNext via the Idle state listener
      return true;
    }
    return false;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.activeResource && this.activeResource.volume) {
      this.activeResource.volume.setVolume(this.volume);
    }
  }

  public stop() {
    this.queue = [];
    this.currentTrack = null;
    this.activeResource = null;
    this.player.stop();
    this.destroy();
  }

  private destroy() {
    if (this.connection) {
      try {
        this.connection.destroy();
      } catch (e) {}
      this.connection = null;
    }
    musicManagers.delete(this.guildId);
  }
}

// Global music managers map
export const musicManagers = new Map<string, GuildMusicManager>();

export function getMusicManager(guildId: string): GuildMusicManager {
  let manager = musicManagers.get(guildId);
  if (!manager) {
    manager = new GuildMusicManager(guildId);
    musicManagers.set(guildId, manager);
  }
  return manager;
}
