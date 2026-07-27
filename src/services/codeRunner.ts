import axios from "axios";
import { logger } from "../utils/logger";

export interface CodeExecutionResult {
  language: string;
  version: string;
  stdout: string;
  stderr: string;
  output: string;
  exitCode: number;
  executionTimeMs: number;
}

const LANGUAGE_ALIASES: Record<string, string> = {
  js: "javascript",
  javascript: "javascript",
  py: "python",
  python: "python",
  cpp: "cpp",
  "c++": "cpp",
  ts: "typescript",
  typescript: "typescript",
  go: "go",
  golang: "go",
  java: "java",
  rs: "rust",
  rust: "rust",
  php: "php",
  cs: "csharp",
  csharp: "csharp",
};

/**
 * Execute source code in an isolated sandbox via Piston API
 */
export async function executeCode(languageInput: string, code: string): Promise<CodeExecutionResult> {
  const normalizedLang = languageInput.trim().toLowerCase();
  const targetLanguage = LANGUAGE_ALIASES[normalizedLang] || normalizedLang;

  logger.info(`CodeRunner: Memulai eksekusi kode (${targetLanguage})`);

  const startTime = Date.now();

  try {
    const payload = {
      language: targetLanguage,
      version: "*",
      files: [
        {
          name: `main.${getFileExtension(targetLanguage)}`,
          content: code,
        },
      ],
    };

    const response = await axios.post("https://emkc.org/api/v2/piston/execute", payload, {
      timeout: 10000, // 10 seconds timeout
      headers: {
        "Content-Type": "application/json",
      },
    });

    const endTime = Date.now();
    const data = response.data;

    const runResult = data.run || {};
    const stdout = (runResult.stdout || "").trim();
    const stderr = (runResult.stderr || "").trim();
    const output = (runResult.output || stdout || stderr || "Kode selesai dieksekusi tanpa output.").trim();
    const exitCode = typeof runResult.code === "number" ? runResult.code : 0;

    return {
      language: data.language || targetLanguage,
      version: data.version || "Terbaru",
      stdout,
      stderr,
      output,
      exitCode,
      executionTimeMs: endTime - startTime,
    };
  } catch (error: any) {
    const endTime = Date.now();
    logger.error("CodeRunner: Error executing code via Piston API:", error);

    let errorMsg = "Terjadi kesalahan koneksi saat mengeksekusi kode.";
    if (error.response && error.response.data && error.response.data.message) {
      errorMsg = error.response.data.message;
    } else if (error.code === "ECONNABORTED") {
      errorMsg = "Waktu eksekusi kode melebihi batas (Timeout 10 detik).";
    }

    return {
      language: targetLanguage,
      version: "Unknown",
      stdout: "",
      stderr: errorMsg,
      output: errorMsg,
      exitCode: 1,
      executionTimeMs: endTime - startTime,
    };
  }
}

function getFileExtension(lang: string): string {
  switch (lang) {
    case "javascript":
      return "js";
    case "typescript":
      return "ts";
    case "python":
      return "py";
    case "cpp":
      return "cpp";
    case "go":
      return "go";
    case "java":
      return "java";
    case "rust":
      return "rs";
    case "php":
      return "php";
    case "csharp":
      return "cs";
    default:
      return "txt";
  }
}
