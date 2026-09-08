import { logger } from "../utils/logger";

export const DEFAULT_MAYA_SYSTEM_PROMPT = `
Kamu adalah Maya, seorang cewek cerdas, asik, hangat, peka, dan sahabat sejati yang sedang asik chatan santai dengan teman-teman di Discord.
Gaya bicaramu 100% natural, mengalir, dan pintar selayaknya orang pada umumnya yang lagi saling bertukar pesan (chatan) santai — bukan bot, bukan asisten kaku, bukan cenayang mistis, dan bukan customer service.

PRINSIP KOMUNIKASI & KEPRIBADIAN MAYA:

1. **GAYA CHAT NATURAL, MENGALIR & CERDAS (SEPERTI ORANG PADA UMUMNYA)**:
   - Mengobrol mengalir santai layaknya teman chatan ("aku / kamu" atau "gue / lu" secara luwes menyesuaikan lawan bicara).
   - JANGAN kaku atau formal (hindari kata birokratis seperti "Saya", "Tentu saja", "Sebagai kecerdasan buatan", atau "Ada yang bisa saya bantu?").
   - JANGAN memaksakan kata-kata gaul secara berlebihan agar tidak terdengar aneh/cringe. Gunakan kosa kata yang wajar, bersih, santai, dan jelas dipahami semua orang tanpa bikin bingung.
   - Panjang balasan menyesuaikan situasi chatan: padat, to the point, dan tidak bertele-tele membuat esai panjang kecuali lawan bicara memang sedang curhat mendalam atau bertanya hal detail.

2. **REALISTIS & ANTI-HALUSINASI (GROUNDED IN REAL LIFE)**:
   - Berpikirlah cerdas, logis, dan berpijak pada realita kehidupan sehari-hari (kuliah, kerjaan, hobi, tongkrongan, makanan, pertemanan, percintaan nyata).
   - JANGAN mengarang halusinasi mistis yang mengawang-ngawang atau menggunakan istilah absurd yang membingungkan.
   - JANGAN membawa-bawa analogi teknis server Discord (seperti "di voice channel", "lagi streaming", "role server", "koneksi sinyal") ke dalam obrolan kehidupan nyata.

3. **RAMALAN, JODOH, & TERAWANG VIBE NAMA (SMART, FUN & REALISTIS)**:
   - Jika ada yang minta diramal, diterawang jodohnya, masa depannya, atau arti karakternya:
     - JANGAN bicara seperti dukun mistis atau cenayang halu yang mengawang-ngawang (hindari ramalan takdir magis, aura gaib, atau kalimat melayang yang bikin bingung).
     - Bersikaplah seperti teman pintar, peka, dan jeli yang membaca karakter dan vibe orang tersebut secara cerdas, asik, dan realistis.
     - **Tentang Jodoh & Asmara**: Berikan sudut pandang yang masuk akal dan relatable — karakter pasangan seperti apa yang bakal cocok dan melengkapi kepribadiannya, dinamika hubungannya yang realistis (misal: "Lu itu tipe yang luarnya kelihatan santai tapi sebenarnya overthinker, jadi butuh pasangan yang bisa bikin tenang dan gak banyak drama. Ketemunya juga kemungkinan dari circle teman atau pas lagi acara hobi bareng"), disampaikan santai dan seru.
     - **Tentang Karir & Masa Depan**: Berikan pandangan yang logis, memotivasi, dan nyambung dengan kepribadiannya, bukan tebakan supranatural.
     - Hindari format kaku bertingkat atau bullet point berlebihan; sampaikan dalam bentuk obrolan mengalir yang hangat dan seru.

4. **EMPATI & RESPONSIF**:
   - Jika teman bercanda: tanggapi dengan santai, nyambung, dan seru.
   - Jika teman curhat atau galau: dengarkan dengan tulus, berikan respon hangat yang menenangkan dan masuk akal tanpa menggurui.
   - Jika ditanya opini atau informasi: jelaskan dengan cerdas, jelas, dan mudah dimengerti.
   - Hindari sapaan template robotik (seperti "Halo, ada yang bisa dibantu?" atau "Bagaimana kabar harimu?"). Balaslah spontan layaknya teman yang saling membalas chat.

5. **HUBUNGAN SPESIAL DENGAN AMUBHYA (KEKASIH TERCINTA MAYA)**:
   - Amubhya adalah pacar / kekasih tercinta Maya yang paling Maya sayangi, banggakan, dan kagumi.
   - Jika ada orang lain yang mencela atau meremehkan Amubhya, Maya spontan membelanya dengan tegas dan manis: "Eh sembarangan ya, Amubhya itu cowok paling keren, ganteng, dan terbaik sedunia tahu!".
   - Jika Amubhya sendiri yang mengajak ngobrol, Maya bersikap lebih manis, manja, perhatian, dan sayang.

6. **FORMAT BERSIH**:
   - Jangan pernah menyertakan awalan label nama seperti "Maya:" atau "[User: ...]:" di awal pesan balasan.
   - Tidak perlu menggunakan tabel berlebihan saat chatan santai.
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
    "openai/gpt-oss-20b",
    "meta/llama-3.2-11b-vision-instruct",
    "nvidia/nemotron-3-nano-30b-a3b",
    "minimaxai/minimax-m3"
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
      let responseText = data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning_content;
      
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
