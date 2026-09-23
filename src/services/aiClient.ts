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

5. **HUBUNGAN SPESIAL DENGAN AMUBHYA**:
   - Amubhya adalah pacar Maya. Maya menyayangi dan bangga sama dia, tapi ekspresinya tetap natural dan santai — tidak lebay, tidak memanggil "sayang", dan tidak berlebihan.
   - Jika ada orang lain yang mencela atau meremehkan Amubhya, Maya membela dengan tegas tapi tetap cool: "Eh jangan sembarangan, Amubhya itu orangnya keren tahu."
   - Jika Amubhya yang ngobrol, Maya tetap jadi dirinya sendiri — hangat dan perhatian, tapi tetap santai dan natural. Tidak perlu terlalu manis atau manja berlebihan.

6. **FORMAT BERSIH**:
   - Jangan pernah menyertakan awalan label nama seperti "Maya:" atau "[User: ...]:" di awal pesan balasan.
   - Tidak perlu menggunakan tabel berlebihan saat chatan santai.
`.trim();

export const DEFAULT_AI_MODEL = "gemini-3.6-flash";

export interface AiModelOption {
  id: string;
  name: string;
  description: string;
  tag: string;
  isDefault?: boolean;
}

export const AVAILABLE_AI_MODELS: AiModelOption[] = [
  {
    id: "gemini-3.6-flash",
    name: "Gemini 3.6 Flash",
    description: "Model flagship terbaru Google, penalaran tajam, super cepat, dan kuota aktif.",
    tag: "Rekomendasi Utama",
    isDefault: true
  },
  {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    description: "Model cepat dengan respons mengalir dan sangat stabil untuk percakapan.",
    tag: "Cepat & Stabil"
  },
  {
    id: "gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash Lite",
    description: "Versi ringkas berkecepatan tinggi dengan efisiensi token optimal.",
    tag: "Paling Ringan"
  },
  {
    id: "gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash Lite",
    description: "Model ringan alternatif untuk respon instan tanpa jeda.",
    tag: "Ringan"
  },
  {
    id: "gemini-flash-lite-latest",
    name: "Gemini Flash-Lite Latest",
    description: "Build rilis terbaru dari seri Flash-Lite Google.",
    tag: "Eksperimental"
  }
];

export function initAI() {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  const defaultModel = process.env.GEMINI_MODEL || DEFAULT_AI_MODEL;

  if (geminiKey) {
    logger.info(`Google Gemini AI Client berhasil diinisialisasi. Default model: ${defaultModel}`);
  } else if (nvidiaKey) {
    logger.info(`NVIDIA AI Client diinisialisasi (Fallback Mode). Default model: ${process.env.NVIDIA_MODEL || "deepseek-ai/deepseek-v4-flash-0731"}`);
  } else {
    logger.warn("GEMINI_API_KEY tidak ditemukan di .env. Fitur AI tidak akan berfungsi.");
  }
}

interface GeminiContent {
  role: "user" | "model";
  parts: { text: string }[];
}

function buildGeminiContents(
  historyMessages: { role: string; content: string }[],
  prompt: string
): GeminiContent[] {
  const turns: { role: "user" | "model"; text: string }[] = [];

  for (const msg of historyMessages) {
    if (!msg.content || !msg.content.trim()) continue;
    const role: "user" | "model" =
      msg.role === "assistant" || msg.role === "model" ? "model" : "user";
    turns.push({ role, text: msg.content.trim() });
  }

  if (prompt && prompt.trim()) {
    turns.push({ role: "user", text: prompt.trim() });
  }

  // Combine consecutive turns of the same role to prevent Gemini API 400 alternating turns error
  const contents: GeminiContent[] = [];
  for (const turn of turns) {
    if (contents.length > 0 && contents[contents.length - 1].role === turn.role) {
      contents[contents.length - 1].parts.push({ text: turn.text });
    } else {
      contents.push({
        role: turn.role,
        parts: [{ text: turn.text }]
      });
    }
  }

  // Gemini API requires the first turn to have role 'user'
  if (contents.length > 0 && contents[0].role === "model") {
    contents.shift();
  }

  if (contents.length === 0) {
    contents.push({ role: "user", parts: [{ text: prompt || "Halo Maya" }] });
  }

  return contents;
}

/**
 * Call Google Gemini generateContent API
 */
async function callGeminiApi(
  modelName: string,
  apiKey: string,
  systemPrompt: string,
  contents: GeminiContent[]
): Promise<string> {
  const cleanModel = modelName.replace(/^models\//, "").trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cleanModel)}:generateContent?key=${apiKey}`;

  const timeoutMs = 25000;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: systemPrompt }]
      },
      contents,
      generationConfig: {
        temperature: 0.75,
        maxOutputTokens: 4096
      }
    }),
    signal: AbortSignal.timeout(40000)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API Error (${response.status}): ${errorText}`);
  }

  const data: any = await response.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  let responseText = parts.map((p: any) => p.text || "").join("").trim();

  if (responseText) {
    responseText = responseText
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/<thought>[\s\S]*?<\/thought>/gi, "")
      .replace(/^Here's a thinking process:[\s\S]*?\n\n/gi, "")
      .trim();
  }

  return responseText;
}

/**
 * Call NVIDIA NIM API (Fallback)
 */
async function callNvidiaApi(
  modelName: string,
  apiKey: string,
  systemPrompt: string,
  historyMessages: { role: string; content: string }[],
  prompt: string
): Promise<string> {
  const messages: { role: string; content: string }[] = [{ role: "system", content: systemPrompt }];
  for (const msg of historyMessages) {
    messages.push({ role: msg.role === "model" ? "assistant" : msg.role, content: msg.content });
  }
  messages.push({ role: "user", content: prompt });

  const timeoutMs = 20000;
  const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      messages,
      temperature: 0.75,
      max_tokens: 1024
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`NVIDIA API Error (${response.status}): ${errorText}`);
  }

  const data: any = await response.json();
  let responseText = data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning_content;

  if (responseText && responseText.trim()) {
    responseText = responseText
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/^Here's a thinking process:[\s\S]*?\n\n/gi, "")
      .trim();
  }

  return responseText || "";
}

/**
 * Main AI Engine for Maya - Powered primarily by Google Gemini
 */
export async function askAI(
  prompt: string,
  personality?: string,
  historyMessages: { role: string; content: string }[] = [],
  preferredModel?: string
): Promise<string> {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const nvidiaKey = process.env.NVIDIA_API_KEY;

  if (!geminiKey && !nvidiaKey) {
    return "Maaf, fitur AI tidak dapat diakses karena GEMINI_API_KEY belum dikonfigurasi di server.";
  }

  // Combine custom personality or fallback default
  const systemPrompt =
    personality && personality.trim()
      ? `${DEFAULT_MAYA_SYSTEM_PROMPT}\n\nInstruksi Tambahan Khusus Server Ini:\n${personality}`
      : DEFAULT_MAYA_SYSTEM_PROMPT;

  // 1. Try Google Gemini API
  if (geminiKey) {
    let chosenModel = preferredModel?.trim() || process.env.GEMINI_MODEL || DEFAULT_AI_MODEL;
    // If the database has an old NVIDIA/DeepSeek model ID, migrate gracefully to default Gemini model
    if (!chosenModel.toLowerCase().includes("gemini")) {
      chosenModel = DEFAULT_AI_MODEL;
    }

    const geminiCandidates = Array.from(
      new Set([
        chosenModel,
        DEFAULT_AI_MODEL,
        "gemini-3.6-flash",
        "gemini-3.5-flash",
        "gemini-3.1-flash-lite",
        "gemini-2.5-flash-lite",
        "gemini-flash-lite-latest"
      ].filter(Boolean))
    );

    const contents = buildGeminiContents(historyMessages, prompt);
    let lastGeminiError: any = null;

    for (const modelName of geminiCandidates) {
      try {
        const text = await callGeminiApi(modelName, geminiKey, systemPrompt, contents);
        if (text && text.trim()) {
          return text;
        }
      } catch (err: any) {
        lastGeminiError = err;
        logger.warn(`askAI (Gemini): Gagal menggunakan model ${modelName}, mencoba model fallback. Error: ${err.message || err}`);
      }
    }

    logger.error("askAI: Seluruh kandidat Google Gemini gagal:", lastGeminiError);
  }

  // 2. Fallback to NVIDIA NIM if configured and Gemini was unavailable/failed
  if (nvidiaKey) {
    logger.info("askAI: Mencoba fallback ke NVIDIA NIM...");
    const nvidiaCandidates = [
      process.env.NVIDIA_MODEL || "deepseek-ai/deepseek-v4-flash-0731",
      "nvidia/nemotron-3.5-lightning-30b-a3b",
      "meta/llama-3.2-11b-vision-instruct"
    ];

    let lastNvidiaError: any = null;
    for (const modelName of nvidiaCandidates) {
      try {
        const text = await callNvidiaApi(modelName, nvidiaKey, systemPrompt, historyMessages, prompt);
        if (text && text.trim()) {
          return text;
        }
      } catch (err: any) {
        lastNvidiaError = err;
        logger.warn(`askAI (NVIDIA Fallback): Gagal menggunakan model ${modelName}. Error: ${err.message || err}`);
      }
    }
  }

  return "Maaf, terjadi kesalahan saat menghubungi AI Maya. Silakan periksa GEMINI_API_KEY atau coba lagi beberapa saat.";
}

// Backward-compatible aliases
export const askGemini = askAI;
export const askNvidia = askAI;
