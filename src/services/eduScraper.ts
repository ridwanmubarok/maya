import axios from "axios";
import * as cheerio from "cheerio";
import { logger } from "../utils/logger";

export interface ScholarshipItem {
  id: string;
  title: string;
  organizer: string;
  level: string;
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

/**
 * Search Beasiswa (Scholarships)
 */
export async function searchScholarships(jenjang: string = "", kategori: string = ""): Promise<ScholarshipItem[]> {
  const items: ScholarshipItem[] = [];
  const normalizedJenjang = (jenjang || "").toLowerCase();
  const normalizedKategori = (kategori || "").toLowerCase();

  logger.info(`EduScraper: Memulai pencarian beasiswa (Jenjang: '${jenjang}', Kategori: '${kategori}')`);

  // Source 1: Scraping IDScholarship / Beasiswa Indonesia Portal
  try {
    const searchUrl = "https://indbeasiswa.com/category/beasiswa-full-scholarship/";
    const res = await axios.get(searchUrl, {
      timeout: 6000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    const $ = cheerio.load(res.data);
    $("article, .post").each((i, el) => {
      if (items.length >= 4) return;
      const title = $(el).find(".entry-title a, h2 a").text().trim();
      const href = $(el).find(".entry-title a, h2 a").attr("href");

      if (title && href) {
        items.push({
          id: `beasiswa-idb-${i}`,
          title: title,
          organizer: "Penyelenggara Resmi IDBeasiswa",
          level: jenjang && jenjang !== "Semua" ? jenjang : "D3 / S1 / S2 / Umum",
          coverage: "Beasiswa Penuh (Full Scholarship)",
          deadline: "Lihat Detail Pendaftaran",
          url: href,
          source: "INDBeasiswa",
        });
      }
    });
  } catch (error) {
    logger.error("EduScraper: Error scraping INDBeasiswa:", error);
  }

  // Fallback Curator for Verified Major Scholarship Programs
  const officialPrograms: ScholarshipItem[] = [
    {
      id: "prog-idcamp",
      title: "Beasiswa IDCamp 2026 - Coding Bootcamp",
      organizer: "Indosat Ooredoo Hutchison x Dicoding",
      level: "SMA/SMK / S1 / Umum",
      coverage: "Beasiswa Bootcamp 100% Gratis + Sertifikat",
      deadline: "Pendaftaran Dibuka",
      url: "https://idcamp.ioh.co.id/",
      source: "Dicoding Indonesia",
    },
    {
      id: "prog-dts",
      title: "Beasiswa Digital Talent Scholarship (DTS)",
      organizer: "Kementerian Kominfo RI",
      level: "D3 / S1 / Umum",
      coverage: "Pelatihan IT Gratis + Pelatihan Sertifikasi Global",
      deadline: "Gelombang Aktif 2026",
      url: "https://digitalent.kominfo.go.id/",
      source: "Kominfo RI",
    },
    {
      id: "prog-km",
      title: "Beasiswa Studi Independen & Magang Merdeka",
      organizer: "Kemdikbudristek RI",
      level: "Mahasiswa D3 / D4 / S1",
      coverage: "Uang Saku Bulanan + Konversi 20 SKS",
      deadline: "Semester Aktif",
      url: "https://kampusmerdeka.kemdikbud.go.id/",
      source: "Kampus Merdeka RI",
    },
    {
      id: "prog-lpdp",
      title: "Beasiswa LPDP Kemenkeu RI (Dalam & Luar Negeri)",
      organizer: "LPDP Kementerian Keuangan RI",
      level: "S2 / S3",
      coverage: "Full Tuition + Uang Saku + Asuransi + Biaya Hidup",
      deadline: "Tahap Pendaftaran LPDP",
      url: "https://lpdp.kemenkeu.go.id/",
      source: "LPDP Kemenkeu",
    },
    {
      id: "prog-bu",
      title: "Beasiswa Unggulan Kemendikbud",
      organizer: "Kementerian Pendidikan dan Kebudayaan RI",
      level: "S1 / S2 / S3",
      coverage: "Biaya Kuliah Penuh + Biaya Hidup + Buku",
      deadline: "Periode Pendaftaran Berlangsung",
      url: "https://beasiswaunggulan.kemdikbud.go.id/",
      source: "Kemendikbud RI",
    },
  ];

  // Merge & Filter
  const allScholarships = [...items, ...officialPrograms];

  let filtered = allScholarships;
  if (normalizedKategori && normalizedKategori !== "semua") {
    filtered = filtered.filter(
      (s) =>
        s.title.toLowerCase().includes(normalizedKategori) ||
        s.organizer.toLowerCase().includes(normalizedKategori) ||
        s.source.toLowerCase().includes(normalizedKategori)
    );
  }

  // Deduplicate and return top 5
  const uniqueMap = new Map<string, ScholarshipItem>();
  for (const s of filtered.length >= 3 ? filtered : allScholarships) {
    uniqueMap.set(s.title, s);
  }

  return Array.from(uniqueMap.values()).slice(0, 5);
}

/**
 * Search Free Courses (Kursus Sertifikasi Gratis)
 */
export async function searchFreeCourses(topik: string = "", platform: string = ""): Promise<CourseItem[]> {
  const items: CourseItem[] = [];
  const normalizedTopic = (topik || "").toLowerCase();
  const normalizedPlatform = (platform || "").toLowerCase();

  logger.info(`EduScraper: Memulai pencarian kursus gratis (Topik: '${topik}', Platform: '${platform}')`);

  // Major Curated Free Certified Course Programs
  const officialCourses: CourseItem[] = [
    {
      id: "crs-google-1",
      title: "Google Skillshop - Sertifikasi Digital Marketing & Analytics",
      provider: "Google",
      topic: "Digital Marketing & Data Analytics",
      certificate: "Sertifikat Resmi Google (Gratis)",
      duration: "Self-paced (~15-20 Jam)",
      url: "https://skillshop.exceedlms.com/student/catalog/browse",
      source: "Google Skillshop",
    },
    {
      id: "crs-aws-1",
      title: "AWS Educate - Cloud Computing & AI Fundamentals",
      provider: "Amazon Web Services (AWS)",
      topic: "Cloud Computing & AI",
      certificate: "Sertifikat & Digital Badge AWS",
      duration: "Self-paced (~10-15 Jam)",
      url: "https://aws.amazon.com/education/awseducate/",
      source: "AWS Educate",
    },
    {
      id: "crs-dicoding-1",
      title: "Dicoding Indonesia - Kelas Dasar Pemrograman Web / Python",
      provider: "Dicoding",
      topic: "Web Development / Python / AI",
      certificate: "Sertifikat Kelulusan Resmi Dicoding",
      duration: "Self-paced (~15 Jam)",
      url: "https://www.dicoding.com/academies/list",
      source: "Dicoding Indonesia",
    },
    {
      id: "crs-coursera-1",
      title: "Coursera Free Courses - Programming & Data Science",
      provider: "Coursera",
      topic: "Computer Science & Data Science",
      certificate: "Akses Belajar Gratis + Sertifikat Audit",
      duration: "Self-paced (~20 Jam)",
      url: "https://www.coursera.org/courses?query=free",
      source: "Coursera",
    },
    {
      id: "crs-cisco-1",
      title: "Cisco Networking Academy - Cybersecurity & Networking Essentials",
      provider: "Cisco",
      topic: "Cybersecurity & Networking",
      certificate: "Sertifikat Kelulusan Resmi Cisco",
      duration: "Self-paced (~30 Jam)",
      url: "https://www.netacad.com/courses/all-courses",
      source: "Cisco NetAcad",
    },
    {
      id: "crs-microsoft-1",
      title: "Microsoft Learn - AI, Azure & C# Fundamentals",
      provider: "Microsoft",
      topic: "Artificial Intelligence & Azure Cloud",
      certificate: "Sertifikat & Badge Microsoft Learn",
      duration: "Self-paced (~12 Jam)",
      url: "https://learn.microsoft.com/id-id/training/",
      source: "Microsoft Learn",
    },
  ];

  let filtered = officialCourses;

  if (normalizedTopic && normalizedTopic !== "semua") {
    filtered = filtered.filter(
      (c) =>
        c.title.toLowerCase().includes(normalizedTopic) ||
        c.topic.toLowerCase().includes(normalizedTopic)
    );
  }

  if (normalizedPlatform && normalizedPlatform !== "semua") {
    filtered = filtered.filter(
      (c) =>
        c.provider.toLowerCase().includes(normalizedPlatform) ||
        c.source.toLowerCase().includes(normalizedPlatform)
    );
  }

  // Fallback if filter result is empty
  const resultList = filtered.length > 0 ? filtered : officialCourses;

  return resultList.slice(0, 5);
}
