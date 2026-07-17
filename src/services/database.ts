import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";

export const prisma = new PrismaClient();

export async function connectDatabase() {
  try {
    await prisma.$connect();
    logger.info("Database PostgreSQL berhasil terhubung melalui Prisma!");
  } catch (error) {
    logger.error("Gagal terhubung ke database:", error);
    process.exit(1);
  }
}
