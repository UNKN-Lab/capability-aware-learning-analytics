import crypto from "crypto";
import prisma from "../lib/prisma.js";

const DEFAULT_UPLOAD_SESSION_TTL_HOURS = 24;

function createSessionId() {
  return `session_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

function getUploadSessionTtlHours() {
  const configuredValue = Number(process.env.UPLOAD_SESSION_TTL_HOURS);

  if (Number.isFinite(configuredValue) && configuredValue > 0) {
    return configuredValue;
  }

  return DEFAULT_UPLOAD_SESSION_TTL_HOURS;
}

function buildExpiryDate(now = new Date()) {
  const ttlHours = getUploadSessionTtlHours();
  return new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
}

function sanitizeJsonPayload(value) {
  return JSON.parse(JSON.stringify(value));
}

function isExpired(expiresAt, now = new Date()) {
  if (!(expiresAt instanceof Date)) return false;
  return expiresAt.getTime() <= now.getTime();
}

export async function clearExpiredUploadSessions() {
  const result = await prisma.uploadSession.deleteMany({
    where: {
      expires_at: {
        lte: new Date()
      }
    }
  });

  return result.count;
}

export async function createUploadSession(data) {
  const now = new Date();
  const sessionId = createSessionId();
  const payload = sanitizeJsonPayload({
    ...data,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  });

  await clearExpiredUploadSessions();

  await prisma.uploadSession.create({
    data: {
      session_id: sessionId,
      payload,
      expires_at: buildExpiryDate(now)
    }
  });

  return sessionId;
}

export async function getUploadSession(sessionId) {
  if (!sessionId) return null;

  const session = await prisma.uploadSession.findUnique({
    where: { session_id: sessionId }
  });

  if (!session) {
    return null;
  }

  if (isExpired(session.expires_at)) {
    await prisma.uploadSession.delete({
      where: { session_id: sessionId }
    }).catch(() => {});

    return null;
  }

  return session.payload ?? null;
}

export async function updateUploadSession(sessionId, patch) {
  const existing = await getUploadSession(sessionId);

  if (!existing) {
    return null;
  }

  const now = new Date();
  const updatedPayload = sanitizeJsonPayload({
    ...existing,
    ...patch,
    updatedAt: now.toISOString()
  });

  await prisma.uploadSession.update({
    where: { session_id: sessionId },
    data: {
      payload: updatedPayload,
      expires_at: buildExpiryDate(now)
    }
  });

  return updatedPayload;
}

export async function deleteUploadSession(sessionId) {
  if (!sessionId) return false;

  const result = await prisma.uploadSession.deleteMany({
    where: { session_id: sessionId }
  });

  return result.count > 0;
}
