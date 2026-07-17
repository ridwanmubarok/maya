import { logger } from "../utils/logger";

export function initAI() {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    logger.warn("NVIDIA_API_KEY tidak ditemukan di .env. Fitur AI tidak akan berfungsi.");
    return;
  }
  logger.info("NVIDIA Build AI Client berhasil diinisialisasi.");
}

export async function askNvidia(prompt: string, personality?: string): Promise<string> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return "Maaf, fitur AI tidak dapat diakses karena NVIDIA API Key belum dikonfigurasi.";
  }

  const modelName = process.env.NVIDIA_MODEL || "meta/llama-3.1-8b-instruct";

  try {
    const messages = [];
    if (personality) {
      messages.push({ role: "system", content: personality });
    }
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
        temperature: 0.7,
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
