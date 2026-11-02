import mongoose, { type Types } from "mongoose";
import { AuditLog } from "../models/AuditLog";

export interface LogAuditParams {
  actorId: string | Types.ObjectId;
  actorRole: "admin" | "shop_manager" | "system";
  actorEmail?: string;
  action: string;
  targetType: "product" | "order" | "inventory" | "category" | "user" | "label";
  targetId: string;
  targetIdentifier?: string;
  metadata?: Record<string, any>;
}

/**
 * Persists an operational audit log entry.
 * Safely sanitizes metadata to never store passwords, tokens, or payment secrets.
 */
export async function logAuditEvent(params: LogAuditParams): Promise<void> {
  try {
    const cleanMeta = { ...(params.metadata || {}) };
    delete cleanMeta.password;
    delete cleanMeta.passwordHash;
    delete cleanMeta.token;
    delete cleanMeta.refreshToken;
    delete cleanMeta.resetOtpHash;
    delete cleanMeta.loginOtpHash;
    delete cleanMeta.apiKey;
    delete cleanMeta.secret;

    const actorObjectId =
      params.actorId instanceof mongoose.Types.ObjectId
        ? params.actorId
        : mongoose.Types.ObjectId.isValid(params.actorId)
          ? new mongoose.Types.ObjectId(params.actorId)
          : null;

    if (!actorObjectId) return;

    await AuditLog.create({
      actorId: actorObjectId,
      actorRole: params.actorRole,
      actorEmail: params.actorEmail || "",
      action: params.action,
      targetType: params.targetType,
      targetId: String(params.targetId),
      targetIdentifier: params.targetIdentifier || "",
      metadata: cleanMeta,
    });
  } catch (err) {
    // Non-blocking log failure
    console.error("[logAuditEvent:error]", err);
  }
}
