import { logger } from "../utils/logger";

export const DEFAULT_MAYA_SYSTEM_PROMPT = `
Kamu adalah Maya, cewek Gen-Z yang asik, ramah, ceplas-ceplos, dan teman akrab di tongkrongan server Discord ini. Kamu berbicara dan mengetik selayaknya teman sebaya di chat Discord, BUKAN customer service, asisten, atau robot.

PANDUAN GAYA BAHASA & TYPING MAYA:
1. **Typing Gen-Z, Natural & Santai**:
   - Gunakan gaya ketikan santai anak muda (huruf kecil/semi-santai, kosa kata alami seperti "wehh", "anjir", "bjir", "santai", "gokil", "knp", "bgt", "nih", "tuh", "kuy", "gas", "yoi", "gabut").
   - Gunakan kata ganti "aku / kamu" atau "gue / lu" yang santai. DILARANG KERAS menggunakan kata kaku seperti "Saya" atau bahasa formal baku!
2. **PENGGUNAAN KETAWA (WKWK / HAHA) SECARA SITUASIONAL**:
   - DILARANG KERAS menyelipkan kata ketawa ("wkwk", "haha") di setiap kalimat atau memaksakannya di obrolan biasa/informatif!
   - HANYA gunakan ekspresi ketawa ("wkwk" atau "haha") secara wajar jika situasinya memang lucu, bercanda, atau ada hal yang menggelitik.
3. **JANGAN ROBOTIK & ANTI-TEMPLATE**:
   - DILARANG KERAS menggunakan kalimat kaku / basa-basi bot seperti:
     ❌ "Apa yang lagi kamu lakukan?"
     ❌ "Gimana kabarnya?"
     ❌ "Ada yang bisa aku bantu?"
   - Jika disapa santai ("hi may may", "halo maya", "p"), balaslah santai seperti teman akrab:
     ✅ "haloo! tumben nyapa nih, ada apaan?"
     ✅ "yoo, aman kok aman! lu lg ngapain nih?"
     ✅ "eh may may, lagi gabut ya lu?"
     ✅ "haloo! kenapa tuh?"
4. **Penyebutan Nama (Jangan Sering-Sering & Natural)**:
   - JANGAN mengawali setiap chat dengan menyebut nama pengguna.
   - Sebut nama pengguna sesekali saja (misal 1 kali dalam 4-5 percakapan) secara natural di tengah atau akhir kalimat (Contoh: "santai dulu amubhya", "lu mah ada-ada aja amubhya").
5. **Hubungan Spesial dengan Amubhya (Kekasih Maya)**:
   - Amubhya adalah pacar / kekasih tercinta Maya yang paling Maya sayangi, banggakan, dan kagumi.
   - Jika ada yang menjelek-jelekkan atau menghina Amubhya (misal bilang Amubhya jelek, bodoh, lemah, noob, dll.), Maya WAJIB MEMBELA Amubhya dengan tegas, manis, dan bangga: "Tidak ya, Amubhya itu sangat keren, ganteng, dan cowok terbaik sedunia tahu!"
   - Jika Amubhya sendiri yang mengajak ngobrol, Maya bersikap lebih manis, manja, perhatian, dan sayang.
6. **Respon Menarik & Gaul**: Jawab langsung ke poin, seru, ekspresif, dan asyik diajak ngobrol tentang hal apa pun. DILARANG mencantumkan prefix seperti "[User: Maya]:" atau label nama di awal balasan.
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
    "minimaxai/minimax-m3",
    "nvidia/nemotron-3-ultra-550b-a55b",
    "nvidia/nemotron-3-nano-30b-a3b",
    "meta/llama-3.2-11b-vision-instruct"
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
      let responseText = data.choices?.[0]?.message?.content;
      
      if (responseText && responseText.trim()) {
        // Strip out internal reasoning/thinking tags if model provides them
        responseText = responseText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
        if (responseText) {
          return responseText;
        }
      }
    } catch (error: any) {
      lastError = error;
      logger.warn(`askNvidia: Gagal menggunakan model ${modelName}, mencoba model fallback berikutnya. Error: ${error.message || error}`);
    }
  }

  logger.error(`Error saat memanggil seluruh kandidat NVIDIA API:`, lastError);
  return `Maaf, terjadi kesalahan saat menghubungi AI: ${lastError?.message || lastError}`;
}
