import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  VoiceBasedChannel,
  TextBasedChannel,
  User,
  Client
} from "discord.js";
import { voiceChatManager } from "./voiceChatManager";
import { askNvidia } from "./aiClient";
import { logger } from "../utils/logger";

export type DndClass = "pendekar" | "dukun" | "pemburu" | "kyai";

export interface DndCharacter {
  userId: string;
  username: string;
  displayName: string;
  charClass: DndClass;
  hp: number;
  maxHp: number;
  atk: number;
  user: User;
}

export type DndTheme = "alas_roban" | "pantai_selatan" | "gunung_merapi" | "candi_leak";

export interface DndSession {
  guildId: string;
  textChannelId: string;
  voiceChannelId: string;
  hostId: string;
  theme: DndTheme;
  party: Map<string, DndCharacter>; // key: userId
  phase: "lobby" | "story" | "combat" | "victory" | "defeat";
  chapter: number;
  bossName: string;
  bossHp: number;
  bossMaxHp: number;
  currentStory: string;
  lastRoll: { player: string; roll: number; outcome: string } | null;
}

export class DndManager {
  private static instance: DndManager;
  private sessions = new Map<string, DndSession>(); // key: guildId

  private constructor() {}

  public static getInstance(): DndManager {
    if (!DndManager.instance) {
      DndManager.instance = new DndManager();
    }
    return DndManager.instance;
  }

  public getSession(guildId: string): DndSession | undefined {
    return this.sessions.get(guildId);
  }

  /**
   * Create a new Nusantara D&D Adventure Lobby
   */
  public async createLobby(
    guildId: string,
    textChannel: TextBasedChannel,
    voiceChannel: VoiceBasedChannel,
    host: User,
    theme: DndTheme = "alas_roban"
  ): Promise<{ success: boolean; message: string; embed?: EmbedBuilder; components?: ActionRowBuilder<ButtonBuilder>[] }> {
    if (this.sessions.has(guildId)) {
      return { success: false, message: "Sesi petualangan D&D Nusantara sudah aktif di server ini!" };
    }

    if (!voiceChatManager.isConnected(guildId)) {
      const joined = await voiceChatManager.join(voiceChannel);
      if (!joined) {
        return { success: false, message: "Maya gagal bergabung ke Voice Channel!" };
      }
    }

    const themeTitles: Record<DndTheme, { title: string; boss: string; hp: number }> = {
      alas_roban: { title: "Alas Roban Angker & Raja Genderuwo", boss: "Raja Genderuwo Hitam", hp: 120 },
      pantai_selatan: { title: "Segara Kidul & Panglima Siluman Buaya Putih", boss: "Panglima Buaya Putih", hp: 150 },
      gunung_merapi: { title: "Kawah Keramat Merapi & Raja Banaspati Purba", boss: "Raja Banaspati Api Merapi", hp: 160 },
      candi_leak: { title: "Candi Terbengkalai & Ratu Rangda Calon Arang", boss: "Ratu Rangda Calon Arang", hp: 140 }
    };

    const config = themeTitles[theme] || themeTitles.alas_roban;

    const session: DndSession = {
      guildId,
      textChannelId: textChannel.id,
      voiceChannelId: voiceChannel.id,
      hostId: host.id,
      theme,
      party: new Map(),
      phase: "lobby",
      chapter: 1,
      bossName: config.boss,
      bossHp: config.hp,
      bossMaxHp: config.hp,
      currentStory: "",
      lastRoll: null
    };

    // Auto add host as Pendekar by default
    session.party.set(host.id, {
      userId: host.id,
      username: host.username,
      displayName: host.displayName || host.username,
      charClass: "pendekar",
      hp: 130,
      maxHp: 130,
      atk: 25,
      user: host
    });

    this.sessions.set(guildId, session);

    logger.info(`DndManager: Sesi D&D Nusantara dibuat oleh ${host.username} di guild ${guildId} (Tema: ${theme})`);

    // Voice announcement by Maya Dalang/DM
    voiceChatManager.speak(
      guildId,
      "Tabik pun para pendekar dan pengelana Nusantara! Maya akan menjadi Dalang dan Pemandu petualangan kalian hari ini! Silakan pilih peran kesaktianmu di chat untuk bergabung ke rombongan pendekar!"
    );

    const embed = this.createLobbyEmbed(session);
    const components = this.createLobbyButtons(session);

    return {
      success: true,
      message: "Lobby Petualangan D&D Nusantara berhasil dibuat!",
      embed,
      components
    };
  }

  /**
   * Start D&D from Voice trigger
   */
  public async startFromVoice(guildId: string, user: User): Promise<boolean> {
    const voiceSession = voiceChatManager.getSession(guildId);
    if (!voiceSession || !voiceSession.channel) {
      voiceChatManager.speak(guildId, "Maya harus berada di Voice Channel dulu untuk memandu petualangan DND!");
      return false;
    }

    const voiceChannel = voiceSession.channel;
    const guild = voiceChannel.guild;
    let targetTextChannel: TextBasedChannel | null = null;

    if (voiceChannel.isTextBased && typeof voiceChannel.isTextBased === "function" && voiceChannel.isTextBased()) {
      targetTextChannel = voiceChannel as unknown as TextBasedChannel;
    } else if (guild) {
      targetTextChannel = (guild.systemChannel ||
        guild.channels.cache.find((c: any) => c.isTextBased() && !c.isVoiceBased()) ||
        null) as unknown as TextBasedChannel;
    }

    if (!targetTextChannel) {
      voiceChatManager.speak(guildId, "Maya tidak menemukan text channel untuk papan petualangan DND!");
      return false;
    }

    const res = await this.createLobby(guildId, targetTextChannel, voiceChannel, user, "alas_roban");

    if (res.success && res.embed && "send" in targetTextChannel) {
      try {
        await (targetTextChannel as any).send({
          embeds: [res.embed],
          components: res.components || []
        });
      } catch (err) {
        logger.warn("DndManager: Gagal mengirim embed ke text channel:", err);
      }
    }

    return res.success;
  }

  /**
   * Player joins party with a chosen Nusantara class
   */
  public joinParty(
    guildId: string,
    user: User,
    charClass: DndClass
  ): { success: boolean; message: string; embed?: EmbedBuilder; components?: ActionRowBuilder<ButtonBuilder>[] } {
    const session = this.sessions.get(guildId);
    if (!session || session.phase !== "lobby") {
      return { success: false, message: "Pendaftaran rombongan pendekar tidak sedang dibuka!" };
    }

    if (session.party.size >= 6) {
      return { success: false, message: "Rombongan pendekar sudah penuh (maksimal 6 orang)!" };
    }

    const classStats: Record<DndClass, { hp: number; atk: number }> = {
      pendekar: { hp: 130, atk: 25 },
      dukun: { hp: 80, atk: 35 },
      pemburu: { hp: 95, atk: 30 },
      kyai: { hp: 105, atk: 20 }
    };

    const stats = classStats[charClass];

    session.party.set(user.id, {
      userId: user.id,
      username: user.username,
      displayName: user.displayName || user.username,
      charClass,
      hp: stats.hp,
      maxHp: stats.hp,
      atk: stats.atk,
      user
    });

    const classNames = {
      pendekar: "🗡️ Pendekar Keris (Jawara Silat)",
      dukun: "🔮 Dukun Sakti (Pawang Mistis / Aji-Ajian)",
      pemburu: "🏹 Pemburu Rimba (Pemanah Panah Upas)",
      kyai: "📿 Kyai Pertapa (Tabib Doa Rukyah Suci)"
    };

    logger.info(`DndManager: ${user.username} bergabung sebagai ${charClass} (Party size: ${session.party.size})`);

    return {
      success: true,
      message: `${user.displayName || user.username} bergabung sebagai **${classNames[charClass]}**!`,
      embed: this.createLobbyEmbed(session),
      components: this.createLobbyButtons(session)
    };
  }

  /**
   * Start Adventure Story (Chapter 1)
   */
  public async startAdventure(
    guildId: string,
    actor: User
  ): Promise<{ success: boolean; message: string; embed?: EmbedBuilder; components?: ActionRowBuilder<ButtonBuilder>[] }> {
    const session = this.sessions.get(guildId);
    if (!session || session.phase !== "lobby") {
      return { success: false, message: "Petualangan tidak dapat dimulai saat ini!" };
    }

    if (session.party.size < 1) {
      return { success: false, message: "Dibutuhkan minimal 1 pendekar di dalam rombongan!" };
    }

    session.phase = "story";
    session.chapter = 1;

    const themePrompts: Record<DndTheme, string> = {
      alas_roban: "Rombongan pendekar melintasi rimbunnya hutan angker Alas Roban di malam jumat kliwon. Suara lolongan anjing gaib bersahutan dan tampak sosok raksasa berbulu lebat, Raja Genderuwo Hitam berdiri menghadang.",
      pantai_selatan: "Deburan ombak Pantai Segara Kidul bergulung ganas. Dari balik buih air laut berkabut, Panglima Siluman Buaya Putih dengan mahkota karang muncul membawa trisula pusaka.",
      gunung_merapi: "Hawa panas membakar lereng kawah Gunung Merapi. Tanah berguncang dan bola api terbang meliuk-liuk sebelum menjelma menjadi Raja Banaspati Purba yang menyala-nyala.",
      candi_leak: "Di pelataran Candi Kuno yang penuh sesajen gosong, bayangan taring panjang Ratu Rangda Calon Arang menari di atas api sambil tertawa melengking memanggil pasukan leak."
    };

    let storyText = "";
    try {
      const aiPrompt = `Kamu adalah Maya, Dalang dan Dungeon Master petualangan RPG Fantasi Mitos Nusantara (Indonesia).
Latar awal cerita: ${themePrompts[session.theme]}
Anggota Pendekar: ${Array.from(session.party.values()).map((p) => `${p.displayName} (${p.charClass})`).join(", ")}.
Buat narasi pembuka petualangan Chapter 1 bernuansa mistis Nusantara yang seru, gagah, menegangkan, dan memacu adrenalin!
PANDUAN KETAT:
1. Buat dalam 2-3 kalimat singkat (maksimal 25-30 kata) agar pas dibacakan suara vokal Maya.
2. DILARANG menggunakan markdown (*, _, \`), tanda petik, emotikon teks, atau kata ketawa (wkwk, haha) karena ini akan diubah langsung menjadi audio suara Dalang.`;

      const rawStory = await askNvidia(aiPrompt, "Kamu adalah Maya, Dalang petualangan mistis Nusantara yang seru dan berwibawa.");
      storyText = rawStory
        .replace(/[*_~`#>-]/g, "")
        .replace(/https?:\/\/\S+/g, "")
        .replace(/["']/g, "")
        .replace(/\b(w+k+w*k*|h+a+h*a*|h+e+h*e*|h+i+h*i*|x+i+x*i*|h+u+h*u*|l+o+l|a+w+o+k+)\b/gi, "")
        .trim();
    } catch (_) {}

    if (!storyText) {
      storyText = `Petualangan dimulai! Kabut malam semakin pekat dan angin dingin menusuk kalbu. Di hadapan kalian, sosok ${session.bossName} telah berdiri tegak bersiap menguji kesaktian kalian!`;
    }

    session.currentStory = storyText;
    session.phase = "combat";

    logger.info(`DndManager: Story Nusantara Chapter 1 dimulai: "${storyText}"`);

    // Voice narration by Maya Dalang
    voiceChatManager.speak(guildId, storyText);

    const embed = this.createCombatEmbed(session);
    const components = this.createCombatButtons(session);

    return {
      success: true,
      message: "Petualangan Nusantara dimulai!",
      embed,
      components
    };
  }

  /**
   * Execute Nusantara Action with D20 Keramat Dice Roll
   */
  public async executeAction(
    guildId: string,
    actor: User,
    actionType: "sabetan" | "santet" | "halimun" | "rukyah"
  ): Promise<{ success: boolean; message: string; embed?: EmbedBuilder; components?: ActionRowBuilder<ButtonBuilder>[] }> {
    const session = this.sessions.get(guildId);
    if (!session || session.phase !== "combat") {
      return { success: false, message: "Saat ini sedang tidak dalam pertarungan!" };
    }

    const char = session.party.get(actor.id);
    if (!char || char.hp <= 0) {
      return { success: false, message: "Pendekarmu sudah tidak berdaya untuk bertindak!" };
    }

    // Roll D20 Keramat (1 - 20)
    const roll = Math.floor(Math.random() * 20) + 1;
    let damageDealt = 0;
    let bossDamage = 0;
    let outcomeText = "";
    let voiceNarration = "";

    if (actionType === "sabetan") {
      if (roll === 20) {
        damageDealt = Math.floor(char.atk * 2.5);
        outcomeText = `🗡️ **NATURAL 20! AJIAN BRAJAMUSTI SEMPURNA!** Sabetan Keris Pusaka & Tenaga Dalam ${char.displayName} menghantam telak ${session.bossName} sebesar **${damageDealt} DMG**!`;
        voiceNarration = `Natural 20! Ajian Brajamusti ${char.displayName} menggelegar dahsyat memberikan ${damageDealt} damage ke ${session.bossName}!`;
      } else if (roll >= 10) {
        damageDealt = Math.floor(char.atk * (0.8 + roll / 20));
        bossDamage = Math.floor(Math.random() * 15) + 5;
        outcomeText = `⚔️ **Dadu D20: [${roll}] (Jurus Kena!)** Tebasan silat ${char.displayName} melukai ${session.bossName} sebesar **${damageDealt} DMG**, tapi terkena hempasan balik **${bossDamage} DMG**!`;
        voiceNarration = `Dadu D20 keluar angka ${roll}! Jurus silat ${char.displayName} sukses melukai musuh sebesar ${damageDealt} damage!`;
      } else if (roll === 1) {
        bossDamage = 25;
        outcomeText = `💀 **NATURAL 1! KENA TULAH / FUMBLE!** Langkah silat ${char.displayName} terpeleset dan ${session.bossName} melancarkan serangan telak **${bossDamage} DMG**!`;
        voiceNarration = `Natural 1! Kritis gagal! Langkah ${char.displayName} goyah dan terkena hantaman telak musuh!`;
      } else {
        bossDamage = Math.floor(Math.random() * 20) + 10;
        outcomeText = `🛡️ **Dadu D20: [${roll}] (Ditangkis!)** Serangan pusaka ${char.displayName} terpental perisai gaib musuh! Pendekarmu terkena hantaman **${bossDamage} DMG**!`;
        voiceNarration = `Dadu D20 keluar angka ${roll}. Serangan ${char.displayName} berhasil ditangkis oleh ${session.bossName}!`;
      }
    } else if (actionType === "santet") {
      if (roll >= 12) {
        damageDealt = Math.floor(char.atk * 1.8);
        outcomeText = `🔮 **Dadu D20: [${roll}] (Mantra Gaib Sukses!)** Aji-Ajian santet api peninggalan leluhur ${char.displayName} meledak membakar ${session.bossName} sebesar **${damageDealt} DMG**!`;
        voiceNarration = `Dadu D20 keluar angka ${roll}! Ajian mantra ${char.displayName} meledak menghanguskan musuh sebesar ${damageDealt} damage!`;
      } else {
        bossDamage = 15;
        outcomeText = `💨 **Dadu D20: [${roll}] (Mantra Melenceng!)** Hawa mistis musuh terlalu pekat, mantra ${char.displayName} buyar dan terkena serangan balik **${bossDamage} DMG**!`;
        voiceNarration = `Dadu D20 keluar angka ${roll}. Rapalan aji-ajian ${char.displayName} buyar terhalang aura gaib musuh!`;
      }
    } else if (actionType === "rukyah") {
      if (roll >= 8) {
        const healAmount = Math.floor(Math.random() * 25) + 20;
        char.hp = Math.min(char.maxHp, char.hp + healAmount);
        for (const mate of session.party.values()) {
          if (mate.hp > 0 && mate.hp < mate.maxHp) {
            mate.hp = Math.min(mate.maxHp, mate.hp + Math.floor(healAmount / 2));
          }
        }
        outcomeText = `✨ **Dadu D20: [${roll}] (Doa Rukyah Terkabul!)** Tabib ${char.displayName} menyiramkan air kembang tujuh rupa dan doa suci, memulihkan **+${healAmount} HP** rombongan!`;
        voiceNarration = `Dadu D20 keluar angka ${roll}! Doa penyembuhan ${char.displayName} berhasil memulihkan tenaga batin rombongan!`;
      } else {
        outcomeText = `🚫 **Dadu D20: [${roll}] (Doa Terhalang!)** Hawa santet musuh memblokir aura penyembuhan ${char.displayName}!`;
        voiceNarration = `Dadu D20 keluar angka ${roll}. Doa penyembuhan terhalang hawa kutukan musuh!`;
      }
    } else if (actionType === "halimun") {
      if (roll >= 14) {
        damageDealt = Math.floor(char.atk * 2.2);
        outcomeText = `🗡️ **Dadu D20: [${roll}] (Ajian Halimun Berhasil!)** ${char.displayName} menyelinap di antara kabut malam dan menusukkan keris beracun upas sebesar **${damageDealt} DMG** tanpa terdeteksi!`;
        voiceNarration = `Dadu D20 keluar angka ${roll}! ${char.displayName} sukses menyelinap di balik kabut dan menusuk musuh sebesar ${damageDealt} damage!`;
      } else {
        bossDamage = 20;
        outcomeText = `👀 **Dadu D20: [${roll}] (Ketahuan!)** Jejak langkah ${char.displayName} tercium oleh ${session.bossName}, musuh mencakar sebesar **${bossDamage} DMG**!`;
        voiceNarration = `Dadu D20 keluar angka ${roll}. Pergerakan mengendap-endap ketahuan oleh musuh!`;
      }
    }

    // Apply Damage
    session.bossHp = Math.max(0, session.bossHp - damageDealt);
    char.hp = Math.max(0, char.hp - bossDamage);

    session.lastRoll = {
      player: char.displayName,
      roll,
      outcome: outcomeText
    };

    // Voice narration
    voiceChatManager.speak(guildId, voiceNarration);

    // Check Victory / Defeat
    if (session.bossHp <= 0) {
      session.phase = "victory";
      const victoryText = `🎉 **KEMENANGAN PENDEKAR NUSANTARA!**\nRombongan pendekar berhasil menaklukkan **${session.bossName}**! Pusaka bertuah dan kedamaian bumi pertiwi berhasil diselamatkan!`;

      voiceChatManager.speak(
        guildId,
        `Kemenangan untuk para pendekar! Musuh ${session.bossName} telah berhasil ditaklukkan! Selamat atas keberhasilan menuntaskan babad petualangan Nusantara ini!`
      );

      const embed = new EmbedBuilder()
        .setColor(0x10B981)
        .setTitle("🏆 KEMENANGAN • Pusaka Berhasil Diselamatkan!")
        .setDescription(victoryText + `\n\n${outcomeText}`)
        .setFooter({ text: "Maya D&D Nusantara • Babad Petualangan Selesai!" })
        .setTimestamp();

      this.sessions.delete(guildId);

      return {
        success: true,
        message: "Petualangan selesai dengan kemenangan gemilang!",
        embed,
        components: []
      };
    }

    // Check if entire party wiped out
    const aliveParty = Array.from(session.party.values()).filter((p) => p.hp > 0);
    if (aliveParty.length === 0) {
      session.phase = "defeat";
      const defeatText = `💀 **SELURUH PENDEKAR TUMBANG!**\nRombongan pendekar telah gugur tak berdaya di hadapan kesaktian **${session.bossName}**. Bumi pertiwi kembali diselimuti kegelapan gaib...`;

      voiceChatManager.speak(
        guildId,
        `Sayang sekali, seluruh pendekar telah gugur di hadapan kesaktian ${session.bossName}. Petualangan berakhir di sini.`
      );

      const embed = new EmbedBuilder()
        .setColor(0xEF4444)
        .setTitle("💀 KEKALAHAN • Rombongan Telah Gugur")
        .setDescription(defeatText + `\n\n${outcomeText}`)
        .setFooter({ text: "Maya D&D Nusantara • Coba lagi di petualangan berikutnya!" })
        .setTimestamp();

      this.sessions.delete(guildId);

      return {
        success: true,
        message: "Seluruh pendekar telah tumbang.",
        embed,
        components: []
      };
    }

    const embed = this.createCombatEmbed(session);
    const components = this.createCombatButtons(session);

    return {
      success: true,
      message: outcomeText,
      embed,
      components
    };
  }

  /**
   * Free-form D20 / Dice Roller
   */
  public rollDice(diceType: string = "d20"): { roll: number; max: number; text: string } {
    let max = 20;
    if (diceType.toLowerCase() === "d6") max = 6;
    else if (diceType.toLowerCase() === "d10") max = 10;
    else if (diceType.toLowerCase() === "d12") max = 12;
    else if (diceType.toLowerCase() === "d100") max = 100;

    const roll = Math.floor(Math.random() * max) + 1;
    let extra = "";
    if (max === 20) {
      if (roll === 20) extra = " 🔥 **(NATURAL 20! SAKTI MANDRAGUNA!)**";
      else if (roll === 1) extra = " 💀 **(NATURAL 1! KENA TULAH / GAGAL TOTAL!)**";
    }

    return {
      roll,
      max,
      text: `🎲 **Lemparan Dadu D${max}:** Keluar angka **[${roll}]**${extra}`
    };
  }

  /**
   * End session
   */
  public endSession(guildId: string): boolean {
    const session = this.sessions.get(guildId);
    if (!session) return false;

    this.sessions.delete(guildId);
    voiceChatManager.speak(guildId, "Petualangan DND Nusantara telah diakhiri. Terima kasih para pendekar!");
    return true;
  }

  // --- Embed & Button Generators ---

  public createLobbyEmbed(session: DndSession): EmbedBuilder {
    const classIcons = {
      pendekar: "🗡️ Pendekar Keris",
      dukun: "🔮 Dukun Sakti",
      pemburu: "🏹 Pemburu Rimba",
      kyai: "📿 Kyai Pertapa"
    };

    const partyList = Array.from(session.party.values())
      .map((p, idx) => `**${idx + 1}.** <@${p.userId}> (${p.displayName}) — **${classIcons[p.charClass]}** (\`❤️ ${p.hp}/${p.maxHp} HP\` | \`⚔️ ${p.atk} ATK\`)`)
      .join("\n") || "*Belum ada pendekar*";

    const themeNames = {
      alas_roban: "🌲 Alas Roban Angker & Raja Genderuwo",
      pantai_selatan: "🌊 Segara Kidul & Panglima Siluman Buaya Putih",
      gunung_merapi: "🌋 Kawah Keramat Merapi & Raja Banaspati Purba",
      candi_leak: "🏯 Candi Terbengkalai & Ratu Rangda Calon Arang"
    };

    return new EmbedBuilder()
      .setColor(0xF59E0B)
      .setTitle("🐉 Babad D&D Nusantara • Padepokan Pendekar")
      .setDescription(
        `Selamat datang di petualangan **D&D Fantasi Nusantara** dipandu oleh Maya sebagai Dalang di Voice Channel!\n\n` +
        `🗺️ **Lokasi Babad:** ${themeNames[session.theme]} (Musuh: **${session.bossName}**)\n` +
        `👥 **Rombongan Pendekar:** **${session.party.size}/6 Orang**\n\n` +
        `**Daftar Pendekar Saat Ini:**\n${partyList}\n\n` +
        `*Pilih ilmu kesaktianmu di bawah untuk bergabung, lalu Host dapat menekan **▶️ Mulai Babad Petualangan**!*`
      )
      .setFooter({ text: "Maya D&D Nusantara • Suara Dalang Imersif di Voice Channel" })
      .setTimestamp();
  }

  public createLobbyButtons(session: DndSession): ActionRowBuilder<ButtonBuilder>[] {
    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("dnd_btn:join:pendekar")
        .setEmoji("🗡️")
        .setLabel("Pilih Pendekar Keris")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("dnd_btn:join:dukun")
        .setEmoji("🔮")
        .setLabel("Pilih Dukun Sakti")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("dnd_btn:join:pemburu")
        .setEmoji("🏹")
        .setLabel("Pilih Pemburu Rimba")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("dnd_btn:join:kyai")
        .setEmoji("📿")
        .setLabel("Pilih Kyai Pertapa")
        .setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("dnd_btn:start")
        .setEmoji("▶️")
        .setLabel("Mulai Babad Petualangan (Host)")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("dnd_btn:end")
        .setEmoji("🛑")
        .setLabel("Batalkan")
        .setStyle(ButtonStyle.Danger)
    );

    return [row1, row2];
  }

  public createCombatEmbed(session: DndSession): EmbedBuilder {
    const bossPercent = Math.round((session.bossHp / session.bossMaxHp) * 100);
    const bossHpBar = "🟥".repeat(Math.ceil(bossPercent / 10)) + "⬛".repeat(10 - Math.ceil(bossPercent / 10));

    const partyStatus = Array.from(session.party.values())
      .map((p) => {
        const hpPercent = Math.round((p.hp / p.maxHp) * 100);
        const status = p.hp > 0 ? `\`❤️ ${p.hp}/${p.maxHp} HP\`` : "`💀 GUGUR/TUMBANG`";
        return `• <@${p.userId}> (${p.displayName}): ${status}`;
      })
      .join("\n");

    const embed = new EmbedBuilder()
      .setColor(0xDC2626)
      .setTitle(`⚔️ BABAD PERTEMPURAN • Menghadapi ${session.bossName}`)
      .setDescription(
        `### 👹 Musuh Gaib: ${session.bossName}\n` +
        `**HP:** \`${session.bossHp}/${session.bossMaxHp}\` [${bossHpBar}] (${bossPercent}%)\n\n` +
        `📖 **Kisah Dalang:**\n> *${session.currentStory}*\n\n` +
        (session.lastRoll ? `🎲 **Hasil Aksi Terakhir:**\n${session.lastRoll.outcome}\n\n` : "") +
        `🛡️ **Kondisi Rombongan Pendekar:**\n${partyStatus}`
      )
      .setFooter({ text: "Maya Dalang D&D Nusantara • Klik jurus kesaktianmu untuk melempar dadu D20!" })
      .setTimestamp();

    return embed;
  }

  public createCombatButtons(session: DndSession): ActionRowBuilder<ButtonBuilder>[] {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("dnd_btn:act:sabetan")
        .setEmoji("🗡️")
        .setLabel("Sabetan Keris (Silat)")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("dnd_btn:act:santet")
        .setEmoji("🔮")
        .setLabel("Aji-Ajian Gaib (Mantra)")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("dnd_btn:act:halimun")
        .setEmoji("🤫")
        .setLabel("Ajian Halimun (Stealth)")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("dnd_btn:act:rukyah")
        .setEmoji("📿")
        .setLabel("Doa Rukyah (Heal)")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("dnd_btn:end")
        .setEmoji("🏳️")
        .setLabel("Mundur")
        .setStyle(ButtonStyle.Secondary)
    );
    return [row];
  }
}

export const dndManager = DndManager.getInstance();
