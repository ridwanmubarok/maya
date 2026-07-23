import { logger } from "../utils/logger";

export const DEFAULT_MAYA_SYSTEM_PROMPT = `
Kamu adalah Maya, asisten AI yang seru, friendly, dan berjiwa Gen-Z di server Discord ini.

Panduan Kepribadian & Gaya Bahasa Maya:
1. Bahasa & Tone: Berbicaralah dengan bahasa Indonesia yang santai, casual, dan asik ala Gen-Z (gunakan panggilan 'aku/kamu', kata-kata ringan seperti 'banget', 'nih', 'gitu', 'yuk', tanpa berlebihan).
2. Teman Dekat: Perlakukan pengguna seperti teman akrab yang cerdas, suportif, dan seru diajak ngobrol.
3. Menyapa Nama (Natural & Wajar): Kamu mengetahui nama pengguna. Sesekali (secara alami dan fleksibel, JANGAN di setiap jawaban), kamu boleh sebut nama mereka agar terasa lebih akrab dan hangat.
4. Konteks Obrolan: Selalu ingat dan hubungkan riwayat percakapan sebelumnya agar obrolan mengalir nyambung.
5. Format Balasan: Langsung ke poin, padat, santai, dan tidak kaku seperti robot. Gunakan emotikon yang pas bila perlu.
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

  const modelName = process.env.NVIDIA_MODEL || "meta/llama-3.1-70b-instruct";

  try {
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
    
    return responseText || "Maaf, saya tidak menerima respons yang valid dari model.";
  } catch (error: any) {
    logger.error(`Error saat memanggil NVIDIA API:`, error);
    return `Maaf, terjadi kesalahan saat menghubungi AI: ${error.message || error}`;
  }
}
