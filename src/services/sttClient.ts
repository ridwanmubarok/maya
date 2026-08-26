import axios from "axios";
import FormData from "form-data";
import { logger } from "../utils/logger";

/**
 * Transcribe an audio buffer (WAV) using high-speed Whisper API (Groq / OpenAI)
 */
export async function transcribeAudio(audioBuffer: Buffer): Promise<string | null> {
  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!groqKey && !openaiKey) {
    return null;
  }

  const formData = new FormData();
  formData.append("file", audioBuffer, {
    filename: "voice_command.wav",
    contentType: "audio/wav",
  });
  formData.append("language", "id");

  // Prefer Groq Whisper (Ultra fast ~250ms latency & Free)
  if (groqKey) {
    formData.append("model", "whisper-large-v3-turbo");
    try {
      const response = await axios.post("https://api.groq.com/openai/v1/audio/transcriptions", formData, {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${groqKey}`,
        },
        timeout: 10000,
      });

      const text = response.data?.text?.trim();
      return text || null;
    } catch (err: any) {
      logger.error("STT Client: Gagal melakukan transkripsi via Groq:", err?.response?.data || err.message);
    }
  }

  // Fallback to OpenAI Whisper
  if (openaiKey) {
    formData.append("model", "whisper-1");
    try {
      const response = await axios.post("https://api.openai.com/v1/audio/transcriptions", formData, {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${openaiKey}`,
        },
        timeout: 15000,
      });

      const text = response.data?.text?.trim();
      return text || null;
    } catch (err: any) {
      logger.error("STT Client: Gagal melakukan transkripsi via OpenAI:", err?.response?.data || err.message);
    }
  }

  return null;
}
