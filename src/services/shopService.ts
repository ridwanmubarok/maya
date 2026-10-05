import { prisma } from "./database";
import { logger } from "../utils/logger";
import { Client, EmbedBuilder } from "discord.js";
import { canUserRedeemShop, recordShopRedemption, releaseShopRedemption } from "./monthlySeasonManager";

export interface CreateShopItemInput {
  guildId: string;
  title: string;
  description: string;
  priceRtk: number;
  category?: string;
  imageUrl?: string;
}

/**
 * Pastikan ada produk E-Wallet nominal bebas di toko guild
 */
export async function ensureDefaultEwalletItem(guildId: string) {
  try {
    const existing = await prisma.shopItem.findFirst({
      where: {
        guildId,
        active: true,
        OR: [
          { category: "EWALLET" },
          { title: { contains: "E-Wallet", mode: "insensitive" } },
          { title: { contains: "Ewallet", mode: "insensitive" } },
        ]
      }
    });

    if (!existing) {
      await prisma.shopItem.create({
        data: {
          guildId,
          title: "💳 Saldo E-Wallet (DANA / GoPay / OVO / ShopeePay)",
          description: "Tukarkan koin RTK kamu ke saldo E-Wallet! Nominal bebas diisi saat checkout (Minimal 10.000 RTK s.d. 50.000 RTK).",
          priceRtk: 10000,
          category: "EWALLET",
          imageUrl: "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=800&auto=format&fit=crop&q=80",
          active: true
        }
      });
    }
  } catch (err) {
    logger.error(`Error ensuring default ewallet item for guild ${guildId}:`, err);
  }
}

/**
 * Ambil daftar produk toko aktif untuk guild (Murni dari Database)
 */
export async function getGuildShopItems(guildId: string) {
  try {
    await ensureDefaultEwalletItem(guildId);
    const items = await prisma.shopItem.findMany({
      where: { guildId, active: true },
      orderBy: { id: "asc" }
    });
    return items;
  } catch (error) {
    logger.error(`Error fetching shop items for guild ${guildId}:`, error);
    return [];
  }
}

/**
 * Tambah produk toko baru di database
 */
export async function createShopItem(input: CreateShopItemInput) {
  return await prisma.shopItem.create({
    data: {
      guildId: input.guildId,
      title: input.title,
      description: input.description,
      priceRtk: Number(input.priceRtk),
      category: input.category || "GAME",
      imageUrl: input.imageUrl || null
    }
  });
}

/**
 * Edit / Update produk toko
 */
export async function updateShopItem(
  id: number,
  guildId: string,
  data: { title?: string; description?: string; priceRtk?: number; category?: string; imageUrl?: string }
) {
  return await prisma.shopItem.updateMany({
    where: { id, guildId },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.priceRtk !== undefined && { priceRtk: Number(data.priceRtk) }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl || null })
    }
  });
}

/**
 * Hapus (nonaktifkan) produk toko
 */
export async function deleteShopItem(id: number, guildId: string) {
  return await prisma.shopItem.updateMany({
    where: { id, guildId },
    data: { active: false }
  });
}

/**
 * Proses Pembelian Produk Toko oleh Member Discord (Mendukung Fixed & Custom Amount E-Wallet)
 */
export async function processShopPurchase(
  guildId: string,
  userId: string,
  username: string,
  itemId: number,
  targetInput: string,
  customAmount?: number
) {
  const item = await prisma.shopItem.findUnique({ where: { id: itemId } });
  if (!item || !item.active) {
    return { success: false, reason: "Produk tidak ditemukan atau sudah tidak aktif." };
  }

  const isEwallet = item.category === "EWALLET" || /e-?wallet|dana|gopay|ovo|shopeepay/i.test(item.title);
  let finalPrice = item.priceRtk;

  if (isEwallet) {
    if (customAmount === undefined || isNaN(customAmount) || customAmount <= 0) {
      return { success: false, reason: "Harap masukkan jumlah nominal koin RTK yang valid untuk penukaran E-Wallet." };
    }
    if (customAmount < 10000) {
      return { success: false, reason: "Batas minimal penukaran saldo E-Wallet adalah **10.000 RTK**." };
    }
    if (customAmount > 50000) {
      return { success: false, reason: "Batas maksimal plafon penukaran hadiah adalah **50.000 RTK** per bulan." };
    }
    finalPrice = customAmount;
  }

  // Validasi Kuota Bulanan (Maks 2 orang), Cooldown, dan Syarat Keaktifan
  const redeemCheck = await canUserRedeemShop(guildId, userId);
  if (!redeemCheck.canRedeem) {
    return {
      success: false,
      reason: redeemCheck.reason || "Kamu tidak dapat menukarkan hadiah bulan ini."
    };
  }

  // Cek saldo user
  const record = await prisma.triviaScore.findUnique({
    where: { guildId_userId: { guildId, userId } }
  });

  const userBalance = record?.score ?? 0;
  if (userBalance < finalPrice) {
    return {
      success: false,
      reason: `Saldo kamu saat ini **${userBalance.toLocaleString("id-ID")} RTK**, tidak cukup untuk menukarkan **${item.title}** sebesar **${finalPrice.toLocaleString("id-ID")} RTK**.`
    };
  }

  // Potong saldo RTK
  await prisma.triviaScore.update({
    where: { id: record!.id },
    data: { score: userBalance - finalPrice }
  });

  // Catat partisipasi redeem musim ini
  await recordShopRedemption(guildId, userId);

  // Buat order TRX
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomCode = Math.floor(1000 + Math.random() * 9000);
  const orderId = `TRX-${dateStr}-${randomCode}`;
  const finalTitle = isEwallet ? `${item.title} (Rp ${finalPrice.toLocaleString("id-ID")})` : item.title;

  const order = await prisma.shopOrder.create({
    data: {
      orderId,
      guildId,
      userId,
      username,
      itemTitle: finalTitle,
      priceRtk: finalPrice,
      targetInput,
      status: "PENDING"
    }
  });

  logger.info(`Shop: Order ${orderId} created by ${username} (${userId}) for ${finalTitle} - ${finalPrice} RTK`);

  return {
    success: true,
    orderId: order.orderId,
    itemTitle: item.title,
    priceRtk: item.priceRtk,
    remainingBalance: userBalance - item.priceRtk
  };
}

/**
 * Ambil antrean pesanan toko untuk Web Dashboard
 */
export async function getGuildOrders(guildId: string) {
  try {
    return await prisma.shopOrder.findMany({
      where: { guildId },
      orderBy: { createdAt: "desc" },
      take: 50
    });
  } catch (error) {
    logger.error(`Error fetching shop orders for ${guildId}:`, error);
    return [];
  }
}

/**
 * Disetujui oleh Admin -> Kirim DM Notifikasi ke Member
 */
export async function approveShopOrder(client: Client, orderId: string, notes?: string) {
  const order = await prisma.shopOrder.findUnique({ where: { orderId } });
  if (!order || order.status !== "PENDING") {
    throw new Error("Pesanan tidak ditemukan atau sudah diproses.");
  }

  const updated = await prisma.shopOrder.update({
    where: { orderId },
    data: {
      status: "COMPLETED",
      notes: notes || "Disetujui oleh Admin"
    }
  });

  // Kirim DM Notifikasi ke Member
  try {
    const user = await client.users.fetch(order.userId).catch(() => null);
    if (user) {
      const embed = new EmbedBuilder()
        .setTitle("🎉 Pesanan Toko Berhasil Diproses!")
        .setDescription(
          `Halo **${order.username}**, pesanan toko kamu telah sukses diproses oleh Admin!\n\n` +
          `📦 **Produk**: ${order.itemTitle}\n` +
          `🏷️ **Kode TRX**: \`${order.orderId}\`\n` +
          `📝 **Catatan Admin**: ${notes || "Terima kasih telah berbelanja di Toko Server!"}`
        )
        .setColor("#10B981")
        .setTimestamp();

      await user.send({ embeds: [embed] }).catch(() => {});
    }
  } catch (e) {
    logger.error(`Failed sending DM notification to ${order.userId}:`, e);
  }

  return updated;
}

/**
 * Ditolak oleh Admin -> Auto Refund RTK ke Member
 */
export async function rejectShopOrder(client: Client, orderId: string, reason?: string) {
  const order = await prisma.shopOrder.findUnique({ where: { orderId } });
  if (!order || order.status !== "PENDING") {
    throw new Error("Pesanan tidak ditemukan atau sudah diproses.");
  }

  // Refund RTK ke database
  const record = await prisma.triviaScore.findUnique({
    where: { guildId_userId: { guildId: order.guildId, userId: order.userId } }
  });

  if (record) {
    await prisma.triviaScore.update({
      where: { id: record.id },
      data: { score: record.score + order.priceRtk }
    });
  } else {
    await prisma.triviaScore.create({
      data: {
        guildId: order.guildId,
        userId: order.userId,
        username: order.username,
        score: order.priceRtk,
        dailyScore: 0
      }
    });
  }

  const updated = await prisma.shopOrder.update({
    where: { orderId },
    data: {
      status: "REFUNDED",
      notes: reason || "Ditolak oleh Admin (Koin RTK dikembalikan)"
    }
  });

  // Lepaskan kuota pemenang bulanan agar slot dapat digunakan kembali
  await releaseShopRedemption(order.guildId, order.userId);

  // Kirim DM Notifikasi ke Member
  try {
    const user = await client.users.fetch(order.userId).catch(() => null);
    if (user) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Pesanan Toko Ditolak & Koin Dikembalikan")
        .setDescription(
          `Halo **${order.username}**, pesanan \`${order.itemTitle}\` tidak dapat diproses.\n\n` +
          `💰 Saldo **+${order.priceRtk} RTK** telah otomatis dikembalikan ke dompet kamu.\n` +
          `📝 **Alasan Penolakan**: ${reason || "Data ID Target tidak ditemukan/salah."}`
        )
        .setColor("#EF4444")
        .setTimestamp();

      await user.send({ embeds: [embed] }).catch(() => {});
    }
  } catch (e) {
    logger.error(`Failed sending DM reject notification to ${order.userId}:`, e);
  }

  return updated;
}
