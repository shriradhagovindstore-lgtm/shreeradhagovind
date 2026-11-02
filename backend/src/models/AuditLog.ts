import { Schema, model, type Document, type Types } from "mongoose";

export interface IAuditLog extends Document {
  actorId: Types.ObjectId;
  actorRole: "admin" | "shop_manager" | "system";
  actorEmail?: string;
  action: string;
  targetType: "product" | "order" | "inventory" | "category" | "user" | "label";
  targetId: string;
  targetIdentifier?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    actorRole: {
      type: String,
      enum: ["admin", "shop_manager", "system"],
      required: true,
      index: true,
    },
    actorEmail: { type: String, default: "", trim: true },
    action: { type: String, required: true, index: true, trim: true },
    targetType: {
      type: String,
      enum: ["product", "order", "inventory", "category", "user", "label"],
      required: true,
      index: true,
    },
    targetId: { type: String, required: true, index: true, trim: true },
    targetIdentifier: { type: String, default: "", trim: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1 });

export const AuditLog = model<IAuditLog>("AuditLog", auditLogSchema);
