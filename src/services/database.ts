import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";

export const prisma = new PrismaClient();

export async function connectDatabase() {
  try {
    await prisma.$connect();
    logger.info("Database PostgreSQL berhasil terhubung melalui Prisma!");
  } catch (error) {
    logger.warn("Peringatan: Gagal terhubung ke remote PostgreSQL database. Berjalan dalam mode degradasi/offline fallback:", error);
  }
}
