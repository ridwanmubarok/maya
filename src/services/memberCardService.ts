import sharp from "sharp";
import QRCode from "qrcode";
import { GuildMember } from "discord.js";
import path from "path";
import fs from "fs";
import { logger } from "../utils/logger";

export interface MemberCardOptions {
  member: GuildMember;
  memberNumber: number;
}

// Dimensi template asli (rasio 2:3 yang pas dengan artwork 682x1024)
const CARD_WIDTH = 1364;
const CARD_HEIGHT = 2048;

function getBackgroundPath(): string {
  const possiblePaths = [
    // Jalur di dalam dist/assets (hasil build copy-assets)
    path.join(__dirname, "../assets", "checkpoint-card.png"),
    path.join(__dirname, "../assets", "checkpoint-card.jpg"),
    path.join(process.cwd(), "dist", "assets", "checkpoint-card.png"),
    path.join(process.cwd(), "dist", "assets", "checkpoint-card.jpg"),

    // Jalur di dalam root assets/ (development / ts-node / container root)
    path.join(process.cwd(), "assets", "checkpoint-card.png"),
    path.join(process.cwd(), "assets", "checkpoint-card.jpg"),
    path.join(__dirname, "../../assets", "checkpoint-card.png"),
    path.join(__dirname, "../../assets", "checkpoint-card.jpg"),
    path.join(__dirname, "../../../assets", "checkpoint-card.png"),
    path.join(__dirname, "../../../assets", "checkpoint-card.jpg")
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`Template aset kartu checkpoint-card tidak ditemukan di folder assets/. Jalur yang dicek: ${possiblePaths.join(", ")}`);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatMemberNumber(number: number): string {
  return `#${number.toString().padStart(3, "0")}`;
}

function formatJoinDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date).toUpperCase();
}

async function createAvatar(member: GuildMember): Promise<Buffer> {
  const avatarSize = 196;
  const r = avatarSize / 2;

  // Masker lingkaran bulat sempurna
  const circleMask = Buffer.from(`
    <svg width="${avatarSize}" height="${avatarSize}">
      <circle cx="${r}" cy="${r}" r="${r}" fill="white"/>
    </svg>
  `);

  // Ring neon cyan halus yang membalut avatar
  const borderRing = Buffer.from(`
    <svg width="${avatarSize}" height="${avatarSize}">
      <circle cx="${r}" cy="${r}" r="${r - 1.5}" fill="none" stroke="#00E5FF" stroke-width="3" stroke-opacity="0.9"/>
    </svg>
  `);

  try {
    const avatarUrl = member.displayAvatarURL({
      extension: "png",
      size: 256,
      forceStatic: true
    });

    const response = await fetch(avatarUrl);
    if (!response.ok) {
      throw new Error(`Fetch avatar gagal: HTTP ${response.status}`);
    }

    const rawBuffer = Buffer.from(await response.arrayBuffer());

    return await sharp(rawBuffer)
      .resize(avatarSize, avatarSize, { fit: "cover" })
      .composite([
        { input: circleMask, blend: "dest-in" },
        { input: borderRing, blend: "over" }
      ])
      .png()
      .toBuffer();
  } catch (err) {
    logger.warn(`Gagal memuat avatar member ${member.id}, menggunakan fallback avatar default:`, err);

    // Fallback avatar berdesain futuristik dan terpotong bulat sempurna
    const fallbackSvg = Buffer.from(`
      <svg width="${avatarSize}" height="${avatarSize}" viewBox="0 0 ${avatarSize} ${avatarSize}">
        <defs>
          <clipPath id="circleView">
            <circle cx="${r}" cy="${r}" r="${r}"/>
          </clipPath>
          <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#5865F2"/>
            <stop offset="100%" stop-color="#23272A"/>
          </linearGradient>
        </defs>
        <g clip-path="url(#circleView)">
          <rect width="${avatarSize}" height="${avatarSize}" fill="url(#bgGrad)"/>
          <circle cx="${r}" cy="${avatarSize * 0.38}" r="${avatarSize * 0.22}" fill="#FFFFFF"/>
          <ellipse cx="${r}" cy="${avatarSize * 0.88}" rx="${avatarSize * 0.38}" ry="${avatarSize * 0.28}" fill="#FFFFFF"/>
        </g>
        <circle cx="${r}" cy="${r}" r="${r - 1.5}" fill="none" stroke="#00E5FF" stroke-width="3" stroke-opacity="0.9"/>
      </svg>
    `);

    return sharp(fallbackSvg).png().toBuffer();
  }
}

async function createQRCode(member: GuildMember): Promise<Buffer> {
  // Ukuran presisi agar pas di dalam bracket reticle bawaan template tanpa meluber/melebihi batas
  const qrSize = 230;
  // Link yang langsung membuka profil Discord pengguna saat discan
  const qrData = `https://discord.com/users/${member.id}`;

  const rawQr = await QRCode.toBuffer(qrData, {
    type: "png",
    width: qrSize,
    margin: 1,
    errorCorrectionLevel: "H",
    color: {
      dark: "#FFFFFF",
      light: "#050A14" // Warna gelap serasi dengan template background
    }
  });

  // Buat sudut rounded halus pada QR code
  const qrRoundedMask = Buffer.from(`
    <svg width="${qrSize}" height="${qrSize}">
      <rect width="${qrSize}" height="${qrSize}" rx="8" fill="white"/>
    </svg>
  `);

  return sharp(rawQr)
    .resize(qrSize, qrSize)
    .composite([{ input: qrRoundedMask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

/**
 * Hitung nomor urut member bergabung di server (berdasarkan join date, non-bot)
 */
export async function getMemberNumber(guild: { members: { fetch: () => Promise<any> }; memberCount: number }, targetUserId: string): Promise<number> {
  try {
    const allMembers = await guild.members.fetch();
    const sortedMembers = Array.from(allMembers.values() as Iterable<GuildMember>)
      .filter(m => !m.user?.bot)
      .sort((a, b) => (a.joinedTimestamp || 0) - (b.joinedTimestamp || 0));
    const memberIdx = sortedMembers.findIndex(m => m.id === targetUserId);
    if (memberIdx !== -1) {
      return memberIdx + 1;
    }
    return guild.memberCount || 1;
  } catch (err) {
    logger.warn(`Gagal menghitung member number untuk user ${targetUserId}:`, err);
    return guild.memberCount || 1;
  }
}

export async function generateMemberCard({
  member,
  memberNumber
}: MemberCardOptions): Promise<Buffer> {
  const backgroundPath = getBackgroundPath();

  const displayName = member.displayName || member.user.displayName || member.user.username;
  const userTag = `@${member.user.username}`;
  const discordId = member.id;

  const joinDate = member.joinedAt
    ? formatJoinDate(member.joinedAt)
    : "UNKNOWN";

  const memberId = formatMemberNumber(memberNumber);

  // Penyesuaian ukuran font dinamis jika nama panjang
  const nameFontSize = displayName.length > 16 ? 38 : (displayName.length > 12 ? 42 : 48);

  const [avatar, qrCode] = await Promise.all([
    createAvatar(member),
    createQRCode(member)
  ]);

  // SVG Overlay yang dipetakan secara presisi ke template checkpoint card
  const overlay = `
  <svg
    width="${CARD_WIDTH}"
    height="${CARD_HEIGHT}"
    viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}"
    xmlns="http://www.w3.org/2000/svg"
  >
    <!-- DISPLAY NAME -->
    <text
      x="340"
      y="1388"
      fill="#FFFFFF"
      font-family="system-ui, -apple-system, sans-serif"
      font-size="${nameFontSize}"
      font-weight="800"
      letter-spacing="1"
    >
      ${escapeXml(displayName)}
    </text>

    <!-- USER TAG & DISCORD ID -->
    <text
      x="342"
      y="1438"
      fill="#7CB8FF"
      font-family="monospace"
      font-size="24"
      font-weight="600"
      letter-spacing="1.5"
    >
      ${escapeXml(userTag)} <tspan fill="#436799">• ID: ${escapeXml(discordId)}</tspan>
    </text>

    <!-- MEMBER NUMBER BADGE (Cyber Plate di sebelah kanan bar nama) -->
    <rect
      x="1010"
      y="1345"
      width="225"
      height="74"
      rx="10"
      fill="#060D1A"
      fill-opacity="0.94"
      stroke="#00E5FF"
      stroke-opacity="0.8"
      stroke-width="2"
    />
    <text
      x="1122"
      y="1370"
      text-anchor="middle"
      fill="#6B8BAE"
      font-family="monospace"
      font-size="14"
      font-weight="700"
      letter-spacing="3"
    >
      MEMBER NO.
    </text>
    <text
      x="1122"
      y="1408"
      text-anchor="middle"
      fill="#00E5FF"
      font-family="monospace"
      font-size="38"
      font-weight="800"
      letter-spacing="3"
    >
      ${escapeXml(memberId)}
    </text>

    <!-- JOIN DATE (Tepat di dalam pill kapsul JOINED) -->
    <text
      x="350"
      y="1665"
      text-anchor="middle"
      fill="#DCEBFF"
      font-family="monospace"
      font-size="30"
      font-weight="700"
      letter-spacing="3"
    >
      ${escapeXml(joinDate)}
    </text>
  </svg>
  `;

  return sharp(backgroundPath)
    .resize(CARD_WIDTH, CARD_HEIGHT, { fit: "cover" })
    .composite([
      {
        input: avatar,
        left: 72,
        top: 1308
      },
      {
        input: qrCode,
        left: 1006,
        top: 1561
      },
      {
        input: Buffer.from(overlay),
        left: 0,
        top: 0
      }
    ])
    .png({ compressionLevel: 8 })
    .toBuffer();
}
