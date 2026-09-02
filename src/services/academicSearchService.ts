import axios from "axios";
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
