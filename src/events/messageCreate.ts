import { Events, Message, TextChannel } from "discord.js";
import { BotEvent } from "../types";
import { prisma } from "../services/database";
import { createEmbed } from "../utils/embeds";
import { logModeration } from "../utils/moderationLogger";
import { logger } from "../utils/logger";
import { trackAnalyticsEvent } from "../services/analyticsTracker";
import { handleStoryWordMessage } from "../services/storyManager";
import { handlePantunMessage } from "../services/pantunManager";
import { askNvidia } from "../services/aiClient";
import { voiceChatManager } from "../services/voiceChatManager";
import { academicSearchService, parseAcademicQuery, createJournalEmbed } from "../services/academicSearchService";
import { searchScholarships, createScholarshipEmbed, searchFreeCourses, createCourseEmbed } from "../services/eduScraper";
import { fetchIndonesianNews, createNewsEmbed } from "../services/newsScraper";
import { searchJobs, createJobEmbed } from "../services/jobScraper";
import { searchOutfitTrends, createOutfitEmbed } from "../services/outfitService";
import { fetchCurrencyRates, createCurrencyEmbed } from "../services/financialService";
import { buildMemberCardPayload } from "../commands/utility/card";

// Helper deterministic query parsers (Bypasses AI reasoning for precision and speed ONLY on explicit search/catalog requests)
function parseScholarshipQuery(prompt: string): { isScholarship: boolean; scope: "luar-negeri" | "nasional" | "semua"; level: string; keyword?: string } {
  // If the user is asking a conversational question, consultation, opinion, advice, or asking about quotas/reasons/tips
  const isConsultationOrQuestion = /(?:mana\s+yang|yang\s+mana|yang\s+banyak|yang\s+paling|yang\s+bagus|kenapa|mengapa|bagaimana|gimana|apakah|apa\s+(?:saja|itu|bedanya|syarat)|tips|cara|trik|kuota|peluang|lolos|alasan|menurut|pendapat|opini|cerita|pengalaman|bocoran|kapan|tanya|nanya)\b/i.test(prompt);
  if (isConsultationOrQuestion) {
    return { isScholarship: false, scope: "semua", level: "semua" };
  }

  // Must have explicit search/listing/catalog intent
  const hasSearchIntent = /(?:cari(?:kan|in)?|temukan|daftar|list|katalog|info\s+(?:beasiswa|daftar)|spill\s+beasiswa|rekomen(?:dasi(?:kan)?)?\s+beasiswa|tampil(?:kan)?\s+beasiswa|ada\s+beasiswa\s+apa)/i.test(prompt);
  const hasKeyword = /\b(beasiswa|scholarship|grant|pendidikan\s+gratis)\b/i.test(prompt);
  if (!hasSearchIntent || !hasKeyword) {
    return { isScholarship: false, scope: "semua", level: "semua" };
  }

  let scope: "luar-negeri" | "nasional" | "semua" = "semua";
  if (/\b(luar\s*negeri|overseas|international|eropa|jepang|amerika|aus|uk|turki|singapura|korea)\b/i.test(prompt)) {
    scope = "luar-negeri";
  } else if (/\b(dalam\s*negeri|nasional|indonesia|lokal|negeri)\b/i.test(prompt)) {
    scope = "nasional";
  }

  let level = "semua";
  if (/\b(s3|doktor|phd)\b/i.test(prompt)) {
    level = "s3";
  } else if (/\b(s2|magister|master)\b/i.test(prompt)) {
    level = "s2";
  } else if (/\b(s1|sarjana|bachelor)\b/i.test(prompt)) {
    level = "s1";
  } else if (/\b(d3|d4|diploma|vokasi)\b/i.test(prompt)) {
    level = "d3";
  } else if (/\b(bootcamp|kursus|pelatihan)\b/i.test(prompt)) {
    level = "bootcamp";
  }

  const words = prompt
    .replace(/<@!?\d+>/g, "")
    .replace(/\b(maya|tolong|carikan|info|beasiswa|scholarship|dong|yang|buat|kuliah|luar|dalam|negeri|nasional|s1|s2|s3|d3|d4|doktor|magister|sarjana)\b/gi, "")
    .trim();
  const keyword = words.length > 2 ? words : undefined;

  return { isScholarship: true, scope, level, keyword };
}

function parseNewsQuery(prompt: string): { isNews: boolean; category: string } {
  const isConsultationOrQuestion = /(?:kenapa|mengapa|bagaimana|gimana|apakah|apa\s+(?:pendapat|tanggapan|maksud|isinya)|menurut|opini|tanya|ceritakan)\b/i.test(prompt);
  if (isConsultationOrQuestion) return { isNews: false, category: "semua" };

  const hasNewsSearchIntent = /(?:cari(?:kan|in)?\s+berita|update\s+berita|baca\s+berita|info\s+berita|kabar\s+terkini|headline|rangkuman\s+berita|berita\s+(?:hari\s+ini|terbaru|terkini|internasional|nasional|dunia|tekno|bisnis))/i.test(prompt);
  if (!hasNewsSearchIntent) return { isNews: false, category: "semua" };

  let category = "semua";
  if (/\b(internasional|global|dunia|luar\s*negeri|world)\b/i.test(prompt)) {
    category = "internasional";
  } else if (/\b(teknologi|tekno|gadget|ai\b|tech|it\b|software)\b/i.test(prompt)) {
    category = "teknologi";
  } else if (/\b(bisnis|ekonomi|saham|market|keuangan|ihsg)\b/i.test(prompt)) {
    category = "ekonomi";
  } else if (/\b(nasional|indonesia|dalam\s*negeri|lokal|nusantara)\b/i.test(prompt)) {
    category = "nasional";
  }

  return { isNews: true, category };
}

function parseJobQuery(prompt: string): { isJob: boolean; keyword?: string; location?: string } {
  const isConsultationOrQuestion = /(?:kenapa|mengapa|bagaimana|gimana|tips|cara|trik|interview|wawancara|cv|resume|gaji\s+ideal|menurut|opini)\b/i.test(prompt);
  if (isConsultationOrQuestion) return { isJob: false };

  const hasJobSearchIntent = /(?:cari(?:kan|in)?\s+(?:loker|lowongan|kerja)|info\s+(?:loker|lowongan)|daftar\s+loker|list\s+loker|spill\s+loker|ada\s+loker|lowongan\s+kerja\s+di|loker\s+(?:di|buat|posisi))/i.test(prompt);
  if (!hasJobSearchIntent) return { isJob: false };

  let location: string | undefined = undefined;
  const locMatch = prompt.match(/\b(jakarta|bandung|surabaya|yogyakarta|jogja|semarang|bali|medan|remote|wfh|wfo)\b/i);
  if (locMatch) {
    location = locMatch[1];
  }

  const cleaned = prompt
    .replace(/<@!?\d+>/g, "")
    .replace(/\b(maya|tolong|carikan|info|loker|lowongan|kerja|kerjaan|job|jobs|hiring|karir|career|dong|ada|di|yang|buat|posisi)\b/gi, "")
    .replace(/\b(jakarta|bandung|surabaya|yogyakarta|jogja|semarang|bali|medan|remote|wfh|wfo)\b/gi, "")
    .trim();

  const keyword = cleaned.length >= 2 ? cleaned : undefined;
  return { isJob: true, keyword, location };
}

function parseCourseQuery(prompt: string): { isCourse: boolean; topic?: string; platform?: string } {
  const isConsultationOrQuestion = /(?:kenapa|mengapa|bagaimana|gimana|apakah|apa\s+(?:bedanya|bagusnya)|menurut|mending|saran)\b/i.test(prompt);
  if (isConsultationOrQuestion) return { isCourse: false };

  const hasCourseSearchIntent = /(?:cari(?:kan|in)?\s+(?:kursus|course|pelatihan|bootcamp)|info\s+(?:kursus|course|pelatihan)|daftar\s+kursus|list\s+kursus|spill\s+kursus|rekomendasi\s+kursus|kursus\s+gratis|pelatihan\s+gratis)/i.test(prompt);
  if (!hasCourseSearchIntent) return { isCourse: false };

  let platform: string | undefined = undefined;
  const platMatch = prompt.match(/\b(google|aws|dicoding|coursera|harvard|microsoft|freecodecamp)\b/i);
  if (platMatch) {
    platform = platMatch[1];
  }

  const cleaned = prompt
    .replace(/<@!?\d+>/g, "")
    .replace(/\b(maya|tolong|carikan|info|kursus|course|courses|pelatihan|sertifikasi|bootcamp|dong|ada|yang|gratis|free|belajar)\b/gi, "")
    .replace(/\b(google|aws|dicoding|coursera|harvard|microsoft|freecodecamp)\b/gi, "")
    .trim();

  const topic = cleaned.length >= 2 ? cleaned : undefined;
  return { isCourse: true, topic, platform };
}

function parseOutfitQuery(prompt: string): { isOutfit: boolean; style?: string; gender?: "pria" | "wanita" | "unisex"; occasion?: string } {
  const isConsultationOrQuestion = /(?:kenapa|mengapa|apakah|cocok\s+gak|bagusan\s+mana|menurut|bagus\s+gak)\b/i.test(prompt);
  if (isConsultationOrQuestion) return { isOutfit: false };

  const hasOutfitIntent = /(?:rekomendasi\s+outfit|ide\s+outfit|cari(?:kan)?\s+outfit|spill\s+outfit|inspirasi\s+outfit|tren\s+outfit|gaya\s+outfit|ootd\s+(?:hari\s+ini|ngampus|kantor|hangout|cowok|cewek))/i.test(prompt);
  if (!hasOutfitIntent) return { isOutfit: false };

  let gender: "pria" | "wanita" | "unisex" | undefined = undefined;
  if (/\b(pria|cowok|laki|men|cowo)\b/i.test(prompt)) gender = "pria";
  else if (/\b(wanita|cewek|perempuan|women|cewe)\b/i.test(prompt)) gender = "wanita";

  let style: string | undefined = undefined;
  const styleMatch = prompt.match(/\b(korean|streetwear|smart\s*casual|old\s*money|minimalist|casual|formal)\b/i);
  if (styleMatch) style = styleMatch[1].replace(/\s+/g, " ");

  let occasion: string | undefined = undefined;
  const occMatch = prompt.match(/\b(kampus|kuliah|kantor|kerja|hangout|dating|kencan|pesta|kondangan|formal|santai)\b/i);
  if (occMatch) occasion = occMatch[1];

  return { isOutfit: true, style, gender, occasion };
}

function parseCurrencyQuery(prompt: string): boolean {
  const isConsultation = /(?:kenapa|mengapa|faktor|prediksi|analisis|masa\s+depan|menurut)\b/i.test(prompt);
  if (isConsultation) return false;

  return /(?:kurs\s+(?:hari\s+ini|valas|dollar|rupiah|usd|eur|jpy|mata\s+uang)|nilai\s+tukar|harga\s+dollar|cek\s+kurs|info\s+kurs)/i.test(prompt);
}


const event: BotEvent = {

  name: Events.MessageCreate,
  async execute(message: Message) {
    // Abaikan pesan dari bot
    if (message.author.bot || !message.guild || !message.channel.isTextBased()) return;

    try {
      const guildId = message.guild.id;
      // Track analytics event for message sent
      trackAnalyticsEvent(guildId, "MESSAGE_SENT").catch(() => {});

      // Pass message to Story Manager if sent in story channel
      await handleStoryWordMessage(message);

      // Pass message to Pantun Manager if sent in pantun channel
      await handlePantunMessage(message);

      // Direct text command trigger: /card, !card, .card (@user, username, id, or reply)
      const trimmedContent = message.content.trim();
      if (/^(?:\/card|!card|\.card)(?:\s+.*)?$/i.test(trimmedContent)) {
        if ("sendTyping" in message.channel) {
          await message.channel.sendTyping().catch(() => {});
        }

        let targetUser = message.author;

        // 1. Mentions (prioritize non-bot mentions)
        const nonBotMention = message.mentions.users.filter(u => !u.bot).first();
        if (nonBotMention) {
          targetUser = nonBotMention;
        } else if (message.mentions.users.first()) {
          targetUser = message.mentions.users.first()!;
        } else if (message.reference?.messageId) {
          // 2. Reply to another user's message
          try {
            const refMsg = await message.channel.messages.fetch(message.reference.messageId);
            if (refMsg?.author) targetUser = refMsg.author;
          } catch (_) {}
        } else {
          // 3. Username or User ID argument (e.g. "/card amubhya" atau "/card 123456789")
          const args = trimmedContent.split(/\s+/).slice(1).join(" ").trim().replace(/^@/, "");
          if (args) {
            try {
              const members = await message.guild.members.fetch({ query: args, limit: 1 });
              const foundMember = members.first();
              if (foundMember) {
                targetUser = foundMember.user;
              } else {
                const byId = await message.guild.members.fetch(args).catch(() => null);
                if (byId) targetUser = byId.user;
              }
            } catch (_) {}
          }
        }

        try {
          const payload = await buildMemberCardPayload(message.guild, targetUser, message.author);
          await message.reply(payload);
          return;
        } catch (cardErr) {
          logger.error("Gagal mengirim kartu member via text command:", cardErr);
          await message.reply({ content: "❌ Gagal memproses kartu member." }).catch(() => {});
          return;
        }
      }

      // Fetch server configuration
      const config = await prisma.guildConfig.findUnique({
        where: { guildId }
      });

      const bannedWordsStr = config?.bannedWords || "anjing,babi,bangsat,kontol,memek,goblok,tolol,bajingan";
      const maxStrikes = config?.maxStrikes ?? 3;
      const muteDuration = config?.muteDuration ?? 10;

      const bannedWords = bannedWordsStr.split(",").map(w => w.trim().toLowerCase()).filter(Boolean);
      const contentLower = message.content.toLowerCase();
      
      const containsBannedWord = bannedWords.some(word => 
        new RegExp(`\\b${word}\\b`, "i").test(contentLower)
      );

      if (containsBannedWord) {
        const channel = message.channel as TextChannel;

        // Hapus pesan pelanggar
        if (message.deletable) {
          await message.delete();
        }

        // Catat strike ke database
        const strike = await prisma.warnLog.create({
          data: {
            userId: message.author.id,
            guildId,
            reason: `Automod: Menggunakan kata kasar/banned word`,
            moderatorId: message.client.user?.id || "AUTOMOD"
          }
        });

        // Hitung total strike user tersebut
        const strikeCount = await prisma.warnLog.count({
          where: {
            userId: message.author.id,
            guildId
          }
        });

        const warningEmbed = createEmbed.warning(
          "Automod - Kata Kasar Terdeteksi",
          `Halo ${message.author}, pesan Anda telah dihapus karena mengandung kata-kata kasar.\n\n` +
          `**Pelanggaran Anda:** ${strike.reason}\n` +
          `**Total Strike:** \`${strikeCount}/${maxStrikes}\`\n\n` +
          `*Peringatan: Mencapai ${maxStrikes} strike dapat mengakibatkan tindakan timeout.*`
        );

        const replyMsg = await channel.send({ embeds: [warningEmbed] });
        
        // Hapus bot warning message setelah 10 detik agar chat tetap bersih
        setTimeout(() => {
          replyMsg.delete().catch(() => {});
        }, 10000);

        logger.info(`Automod: Memberikan strike ke ${message.author.tag} di guild ${guildId} (Total: ${strikeCount})`);

        // Kirim moderation log
        await logModeration(
          message.guild,
          "AUTOMOD_WARN",
          { id: message.author.id, tag: message.author.tag },
          { id: message.client.user?.id || "AUTOMOD", tag: "Automod 🤖" },
          strike.reason,
          `Total Strike: ${strikeCount}/${maxStrikes}\nKonten pesan: "${message.content.substring(0, 100)}"`
        );

        // Tindakan otomatis jika melebihi maxStrikes
        if (strikeCount >= maxStrikes) {
          const member = message.member;
          if (member && member.moderatable) {
            // Berikan timeout selama muteDuration menit
            await member.timeout(muteDuration * 60_000, `Automod: Melebihi ${maxStrikes} kali strike kata kasar`);
            
            const timeoutEmbed = createEmbed.error(
              "Muted Secara Otomatis",
              `${member} telah di-mute (timeout) selama ${muteDuration} menit karena melanggar aturan kata kasar sebanyak ${maxStrikes} kali atau lebih.`
            );
            await channel.send({ embeds: [timeoutEmbed] });

            // Kirim moderation log mute
            await logModeration(
              message.guild,
              "AUTOMOD_MUTE",
              { id: member.user.id, tag: member.user.tag },
              { id: message.client.user?.id || "AUTOMOD", tag: "Automod 🤖" },
              `Melebihi ${maxStrikes} kali strike kata kasar`,
              `Di-mute (timeout) selama ${muteDuration} menit`
            );
          }
        }
      }

      // Check if message is a mention to Maya or a reply to Maya's message
      const botId = message.client.user?.id;
      const isMentioned = botId && message.mentions.users.has(botId) && !message.mentions.everyone;
      let isReplyToMaya = false;
      if (message.reference?.messageId) {
        try {
          const refMsg = await message.channel.messages.fetch(message.reference.messageId);
          if (refMsg && refMsg.author.id === botId) {
            isReplyToMaya = true;
          }
        } catch (_) {}
      }

      if (isMentioned || isReplyToMaya) {
        // Send typing status
        if ("sendTyping" in message.channel) {
          await message.channel.sendTyping().catch(() => {});
        }

        const rawContent = message.content.replace(new RegExp(`<@!?${botId}>`, "g"), "").trim();
        const userPrompt = rawContent || "halo maya!";

        // 1. Natural Mention Intent: Leave / Disconnect Voice Channel
        if (
          /(?:keluar\s+voice|leave\s+voice|keluar\s+vc|leave\s+vc|dc\s+dari\s+voice|disconnect\s+voice|dc\s+voice|keluar\s+room|dc\s+dulu|cabut\s+dari\s+voice|disconnect\s+dari\s+voice|pamit\s+dari\s+voice|keluar\s+dong)/i.test(userPrompt) ||
          /^(?:keluar\s+voice|leave\s+voice|dc|disconnect|cabut|pamit)$/i.test(userPrompt.toLowerCase())
        ) {
          const session = voiceChatManager.getSession(guildId);
          if (session) {
            await voiceChatManager.leave(guildId, true);
            await message.reply({
              content: "Siap, Maya izin keluar dari Voice Channel dulu ya! Sampai ketemu lagi guys! 👋✨",
              allowedMentions: { repliedUser: true }
            }).catch(() => {});
            return;
          } else {
            await message.reply({
              content: "Maya lagi nggak ada di Voice Channel kok! Kalau mau ajak ngobrol di voice, panggil Maya ya! 🎙️",
              allowedMentions: { repliedUser: true }
            }).catch(() => {});
            return;
          }
        }

        // 2. Natural Mention Intent: Join Voice Channel
        if (
          /(?:masuk\s+voice|join\s+voice|masuk\s+vc|join\s+vc|sini\s+masuk|gabung\s+voice|gabung\s+vc|masuk\s+room|join\s+room|sini\s+gabung)/i.test(userPrompt)
        ) {
          const memberVoice = message.member?.voice?.channel;
          if (memberVoice) {
            await voiceChatManager.join(memberVoice);
            await message.reply({
              content: `Siap! Maya meluncur gabung ke Voice Channel **${memberVoice.name}**! 🚀🎙️`,
              allowedMentions: { repliedUser: true }
            }).catch(() => {});
            return;
          } else {
            await message.reply({
              content: "Kamu belum masuk ke Voice Channel nih! Masuk ke salah satu voice channel dulu ya, nanti Maya langsung join nemenin! 🎧",
              allowedMentions: { repliedUser: true }
            }).catch(() => {});
            return;
          }
        }

        // 3. Natural Mention Intent: Search Journal / Paper / Academic Articles
        const academicQuery = parseAcademicQuery(userPrompt);
        if (academicQuery.isAcademic && academicQuery.topic.length >= 2) {
          const papers = await academicSearchService.search(academicQuery.topic, {
            fromYear: academicQuery.fromYear,
            toYear: academicQuery.toYear,
            limit: 4,
          });

          if (papers.length > 0) {
            const { embed, components } = createJournalEmbed(
              papers,
              academicQuery.topic,
              { fromYear: academicQuery.fromYear, toYear: academicQuery.toYear, limit: 4 },
              message.client.user?.displayAvatarURL()
            );

            await message.reply({
              content: `Ini dia daftar jurnal & paper ilmiah terverifikasi yang Maya temukan buat kamu: 📚✨`,
              embeds: [embed],
              components,
              allowedMentions: { repliedUser: true },
            }).catch(() => {});
            return;
          } else {
            const notFoundEmbed = createEmbed.error(
              "Jurnal Tidak Ditemukan",
              `Tidak ditemukan jurnal atau paper ilmiah terverifikasi untuk topik **"${academicQuery.topic}"**.\n\n💡 *Tips: Coba gunakan kata kunci bahasa Inggris yang lebih umum atau perlebar rentang tahun pencarian.*`
            );
            await message.reply({
              embeds: [notFoundEmbed],
              allowedMentions: { repliedUser: true },
            }).catch(() => {});
            return;
          }
        }

        // 4. Natural Mention Intent: Search Scholarships (Beasiswa Luar Negeri / Nasional)
        const schQuery = parseScholarshipQuery(userPrompt);
        if (schQuery.isScholarship) {
          const items = await searchScholarships({
            scope: schQuery.scope,
            level: schQuery.level,
            keyword: schQuery.keyword
          });
          const { embed, components } = createScholarshipEmbed(
            items,
            { scope: schQuery.scope, level: schQuery.level, keyword: schQuery.keyword },
            message.client.user?.displayAvatarURL()
          );
          await message.reply({
            embeds: [embed],
            components,
            allowedMentions: { repliedUser: true }
          }).catch(() => {});
          return;
        }

        // 5. Natural Mention Intent: Search News (Berita Nasional / Internasional / Teknologi / Bisnis)
        const newsQuery = parseNewsQuery(userPrompt);
        if (newsQuery.isNews) {
          const newsItems = await fetchIndonesianNews(newsQuery.category);
          const { embed, components } = createNewsEmbed(
            newsItems,
            newsQuery.category,
            message.client.user?.displayAvatarURL()
          );
          await message.reply({
            embeds: [embed],
            components,
            allowedMentions: { repliedUser: true }
          }).catch(() => {});
          return;
        }

        // 6. Natural Mention Intent: Search Job Vacancies (Loker)
        const jobQuery = parseJobQuery(userPrompt);
        if (jobQuery.isJob) {
          const pos = jobQuery.keyword || "Staff";
          const loc = jobQuery.location || "Indonesia";
          const jobItems = await searchJobs(pos, loc);
          const { embed, components } = createJobEmbed(
            jobItems,
            { position: pos, location: loc },
            message.client.user?.displayAvatarURL()
          );
          await message.reply({
            embeds: [embed],
            components,
            allowedMentions: { repliedUser: true }
          }).catch(() => {});
          return;
        }

        // 7. Natural Mention Intent: Search Free Courses & Certifications (Kursus)
        const courseQuery = parseCourseQuery(userPrompt);
        if (courseQuery.isCourse) {
          const courseItems = await searchFreeCourses(courseQuery.topic || "", courseQuery.platform || "");
          const { embed, components } = createCourseEmbed(
            courseItems,
            courseQuery.topic || "Semua Materi",
            message.client.user?.displayAvatarURL()
          );
          await message.reply({
            embeds: [embed],
            components,
            allowedMentions: { repliedUser: true }
          }).catch(() => {});
          return;
        }

        // 8. Natural Mention Intent: Outfit Trends & OOTD Styling
        const outfitQuery = parseOutfitQuery(userPrompt);
        if (outfitQuery.isOutfit) {
          const outfitItems = await searchOutfitTrends(userPrompt);
          const { embed, components } = createOutfitEmbed(
            outfitItems,
            userPrompt,
            message.client.user?.displayAvatarURL()
          );
          await message.reply({
            embeds: [embed],
            components,
            allowedMentions: { repliedUser: true }
          }).catch(() => {});
          return;
        }

        // 9. Natural Mention Intent: Currency Rates / Kurs Valas (Live Data)
        if (parseCurrencyQuery(userPrompt)) {
          const rateReport = await fetchCurrencyRates();
          const { embed, components } = createCurrencyEmbed(
            rateReport,
            message.client.user?.displayAvatarURL()
          );
          await message.reply({
            embeds: [embed],
            components,
            allowedMentions: { repliedUser: true }
          }).catch(() => {});
          return;
        }


        // Fetch recent conversation history with this user for natural context
        const dbHistory = await prisma.aiChatMessage.findMany({
          where: { guildId, userId: message.author.id },
          orderBy: { createdAt: "desc" },
          take: 8
        });

        const historyMessages = dbHistory.reverse().map(msg => ({
          role: msg.role,
          content: msg.content
        }));

        // Extract other mentioned members for live context awareness ONLY when asking about whereabouts
        let contextAddition = "";
        const isAskingWhereabouts = /(kemana|ke\s+mana|di\s+mana|dimana|lagi\s+apa|sedang\s+apa|ada\s+gak|online\s+gak|lagi\s+ngapain|nyari|nyariin)\b/i.test(userPrompt);
        const otherMentions = message.mentions.users.filter(u => u.id !== botId);

        if (isAskingWhereabouts && otherMentions.size > 0 && message.guild) {
          const contextParts: string[] = [];
          for (const [targetId, targetUser] of otherMentions) {
            const targetMember = message.guild.members.cache.get(targetId) || await message.guild.members.fetch(targetId).catch(() => null);
            const targetName = targetMember?.displayName || targetUser.displayName || targetUser.username;
            const inVoice = targetMember?.voice?.channel 
              ? `sedang online dan nongkrong di Voice Channel "${targetMember.voice.channel.name}"` 
              : "sedang tidak berada di Voice Channel manapun";
            contextParts.push(`Status Target ${targetName}: ${inVoice}`);
          }
          if (contextParts.length > 0) {
            contextAddition = `\n[Info Live Server Discord: ${contextParts.join("; ")}]`;
          }
        }

        const personality = config?.aiPersonality || undefined;
        const preferredModel = config?.aiModel || undefined;
        const authorName = message.member?.displayName || message.author.displayName || message.author.username;
        const promptWithUser = `${authorName}: ${userPrompt}${contextAddition}`;

        const aiResponse = await askNvidia(promptWithUser, personality, historyMessages, preferredModel);
        const cleanResponse = aiResponse
          .replace(/^(\[User:.*?\]|\bMaya:\s*|\bAI:\s*)/i, "")
          .trim();

        if (cleanResponse) {
          // Save to memory
          await prisma.aiChatMessage.createMany({
            data: [
              {
                guildId,
                userId: message.author.id,
                username: message.author.username,
                role: "user",
                content: userPrompt
              },
              {
                guildId,
                userId: message.author.id,
                username: message.author.username,
                role: "assistant",
                content: cleanResponse
              }
            ]
          }).catch(() => {});

          await message.reply({
            content: cleanResponse.length > 2000 ? cleanResponse.substring(0, 1997) + "..." : cleanResponse,
            allowedMentions: { repliedUser: true }
          }).catch(() => {});
        }
      }
    } catch (error) {
      logger.error("Error pada event messageCreate (Chat/Automod):", error);
    }
  }
};

export default event;
