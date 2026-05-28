import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { ObjectPermission } from "../lib/objectAcl";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const UploadRequestBody = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
  contentType: z.string().refine((v) => ALLOWED_CONTENT_TYPES.has(v), {
    message: "contentType must be one of: image/jpeg, image/png, image/webp, image/gif",
  }),
});

function getSigningSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET must be set (min 16 chars) for upload token signing");
  }
  return secret;
}

/**
 * HMAC-sign an (objectPath, clerkUserId) pair so the server can later verify
 * that the user attaching an objectPath to a record is the same user who
 * originally requested the upload URL — without any DB lookups.
 */
export function signUploadToken(objectPath: string, clerkUserId: string): string {
  return createHmac("sha256", getSigningSecret())
    .update(`${clerkUserId}:${objectPath}`)
    .digest("hex");
}

export function verifyUploadToken(
  objectPath: string,
  clerkUserId: string,
  token: string,
): boolean {
  try {
    const expected = signUploadToken(objectPath, clerkUserId);
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(token, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * POST /storage/uploads/request-url
 *
 * Auth-required. Validates MIME + size, then returns a presigned PUT URL plus
 * an HMAC `uploadToken` proving this user requested this object path. The
 * client must echo the token back when attaching the object to a record
 * (e.g. when creating a meal post with imageUrl).
 */
router.post("/storage/uploads/request-url", requireAuth, async (req: Request, res: Response) => {
  const parsed = UploadRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid upload request" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;
    const clerkUserId = req.clerkUserId!;

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    const uploadToken = signUploadToken(objectPath, clerkUserId);

    res.json({
      uploadURL,
      objectPath,
      uploadToken,
      metadata: { name, size, contentType },
    });
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * Unconditionally public — used for app/website assets uploaded via the
 * Object Storage tool pane (NOT user uploads).
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve user-uploaded objects from PRIVATE_OBJECT_DIR.
 * Auth-required. Owner can always read; otherwise the object's ACL must
 * be marked `visibility: "public"` (set when the object is attached to a
 * publicly-visible record like a meal post).
 */
router.get("/storage/objects/*path", requireAuth, async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    const canAccess = await objectStorageService.canAccessObjectEntity({
      userId: req.clerkUserId!,
      objectFile,
      requestedPermission: ObjectPermission.READ,
    });
    if (!canAccess) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
