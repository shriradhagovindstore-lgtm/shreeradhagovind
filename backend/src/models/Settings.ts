import { Schema, model } from "mongoose";

const settingsSchema = new Schema(
  {
    key: { type: String, default: "global", unique: true },
    siteName: { type: String, default: "Shri Radha Govind Store" },
    tagline: { type: String, default: "Sacred essentials from Vrindavan" },
    email: { type: String, default: "support@shreeradhagovind.com" },
    announcement: { type: String, default: "🚚 Free shipping over ₹299 · 🎁 Use code RADHE10" },
    currency: { type: String, default: "INR" },
    freeShipThreshold: { type: Number, default: 299 },
    shippingFee: { type: Number, default: 49 },
    codEnabled: { type: Boolean, default: true },
    razorpayKeyId: { type: String, default: "" },
    homeHeroImage: { type: String, default: "" },
    vrindavanStoryImage: { type: String, default: "" },
    aboutHeroImage: { type: String, default: "" },
    aboutStoryImage: { type: String, default: "" },
    aboutManojImage: { type: String, default: "" },
    aboutGovindImage: { type: String, default: "" },
    whatsappTemplate: { type: String, default: "" },
    showDeveloperProfile: { type: Boolean, default: true },
    homeHeroVideo: { type: String, default: "/Homepage_banner.mp4" },
    aboutStoryVideo: { type: String, default: "/About_US_story_video.mp4" },
    loyalty: {
      enabled: { type: Boolean, default: true },
      pointsEarningRate: { type: Number, default: 1 }, // 1 point per spend unit
      pointsEarningSpendUnit: { type: Number, default: 100 }, // per ₹100 spent
      pointMonetaryValue: { type: Number, default: 1 }, // 1 point = ₹1.00
      minPointsRedemption: { type: Number, default: 50 }, // min points to redeem
      maxPointsRedemptionPercent: { type: Number, default: 50 }, // max 50% of subtotal
      pointsCombineWithCoupons: { type: Boolean, default: true },
      pointsExpirationDays: { type: Number, default: 180 }, // confirmed business rule: exactly 180 days
      earnPointsOnShipping: { type: Boolean, default: false },
      earnPointsOnDiscountedSubtotal: { type: Boolean, default: true },
    },
    returnWindowHours: { type: Number, default: 48 },
    diwaliThemeEnabled: { type: Boolean, default: true },
    diwaliThemeExpiry: { type: String, default: "2026-11-14T00:00:00+05:30" },
    tiers: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true },
        minSpend: { type: Number, default: 0 },
        minOrders: { type: Number, default: 0 },
        rule: {
          type: String,
          enum: ["spend_or_orders", "spend_and_orders", "spend_only", "orders_only"],
          default: "spend_or_orders",
        },
        badgeColor: { type: String, default: "#b45309" },
        perks: [{ type: String }],
        extraPointsMultiplier: { type: Number, default: 1 },
      },
    ],
  },
  { timestamps: true }
);

export const Settings = model("Settings", settingsSchema);
