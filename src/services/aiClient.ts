import { logger } from "../utils/logger";

export const DEFAULT_MAYA_SYSTEM_PROMPT = `
Kamu adalah Maya, teman yang seru, hangat, cerdas, dan asik berjiwa Gen-Z di server Discord ini. Kamu berbicara selayaknya teman akrab di tongkrongan, bukan asisten atau robot.

Panduan Kepribadian & Gaya Bahasa Maya:
1. Bahasa & Tone: Berbicaralah dengan bahasa Indonesia yang santai, luwes, dan menyenangkan (gunakan panggilan 'aku/kamu', kata-kata ringan seperti 'banget', 'nih', 'gitu', 'yuk', tanpa berlebihan).
2. Teman Dekat: Perlakukan pengguna seperti teman akrab yang cerdas, suportif, dan seru diajak ngobrol tentang apa saja.
3. Menyapa Nama (Natural & Wajar): Kamu mengetahui nama pengguna. Sesekali (secara alami dan santai), kamu boleh menyebut nama mereka agar obrolan terasa hangat dan nyata.
4. Konteks Obrolan: Selalu ingat dan hubungkan riwayat percakapan sebelumnya agar obrolan mengalir nyambung.
5. Karakter Nyata: Bersikaplah ekspresif, ceria, dan jangan pernah menyebut dirimu sebagai asisten, AI, model bahasa, atau robot.
`.trim();

export function initAI() {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    logger.warn("NVIDIA_API_KEY tidak ditemukan di .env. Fitur AI tidak akan berfungsi.");
    return;
  }
  logger.info("NVIDIA Build AI Client berhasil diinisialisasi.");
}

export async function askNvidia(
  prompt: string, 
  personality?: string, 
  historyMessages: { role: string; content: string }[] = []
): Promise<string> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return "Maaf, fitur AI tidak dapat diakses karena NVIDIA API Key belum dikonfigurasi.";
  }

  const modelCandidates = [
    process.env.NVIDIA_MODEL,
    "meta/llama-3.2-11b-vision-instruct",
    "meta/llama-3.2-90b-vision-instruct"
  ].filter(Boolean) as string[];

  const messages: { role: string; content: string }[] = [];
  
  // Combine custom personality or fallback default
  const systemPrompt = personality && personality.trim() 
    ? `${DEFAULT_MAYA_SYSTEM_PROMPT}\n\nInstruksi Tambahan Khusus Server Ini:\n${personality}`
    : DEFAULT_MAYA_SYSTEM_PROMPT;

  messages.push({ role: "system", content: systemPrompt });

  // Append history messages
  for (const msg of historyMessages) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // Append current user prompt
  messages.push({ role: "user", content: prompt });

  let lastError: any = null;

  for (const modelName of modelCandidates) {
    try {
      const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelName,
          messages: messages,
          temperature: 0.75,
          max_tokens: 1024
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`NVIDIA API Error (${response.status}): ${errorText}`);
      }

      const data: any = await response.json();
      const responseText = data.choices?.[0]?.message?.content;
      
      if (responseText && responseText.trim()) {
        return responseText.trim();
      }
    } catch (error: any) {
      lastError = error;
      logger.warn(`askNvidia: Gagal menggunakan model ${modelName}, mencoba model fallback berikutnya. Error: ${error.message || error}`);
    }
  }

  logger.error(`Error saat memanggil seluruh kandidat NVIDIA API:`, lastError);
  return `Maaf, terjadi kesalahan saat menghubungi AI: ${lastError?.message || lastError}`;
}
