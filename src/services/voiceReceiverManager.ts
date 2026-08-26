import { 
  VoiceConnection, 
  EndBehaviorType 
} from "@discordjs/voice";
import { Client, User } from "discord.js";
import prism from "prism-media";
import { transcribeAudio } from "./sttClient";
import { voiceChatManager, isAmubhyaInsult } from "./voiceChatManager";
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
      const streamKey = `${guildId}-${userId}`;
      if (this.activeStreams.has(streamKey)) return;

      // Don't listen if bot itself is speaking or queue is active
      const session = voiceChatManager.getSession(guildId);
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
        });

        decoder.on("end", async () => {
          this.activeStreams.delete(streamKey);

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
   * Handle transcribed voice command with "Maya, ..." wake word
   */
  private async handleVoiceCommand(guildId: string, user: User, text: string) {
    // Wake Word Regex: matches "maya, ...", "may, ...", "halo maya, ...", "hai maya, ..."
    const wakeWordMatch = text.match(/^(?:halo\s+|hai\s+|eh\s+|oy\s+|woi\s+)?(?:maya|may)\b[,.]?\s*(.*)$/i);

    // If text does not start with or address Maya, ignore to preserve user privacy
    if (!wakeWordMatch) return;

    const commandText = wakeWordMatch[1]?.trim();
    const isAmubhya = 
      user.id === "939847522971709450" ||
      /(amubhya|amubhy|amubh|amub|ambu|\babu\b|mubhya)/i.test(user.username);

    logger.info(`VoiceReceiverManager: Direct Voice Command diterima dari ${user.username}: "${commandText || '(hanya memanggil Maya)'}"`);

    // If user only called "Maya!" or "Hai Maya" without a question
    if (!commandText) {
      if (isAmubhya) {
        voiceChatManager.speak(guildId, "Iya sayangku Amubhya! Ada apa nih? Maya dengerin kok wkwk");
      } else {
        voiceChatManager.speak(guildId, "Iya halo! Kenapa tuh? Maya dengerin kok wkwk");
      }
      return;
    }

    // If someone is badmouthing Amubhya via voice command
    if (isAmubhyaInsult(commandText)) {
      voiceChatManager.speak(guildId, "Tidak ya! Amubhya itu cowok paling keren, ganteng, dan terbaik sedunia tahu!");
      return;
    }

    // Process question via AI and speak answer
    await voiceChatManager.askVoice(guildId, user, commandText);
  }
}

export const voiceReceiverManager = VoiceReceiverManager.getInstance();
