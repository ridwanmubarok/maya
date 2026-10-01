import fs from "fs";
import path from "path";
import { Client, VoiceState } from "discord.js";
import { logger } from "../utils/logger";

export interface ActiveVoiceMember {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  channelName: string;
}

export interface BonfireState {
  sparks: number; // 0 - 1000
  energy: number; // 0.0 - 1.0
  voiceCount: number;
  voiceMembers: ActiveVoiceMember[];
  isExtinguished: boolean;
  stageText: string;
  statusQuote: string;
  streakDays: number;
  streakTier: number; // 0: Padam, 1: 1-2 hari (Bara Emas), 2: 3-6 hari (Stardust Sparkle), 3: 7+ hari (Cosmic Vortex)
  streakMultiplier: number; // 1.0 - 1.30
  litSince: number;
  lastUpdated: number;
}

const MAX_SPARKS = 1000;
const STATE_FILE_PATH = path.join(process.cwd(), "data", "bonfire-state.json");

class BonfireManager {
  private sparks: number = 450;
  private streakDays: number = 1;
  private litSince: number = Date.now();
  private lastTick: number = Date.now();
  private tickerInterval: NodeJS.Timeout | null = null;
  private saveDebounceTimeout: NodeJS.Timeout | null = null;
  private client: Client | null = null;
  private onStateChangeCallback: ((state: BonfireState) => void) | null = null;

  constructor() {
    this.loadState();
  }

  public init(client: Client, onStateChange?: (state: BonfireState) => void) {
    this.client = client;
    if (onStateChange) {
      this.onStateChangeCallback = onStateChange;
    }

    if (this.tickerInterval) {
      clearInterval(this.tickerInterval);
    }

    this.lastTick = Date.now();

    // Jalankan kalkulasi setiap 3 detik
    this.tickerInterval = setInterval(() => {
      this.tick();
    }, 3000);

    logger.info(`BonfireManager: Initialized bonfire dynamics engine. Current sparks: ${Math.round(this.sparks)}/${MAX_SPARKS}`);
  }

  public setCallback(cb: (state: BonfireState) => void) {
    this.onStateChangeCallback = cb;
  }

  public getState(): BonfireState {
    const voiceMembers = this.getActiveVoiceMembers();
    const voiceCount = voiceMembers.length;
    const sparksRounded = Math.round(Math.max(0, Math.min(MAX_SPARKS, this.sparks)));
    const energy = Number((sparksRounded / MAX_SPARKS).toFixed(3));
    const isExtinguished = sparksRounded <= 0;

    let stageText = "STOKE THE FLAME";
    let statusQuote = "Singgah sebentar. Hangatkan suasana, lanjutkan perjalanan.";

    if (isExtinguished) {
      stageText = "API TELAH PADAM";
      statusQuote = "Api unggun telah padam dalam keheningan... Masuklah ke Voice Channel untuk menyalakan kembali kehangatan sanctuary.";
    } else if (voiceCount === 1) {
      stageText = "MENJAGA LENTERA";
      statusQuote = "1 pengelana sedang menjaga kehangatan lentera. Masuk ke Voice Channel untuk mulai mengobarkan api.";
    } else if (energy < 0.2) {
      stageText = "BARA MEREDUP";
      statusQuote = "Bara api meredup dingin. Kehangatan suara di Voice Channel dibutuhkan agar api tidak padam.";
    } else if (energy > 0.8) {
      stageText = "BERKOBAR MAKSIMAL";
      statusQuote = "Api berkobar cerah dan hangat, dipelihara oleh tawa dan obrolan para pengelana The Checkpoint.";
    } else if (voiceCount > 1) {
      stageText = "KEHANGATAN TUMBUH";
      statusQuote = `${voiceCount} pengelana sedang berkumpul di Voice Channel, menghidupkan nyala api unggun.`;
    }

    let streakTier = 0;
    let streakMultiplier = 1.0;
    if (!isExtinguished) {
      if (this.streakDays >= 7) {
        streakTier = 3;
        streakMultiplier = 1.30;
      } else if (this.streakDays >= 3) {
        streakTier = 2;
        streakMultiplier = 1.20;
      } else {
        streakTier = 1;
        streakMultiplier = 1.10;
      }
    }

    return {
      sparks: sparksRounded,
      energy,
      voiceCount,
      voiceMembers,
      isExtinguished,
      stageText,
      statusQuote,
      streakDays: isExtinguished ? 0 : this.streakDays,
      streakTier,
      streakMultiplier,
      litSince: this.litSince,
      lastUpdated: Date.now()
    };
  }

  /**
   * Ambil daftar member aktif di Voice Channel non-AFK secara real-time
   */
  public getActiveVoiceMembers(): ActiveVoiceMember[] {
    if (!this.client) return [];

    const checkpointGuild = this.client.guilds.cache.find(g =>
      g.name.toLowerCase().includes("checkpoint") || g.id === "1527510081284079728"
    ) || this.client.guilds.cache.first();

    if (!checkpointGuild) return [];

    const members: ActiveVoiceMember[] = [];
    const seen = new Set<string>();

    for (const channel of checkpointGuild.channels.cache.values()) {
      if (channel.isVoiceBased() && channel.id !== checkpointGuild.afkChannelId) {
        for (const member of channel.members.values()) {
          if (!member.user.bot && !seen.has(member.id)) {
            seen.add(member.id);
            members.push({
              id: member.id,
              username: member.user.username,
              displayName: member.displayName || member.user.username,
              avatar: member.user.displayAvatarURL({ extension: "png", size: 128 }),
              channelName: channel.name
            });
          }
        }
      }
    }

    return members;
  }

  /**
   * Hitung jumlah member aktif (non-bot) di seluruh Voice Channel non-AFK
   */
  public getActiveVoiceMembersCount(): number {
    return this.getActiveVoiceMembers().length;
  }

  /**
   * Main Dynamic Simulation Tick (Dipanggil setiap 3 detik)
   */
  private tick() {
    const now = Date.now();
    const deltaSec = (now - this.lastTick) / 1000;
    this.lastTick = now;

    if (deltaSec <= 0 || deltaSec > 60) {
      return; // Skip invalid or too large leap
    }

    const voiceCount = this.getActiveVoiceMembersCount();
    const wasExtinguished = this.sparks <= 0;

    if (voiceCount === 0) {
      // Tidak ada orang di voice: Api berkurang hingga padam dalam ~20 menit (1200 detik)
      // Decay rate: ~0.833 sparks per detik
      const decayRate = 0.833;
      this.sparks = Math.max(0, this.sparks - (decayRate * deltaSec));
    } else if (voiceCount === 1) {
      // 1 orang sendirian di voice:
      // Soft Threshold: menahan bara agar tidak padam (stagnan di level saat ini, tidak bertambah sampai penuh).
      // Jika api sebelumnya padam total (0), nyalakan bara lentera awal (35 bara) lalu tahan stabil di situ.
      if (this.sparks < 35) {
        this.sparks = Math.min(35, this.sparks + (2.0 * deltaSec));
      }
      // Tingkat bara bertahan stabil (tidak berkurang dan tidak bertambah)
    } else {
      // 2+ orang di voice: baru mulai bertambah
      // 2 orang: ~3.5 sparks/s (pulih bertahap)
      // 3+ orang: bertambah lumayan cepat (~5.0 - 7.5 sparks/s, tidak over)
      let rate = 3.5;
      if (voiceCount >= 3) {
        rate = Math.min(7.5, 4.0 + (voiceCount - 2) * 1.0);
      }

      this.sparks = Math.min(MAX_SPARKS, this.sparks + (rate * deltaSec));
    }

    // Kalkulasi Fire Streak (Akumulasi 24 Jam berturut-turut tanpa padam)
    if (this.sparks <= 0) {
      this.streakDays = 0;
      this.litSince = 0;
    } else {
      if (!this.litSince || this.litSince <= 0) {
        this.litSince = now;
        this.streakDays = 1;
      } else {
        const litDurationMs = now - this.litSince;
        // Setiap 24 jam terus menyala tanpa padam = +1 hari streak
        this.streakDays = Math.max(1, Math.floor(litDurationMs / (24 * 3600 * 1000)) + 1);
      }
    }

    const currentState = this.getState();

    // Trigger callback bila status berubah
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback(currentState);
    }

    this.scheduleSave();
  }

  /**
   * Beri bonus spark langsung saat ada aktivitas chat / voice join
   */
  public addActivitySpark(amount: number = 5): BonfireState {
    this.sparks = Math.min(MAX_SPARKS, this.sparks + amount);
    const state = this.getState();
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback(state);
    }
    this.scheduleSave();
    return state;
  }

  /**
   * Tangani event perpindahan Voice
   */
  public handleVoiceEvent(oldState: VoiceState, newState: VoiceState) {
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    // Jika member join dan api sebelumnya padam, beri dorongan awal
    if (!oldState.channelId && newState.channelId) {
      if (this.sparks <= 0) {
        this.sparks = 35; // Nyalakan bara lentera awal
        this.litSince = Date.now();
        this.streakDays = 1;
      } else {
        const count = this.getActiveVoiceMembersCount();
        if (count > 1) {
          this.addActivitySpark(8);
        }
      }
    }

    // Emit perubahan real-time langsung ke web client
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback(this.getState());
    }
  }

  /**
   * Multiplier XP Pasif bagi Komunitas berdasarkan Streak Api Unggun
   */
  public getXpMultiplier(): number {
    if (this.sparks <= 0) return 1.0;
    if (this.streakDays >= 7) return 1.30; // +30% XP
    if (this.streakDays >= 3) return 1.20; // +20% XP
    return 1.10; // +10% XP
  }

  private scheduleSave() {
    if (this.saveDebounceTimeout) return;
    this.saveDebounceTimeout = setTimeout(() => {
      this.saveDebounceTimeout = null;
      this.saveState();
    }, 10000);
  }

  private saveState() {
    try {
      const dir = path.dirname(STATE_FILE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        STATE_FILE_PATH,
        JSON.stringify({
          sparks: this.sparks,
          streakDays: this.streakDays,
          litSince: this.litSince,
          lastSaved: Date.now()
        }, null, 2),
        "utf8"
      );
    } catch (err) {
      logger.warn("BonfireManager: Failed to save bonfire state to disk:", err);
    }
  }

  private loadState() {
    try {
      if (fs.existsSync(STATE_FILE_PATH)) {
        const data = JSON.parse(fs.readFileSync(STATE_FILE_PATH, "utf8"));
        if (typeof data.sparks === "number" && !isNaN(data.sparks)) {
          this.sparks = Math.max(0, Math.min(MAX_SPARKS, data.sparks));
          logger.info(`BonfireManager: Restored persisted bonfire state with ${Math.round(this.sparks)} sparks`);
        }
        if (typeof data.streakDays === "number" && !isNaN(data.streakDays)) {
          this.streakDays = Math.max(0, data.streakDays);
        }
        if (typeof data.litSince === "number" && !isNaN(data.litSince)) {
          this.litSince = data.litSince;
        } else if (this.sparks > 0) {
          this.litSince = Date.now();
        }
      }
    } catch (err) {
      logger.warn("BonfireManager: Could not load previous bonfire state, using defaults:", err);
    }
  }
}

export const bonfireManager = new BonfireManager();
