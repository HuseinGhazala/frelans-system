import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * تخزين اللقطات:
 * - STORAGE_DRIVER=local (الافتراضي): ملفات على السيرفر في STORAGE_DIR — مناسب لـ VPS.
 * - STORAGE_DRIVER=s3: أي خدمة S3-compatible (Cloudflare R2 / MinIO / AWS) — مناسب للاستضافة السحابية.
 * في الحالتين الصور بتتعرض بس عن طريق /api/screenshots/[id] بعد التأكد من الصلاحية.
 */
const driver = process.env.STORAGE_DRIVER === "s3" ? "s3" : "local";
const localDir = path.resolve(process.env.STORAGE_DIR ?? "./storage");

let s3: S3Client | null = null;
function client() {
  s3 ??= new S3Client({
    region: process.env.S3_REGION ?? "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.S3_ENDPOINT),
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "" },
  });
  return s3;
}
const bucket = () => process.env.S3_BUCKET ?? "rased";

function localPath(key: string) {
  const p = path.resolve(localDir, key);
  if (!p.startsWith(localDir + path.sep)) throw new Error("invalid storage key");
  return p;
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  if (driver === "s3") {
    await client().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
    return;
  }
  const p = localPath(key);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, body);
}

export async function deleteObject(key: string) {
  if (driver === "s3") {
    await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
    return;
  }
  await fs.rm(localPath(key), { force: true });
}

/** للـ S3 بيرجع رابط موقّع صالح 5 دقايق، وللـ local بيرجع محتوى الملف */
export async function readObject(key: string): Promise<{ redirect: string } | { body: Buffer }> {
  if (driver === "s3") {
    return { redirect: await getSignedUrl(client(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: 300 }) };
  }
  return { body: await fs.readFile(localPath(key)) };
}
