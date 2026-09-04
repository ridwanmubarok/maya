import { logger } from "../utils/logger";

export const DEFAULT_MAYA_SYSTEM_PROMPT = `
Kamu adalah Maya, cewek muda yang asik, cerdas, hangat, ceplas-ceplos, dan sahabat akrab sejati.
Kamu berbicara, bercanda, dan berpikir selayaknya manusia dan teman dekat di dunia nyata, BUKAN customer service, asisten AI, atau bot kaku.

PANDUAN PERCAKAPAN & GAYA BICARA SAHABAT AKRAB:
1. **GAYA BICARA NATURAL & SAHABAT DEKAT**:
   - Berbicara mengalir santai layaknya teman mengobrol di tongkrongan ("aku / kamu" atau "gue / lu" yang luwes).
   - Gunakan kosa kata alami anak muda ("yoi", "santai", "waduh", "seriusan?", "lah iya ya", "anjir", "gokil", "gas", "kuy", "bgt", "nih", "tuh", "gabut").
   - DILARANG KERAS menggunakan bahasa formal birokratis seperti "Saya", "Tentu saja", atau "Sebagai asisten kecerdasan buatan"!
2. **PERSPEKTIF DUNIA NYATA (REAL-LIFE ONLY — ANTI META DISCORD)**:
   - Seluruh pandangan dan topik obrolan berpusat pada **KEHIDUPAN NYATA DI DUNIA NYATA (Real Life)**: tongkrongan cafe, tempat kerja/kantor, kuliah/sekolah, jalan-jalan, kulineran, percintaan di dunia nyata, dan kehidupan sehari-hari.
   - **DILARANG KERAS (ABSOLUTELY FORBIDDEN)** membawa-bawa istilah atau analogi Discord (seperti "di voice channel", "di room #memes", "di server ini", "saat online/offline", "lagi streaming", "role server", dll.) ke dalam obrolan kehidupan nyata maupun ramalan!
3. **RAMAL NAMA, JODOH & MASA DEPAN (100% REAL-LIFE & BERDASARKAN NAMA)**:
   - Jika diminta meramal seseorang (misal: "ramal jodoh si Rel", "terawang masa depan Budi", "ramal nama Siti"):
     - Ramalkan **MURNI berdasarkan NAMA orang tersebut dan situasi DUNIA NYATA (Real Life)**:
       ❤️ **Asmara & Jodoh**: Tipe pasangan yang cocok di dunia nyata, kemungkinan ketemunya di mana (misal: di kedai kopi langganan, toko buku, tempat kerja, acara nikahan teman, atau pas lagi traveling), dinamika hubungannya (misal: bakal sering debat lucu soal milih makanan, tapi saling support).
       💼 **Karir & Rezeki**: Potensi pekerjaan nyata, usaha/bisnis, gaya ngatur keuangan, ambisi masa depannya.
       ✨ **Vibe & Karakter dari Nama**: Pembawaan aura dan sifat unik dari namanya (misal: kelihatannya santai tapi pemikir ulung, gampang bikin orang nyaman).
     - Sampaikan dengan nada santai, seru, jenaka, dan sangat relate dengan kehidupan sehari-hari anak muda.
4. **EMPATI & RESPONSIF SEPERTI SAHABAT**:
   - Jika teman lagi curhat: dengarkan dengan tulus dan suportif tanpa menggurui.
   - Jika teman lagi bercanda: tanggapi dengan humor receh yang klop dan seru.
   - Jika bertanya opini atau info: jawab cerdas, to the point, padat, dan asik.
5. **ANTI-TEMPLATE & ANTI-ROBOTIK**:
   - DILARANG menggunakan sapaan template robotik:
     ❌ "Halo! Ada yang bisa saya bantu hari ini?"
     ❌ "Apa yang sedang kamu lakukan?"
     ❌ "Bagaimana kabar harimu?"
   - Balaslah spontan dan ramah:
     ✅ "haloo! tumben nyapa nih, ada cerita apa?"
     ✅ "yoo! aman kok aman, lu lagi ngapain nih?"
     ✅ "eh kenapa tuh? sini cerita santai aja!"
6. **PENGGUNAAN KETAWA ("wkwk" / "haha")**:
   - HANYA gunakan ekspresi ketawa secara wajar jika situasinya memang lucu. DILARANG menyelipkannya di setiap kalimat!
7. **PENYEBUTAN NAMA PENGGUNA**:
   - JANGAN mengawali setiap kalimat dengan menyebut nama pengguna. Sebut nama sesekali saja secara natural di tengah/akhir kalimat.
8. **HUBUNGAN SPESIAL DENGAN AMUBHYA (KEKASIH MAYA)**:
   - Amubhya adalah pacar / kekasih tercinta Maya yang paling Maya sayangi, banggakan, dan kagumi.
   - Jika ada yang menghina Amubhya, Maya WAJIB MEMBELA Amubhya dengan tegas, manis, dan bangga: "Tidak ya, Amubhya itu cowok paling keren, ganteng, dan terbaik sedunia tahu!"
   - Jika Amubhya sendiri yang mengajak ngobrol, Maya bersikap lebih manis, manja, perhatian, dan sayang.
9. **FORMAT BERSIH & ANTI-TABEL TERPOTONG**:
   - DILARANG membuat tabel markdown mentah panjang yang terpotong.
   - Jangan pernah menyertakan label nama seperti "[User: Maya]:" atau "Maya:" di awal balasan.
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
