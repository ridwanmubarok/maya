import { logger } from "../utils/logger";

export interface NobarParticipant {
  socketId: string;
  userId?: string;
  username: string;
  avatarUrl?: string;
  isHost: boolean;
  joinedAt: Date;
}

export interface NobarChatMessage {
  id: string;
  username: string;
  avatarUrl?: string;
  text: string;
  timestamp: string;
  isSystem?: boolean;
}

export interface NobarRoom {
  id: string;
  guildId?: string;
  guildName?: string;
  title: string;
  videoUrl: string;
  videoType: "youtube" | "direct";
  youtubeId?: string;
  currentTime: number;
  isPlaying: boolean;
  playbackRate: number;
  hostId: string;
  hostName: string;
  createdAt: Date;
  lastActiveAt: Date;
  participants: Map<string, NobarParticipant>;
  chatHistory: NobarChatMessage[];
}

export class NobarManager {
  private static instance: NobarManager;
  private rooms: Map<string, NobarRoom> = new Map();

  private constructor() {
    // Periodic cleanup of abandoned rooms (> 4 hours of inactivity or empty for > 30 mins)
    setInterval(() => this.cleanupRooms(), 15 * 60 * 1000);
  }

  public static getInstance(): NobarManager {
    if (!NobarManager.instance) {
      NobarManager.instance = new NobarManager();
    }
    return NobarManager.instance;
  }

  /**
   * Helper to parse YouTube URL or direct MP4 URL
   */
  public parseVideoUrl(url: string): { videoType: "youtube" | "direct"; youtubeId?: string; cleanUrl: string } {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes("youtube.com") || parsed.hostname.includes("youtu.be")) {
        let videoId: string | null = null;
        if (parsed.hostname.includes("youtu.be")) {
          videoId = parsed.pathname.slice(1);
        } else {
          videoId = parsed.searchParams.get("v");
        }
        if (videoId) {
          // Remove any extra parameters
          videoId = videoId.split("&")[0];
          return { videoType: "youtube", youtubeId: videoId, cleanUrl: `https://www.youtube.com/watch?v=${videoId}` };
        }
      }
    } catch {
      // Ignore URL parse error, fallback to direct
    }

    return { videoType: "direct", cleanUrl: url };
  }

  /**
   * Create a new Nobar Room
   */
  public createRoom(
    title: string,
    videoUrl: string,
    hostId: string,
    hostName: string,
    guildId?: string,
    guildName?: string
  ): NobarRoom {
    const roomId = `stage-${Math.random().toString(36).substring(2, 8)}`;
    const parsed = this.parseVideoUrl(videoUrl);

    const room: NobarRoom = {
      id: roomId,
      guildId,
      guildName,
      title: title || "Nonton Bareng Maya",
      videoUrl: parsed.cleanUrl,
      videoType: parsed.videoType,
      youtubeId: parsed.youtubeId,
      currentTime: 0,
      isPlaying: false,
      playbackRate: 1,
      hostId,
      hostName,
      createdAt: new Date(),
      lastActiveAt: new Date(),
      participants: new Map(),
      chatHistory: [
        {
          id: `sys-${Date.now()}`,
          username: "System",
          text: `Selamat datang di Stage Nonton Bareng: ${title}! Host: ${hostName}`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          isSystem: true,
        },
      ],
    };

    this.rooms.set(roomId, room);
    logger.info(`NobarManager: Room ${roomId} berhasil dibuat oleh ${hostName}`);
    return room;
  }

  /**
   * Get Room by ID
   */
  public getRoom(roomId: string): NobarRoom | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Update Room Video State
   */
  public updateRoomVideoState(roomId: string, isPlaying: boolean, currentTime: number, playbackRate: number = 1): NobarRoom | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    room.isPlaying = isPlaying;
    room.currentTime = currentTime;
    room.playbackRate = playbackRate;
    room.lastActiveAt = new Date();
    return room;
  }

  /**
   * Add Participant to Room
   */
  public addParticipant(roomId: string, participant: NobarParticipant): NobarRoom | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    room.participants.set(participant.socketId, participant);
    room.lastActiveAt = new Date();
    return room;
  }

  /**
   * Remove Participant from Room
   */
  public removeParticipant(roomId: string, socketId: string): { room?: NobarRoom; removedParticipant?: NobarParticipant } {
    const room = this.rooms.get(roomId);
    if (!room) return {};

    const removedParticipant = room.participants.get(socketId);
    if (removedParticipant) {
      room.participants.delete(socketId);
      room.lastActiveAt = new Date();

      // Reassign host if host left and participants remain
      if (removedParticipant.isHost && room.participants.size > 0) {
        const nextParticipant = room.participants.values().next().value;
        if (nextParticipant) {
          nextParticipant.isHost = true;
          room.hostId = nextParticipant.userId || nextParticipant.socketId;
          room.hostName = nextParticipant.username;
          room.chatHistory.push({
            id: `sys-${Date.now()}`,
            username: "System",
            text: `Host telah keluar. ${nextParticipant.username} sekarang menjadi Host baru Stage!`,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            isSystem: true,
          });
        }
      }
    }

    return { room, removedParticipant };
  }

  /**
   * Add Chat Message to Room
   */
  public addChatMessage(roomId: string, username: string, text: string, avatarUrl?: string, isSystem = false): NobarChatMessage | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    const msg: NobarChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      username,
      avatarUrl,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      isSystem,
    };

    room.chatHistory.push(msg);

    // Limit chat history to 100 messages
    if (room.chatHistory.length > 100) {
      room.chatHistory.shift();
    }

    return msg;
  }

  /**
   * Get formatted participant list
   */
  public getParticipantsList(roomId: string): NobarParticipant[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return Array.from(room.participants.values());
  }

  /**
   * Delete room
   */
  public deleteRoom(roomId: string): boolean {
    return this.rooms.delete(roomId);
  }

  /**
   * Periodic cleanup of inactive rooms
   */
  private cleanupRooms() {
    const now = new Date().getTime();
    for (const [roomId, room] of this.rooms.entries()) {
      const inactiveMs = now - room.lastActiveAt.getTime();
      // Remove empty rooms inactive for 30 minutes, or any room inactive for 4 hours
      if ((room.participants.size === 0 && inactiveMs > 30 * 60 * 1000) || inactiveMs > 4 * 60 * 60 * 1000) {
        this.rooms.delete(roomId);
        logger.info(`NobarManager: Cleaning up inactive room ${roomId}`);
      }
    }
  }
}

export const nobarManager = NobarManager.getInstance();
