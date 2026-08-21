import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { logger } from "../utils/logger";

const s3Endpoint = process.env.S3_ENDPOINT || "http://154.26.129.168:8333";
const s3Region = process.env.S3_REGION || "us-east-1";
const s3AccessKey = process.env.S3_ACCESS_KEY || "X9I88SS0Z6GFYHCSV15A";
const s3SecretKey = process.env.S3_SECRET_KEY || "ZZKkS4bF4dg/RfAjNlKNpwLAu1/p8byfQbu8aCqQ";
const s3Bucket = process.env.S3_BUCKET || "the-checkpoint";
const s3PublicBaseUrl = process.env.S3_PUBLIC_BASE_URL || `${s3Endpoint}/${s3Bucket}`;

const s3Client = new S3Client({
  endpoint: s3Endpoint,
  region: s3Region,
  credentials: {
    accessKeyId: s3AccessKey,
    secretAccessKey: s3SecretKey
  },
  forcePathStyle: true // Needed for SeaweedFS / MinIO S3 compatibility
});

/**
 * Upload a raw buffer to SeaweedFS S3
 */
export async function uploadBufferToS3(
  buffer: Buffer,
  key: string,
  contentType: string = "image/png"
): Promise<string> {
  try {
    const command = new PutObjectCommand({
      Bucket: s3Bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: "public-read"
    });

    await s3Client.send(command);

    const publicUrl = `${s3PublicBaseUrl.replace(/\/+$/, "")}/${key}`;
    logger.info(`StorageService: Successfully uploaded ${key} to S3 (${publicUrl})`);
    return publicUrl;
  } catch (error) {
    logger.error(`StorageService: Error uploading ${key} to SeaweedFS S3:`, error);
    throw error;
  }
}

/**
 * Upload a Base64 encoded image string to SeaweedFS S3
 */
export async function uploadBase64ToS3(
  base64String: string,
  folder: string = "roblox/photos",
  extension: string = "png"
): Promise<string> {
  // Strip metadata header if present (e.g. data:image/png;base64,...)
  let cleanBase64 = base64String.trim();
  let contentType = `image/${extension}`;

  const match = cleanBase64.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (match) {
    contentType = match[1];
    cleanBase64 = match[2];
  }

  const buffer = Buffer.from(cleanBase64, "base64");
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const key = `${folder.replace(/\/+$/, "")}/${Date.now()}_${randomSuffix}.${extension}`;

  return await uploadBufferToS3(buffer, key, contentType);
}
