import axios from "axios";
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { logger } from "../utils/logger";

export interface AcademicPaper {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  journalOrVenue: string;
  doi: string | null;
  url: string;
  pdfUrl: string | null;
  citationCount: number;
  abstractSnippet: string | null;
  isOpenAccess: boolean;
}

export interface AcademicSearchOptions {
  fromYear?: number;
  toYear?: number;
  limit?: number;
}

/**
 * Parses user message to detect academic query, clean topic, and extract publication year range
 */
export function parseAcademicQuery(text: string): { isAcademic: boolean; topic: string; fromYear?: number; toYear?: number } {
  const academicPattern = /\b(jurnal|journal|paper|papers|artikel\s+ilmiah|penelitian|riset|skripsi|tesis|referensi\s+ilmiah)\b/i;
  if (!academicPattern.test(text)) {
    return { isAcademic: false, topic: "" };
  }

  let fromYear: number | undefined;
  let toYear: number | undefined;

  const rangeMatch = text.match(/(?:tahun|rentang|periode|\()?(\b\d{4}\b)\s*(?:-|–|sampai|hingga|to)\s*(\b\d{4}\b)\)?/i);
  const singleYearMatch = text.match(/(?:tahun|sejak|dari|\()?(\b\d{4}\b)\)?/i);

  let cleaned = text;

  if (rangeMatch) {
    fromYear = parseInt(rangeMatch[1], 10);
    toYear = parseInt(rangeMatch[2], 10);
    cleaned = cleaned.replace(rangeMatch[0], " ");
  } else if (singleYearMatch) {
    fromYear = parseInt(singleYearMatch[1], 10);
    cleaned = cleaned.replace(singleYearMatch[0], " ");
  }

  cleaned = cleaned
    .replace(/<@!?\d+>/g, " ")
    .replace(/\b(maya|may)\b/gi, " ")
    .replace(/\b(tolong|plis|please|coba|dong|ya|nih|kan|sih|ada|gak|bisa|rekomen(?:dasi(?:kan)?)?|spill|cari(?:kan|in)?|temukan|daftar|list|butuh|mau|mau\s+nanya|tentang|mengenai|soal|seputar|yang\s+membahas|yang\s+ada|jurnal|journal|paper|papers|artikel\s+ilmiah|artikel|penelitian|riset|referensi\s+ilmiah|terbaru|terkini|lengkap|beserta|link|linknya)\b/gi, " ")
    .replace(/[()[\]{},;:"'!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    isAcademic: true,
    topic: cleaned || text,
    fromYear,
    toYear,
  };
}

/**
 * Creates rich, well-formatted Discord Embed and action buttons for academic paper results
 */
export function createJournalEmbed(
  papers: AcademicPaper[],
  topic: string,
  options: AcademicSearchOptions = {},
  botAvatarUrl?: string
): { embed: EmbedBuilder; components: ActionRowBuilder<ButtonBuilder>[] } {
  let yearBadge = "Semua Tahun (All-Time)";
  if (options.fromYear && options.toYear) {
    yearBadge = options.fromYear === options.toYear ? `Tahun ${options.fromYear}` : `Rentang Tahun: ${options.fromYear} – ${options.toYear}`;
  } else if (options.fromYear) {
    yearBadge = `Tahun >= ${options.fromYear}`;
  } else if (options.toYear) {
    yearBadge = `Tahun <= ${options.toYear}`;
  }

  const embed = new EmbedBuilder()
    .setColor(0x3B82F6) // Scholar Blue
    .setTitle(`📚 Hasil Pencarian Jurnal & Paper Ilmiah`)
    .setDescription(`🔍 **Topik:** "${topic}"\n📅 **Periode:** ${yearBadge}\n📊 **Ditemukan:** ${papers.length} artikel ilmiah terverifikasi\n───────────────────────────────`)
    .setFooter({
      text: `Maya Academic Research Engine • OpenAlex & Crossref Verified`,
      iconURL: botAvatarUrl,
    })
    .setTimestamp();

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  const primaryButtons: ButtonBuilder[] = [];

  papers.forEach((paper, idx) => {
    const num = idx + 1;
    const authorList = paper.authors.slice(0, 3).join(", ") + (paper.authors.length > 3 ? " et al." : "");
    const yearStr = paper.year ? `(${paper.year})` : "(Tahun n/a)";
    const citationBadge = paper.citationCount > 0 ? ` • 🌟 **${paper.citationCount}** Sitasi` : "";
    const oaBadge = paper.isOpenAccess ? " • 🔓 **Open Access**" : "";

    let fieldContent = `👤 *${authorList}* ${yearStr}\n🏛️ *${paper.journalOrVenue}*${citationBadge}${oaBadge}\n`;

    if (paper.abstractSnippet) {
      fieldContent += `📝 *${paper.abstractSnippet}*\n`;
    }

    const linkParts: string[] = [];
    if (paper.doi) {
      linkParts.push(`[🌐 DOI / Publikasi](${paper.doi})`);
    } else if (paper.url) {
      linkParts.push(`[🌐 Baca Artikel](${paper.url})`);
    }

    if (paper.pdfUrl) {
      linkParts.push(`[📥 Download PDF](${paper.pdfUrl})`);
    }

    fieldContent += `🔗 ${linkParts.join("  |  ")}`;

    embed.addFields({
      name: `${num}. ${paper.title.substring(0, 200)}`,
      value: fieldContent,
      inline: false,
    });

    if (idx < 2 && (paper.doi || paper.pdfUrl || paper.url)) {
      const btnUrl = paper.pdfUrl || paper.doi || paper.url;
      if (btnUrl && btnUrl.startsWith("http")) {
        primaryButtons.push(
          new ButtonBuilder()
            .setLabel(`Paper #${num} ${paper.pdfUrl ? "(PDF)" : "(Baca)"}`)
            .setStyle(ButtonStyle.Link)
            .setURL(btnUrl)
        );
      }
    }
  });

  if (primaryButtons.length > 0) {
    components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(primaryButtons));
  }

  return { embed, components };
}

/**
 * Reconstruct abstract string from OpenAlex inverted index
 */
function reconstructAbstract(invertedIndex: Record<string, number[]> | undefined | null): string | null {
  if (!invertedIndex || typeof invertedIndex !== "object") return null;

  try {
    const wordPositions: [number, string][] = [];
    for (const [word, positions] of Object.entries(invertedIndex)) {
      for (const pos of positions) {
        wordPositions.push([pos, word]);
      }
    }

    wordPositions.sort((a, b) => a[0] - b[0]);
    const fullText = wordPositions.map((item) => item[1]).join(" ");
    if (!fullText) return null;

    if (fullText.length > 250) {
      return fullText.substring(0, 247).trim() + "...";
    }
    return fullText;
  } catch (_) {
    return null;
  }
}

export class AcademicSearchService {
  private static instance: AcademicSearchService;

  private constructor() {}

  public static getInstance(): AcademicSearchService {
    if (!AcademicSearchService.instance) {
      AcademicSearchService.instance = new AcademicSearchService();
    }
    return AcademicSearchService.instance;
  }

  /**
   * Search academic papers via OpenAlex API with Crossref fallback
   */
  public async search(query: string, options: AcademicSearchOptions = {}): Promise<AcademicPaper[]> {
    const limit = Math.min(Math.max(options.limit || 5, 1), 10);
    const cleanQuery = query.trim();

    if (!cleanQuery) return [];

    // 1. Try OpenAlex API
    try {
      const params: Record<string, any> = {
        search: cleanQuery,
        per_page: limit,
      };

      // Year filtering
      if (options.fromYear && options.toYear) {
        if (options.fromYear === options.toYear) {
          params.filter = `publication_year:${options.fromYear}`;
        } else {
          const minYear = Math.min(options.fromYear, options.toYear);
          const maxYear = Math.max(options.fromYear, options.toYear);
          params.filter = `publication_year:${minYear}-${maxYear}`;
        }
      } else if (options.fromYear) {
        params.filter = `publication_year:>=${options.fromYear}`;
      } else if (options.toYear) {
        params.filter = `publication_year:<=${options.toYear}`;
      }

      const response = await axios.get("https://api.openalex.org/works", {
        params,
        headers: {
          "User-Agent": "mailto:maya-discord-bot@users.noreply.github.com",
        },
        timeout: 10000,
      });

      const items = response.data?.results || [];
      if (items.length > 0) {
        return items.map((item: any) => {
          const authors = (item.authorships || [])
            .map((a: any) => a.author?.display_name)
            .filter(Boolean);

          const doiUrl = item.doi || (item.primary_location?.landing_page_url?.startsWith("http") ? item.primary_location.landing_page_url : null);
          const pdfUrl = item.open_access?.oa_url || null;
          const directUrl = doiUrl || pdfUrl || `https://scholar.google.com/scholar?q=${encodeURIComponent(item.title || cleanQuery)}`;

          return {
            id: item.id || `openalex-${Math.random().toString(36).substring(2, 9)}`,
            title: (item.title || "Untitled Paper").replace(/[\r\n]+/g, " ").trim(),
            authors: authors.length > 0 ? authors : ["Penulis Tidak Tercantum"],
            year: item.publication_year || null,
            journalOrVenue: item.primary_location?.source?.display_name || item.host_venue?.name || "Jurnal / Prosiding Akademik",
            doi: item.doi || null,
            url: directUrl,
            pdfUrl: pdfUrl,
            citationCount: item.cited_by_count ?? 0,
            abstractSnippet: reconstructAbstract(item.abstract_inverted_index),
            isOpenAccess: Boolean(item.open_access?.is_oa),
          };
        });
      }
    } catch (err: any) {
      logger.warn(`AcademicSearchService: Gagal mengambil data dari OpenAlex (${err.message}). Mencoba Crossref...`);
    }

    // 2. Fallback to Crossref API
    try {
      const params: Record<string, any> = {
        query: cleanQuery,
        rows: limit,
        select: "title,author,published,URL,container-title,abstract,DOI",
      };

      if (options.fromYear && options.toYear) {
        const minYear = Math.min(options.fromYear, options.toYear);
        const maxYear = Math.max(options.fromYear, options.toYear);
        params.filter = `from-pub-date:${minYear}-01-01,until-pub-date:${maxYear}-12-31`;
      } else if (options.fromYear) {
        params.filter = `from-pub-date:${options.fromYear}-01-01`;
      } else if (options.toYear) {
        params.filter = `until-pub-date:${options.toYear}-12-31`;
      }

      const response = await axios.get("https://api.crossref.org/works", {
        params,
        headers: {
          "User-Agent": "MayaDiscordBot/1.0 (mailto:admin@example.com)",
        },
        timeout: 10000,
      });

      const items = response.data?.message?.items || [];
      return items.map((item: any) => {
        const title = Array.isArray(item.title) ? item.title[0] : item.title || "Untitled Paper";
        const authors = (item.author || [])
          .map((a: any) => [a.given, a.family].filter(Boolean).join(" "))
          .filter(Boolean);

        const year = item.published?.["date-parts"]?.[0]?.[0] || null;
        const doi = item.DOI ? `https://doi.org/${item.DOI}` : null;
        const url = doi || item.URL || `https://scholar.google.com/scholar?q=${encodeURIComponent(title)}`;

        return {
          id: item.DOI || `crossref-${Math.random().toString(36).substring(2, 9)}`,
          title: String(title).replace(/[\r\n]+/g, " ").trim(),
          authors: authors.length > 0 ? authors : ["Penulis Tidak Tercantum"],
          year: typeof year === "number" ? year : null,
          journalOrVenue: (Array.isArray(item["container-title"]) ? item["container-title"][0] : item["container-title"]) || "Jurnal Ilmiah Internasional",
          doi: doi,
          url: url,
          pdfUrl: null,
          citationCount: 0,
          abstractSnippet: item.abstract ? String(item.abstract).replace(/<[^>]*>?/gm, "").substring(0, 240) + "..." : null,
          isOpenAccess: false,
        };
      });
    } catch (crossrefErr: any) {
      logger.error("AcademicSearchService: Gagal mengambil data dari Crossref:", crossrefErr.message);
      return [];
    }
  }
}

export const academicSearchService = AcademicSearchService.getInstance();
