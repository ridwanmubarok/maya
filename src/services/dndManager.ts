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

export type DndClass = "warrior" | "mage" | "rogue" | "cleric";

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

export type DndTheme = "dungeon" | "dragon" | "vampire" | "dark_forest";

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
   * Create a new D&D Adventure Lobby
   */
  public async createLobby(
    guildId: string,
    textChannel: TextBasedChannel,
    voiceChannel: VoiceBasedChannel,
    host: User,
    theme: DndTheme = "dungeon"
  ): Promise<{ success: boolean; message: string; embed?: EmbedBuilder; components?: ActionRowBuilder<ButtonBuilder>[] }> {
    if (this.sessions.has(guildId)) {
      return { success: false, message: "Sesi petualangan D&D sudah aktif di server ini!" };
    }

    if (!voiceChatManager.isConnected(guildId)) {
      const joined = await voiceChatManager.join(voiceChannel);
      if (!joined) {
        return { success: false, message: "Maya gagal bergabung ke Voice Channel!" };
      }
    }

    const themeTitles: Record<DndTheme, { title: string; boss: string; hp: number }> = {
      dungeon: { title: "Reruntuhan Kuno & Raja Goblin", boss: "Goblin King Ghorzar", hp: 120 },
      dragon: { title: "Puncak Gunung Berapi & Naga Merah", boss: "Ancient Red Dragon Ignis", hp: 180 },
      vampire: { title: "Kastil Kegelapan & Lord Vampir", boss: "Lord Dracula Von Blood", hp: 150 },
      dark_forest: { title: "Hutan Terlarang & Ratu Penyihir", boss: "Witch Queen Morgana", hp: 130 }
    };

    const config = themeTitles[theme];

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

    // Auto add host as Warrior by default
    session.party.set(host.id, {
      userId: host.id,
      username: host.username,
      displayName: host.displayName || host.username,
      charClass: "warrior",
      hp: 100,
      maxHp: 100,
      atk: 20,
      user: host
    });

    this.sessions.set(guildId, session);

    logger.info(`DndManager: Sesi D&D dibuat oleh ${host.username} di guild ${guildId} (Tema: ${theme})`);

    // Voice announcement
    voiceChatManager.speak(
      guildId,
      "Salam para petualang! Maya akan menjadi Dungeon Master kalian hari ini! Silakan pilih kelas karaktermu di chat untuk bergabung ke party petualangan!"
    );

    const embed = this.createLobbyEmbed(session);
    const components = this.createLobbyButtons(session);

    return {
      success: true,
      message: "Lobby D&D berhasil dibuat!",
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
      voiceChatManager.speak(guildId, "Maya harus berada di Voice Channel dulu untuk memandu DND!");
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
      voiceChatManager.speak(guildId, "Maya tidak menemukan text channel untuk papan DND!");
      return false;
    }

    const res = await this.createLobby(guildId, targetTextChannel, voiceChannel, user, "dungeon");

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
   * Player joins party with a chosen class
   */
  public joinParty(
    guildId: string,
    user: User,
    charClass: DndClass
  ): { success: boolean; message: string; embed?: EmbedBuilder; components?: ActionRowBuilder<ButtonBuilder>[] } {
    const session = this.sessions.get(guildId);
    if (!session || session.phase !== "lobby") {
      return { success: false, message: "Pendaftaran party petualangan tidak sedang dibuka!" };
    }

    if (session.party.size >= 6) {
      return { success: false, message: "Party petualang sudah penuh (maksimal 6 petualang)!" };
    }

    const classStats: Record<DndClass, { hp: number; atk: number }> = {
      warrior: { hp: 120, atk: 25 },
      mage: { hp: 80, atk: 35 },
      rogue: { hp: 90, atk: 30 },
      cleric: { hp: 100, atk: 20 }
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
      warrior: "⚔️ Warrior (Pejuang)",
      mage: "🧙‍♂️ Mage (Penyihir)",
      rogue: "🏹 Rogue (Pemanah/Pengintai)",
      cleric: "🛡️ Cleric (Penyembuh/Ksatria Suci)"
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
      return { success: false, message: "Dibutuhkan minimal 1 petualang di dalam party!" };
    }

    session.phase = "story";
    session.chapter = 1;

    const themePrompts: Record<DndTheme, string> = {
      dungeon: "Party petualang baru saja menuruni tangga batu berlumut menuju Reruntuhan Kuno bawah tanah. Obor menyala temaram, terdengar suara geraman Goblin di kejauhan.",
      dragon: "Party petualang mendaki kawah Gunung Berapi yang mengepulkan asap belerang. Di sarang puncak, bayangan Naga Merah raksasa tampak melingkari tumpukan emas.",
      vampire: "Pintu gerbang Kastil Kegelapan terbuka berderit. Angin dingin menusuk tulang dan kelelawar berterbangan saat Lord Vampir mengawasi dari atas balkon.",
      dark_forest: "Kalian memasuki Hutan Terlarang yang diselimuti kabut tebal berwarna ungu. Pohon-pohon purba seolah bergerak dan suara tawa Ratu Penyihir menggema."
    };

    let storyText = "";
    try {
      const aiPrompt = `Kamu adalah Maya, Dungeon Master (DM) pemandu game D&D (Dungeons & Dragons) di Voice Channel Discord.
Latar awal cerita: ${themePrompts[session.theme]}
Anggota Party: ${Array.from(session.party.values()).map((p) => `${p.displayName} (${p.charClass})`).join(", ")}.
Buat narasi pembuka petualangan Chapter 1 yang seru, imersif, misterius, dan menegangkan!
PANDUAN KETAT:
1. Buat dalam 2-3 kalimat singkat (maksimal 25-30 kata) agar pas dibacakan suara vokal Maya.
2. DILARANG menggunakan markdown (*, _, \`), tanda petik, emotikon teks, atau kata ketawa (wkwk, haha) karena ini akan diubah langsung menjadi audio suara Dungeon Master.`;

      const rawStory = await askNvidia(aiPrompt, "Kamu adalah Maya, Dungeon Master RPG D&D yang seru dan atmosferik.");
      storyText = rawStory
        .replace(/[*_~`#>-]/g, "")
        .replace(/https?:\/\/\S+/g, "")
        .replace(/["']/g, "")
        .replace(/\b(w+k+w*k*|h+a+h*a*|h+e+h*e*|h+i+h*i*|x+i+x*i*|h+u+h*u*|l+o+l|a+w+o+k+)\b/gi, "")
        .trim();
    } catch (_) {}

    if (!storyText) {
      storyText = `Petualangan dimulai! Pintu gerbang terbuka perlahan dan hawa dingin menyambut kalian. Di hadapan kalian, tampak monster penjaga ${session.bossName} sedang bersiap menyerang!`;
    }

    session.currentStory = storyText;
    session.phase = "combat";

    logger.info(`DndManager: Story Chapter 1 dimulai: "${storyText}"`);

    // Voice announcement by Maya DM
    voiceChatManager.speak(guildId, storyText);

    const embed = this.createCombatEmbed(session);
    const components = this.createCombatButtons(session);

    return {
      success: true,
      message: "Petualangan dimulai!",
      embed,
      components
    };
  }

  /**
   * Execute Action with D20 Dice Roll
   */
  public async executeAction(
    guildId: string,
    actor: User,
    actionType: "attack" | "spell" | "stealth" | "heal"
  ): Promise<{ success: boolean; message: string; embed?: EmbedBuilder; components?: ActionRowBuilder<ButtonBuilder>[] }> {
    const session = this.sessions.get(guildId);
    if (!session || session.phase !== "combat") {
      return { success: false, message: "Saat ini sedang tidak dalam fase pertarungan!" };
    }

    const char = session.party.get(actor.id);
    if (!char || char.hp <= 0) {
      return { success: false, message: "Karaktermu sudah tidak berdaya untuk bertindak!" };
    }

    // Roll D20 dice (1 - 20)
    const roll = Math.floor(Math.random() * 20) + 1;
    let damageDealt = 0;
    let bossDamage = 0;
    let outcomeText = "";
    let voiceNarration = "";

    if (actionType === "attack") {
      if (roll === 20) {
        damageDealt = Math.floor(char.atk * 2.5);
        outcomeText = `🎯 **NATURAL 20! CRITICAL HIT!** Serangan ${char.displayName} menghantam titik vital ${session.bossName} dengan dahsyat sebesar **${damageDealt} DMG**!`;
        voiceNarration = `Natural 20! Serangan kritis ${char.displayName} memberikan damage dahsyat sebesar ${damageDealt} poin ke ${session.bossName}!`;
      } else if (roll >= 10) {
        damageDealt = Math.floor(char.atk * (0.8 + roll / 20));
        bossDamage = Math.floor(Math.random() * 15) + 5;
        outcomeText = `⚔️ **Dadu D20: [${roll}] (Berhasil!)** ${char.displayName} menebas ${session.bossName} sebesar **${damageDealt} DMG**, tapi terkena serangan balik **${bossDamage} DMG**!`;
        voiceNarration = `Dadu D20 keluar angka ${roll}! Serangan ${char.displayName} sukses memberikan ${damageDealt} damage!`;
      } else if (roll === 1) {
        bossDamage = 25;
        outcomeText = `💀 **NATURAL 1! CRITICAL FUMBLE!** Serangan ${char.displayName} meleset fatal dan ${session.bossName} membalas telak sebesar **${bossDamage} DMG**!`;
        voiceNarration = `Natural 1! Kritis gagal! Serangan ${char.displayName} terpeleset dan terkena serangan balik musuh!`;
      } else {
        bossDamage = Math.floor(Math.random() * 20) + 10;
        outcomeText = `🛡️ **Dadu D20: [${roll}] (Gagal!)** Serangan ${char.displayName} ditangkis musuh! Karaktermu terkena serangan balik **${bossDamage} DMG**!`;
        voiceNarration = `Dadu D20 keluar angka ${roll}. Serangan ${char.displayName} berhasil ditangkis oleh ${session.bossName}!`;
      }
    } else if (actionType === "spell") {
      if (roll >= 12) {
        damageDealt = Math.floor(char.atk * 1.8);
        outcomeText = `🔮 **Dadu D20: [${roll}] (Mantra Sukses!)** ${char.displayName} melancarkan sihir ledakan elemen dahsyat sebesar **${damageDealt} DMG**!`;
        voiceNarration = `Dadu D20 keluar angka ${roll}! Sihir ${char.displayName} meledak dan membakar musuh sebesar ${damageDealt} damage!`;
      } else {
        bossDamage = 15;
        outcomeText = `💨 **Dadu D20: [${roll}] (Sihir Buyar!)** Konsentrasi sihir ${char.displayName} terganggu dan terkena gelombang kejut **${bossDamage} DMG**!`;
        voiceNarration = `Dadu D20 keluar angka ${roll}. Rapalan sihir ${char.displayName} gagal dan buyar!`;
      }
    } else if (actionType === "heal") {
      if (roll >= 8) {
        const healAmount = Math.floor(Math.random() * 25) + 20;
        char.hp = Math.min(char.maxHp, char.hp + healAmount);
        // Also heal team member with lowest HP
        for (const mate of session.party.values()) {
          if (mate.hp > 0 && mate.hp < mate.maxHp) {
            mate.hp = Math.min(mate.maxHp, mate.hp + Math.floor(healAmount / 2));
          }
        }
        outcomeText = `✨ **Dadu D20: [${roll}] (Heal Berhasil!)** ${char.displayName} merapalkan doa penyembuhan, memulihkan **+${healAmount} HP** party!`;
        voiceNarration = `Dadu D20 keluar angka ${roll}! Cahaya penyembuhan ${char.displayName} berhasil memulihkan HP rekan party!`;
      } else {
        outcomeText = `🚫 **Dadu D20: [${roll}] (Gagal Heal!)** Mantra penyembuhan ${char.displayName} terhalang aura jahat dungeon!`;
        voiceNarration = `Dadu D20 keluar angka ${roll}. Mantra penyembuhan terhalang aura kegelapan!`;
      }
    } else if (actionType === "stealth") {
      if (roll >= 14) {
        damageDealt = Math.floor(char.atk * 2.2);
        outcomeText = `🗡️ **Dadu D20: [${roll}] (Serangan Kejutan!)** ${char.displayName} menyelinap ke belakang ${session.bossName} dan menusuk dari bayangan sebesar **${damageDealt} DMG** tanpa terkena serangan balik!`;
        voiceNarration = `Dadu D20 keluar angka ${roll}! ${char.displayName} sukses menyelinap dan menusuk titik lemah musuh sebesar ${damageDealt} damage!`;
      } else {
        bossDamage = 20;
        outcomeText = `👀 **Dadu D20: [${roll}] (Ketahuan!)** Langkah ${char.displayName} terdengar oleh ${session.bossName}, musuh menghantammu sebesar **${bossDamage} DMG**!`;
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
      const victoryText = `🎉 **KEMENANGAN TELAH DIRAIH!**\nParty petualang berhasil mengalahkan **${session.bossName}**! Harta karun legendaris dan kedamaian kembali ke negeri ini!`;

      voiceChatManager.speak(
        guildId,
        `Luar biasa! Musuh ${session.bossName} telah tumbang! Selamat untuk seluruh petualang, kalian berhasil menyelesaikan quest legendaris ini!`
      );

      const embed = new EmbedBuilder()
        .setColor(0x10B981)
        .setTitle("🏆 VICTORY • Quest Selesai!")
        .setDescription(victoryText + `\n\n${outcomeText}`)
        .setFooter({ text: "Maya D&D Dungeon Master • Petualangan Berhasil!" })
        .setTimestamp();

      this.sessions.delete(guildId);

      return {
        success: true,
        message: "Petualangan selesai dengan kemenangan!",
        embed,
        components: []
      };
    }

    // Check if entire party wiped out
    const aliveParty = Array.from(session.party.values()).filter((p) => p.hp > 0);
    if (aliveParty.length === 0) {
      session.phase = "defeat";
      const defeatText = `💀 **PARTY WIPEOUT / DEFEAT!**\nSeluruh anggota petualang telah tumbang di tangan **${session.bossName}**. Kegelapan menelan reruntuhan ini...`;

      voiceChatManager.speak(
        guildId,
        `Sayang sekali, seluruh petualang telah gugur di tangan ${session.bossName}. Petualangan berakhir di sini.`
      );

      const embed = new EmbedBuilder()
        .setColor(0xEF4444)
        .setTitle("💀 DEFEAT • Party Telah Gugur")
        .setDescription(defeatText + `\n\n${outcomeText}`)
        .setFooter({ text: "Maya D&D Dungeon Master • Coba lagi di petualangan berikutnya!" })
        .setTimestamp();

      this.sessions.delete(guildId);

      return {
        success: true,
        message: "Seluruh party telah gugur.",
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
      if (roll === 20) extra = " 🔥 **(NATURAL 20! CRITICAL SUCCESS!)**";
      else if (roll === 1) extra = " 💀 **(NATURAL 1! CRITICAL FUMBLE!)**";
    }

    return {
      roll,
      max,
      text: `🎲 **Lemparan D${max}:** Keluar angka **[${roll}]**${extra}`
    };
  }

  /**
   * End session
   */
  public endSession(guildId: string): boolean {
    const session = this.sessions.get(guildId);
    if (!session) return false;

    this.sessions.delete(guildId);
    voiceChatManager.speak(guildId, "Petualangan D&D telah diakhiri. Terima kasih para petualang!");
    return true;
  }

  // --- Embed & Button Generators ---

  public createLobbyEmbed(session: DndSession): EmbedBuilder {
    const classIcons = {
      warrior: "⚔️ Warrior",
      mage: "🧙‍♂️ Mage",
      rogue: "🏹 Rogue",
      cleric: "🛡️ Cleric"
    };

    const partyList = Array.from(session.party.values())
      .map((p, idx) => `**${idx + 1}.** <@${p.userId}> (${p.displayName}) — **${classIcons[p.charClass]}** (\`❤️ ${p.hp}/${p.maxHp} HP\` | \`⚔️ ${p.atk} ATK\`)`)
      .join("\n") || "*Belum ada petualang*";

    return new EmbedBuilder()
      .setColor(0xF59E0B)
      .setTitle("🐉 Maya D&D • Guild Pendaftaran Petualang")
      .setDescription(
        `Selamat datang di petualangan **Dungeons & Dragons** dipandu oleh Maya sebagai Dungeon Master di Voice Channel!\n\n` +
        `🗺️ **Lokasi Quest:** ${session.theme.toUpperCase()} (Boss: **${session.bossName}**)\n` +
        `👥 **Anggota Party:** **${session.party.size}/6 Petualang**\n\n` +
        `**Daftar Petualang Saat Ini:**\n${partyList}\n\n` +
        `*Pilih kelas karaktermu di bawah untuk bergabung, lalu Host dapat menekan **▶️ Mulai Petualangan**!*`
      )
      .setFooter({ text: "Maya D&D Dungeon Master • Suara Narasi Imersif di Voice Channel" })
      .setTimestamp();
  }

  public createLobbyButtons(session: DndSession): ActionRowBuilder<ButtonBuilder>[] {
    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("dnd_btn:join:warrior")
        .setEmoji("⚔️")
        .setLabel("Pilih Warrior")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("dnd_btn:join:mage")
        .setEmoji("🧙‍♂️")
        .setLabel("Pilih Mage")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("dnd_btn:join:rogue")
        .setEmoji("🏹")
        .setLabel("Pilih Rogue")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("dnd_btn:join:cleric")
        .setEmoji("🛡️")
        .setLabel("Pilih Cleric")
        .setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("dnd_btn:start")
        .setEmoji("▶️")
        .setLabel("Mulai Petualangan (Host)")
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
        const status = p.hp > 0 ? `\`❤️ ${p.hp}/${p.maxHp} HP\`` : "`💀 TUMBANG`";
        return `• <@${p.userId}> (${p.displayName}): ${status}`;
      })
      .join("\n");

    const embed = new EmbedBuilder()
      .setColor(0xDC2626)
      .setTitle(`⚔️ BATTLE • Menghadapi ${session.bossName}`)
      .setDescription(
        `### 👹 Boss: ${session.bossName}\n` +
        `**HP:** \`${session.bossHp}/${session.bossMaxHp}\` [${bossHpBar}] (${bossPercent}%)\n\n` +
        `📖 **Narasi Situasi:**\n> *${session.currentStory}*\n\n` +
        (session.lastRoll ? `🎲 **Hasil Aksi Terakhir:**\n${session.lastRoll.outcome}\n\n` : "") +
        `🛡️ **Status Party Petualang:**\n${partyStatus}`
      )
      .setFooter({ text: "Maya D&D Dungeon Master • Klik aksi di bawah untuk melempar dadu D20!" })
      .setTimestamp();

    return embed;
  }

  public createCombatButtons(session: DndSession): ActionRowBuilder<ButtonBuilder>[] {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("dnd_btn:act:attack")
        .setEmoji("⚔️")
        .setLabel("Serang (D20 Melee)")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("dnd_btn:act:spell")
        .setEmoji("🔮")
        .setLabel("Sihir (D20 Magic)")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("dnd_btn:act:stealth")
        .setEmoji("🗡️")
        .setLabel("Menyelinap (Stealth)")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("dnd_btn:act:heal")
        .setEmoji("✨")
        .setLabel("Doa Penyembuhan (Heal)")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("dnd_btn:end")
        .setEmoji("🏳️")
        .setLabel("Menyerah")
        .setStyle(ButtonStyle.Secondary)
    );
    return [row];
  }
}

export const dndManager = DndManager.getInstance();
