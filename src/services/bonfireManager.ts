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
  lastUpdated: number;
}

const MAX_SPARKS = 1000;
const STATE_FILE_PATH = path.join(process.cwd(), "data", "bonfire-state.json");

class BonfireManager {
  private sparks: number = 450;
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
    } else if (energy < 0.2) {
      stageText = "BARA MEREDUP";
      statusQuote = "Bara api meredup dingin. Kehangatan suara di Voice Channel dibutuhkan agar api tidak padam.";
    } else if (energy > 0.8) {
      stageText = "BERKOBAR MAKSIMAL";
      statusQuote = "Api berkobar cerah dan hangat, dipelihara oleh tawa dan obrolan para pengelana The Checkpoint.";
    } else if (voiceCount > 0) {
      stageText = "KEHANGATAN TUMBUH";
      statusQuote = `${voiceCount} pengelana sedang berkumpul di Voice Channel, menghidupkan nyala api unggun.`;
    }

    return {
      sparks: sparksRounded,
      energy,
      voiceCount,
      voiceMembers,
      isExtinguished,
      stageText,
      statusQuote,
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
    } else {
      // Ada orang di voice:
      // 1 orang: ~3.33 sparks/s (pulih dalam ~5 menit)
      // 2 orang: ~5.0 sparks/s
      // 3+ orang: bertambah lumayan cepat (~6.5 - 8.0 sparks/s, tidak over)
      let rate = 3.33;
      if (voiceCount === 2) {
        rate = 5.0;
      } else if (voiceCount >= 3) {
        rate = Math.min(8.0, 5.0 + (voiceCount - 2) * 1.0);
      }

      this.sparks = Math.min(MAX_SPARKS, this.sparks + (rate * deltaSec));
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
        this.sparks = 15; // Nyalakan bara awal
      } else {
        this.addActivitySpark(8);
      }
    }

    // Emit perubahan real-time langsung ke web client
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback(this.getState());
    }
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
      }
    } catch (err) {
      logger.warn("BonfireManager: Could not load previous bonfire state, using defaults:", err);
    }
  }
}

export const bonfireManager = new BonfireManager();
