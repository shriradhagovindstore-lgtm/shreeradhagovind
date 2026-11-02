import { Schema, model, type InferSchemaType } from "mongoose";

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    passwordHash: { type: String, default: "" },
    role: { type: String, enum: ["user", "admin", "shop_manager"], default: "user", index: true },
    provider: { type: String, enum: ["password", "google"], default: "password" },
    avatar: { type: String, default: "" },
    phone: { type: String, default: "" },
    address: {
      line1: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      pincode: { type: String, default: "" },
    },
    isBlocked: { type: Boolean, default: false, index: true },
    passwordSet: { type: Boolean, default: true, index: true },
    lastLoginAt: { type: Date, default: null },
    resetOtpHash: { type: String, default: "" },
    resetOtpExpiresAt: { type: Date, default: null },
    resetOtpVerifiedAt: { type: Date, default: null },
    resetOtpAttempts: { type: Number, default: 0 },
    resetOtpLastSentAt: { type: Date, default: null },
    loginOtpHash: { type: String, default: "" },
    loginOtpExpiresAt: { type: Date, default: null },
    loginOtpAttempts: { type: Number, default: 0 },
    loginOtpLastSentAt: { type: Date, default: null },
    loyaltyPointsBalance: { type: Number, default: 0, min: 0 },
    walletBalance: { type: Number, default: 0, min: 0 },
    wishlist: [{ type: Schema.Types.ObjectId, ref: "Product" }],
    marketingEmailOptIn: { type: Boolean, default: true, index: true },
    unsubscribeToken: { type: String, sparse: true, index: true },
    emailVerified: { type: Boolean, default: false, index: true },
    emailVerifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: string };
export const User = model("User", userSchema);
