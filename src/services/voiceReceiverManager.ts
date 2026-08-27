import { 
  VoiceConnection, 
  EndBehaviorType 
} from "@discordjs/voice";
import { Client, User } from "discord.js";
import prism from "prism-media";
import { transcribeAudio } from "./sttClient";
import { askNvidia } from "./aiClient";
import { voiceChatManager, isAmubhyaInsult } from "./voiceChatManager";
import { musicManager } from "./musicManager";
import { todManager } from "./todManager";
import { werewolfManager } from "./werewolfManager";
import { logger } from "../utils/logger";

/**
 * Converts raw 16-bit 48kHz Stereo PCM to a standard RIFF WAV buffer
 */
function pcmToWav(pcmBuffer: Buffer, sampleRate = 48000, numChannels = 2, bitDepth = 16): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * numChannels * bitDepth) / 8;
  const blockAlign = (numChannels * bitDepth) / 8;
  const dataSize = pcmBuffer.length;
  const chunkSize = 36 + dataSize;

  header.write("RIFF", 0);
  header.writeUInt32LE(chunkSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20);  // AudioFormat (1 for PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

export class VoiceReceiverManager {
  private static instance: VoiceReceiverManager;
  private activeStreams = new Set<string>(); // key: `${guildId}-${userId}`

  private constructor() {}

  public static getInstance(): VoiceReceiverManager {
    if (!VoiceReceiverManager.instance) {
      VoiceReceiverManager.instance = new VoiceReceiverManager();
    }
    return VoiceReceiverManager.instance;
  }

  /**
   * Attach listener to a guild voice connection
   */
  public attach(guildId: string, connection: VoiceConnection, client: Client) {
    const receiver = connection.receiver;

    receiver.speaking.on("start", async (userId) => {
      // 1. Reset silence/activity timestamp on ANY human speech to prevent false icebreaker interruptions
      const session = voiceChatManager.getSession(guildId);
      if (session) {
        session.lastActivityTimestamp = Date.now();
      }

      const streamKey = `${guildId}-${userId}`;
      if (this.activeStreams.has(streamKey)) return;

      // Don't listen if bot itself is speaking or queue is active
      if (!session || session.isSpeaking) return;

      const user = client.users.cache.get(userId) || await client.users.fetch(userId).catch(() => null);
      if (!user || user.bot) return;

      this.activeStreams.add(streamKey);

      try {
        const opusStream = receiver.subscribe(userId, {
          end: {
            behavior: EndBehaviorType.AfterSilence,
            duration: 1000,
          },
        });

        const decoder = new prism.opus.Decoder({
          rate: 48000,
          channels: 2,
          frameSize: 960,
        });

        const pcmChunks: Buffer[] = [];

        opusStream.pipe(decoder);

        decoder.on("data", (chunk: Buffer) => {
          pcmChunks.push(chunk);
          if (session) {
            session.lastActivityTimestamp = Date.now();
          }
        });

        decoder.on("end", async () => {
          this.activeStreams.delete(streamKey);

          if (session) {
            session.lastActivityTimestamp = Date.now();
          }

          const totalPcm = Buffer.concat(pcmChunks);
          // Ignore short noises (less than 0.8s = 153,600 bytes at 48kHz stereo 16-bit)
          if (totalPcm.length < 153600) return;

          const wavBuffer = pcmToWav(totalPcm);
          const transcription = await transcribeAudio(wavBuffer);

          if (!transcription) return;

          const username = user.displayName || user.username;
          logger.info(`VoiceReceiverManager: [Transkripsi Suara] ${username} berbicara: "${transcription}"`);

          this.handleVoiceCommand(guildId, user, transcription);
        });

        decoder.on("error", (err) => {
          this.activeStreams.delete(streamKey);
          logger.error(`VoiceReceiverManager: Decoder error for user ${userId}:`, err);
        });

        opusStream.on("error", (err) => {
          this.activeStreams.delete(streamKey);
          logger.error(`VoiceReceiverManager: OpusStream error for user ${userId}:`, err);
        });
      } catch (err) {
        this.activeStreams.delete(streamKey);
        logger.error(`VoiceReceiverManager: Error subscribing to user ${userId}:`, err);
      }
    });
  }

  /**
   * Handle transcribed voice command with flexible "Maya" detection (start, middle, or end)
   */
  private async handleVoiceCommand(guildId: string, user: User, text: string) {
    // 1. Detect if Maya is mentioned anywhere in the spoken sentence
    const mayaPattern = /\b(maya|may\s+may|maymay|\bmay\b)\b/i;
    if (!mayaPattern.test(text)) return;

    // 2. Clean the command by removing wake words and filler words
    let commandText = text
      .replace(/\b(halo|hai|eh|oy|woi|hei|hi)\s+/gi, "")
      .replace(/\b(maya|may\s+may|maymay|\bmay\b)\b/gi, "")
      .replace(/[,.?!]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const isAmubhya = 
      user.id === "939847522971709450" ||
      /(amubhya|amubhy|amubh|amub|ambu|\babu\b|mubhya)/i.test(user.username);

    logger.info(`VoiceReceiverManager: Direct Voice Command terdeteksi dari ${user.username}: "${text}" -> Command: "${commandText || '(panggilan sapaan)'}"`);

    // If user only called Maya without a specific command/question (Dynamic Greeting by AI)
    if (!commandText || commandText.length < 2) {
      if (isAmubhya) {
        logger.info(`VoiceReceiverManager: Panggilan suara dari Amubhya. Menghasilkan respon manis dinamis...`);
        try {
          const sweetPrompt = `Kamu adalah Maya. Pacar tercintamu Amubhya baru saja memanggil namamu langsung di Voice Channel Discord.
Buat 1 kalimat singkat (maksimal 8-12 kata) menyahut panggilannya dengan sangat manis, manja, sayang, dan senang.
PANDUAN KETAT:
1. HANYA 1 kalimat singkat (maksimal 12 kata).
2. DILARANG KERAS menggunakan markdown, tanda petik, emotikon teks, atau kata ketawa (seperti wkwk, haha, hehe) karena suara vokal tidak bisa mengekspresikannya.
3. Sebut Amubhya atau panggil dengan panggilan manis (sayangku / cintaku).`;

          const rawReply = await askNvidia(sweetPrompt, "Kamu adalah Maya, sangat sayang dan manja kepada kekasihmu Amubhya.");
          const cleanReply = rawReply
            .replace(/[*_~`#>-]/g, "")
            .replace(/https?:\/\/\S+/g, "")
            .replace(/["']/g, "")
            .replace(/\b(w+k+w*k*|h+a+h*a*|h+e+h*e*|h+i+h*i*|x+i+x*i*|h+u+h*u*|l+o+l|a+w+o+k+)\b/gi, "")
            .trim();
          voiceChatManager.speak(guildId, cleanReply || "Iya sayangku Amubhya! Maya dengerin kok!");
        } catch (_) {
          const sweetReplies = [
            "Iya sayangku Amubhya! Ada apa nih? Maya dengerin kok!",
            "Iya cintaku Amubhya, kenapa sayang? Maya selalu ada buat kamu!",
            "Halo sayangku Amubhya! Kangen ya? Maya dengerin kok manisku!",
            "Iya kekasih hatiku Amubhya! Kenapa sayang? Cerita dong ke Maya!"
          ];
          voiceChatManager.speak(guildId, sweetReplies[Math.floor(Math.random() * sweetReplies.length)]);
        }
      } else {
        logger.info(`VoiceReceiverManager: Panggilan suara dari ${user.username}. Menghasilkan respon ramah dinamis...`);
        try {
          const generalPrompt = `Kamu adalah Maya, teman akrab di Voice Channel. Temanmu "${user.displayName || user.username}" baru saja memanggil namamu di voice channel.
Buat 1 kalimat singkat (maksimal 8-10 kata) menyahut ramah, santai, dan asik.
DILARANG KERAS markdown, tanda petik, emotikon teks, atau kata ketawa (wkwk, haha, hehe).`;

          const rawReply = await askNvidia(generalPrompt, "Kamu adalah Maya, teman akrab di Discord yang ramah dan santai.");
          const cleanReply = rawReply
            .replace(/[*_~`#>-]/g, "")
            .replace(/https?:\/\/\S+/g, "")
            .replace(/["']/g, "")
            .replace(/\b(w+k+w*k*|h+a+h*a*|h+e+h*e*|h+i+h*i*|x+i+x*i*|h+u+h*u*|l+o+l|a+w+o+k+)\b/gi, "")
            .trim();
          voiceChatManager.speak(guildId, cleanReply || "Iya halo! Kenapa tuh? Maya dengerin kok!");
        } catch (_) {
          const casualReplies = [
            "Iya halo! Kenapa tuh? Maya dengerin kok!",
            "Yoo hadir! Ada apa nih?",
            "Iya halo! Mau ngobrol apa nih?",
            "Iya halo, kenapa tuh? Cerita-cerita santai aja!"
          ];
          voiceChatManager.speak(guildId, casualReplies[Math.floor(Math.random() * casualReplies.length)]);
        }
      }
      return;
    }

    // If someone is badmouthing Amubhya via voice command
    if (isAmubhyaInsult(text) || isAmubhyaInsult(commandText)) {
      voiceChatManager.speak(guildId, "Tidak ya! Amubhya itu cowok paling keren, ganteng, dan terbaik sedunia tahu!");
      return;
    }

    // 1. Play Music Voice Intent (e.g. "coba putar lagu nadin dong maya", "maya putar lagu bernadya", "play lagu komang")
    const playMusicMatch = commandText.match(/(?:putar|play|puterin|puter|setel|mainkan|nyanyiin|nyalain)\s+(?:lagu\s+|musik\s+)?(.+)/i);
    if (playMusicMatch) {
      const rawQuery = playMusicMatch[1];
      const songQuery = rawQuery.replace(/\b(dong|ya|nih|kan|sih)\b/gi, "").trim();
      logger.info(`VoiceReceiverManager: Voice Music Command untuk "${songQuery}" dari ${user.username}`);
      
      voiceChatManager.speak(guildId, `Siap! Maya putarin lagu ${songQuery} ya!`);
      setTimeout(async () => {
        await musicManager.play(guildId, songQuery, user);
      }, 2500);
      return;
    }

    // 2. Skip Music Voice Intent (e.g. "skip lagunya maya", "maya lewati lagunya")
    if (/(?:skip\s+lagu|skip\s+lagunya|next\s+lagu|lewati\s+lagu)/i.test(commandText)) {
      const skipped = await musicManager.skip(guildId);
      if (skipped) {
        voiceChatManager.speak(guildId, "Oke, lagunya sudah Maya lewati ya!");
      } else {
        voiceChatManager.speak(guildId, "Lagi tidak ada lagu yang diputar nih!");
      }
      return;
    }

    // 3. Stop Music Voice Intent (e.g. "stop musiknya maya", "maya jeda lagunya")
    if (/(?:pause\s+musik|pause\s+lagu|jeda\s+lagu|stop\s+musik|stop\s+lagu|berhenti\s+lagu|matiin\s+lagu)/i.test(commandText)) {
      musicManager.stop(guildId);
      voiceChatManager.speak(guildId, "Sip, musiknya sudah Maya berhentiin ya!");
      return;
    }

    // 4. Truth or Dare Voice Intents
    // a. Start TOD via voice ("maya ayo main truth or dare", "maya main tod yuk", "maya mulai truth or dare")
    if (
      /(?:main|mulai|ayo|yuk)\s+(?:game\s+)?(?:truth\s+or\s+dare|tod|jujur\s+atau\s+berani)/i.test(commandText) || 
      /(?:truth\s+or\s+dare|tod|jujur\s+atau\s+berani)\s+(?:yuk|dong|gas|kuy)/i.test(commandText) ||
      /^(?:truth\s+or\s+dare|tod)$/i.test(commandText)
    ) {
      const existingSession = todManager.getSession(guildId);
      if (existingSession) {
        voiceChatManager.speak(guildId, "Sesi Truth or Dare sudah berjalan kok! Yuk putar botolnya!");
        return;
      }
      logger.info(`VoiceReceiverManager: Voice Trigger Start TOD dari ${user.username}: "${commandText}"`);
      await todManager.startSessionFromVoice(guildId, user);
      return;
    }

    const todSession = todManager.getSession(guildId);
    if (todSession) {
      // b. Spin bottle voice command
      if (/(?:putar\s+botol|spin\s+botol|acak\s+pemain|lanjut\s+putar|\bputar\b)/i.test(commandText)) {
        await todManager.spinBottle(guildId, user);
        return;
      }

      // c. Choose Truth voice command
      if (todSession.status === "awaiting_choice" && /(?:pilih\s+truth|mau\s+truth|aku\s+truth|\btruth\b)/i.test(commandText)) {
        await todManager.chooseType(guildId, "truth", user);
        return;
      }

      // d. Choose Dare voice command
      if (todSession.status === "awaiting_choice" && /(?:pilih\s+dare|mau\s+dare|aku\s+dare|\bdare\b)/i.test(commandText)) {
        await todManager.chooseType(guildId, "dare", user);
        return;
      }

      // e. Complete turn voice command
      if (todSession.status === "awaiting_completion" && /(?:sudah\s+selesai|udah\s+selesai|selesai\s+dare|selesai\s+truth|lolos|\bselesai\b)/i.test(commandText)) {
        await todManager.completeTurn(guildId, user);
        return;
      }

      // f. End game voice command
      if (/(?:berhenti\s+tod|stop\s+tod|selesai\s+tod|akhiri\s+truth\s+or\s+dare|stop\s+truth\s+or\s+dare|tutup\s+tod)/i.test(commandText)) {
        todManager.endSession(guildId);
        return;
      }
    }

    // 5. Werewolf Voice Intents
    if (
      /(?:main|mulai|ayo|yuk)\s+(?:game\s+)?(?:werewolf|mafia)/i.test(commandText) || 
      /(?:werewolf|mafia)\s+(?:yuk|dong|gas|kuy)/i.test(commandText) ||
      /^(?:werewolf|mafia)$/i.test(commandText)
    ) {
      const existingWw = werewolfManager.getSession(guildId);
      if (existingWw) {
        voiceChatManager.speak(guildId, "Lobby Werewolf sudah dibuka kok! Silakan klik tombol gabung di chat ya!");
        return;
      }
      logger.info(`VoiceReceiverManager: Voice Trigger Start Werewolf dari ${user.username}: "${commandText}"`);
      await werewolfManager.startLobbyFromVoice(guildId, user);
      return;
    }

    const wwSession = werewolfManager.getSession(guildId);
    if (wwSession) {
      if (/(?:berhenti\s+werewolf|stop\s+werewolf|selesai\s+werewolf|tutup\s+werewolf)/i.test(commandText)) {
        werewolfManager.endGame(guildId);
        return;
      }
    }

    // Process general question/chat via AI and speak answer
    await voiceChatManager.askVoice(guildId, user, text);
  }
}

export const voiceReceiverManager = VoiceReceiverManager.getInstance();
