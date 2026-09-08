import axios from "axios";
import * as cheerio from "cheerio";
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { logger } from "../utils/logger";

export interface ScholarshipItem {
  id: string;
  title: string;
  organizer: string;
  level: string; // S1, S2, S3, D3, Bootcamp, etc.
  scope: "Luar Negeri" | "Nasional";
  country?: string;
  coverage: string;
  deadline: string;
  url: string;
  source: string;
}

export interface CourseItem {
  id: string;
  title: string;
  provider: string;
  topic: string;
  certificate: string;
  duration: string;
  url: string;
  source: string;
}

export interface ScholarshipFilter {
  scope?: "luar-negeri" | "nasional" | "semua";
  level?: string; // s1, s2, s3, d3, sma, bootcamp, semua
  keyword?: string;
}

// Katalog Lengkap Program Beasiswa Terverifikasi (Nasional & Luar Negeri)
const OFFICIAL_SCHOLARSHIPS: ScholarshipItem[] = [
  // --- LUAR NEGERI ---
  {
    id: "sch-lpdp-ln",
    title: "Beasiswa LPDP Luar Negeri (Kemenkeu RI)",
    organizer: "Lembaga Pengelola Dana Pendidikan Kemenkeu RI",
    level: "S2 / S3",
    scope: "Luar Negeri",
    country: "Global (Top World Universities)",
    coverage: "Full Funding (Biaya Kuliah Penuh, Tiket PP, Tunjangan Hidup, Asuransi)",
    deadline: "Tahap Reguler & Afirmasi Aktif 2026",
    url: "https://lpdp.kemenkeu.go.id/",
    source: "LPDP Kemenkeu",
  },
  {
    id: "sch-chevening",
    title: "Chevening Scholarship United Kingdom (UK)",
    organizer: "Foreign, Commonwealth & Development Office (FCDO) UK",
    level: "S2 (Master)",
    scope: "Luar Negeri",
    country: "Inggris / United Kingdom",
    coverage: "Full Funding (Kuliah Master 1 Tahun, Tiket Pesawat, Biaya Hidup Bulanan)",
    deadline: "Periode Pendaftaran Tahunan",
    url: "https://www.chevening.org/scholarships/",
    source: "Pemerintah Inggris (UK)",
  },
  {
    id: "sch-fulbright",
    title: "Fulbright Master & Doctoral Degree Program (USA)",
    organizer: "AMINEF / US Department of State",
    level: "S2 / S3",
    scope: "Luar Negeri",
    country: "Amerika Serikat (USA)",
    coverage: "Full Funding (Tuition Fee, Tunjangan Buku & Hidup, Asuransi Kesehatan)",
    deadline: "Seleksi AMINEF Dibuka",
    url: "https://www.aminef.or.id/grants-for-indonesians/fulbright-programs/",
    source: "AMINEF Fulbright",
  },
  {
    id: "sch-mext",
    title: "Beasiswa MEXT Monbukagakusho (Jepang)",
    organizer: "Kementerian Pendidikan, Budaya, Olahraga, Sains & Teknologi Jepang",
    level: "D3 / S1 / S2 / S3",
    scope: "Luar Negeri",
    country: "Jepang",
    coverage: "Full Funding (100% Bebas SPP, Tunjangan Bulanan ~143.000 Yen, Tiket PP)",
    deadline: "Pendaftaran Jalur G to G & U to U",
    url: "https://www.id.emb-japan.go.jp/sch.html",
    source: "Kedutaan Besar Jepang",
  },
  {
    id: "sch-aas",
    title: "Australia Awards Scholarships (AAS)",
    organizer: "Department of Foreign Affairs and Trade (DFAT) Australia",
    level: "S2 / S3",
    scope: "Luar Negeri",
    country: "Australia",
    coverage: "Full Funding (Biaya Pendidikan Penuh, Pelatihan Bahasa Pre-Departure, Biaya Hidup)",
    deadline: "Siklus Tahunan Australia Awards",
    url: "https://www.australiaawardsindonesia.org/",
    source: "Australia Awards Indonesia",
  },
  {
    id: "sch-daad",
    title: "Beasiswa DAAD EPOS (Jerman)",
    organizer: "Deutscher Akademischer Austauschdienst (DAAD)",
    level: "S2 / S3",
    scope: "Luar Negeri",
    country: "Jerman",
    coverage: "Full Funding (Biaya Bebas Kuliah, Tunjangan Hidup ~934 Euro/bulan, Tiket PP)",
    deadline: "Pendaftaran Universitas Partner DAAD",
    url: "https://www.daad.id/en/find-funding/scholarships-for-indonesians/",
    source: "DAAD Jerman",
  },
  {
    id: "sch-turkiye",
    title: "Turkiye Burslari Scholarships (Turki)",
    organizer: "Pemerintah Republik Turki (YTB)",
    level: "S1 / S2 / S3",
    scope: "Luar Negeri",
    country: "Turki",
    coverage: "Full Funding (Kuliah Gratis, Asrama, Kursus Bahasa Turki 1 Tahun, Uang Saku)",
    deadline: "Periode Pendaftaran Awal Tahun",
    url: "https://www.turkiyeburslari.gov.tr/",
    source: "Pemerintah Turki",
  },
  {
    id: "sch-gks",
    title: "Global Korea Scholarship (GKS / KGSP)",
    organizer: "National Institute for International Education (NIIED) Korea",
    level: "S1 / S2 / S3",
    scope: "Luar Negeri",
    country: "Korea Selatan",
    coverage: "Full Funding (Kuliah, Tiket PP, Kursus Bahasa Korea, Tunjangan Hidup)",
    deadline: "Jalur Embassy & University Track",
    url: "https://www.studyinkorea.go.kr/",
    source: "NIIED Korea Selatan",
  },
  {
    id: "sch-iisma",
    title: "Beasiswa IISMA (Pertukaran Mahasiswa Luar Negeri)",
    organizer: "Kemendikbudristek RI",
    level: "S1 / D4 (Semester 4-6)",
    scope: "Luar Negeri",
    country: "Universitas Top Dunia (Eropa, Asia, Amerika, Australia)",
    coverage: "Full Funding (Kuliah 1 Semester Luar Negeri, Tiket PP, Biaya Hidup, Konversi 20 SKS)",
    deadline: "Jadwal Resmi IISMA",
    url: "https://iisma.kemdikbud.go.id/",
    source: "Kemendikbudristek RI",
  },

  // --- NASIONAL / DALAM NEGERI ---
  {
    id: "sch-lpdp-dn",
    title: "Beasiswa LPDP Dalam Negeri (Kemenkeu RI)",
    organizer: "Lembaga Pengelola Dana Pendidikan Kemenkeu RI",
    level: "S2 / S3",
    scope: "Nasional",
    country: "Indonesia (PTN/PTS Terakreditasi)",
    coverage: "Full Funding (Biaya SPP Penuh, Uang Saku Bulanan, Tunjangan Buku, Dana Penelitian)",
    deadline: "Tahap Reguler & Afirmasi Aktif 2026",
    url: "https://lpdp.kemenkeu.go.id/",
    source: "LPDP Kemenkeu",
  },
  {
    id: "sch-bu",
    title: "Beasiswa Unggulan Kemendikbudristek",
    organizer: "Puslapdik Kemendikbudristek RI",
    level: "S1 / S2 / S3",
    scope: "Nasional",
    country: "Indonesia",
    coverage: "Full Tuition + Biaya Hidup Bulanan + Tunjangan Buku",
    deadline: "Periode Pendaftaran Aktif",
    url: "https://beasiswaunggulan.kemdikbud.go.id/",
    source: "Kemendikbudristek RI",
  },
  {
    id: "sch-kipk",
    title: "KIP Kuliah Merdeka (Kartu Indonesia Pintar)",
    organizer: "Kementerian Pendidikan, Kebudayaan, Riset, dan Teknologi RI",
    level: "D3 / D4 / S1",
    scope: "Nasional",
    country: "Indonesia",
    coverage: "Pembebasan Biaya Kuliah Penuh 100% + Bantuan Biaya Hidup Bulanan",
    deadline: "Jalur SNBP, SNBT & Mandiri 2026",
    url: "https://kip-kuliah.kemdikbud.go.id/",
    source: "Kemendikbudristek RI",
  },
  {
    id: "sch-bca",
    title: "Beasiswa BCA PPTI & PPA (Teknologi & Akuntansi)",
    organizer: "PT Bank Central Asia Tbk",
    level: "SMA / SMK / Lulusan Baru",
    scope: "Nasional",
    country: "Indonesia (BCA Learning Center)",
    coverage: "Bebas Biaya Pendidikan Penuh + Uang Saku Bulanan + Kesempatan Karir di BCA",
    deadline: "Pendaftaran Online Dibuka",
    url: "https://karir.bca.co.id/beasiswa-bca",
    source: "BCA Career",
  },
  {
    id: "sch-djarum",
    title: "Djarum Beasiswa Plus (Beswan Djarum)",
    organizer: "Djarum Foundation",
    level: "Mahasiswa S1 / D4 (Semester 4)",
    scope: "Nasional",
    country: "Indonesia",
    coverage: "Dana Bantuan Pendidikan Rp 1.000.000/bulan (1 tahun) + Pelatihan Soft Skills Nasional",
    deadline: "Seleksi Tahunan Djarum Foundation",
    url: "https://djarumbeasiswaplus.org/",
    source: "Djarum Foundation",
  },
  {
    id: "sch-idcamp",
    title: "Beasiswa IDCamp 2026 - Coding Bootcamp",
    organizer: "Indosat Ooredoo Hutchison x Dicoding",
    level: "SMA/SMK / S1 / Umum",
    scope: "Nasional",
    country: "Indonesia (Online)",
    coverage: "100% Gratis Akses Kelas Industri + Sertifikasi Developer Global",
    deadline: "Gelombang Aktif",
    url: "https://idcamp.ioh.co.id/",
    source: "Dicoding Indonesia",
  },
  {
    id: "sch-dts",
    title: "Beasiswa Digital Talent Scholarship (DTS)",
    organizer: "Kementerian Komunikasi dan Informatika RI (Kominfo)",
    level: "D3 / S1 / Umum",
    scope: "Nasional",
    country: "Indonesia",
    coverage: "Pelatihan IT Gratis (Cloud, Cyber Security, AI, Data) + Sertifikasi Internasional",
    deadline: "Academy Aktif 2026",
    url: "https://digitalent.kominfo.go.id/",
    source: "Kominfo RI",
  },
];

/**
 * Search Beasiswa (Scholarships) dengan filter Scope & Jenjang
 */
export async function searchScholarships(filter: ScholarshipFilter | string = "", kategori: string = ""): Promise<ScholarshipItem[]> {
  let opts: ScholarshipFilter = {};
  if (typeof filter === "string") {
    opts = { keyword: filter, level: kategori };
  } else {
    opts = filter;
  }

  const keyword = (opts.keyword || "").toLowerCase();
  const scope = (opts.scope || "semua").toLowerCase();
  const level = (opts.level || "semua").toLowerCase();

  logger.info(`EduScraper: Memulai pencarian beasiswa (Scope: '${scope}', Level: '${level}', Keyword: '${keyword}')`);

  // 1. Scraping Live Feeds from INDBeasiswa Network (Real-time 2026 data)
  const targetFeeds: string[] = [];
  if (level.includes("s1")) targetFeeds.push("https://indbeasiswa.com/category/beasiswa-s1/feed/");
  if (level.includes("s2")) targetFeeds.push("https://indbeasiswa.com/category/beasiswa-s2/feed/");
  if (level.includes("s3")) targetFeeds.push("https://indbeasiswa.com/category/beasiswa-s3/feed/");
  if (scope === "luar-negeri" || scope === "ln") targetFeeds.push("https://indbeasiswa.com/category/beasiswa-luar-negeri/feed/");
  if (scope === "nasional" || scope === "dn") targetFeeds.push("https://indbeasiswa.com/category/beasiswa-dalam-negeri/feed/");
  
  targetFeeds.push("https://indbeasiswa.com/feed/");
  const uniqueFeeds = Array.from(new Set(targetFeeds));

  const scrapedItems: ScholarshipItem[] = [];
  try {
    const feedPromises = uniqueFeeds.map(async (feedUrl) => {
      try {
        const res = await axios.get(feedUrl, {
          timeout: 4500,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          },
        });
        const $ = cheerio.load(res.data, { xmlMode: true });
        const items: ScholarshipItem[] = [];
        $("item").each((_, el) => {
          const rawTitle = $(el).find("title").text().trim();
          const href = $(el).find("link").text().trim();
          const desc = $(el).find("description").text().replace(/<[^>]+>/g, "").trim();

          if (!rawTitle || !href) return;

          const dlMatch = rawTitle.match(/Deadline:\s*([^)]+)/i) || desc.match(/Deadline:\s*([^\n.]+)/i);
          const deadline = dlMatch ? `Deadline: ${dlMatch[1].trim()}` : "Pendaftaran Dibuka / Aktif";
          const cleanTitle = rawTitle.replace(/\(Deadline:[^)]+\)/i, "").trim();

          let itemLevel = "S1 / S2";
          if (/s3|doktor|phd/i.test(rawTitle + desc)) itemLevel = "S3";
          else if (/s2|magister|master/i.test(rawTitle + desc)) itemLevel = "S2";
          else if (/s1|sarjana/i.test(rawTitle + desc)) itemLevel = "S1";
          else if (/d3|d4|diploma|vokasi/i.test(rawTitle + desc)) itemLevel = "D3 / D4";
          else if (/sma|smk/i.test(rawTitle + desc)) itemLevel = "SMA / SMK";

          const isAbroad = /luar negeri|inggris|jepang|korea|australia|eropa|amerika|turki|singapura|jerman|taiwan|belanda|world|global/i.test(rawTitle + desc);

          items.push({
            id: `live-sch-${href.replace(/[^a-zA-Z0-9]/g, "").slice(-20)}`,
            title: cleanTitle,
            organizer: "Penyelenggara Terverifikasi",
            level: itemLevel,
            scope: isAbroad ? "Luar Negeri" : "Nasional",
            coverage: /full|sepenuhnya|biaya kuliah|uang saku/i.test(rawTitle + desc) ? "Bantuan Pendidikan / Beasiswa Penuh" : "Bantuan Biaya Studi & Sertifikasi",
            deadline,
            url: href,
            source: "INDBeasiswa Live Feed",
          });
        });
        return items;
      } catch (_) {
        return [];
      }
    });

    const results = await Promise.all(feedPromises);
    scrapedItems.push(...results.flat());
    logger.info(`EduScraper: Berhasil mengambil ${scrapedItems.length} beasiswa live dari feed internet`);
  } catch (error) {
    logger.warn("EduScraper: Gagal scraping feed live, menggunakan direktori terverifikasi.");
  }

  const allList = [...scrapedItems, ...OFFICIAL_SCHOLARSHIPS];


  // 2. Filter data
  let filtered = allList.filter((item) => {
    // Filter Scope (Luar Negeri vs Nasional)
    if (scope === "luar-negeri" || scope === "luarnegeri" || scope === "ln") {
      if (item.scope !== "Luar Negeri") return false;
    } else if (scope === "nasional" || scope === "dalam-negeri" || scope === "dn") {
      if (item.scope !== "Nasional") return false;
    }

    // Filter Level (S1, S2, S3, dll.)
    if (level && level !== "semua") {
      const itemLevel = item.level.toLowerCase();
      if (level === "s1" && !itemLevel.includes("s1")) return false;
      if (level === "s2" && !itemLevel.includes("s2")) return false;
      if (level === "s3" && !itemLevel.includes("s3")) return false;
      if (level === "d3" && !itemLevel.includes("d3") && !itemLevel.includes("d4")) return false;
      if (level === "bootcamp" && !itemLevel.includes("bootcamp") && !itemLevel.includes("sma/smk")) return false;
    }

    // Filter Keyword
    if (keyword && keyword !== "semua") {
      const textToSearch = `${item.title} ${item.organizer} ${item.country || ""} ${item.source}`.toLowerCase();
      if (!textToSearch.includes(keyword)) return false;
    }

    return true;
  });

  // Fallback jika terlalu sempit
  if (filtered.length === 0) {
    filtered = allList.filter((item) => {
      if (scope === "luar-negeri") return item.scope === "Luar Negeri";
      if (scope === "nasional") return item.scope === "Nasional";
      return true;
    });
  }

  // Deduplikasi & ambil top 4
  const uniqueMap = new Map<string, ScholarshipItem>();
  for (const s of filtered) {
    uniqueMap.set(s.title, s);
  }

  return Array.from(uniqueMap.values()).slice(0, 4);
}

/**
 * Render clean journal-style embed for Scholarships (tanpa emoji spam)
 */
export function createScholarshipEmbed(
  items: ScholarshipItem[],
  queryInfo: { scope?: string; level?: string; keyword?: string },
  botAvatarUrl?: string
): { embed: EmbedBuilder; components: ActionRowBuilder<ButtonBuilder>[] } {
  const scopeBadge = queryInfo.scope ? (queryInfo.scope === "luar-negeri" ? "Luar Negeri" : queryInfo.scope === "nasional" ? "Dalam Negeri (Nasional)" : "Semua Wilayah") : "Semua Wilayah";
  const levelBadge = queryInfo.level && queryInfo.level !== "semua" ? queryInfo.level.toUpperCase() : "Semua Jenjang";

  const embed = new EmbedBuilder()
    .setColor(0x059669) // Emerald Green
    .setTitle("Direktori Program Beasiswa Resmi")
    .setDescription(
      `Wilayah: **${scopeBadge}** | Jenjang: **${levelBadge}** | Ditemukan: **${items.length} program**\n───────────────────────────────`
    )
    .setFooter({
      text: "Maya Scholarship Directory • Sumber Terverifikasi & Resmi",
      iconURL: botAvatarUrl,
    })
    .setTimestamp();

  const buttons: ButtonBuilder[] = [];

  items.forEach((item, idx) => {
    const num = idx + 1;
    const countryStr = item.country ? ` (${item.country})` : "";
    const fieldContent = 
      `**Penyelenggara**: ${item.organizer}${countryStr}\n` +
      `**Jenjang**: ${item.level} • **Cakupan**: ${item.coverage}\n` +
      `**Status**: ${item.deadline}\n` +
      `**Portal Resmi**: [${item.source}](${item.url})`;

    embed.addFields({
      name: `${num}. ${item.title}`,
      value: fieldContent,
      inline: false,
    });

    if (buttons.length < 4 && item.url && item.url.startsWith("http")) {
      const labelName = item.source.length > 18 ? item.source.substring(0, 15) + "..." : item.source;
      buttons.push(
        new ButtonBuilder()
          .setLabel(`Portal #${num} (${labelName})`)
          .setStyle(ButtonStyle.Link)
          .setURL(item.url)
      );
    }
  });

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  if (buttons.length > 0) {
    components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons));
  }

  return { embed, components };
}

async function fetchLiveCoursesFromWeb(queryTopic: string = ""): Promise<CourseItem[]> {
  const liveItems: CourseItem[] = [];
  const normalized = (queryTopic || "").toLowerCase();

  // 1. Fetch ClassCentral 2026 curated course guides & programs
  try {
    const res = await axios.get("https://www.classcentral.com/report/feed/", {
      timeout: 4500,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    });
    const $ = cheerio.load(res.data, { xmlMode: true });
    $("item").each((i, el) => {
      const title = $(el).find("title").text().trim();
      const link = $(el).find("link").text().trim();
      const desc = $(el).find("description").text().replace(/<[^>]+>/g, "").trim();

      if (!title || !link) return;

      if (!normalized || normalized === "semua" || title.toLowerCase().includes(normalized) || desc.toLowerCase().includes(normalized)) {
        liveItems.push({
          id: `live-cc-${i}`,
          title,
          provider: "Class Central (Top Universities)",
          topic: desc.substring(0, 80) + "...",
          certificate: "Gratis / Bersertifikat Audit",
          duration: "Self-paced",
          url: link,
          source: "Class Central Guide",
        });
      }
    });
  } catch (err) {
    logger.warn("EduScraper: Error fetching ClassCentral live feed:", err);
  }

  // 2. Fetch freeCodeCamp live tutorials & courses
  try {
    const res = await axios.get("https://www.freecodecamp.org/news/rss/", {
      timeout: 4500,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    });
    const $ = cheerio.load(res.data, { xmlMode: true });
    $("item").each((i, el) => {
      const title = $(el).find("title").text().replace(/\s+/g, " ").trim();
      const link = $(el).find("link").text().trim();
      const cat = $(el).find("category").map((_, c) => $(c).text().trim()).get().join(", ");

      if (!title || !link) return;

      if (!normalized || normalized === "semua" || title.toLowerCase().includes(normalized) || cat.toLowerCase().includes(normalized)) {
        liveItems.push({
          id: `live-fcc-${i}`,
          title,
          provider: "freeCodeCamp",
          topic: cat || "Programming & Tech",
          certificate: "Kurikulum Interaktif Gratis",
          duration: "Self-paced",
          url: link,
          source: "freeCodeCamp Live",
        });
      }
    });
  } catch (err) {
    logger.warn("EduScraper: Error fetching freeCodeCamp live feed:", err);
  }

  return liveItems;
}

/**
 * Search Free Courses
 */
export async function searchFreeCourses(topik: string = "", platform: string = ""): Promise<CourseItem[]> {
  const normalizedTopic = (topik || "").toLowerCase();
  const normalizedPlatform = (platform || "").toLowerCase();

  const liveCourses = await fetchLiveCoursesFromWeb(normalizedTopic);

  const officialCourses: CourseItem[] = [
    {
      id: "crs-google-1",
      title: "Google Skillshop - Sertifikasi Digital Marketing & Data Analytics",
      provider: "Google",
      topic: "Digital Marketing, Data & Cloud",
      certificate: "Sertifikat Kelulusan Resmi Google (Gratis)",
      duration: "Self-paced (~15-20 Jam)",
      url: "https://skillshop.exceedlms.com/student/catalog/browse",
      source: "Google Skillshop",
    },
    {
      id: "crs-aws-1",
      title: "AWS Educate - Cloud Computing & AI Fundamentals",
      provider: "Amazon Web Services (AWS)",
      topic: "Cloud Computing, Machine Learning, Serverless",
      certificate: "Sertifikat & Digital Badge AWS",
      duration: "Self-paced (~10-15 Jam)",
      url: "https://aws.amazon.com/education/awseducate/",
      source: "AWS Educate",
    },
    {
      id: "crs-dicoding-1",
      title: "Dicoding Indonesia - Dasar Pemrograman Web & Python",
      provider: "Dicoding",
      topic: "Web Development, Python, JavaScript, AI",
      certificate: "Sertifikat Kompetensi Resmi Dicoding",
      duration: "Self-paced (~15 Jam)",
      url: "https://www.dicoding.com/academies/list",
      source: "Dicoding Indonesia",
    },
    {
      id: "crs-coursera-1",
      title: "Coursera Free Courses - Computer Science & Data Science",
      provider: "Coursera",
      topic: "Programming, Machine Learning, UI/UX",
      certificate: "Akses Belajar Gratis + Sertifikat Audit",
      duration: "Self-paced (~20-30 Jam)",
      url: "https://www.coursera.org/courses?query=free",
      source: "Coursera",
    },
    {
      id: "crs-harvard-1",
      title: "Harvard CS50x - Introduction to Computer Science",
      provider: "Harvard University (edX)",
      topic: "C, Python, SQL, HTML, CSS, JavaScript",
      certificate: "Sertifikat Kelulusan Resmi CS50 Gratis",
      duration: "Self-paced (~10 Minggu)",
      url: "https://cs50.harvard.edu/x/",
      source: "Harvard University",
    },
    {
      id: "crs-cisco-1",
      title: "Cisco Networking Academy - Cybersecurity & Networking Essentials",
      provider: "Cisco",
      topic: "Cybersecurity, Networking, IoT, Linux",
      certificate: "Sertifikat Kelulusan Resmi Cisco",
      duration: "Self-paced (~30 Jam)",
      url: "https://www.netacad.com/courses/all-courses",
      source: "Cisco NetAcad",
    },
    {
      id: "crs-microsoft-1",
      title: "Microsoft Learn - AI, Azure Cloud & C# Developer",
      provider: "Microsoft",
      topic: "Artificial Intelligence, Azure, C#, Security",
      certificate: "Sertifikat & Badge Microsoft Learn",
      duration: "Self-paced (~12-18 Jam)",
      url: "https://learn.microsoft.com/id-id/training/",
      source: "Microsoft Learn",
    },
  ];

  const allCourses = [...liveCourses, ...officialCourses];
  let filtered = allCourses;

  if (normalizedTopic && normalizedTopic !== "semua") {
    filtered = filtered.filter(
      (c) =>
        c.title.toLowerCase().includes(normalizedTopic) ||
        c.topic.toLowerCase().includes(normalizedTopic) ||
        c.provider.toLowerCase().includes(normalizedTopic)
    );
  }

  if (normalizedPlatform && normalizedPlatform !== "semua") {
    filtered = filtered.filter(
      (c) =>
        c.provider.toLowerCase().includes(normalizedPlatform) ||
        c.source.toLowerCase().includes(normalizedPlatform)
    );
  }

  const results = filtered.length > 0 ? filtered : officialCourses;
  return results.slice(0, 4);
}

/**
 * Render clean journal-style embed for Online Courses (tanpa emoji spam)
 */
export function createCourseEmbed(
  items: CourseItem[],
  queryTopic: string,
  botAvatarUrl?: string
): { embed: EmbedBuilder; components: ActionRowBuilder<ButtonBuilder>[] } {
  const embed = new EmbedBuilder()
    .setColor(0x4F46E5) // Indigo
    .setTitle("Katalog Pelatihan & Kursus Bersertifikat")
    .setDescription(
      `Topik: **${queryTopic || "Semua Materi"}** | Ditemukan: **${items.length} program gratis**\n───────────────────────────────`
    )
    .setFooter({
      text: "Maya Training Catalog • Sumber Resmi & Kredibel",
      iconURL: botAvatarUrl,
    })
    .setTimestamp();

  const buttons: ButtonBuilder[] = [];

  items.forEach((item, idx) => {
    const num = idx + 1;
    const fieldContent =
      `**Penyedia**: ${item.provider}\n` +
      `**Materi**: ${item.topic}\n` +
      `**Sertifikat**: ${item.certificate}\n` +
      `**Estimasi Waktu**: ${item.duration}\n` +
      `**Portal Belajar**: [${item.source}](${item.url})`;

    embed.addFields({
      name: `${num}. ${item.title}`,
      value: fieldContent,
      inline: false,
    });

    if (buttons.length < 4 && item.url && item.url.startsWith("http")) {
      const labelName = item.provider.length > 18 ? item.provider.substring(0, 15) + "..." : item.provider;
      buttons.push(
        new ButtonBuilder()
          .setLabel(`Mulai #${num} (${labelName})`)
          .setStyle(ButtonStyle.Link)
          .setURL(item.url)
      );
    }
  });

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  if (buttons.length > 0) {
    components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons));
  }

  return { embed, components };
}
