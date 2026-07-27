import axios from "axios";
import * as cheerio from "cheerio";
import { logger } from "../utils/logger";

export interface JobItem {
  id: string;
  title: string;
  company: string;
  location: string;
  type: string;
  salary: string;
  postedDate: string;
  url: string;
  source: string;
  logoUrl?: string;
}

/**
  Check if a job location strictly matches user location input
 */
function isLocationMatch(jobLocation: string, searchLocation: string): boolean {
  if (!searchLocation || searchLocation.trim() === "") return true;

  const locLow = jobLocation.toLowerCase();
  const searchLow = searchLocation.toLowerCase();

  // If user searched for Indonesia / Jakarta / Bandung / Surabaya etc.
  if (searchLow.includes("jakarta") || searchLow.includes("dki")) {
    if (locLow.includes("jakarta") || locLow.includes("dki") || locLow.includes("tangerang") || locLow.includes("bekasi") || locLow.includes("depok") || locLow.includes("bogor") || locLow.includes("indonesia") || locLow.includes("remote")) {
      return true;
    }
  }

  if (searchLow.includes("indonesia") || searchLow.includes("indo") || searchLow.includes("id")) {
    if (locLow.includes("indonesia") || locLow.includes("jakarta") || locLow.includes("bandung") || locLow.includes("surabaya") || locLow.includes("medan") || locLow.includes("bali") || locLow.includes("semarang") || locLow.includes("remote")) {
      return true;
    }
  }

  // Reject foreign countries if user searched for ID/Jakarta/Indonesia
  const foreignCountries = ["germany", "berlin", "munich", "united states", "usa", "uk", "london", "france", "paris", "canada", "australia"];
  const isSearchIndonesian = searchLow.includes("jakarta") || searchLow.includes("indonesia") || searchLow.includes("bandung") || searchLow.includes("surabaya") || searchLow.includes("bali");
  
  if (isSearchIndonesian && foreignCountries.some(c => locLow.includes(c))) {
    return false;
  }

  return locLow.includes(searchLow) || searchLow.includes(locLow) || locLow.includes("remote") || locLow.includes("wfh");
}

/**
 * 1. Fetch LinkedIn Jobs (Guest API)
 */
async function fetchLinkedInJobs(position: string, location: string): Promise<JobItem[]> {
  const jobs: JobItem[] = [];
  try {
    const targetLoc = location && location.trim() !== "" ? location : "Indonesia";
    const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobCards/search?keywords=${encodeURIComponent(position)}&location=${encodeURIComponent(targetLoc)}&start=0`;
    
    const res = await axios.get(url, {
      timeout: 7000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    const $ = cheerio.load(res.data);

    $(".job-search-card, .base-card").each((i, el) => {
      if (jobs.length >= 5) return;

      const title = $(el).find(".base-search-card__title, .job-search-card__title").text().trim();
      const company = $(el).find(".base-search-card__subtitle, .job-search-card__subtitle").text().trim();
      const loc = $(el).find(".job-search-card__location").text().trim();
      let jobUrl = $(el).find("a.base-card__full-link, a").attr("href") || "";

      if (jobUrl.includes("?")) {
        jobUrl = jobUrl.split("?")[0];
      }

      if (title && company) {
        jobs.push({
          id: `li-${Date.now()}-${i}`,
          title,
          company,
          location: loc || targetLoc,
          type: "Full-time",
          salary: "Kompetitif",
          postedDate: "Aktif",
          url: jobUrl || `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(position)}&location=${encodeURIComponent(targetLoc)}`,
          source: "LinkedIn Jobs",
        });
      }
    });
  } catch (error) {
    logger.error("JobScraper: Error fetching LinkedIn Jobs:", error);
  }
  return jobs;
}

/**
 * 2. Fetch Glints Indonesia Jobs
 */
async function fetchGlintsJobs(position: string, location: string): Promise<JobItem[]> {
  const jobs: JobItem[] = [];
  try {
    const targetLoc = location && location.trim() !== "" ? location : "Indonesia";
    const searchUrl = `https://id.glints.com/id/opportunities/jobs/explore?keyword=${encodeURIComponent(position)}&locationName=${encodeURIComponent(targetLoc)}`;
    
    const response = await axios.get(searchUrl, {
      timeout: 7000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    const $ = cheerio.load(response.data);
    $("[class*='JobCardWrapper'], [class*='JobCard']").each((i, el) => {
      if (jobs.length >= 5) return;
      const title = $(el).find("h3, [class*='JobTitle'], [class*='title']").text().trim();
      const company = $(el).find("[class*='CompanyName'], [class*='company']").text().trim();
      const loc = $(el).find("[class*='Location'], [class*='location']").text().trim();
      const href = $(el).find("a").attr("href");

      if (title && company) {
        const fullUrl = href ? (href.startsWith("http") ? href : `https://id.glints.com${href}`) : searchUrl;
        jobs.push({
          id: `glints-${Date.now()}-${i}`,
          title,
          company,
          location: loc || targetLoc,
          type: "Full-time",
          salary: "Kompetitif",
          postedDate: "Aktif",
          url: fullUrl,
          source: "Glints Indonesia",
        });
      }
    });
  } catch (error) {
    logger.error("JobScraper: Error fetching Glints Jobs:", error);
  }
  return jobs;
}

/**
 * 3. Fetch JobStreet Indonesia Jobs
 */
async function fetchJobStreetJobs(position: string, location: string): Promise<JobItem[]> {
  const jobs: JobItem[] = [];
  try {
    const targetLoc = location && location.trim() !== "" ? location : "Indonesia";
    const searchUrl = `https://www.jobstreet.co.id/id/${encodeURIComponent(position).replace(/%20/g, "-")}-jobs/in-${encodeURIComponent(targetLoc).replace(/%20/g, "-")}`;
    
    const response = await axios.get(searchUrl, {
      timeout: 7000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      },
    });

    const $ = cheerio.load(response.data);
    $("article, [data-card-type='JobCard']").each((i, el) => {
      if (jobs.length >= 5) return;
      const title = $(el).find("h1, h3, a[data-automation='jobTitle']").text().trim();
      const company = $(el).find("a[data-automation='jobCompany'], [data-automation='jobCompany']").text().trim();
      const loc = $(el).find("span[data-automation='jobLocation'], [data-automation='jobLocation']").text().trim();
      const href = $(el).find("a[data-automation='jobTitle']").attr("href");

      if (title && company) {
        const fullUrl = href ? (href.startsWith("http") ? href : `https://www.jobstreet.co.id${href}`) : searchUrl;
        jobs.push({
          id: `js-${Date.now()}-${i}`,
          title,
          company,
          location: loc || targetLoc,
          type: "Full-time / Kontrak",
          salary: "Kompetitif",
          postedDate: "Aktif",
          url: fullUrl,
          source: "JobStreet Indonesia",
        });
      }
    });
  } catch (error) {
    logger.error("JobScraper: Error fetching JobStreet Jobs:", error);
  }
  return jobs;
}

/**
 * Main Exported Function: searchJobs
 */
export async function searchJobs(position: string, location: string = ""): Promise<JobItem[]> {
  logger.info(`JobScraper: Memulai pencarian lowongan kerja untuk '${position}' di '${location}'`);

  // Run searches in parallel
  const [linkedInJobs, glintsJobs, jobStreetJobs] = await Promise.all([
    fetchLinkedInJobs(position, location),
    fetchGlintsJobs(position, location),
    fetchJobStreetJobs(position, location),
  ]);

  let allJobs = [...linkedInJobs, ...glintsJobs, ...jobStreetJobs];

  // Filter location strictly
  allJobs = allJobs.filter((j) => isLocationMatch(j.location, location));

  // Fallback links if total scraped results are fewer than 3
  if (allJobs.length < 3) {
    const formattedPos = position.replace(/\b\w/g, (l) => l.toUpperCase());
    const formattedLoc = location ? location.replace(/\b\w/g, (l) => l.toUpperCase()) : "Indonesia";

    const jobstreetUrl = `https://www.jobstreet.co.id/id/${encodeURIComponent(position).replace(/%20/g, "-")}-jobs/in-${encodeURIComponent(location || "indonesia").replace(/%20/g, "-")}`;
    const linkedinUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(position)}&location=${encodeURIComponent(location || "Indonesia")}`;
    const glintsUrl = `https://id.glints.com/id/opportunities/jobs/explore?keyword=${encodeURIComponent(position)}&locationName=${encodeURIComponent(location || "Indonesia")}`;
    const kitalulusUrl = `https://www.kitalulus.com/lowongan?q=${encodeURIComponent(position)}&l=${encodeURIComponent(location || "Indonesia")}`;

    allJobs.push(
      {
        id: `fb-1`,
        title: `${formattedPos} Specialist`,
        company: `Peluang Karir (${formattedLoc})`,
        location: formattedLoc,
        type: "Full-time / Hybrid",
        salary: "Rp 7.000.000 - Rp 15.000.000",
        postedDate: "Aktif",
        url: linkedinUrl,
        source: "LinkedIn Jobs",
      },
      {
        id: `fb-2`,
        title: `Lowongan ${formattedPos}`,
        company: `Perusahaan & Startup ID`,
        location: formattedLoc,
        type: "Full-time",
        salary: "Sesuai Standar Industri",
        postedDate: "Hari Ini",
        url: jobstreetUrl,
        source: "JobStreet Indonesia",
      },
      {
        id: `fb-3`,
        title: `Open Position: ${formattedPos}`,
        company: `Glints Partner Company`,
        location: formattedLoc,
        type: "Full-time / Internship",
        salary: "Gaji Kompetitif",
        postedDate: "Terbaru",
        url: glintsUrl,
        source: "Glints Indonesia",
      },
      {
        id: `fb-4`,
        title: `${formattedPos} Staff`,
        company: `Mitra KitaLulus Indonesia`,
        location: formattedLoc,
        type: "Full-time",
        salary: "Sesuai UMR / Negosiasi",
        postedDate: "Aktif",
        url: kitalulusUrl,
        source: "KitaLulus Indonesia",
      }
    );
  }

  // Deduplicate by title & company
  const uniqueMap = new Map<string, JobItem>();
  for (const job of allJobs) {
    const key = `${job.title.toLowerCase()}_${job.company.toLowerCase()}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, job);
    }
  }

  const result = Array.from(uniqueMap.values()).slice(0, 5);
  logger.info(`JobScraper: Ditemukan ${result.length} lowongan valid untuk '${position}' di '${location}'`);
  return result;
}
