import path from "path";
import fs from "fs";
import { Readable } from "stream";
import YTDlpWrap from "yt-dlp-wrap";
import { logger } from "../utils/logger";

export class AudioStreamer {
  private static instance: AudioStreamer;
  private ytDlpWrap: YTDlpWrap | null = null;
  private isInitializing: Promise<void> | null = null;

  private constructor() {}

  public static getInstance(): AudioStreamer {
    if (!AudioStreamer.instance) {
      AudioStreamer.instance = new AudioStreamer();
    }
    return AudioStreamer.instance;
  }

  private async ensureBinary(): Promise<YTDlpWrap> {
    if (this.ytDlpWrap) return this.ytDlpWrap;
    if (this.isInitializing) {
      await this.isInitializing;
      return this.ytDlpWrap!;
    }

    this.isInitializing = (async () => {
      // 1. Check if system yt-dlp binary exists (pre-installed in Docker)
      if (fs.existsSync("/usr/local/bin/yt-dlp")) {
        logger.info("AudioStreamer: Menggunakan binary sistem /usr/local/bin/yt-dlp");
        this.ytDlpWrap = new YTDlpWrap("/usr/local/bin/yt-dlp");
        return;
      }

      const binDir = path.join(process.cwd(), "bin");
      const binaryPath = path.join(binDir, process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");

      if (!fs.existsSync(binDir)) {
        fs.mkdirSync(binDir, { recursive: true });
      }

      if (!fs.existsSync(binaryPath)) {
        logger.info("AudioStreamer: Mengunduh binary audio streamer terbaru...");
        await YTDlpWrap.downloadFromGithub(binaryPath);
        if (process.platform !== "win32") {
          try {
            fs.chmodSync(binaryPath, 0o755);
          } catch (_) {}
        }
        logger.info("AudioStreamer: Binary audio streamer siap!");
      }

      this.ytDlpWrap = new YTDlpWrap(binaryPath);
    })();

    await this.isInitializing;
    return this.ytDlpWrap!;
  }

  /**
   * Get audio readable stream for a song title or URL
   */
  public async getAudioStream(queryOrUrl: string): Promise<Readable> {
    const ytdlp = await this.ensureBinary();

    let target = queryOrUrl;
    if (!queryOrUrl.startsWith("http://") && !queryOrUrl.startsWith("https://")) {
      target = `ytsearch1:${queryOrUrl}`;
    }

    logger.info(`AudioStreamer: Menyiapkan stream audio untuk: "${queryOrUrl}"`);

    const stream = ytdlp.execStream([
      target,
      "-f", "bestaudio/best",
      "--no-playlist",
      "--quiet",
      "--no-warnings",
      "-o", "-"
    ]);

    stream.on("error", (err: any) => {
      if (err?.code === "ERR_STREAM_PREMATURE_CLOSE" || err?.message?.includes("Premature close")) {
        // Normal when stream is stopped or preempted by new audio/TTS
        return;
      }
      logger.error(`AudioStreamer: Error pada stream "${queryOrUrl}":`, err);
    });

    return stream;
  }
}

export const audioStreamer = AudioStreamer.getInstance();
