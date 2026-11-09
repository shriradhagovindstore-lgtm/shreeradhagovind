import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import { env } from "./config/env";
import { notFound, errorHandler } from "./middleware/error";
import { USER_ROLES } from "./models/User";

import authRoutes from "./routes/auth.routes";
import productRoutes from "./routes/product.routes";
import categoryRoutes, { adminCategoryRouter } from "./routes/category.routes";
import orderRoutes from "./routes/order.routes";
import adminRoutes from "./routes/admin.routes";
import inventoryRoutes from "./routes/inventory.routes";
import uploadRoutes from "./routes/upload.routes";
import settingsRoutes from "./routes/settings.routes";
import paymentRoutes from "./routes/payment.routes";
import blogRoutes from "./routes/blog.routes";
import postalRoutes from "./routes/postal.routes";
import reviewRoutes from "./routes/review.routes";
import aiRoutes from "./routes/ai.routes";
import llmsRoutes from "./routes/llms.routes";
import checkoutSessionRoutes from "./routes/checkoutSession.routes";
import analyticsRoutes, { adminAnalyticsRoutes } from "./routes/analytics.routes";
import couponRoutes, { adminCouponRouter } from "./routes/coupon.routes";
import loyaltyRoutes from "./routes/loyalty.routes";
import walletRoutes from "./routes/wallet.routes";
import wishlistRoutes from "./routes/wishlist.routes";
import marketingRoutes from "./routes/marketing.routes";
import adminRetentionRoutes from "./routes/admin.retention.routes";
import returnsRouter from "./routes/returns.routes";
import adminReturnsRouter from "./routes/admin.returns.routes";
import supportRoutes from "./routes/support.routes";
import adminSupportRoutes from "./routes/admin.support.routes";
import { startSupportAutoCloseScheduler } from "./services/support.service";

export const app = express();

app.use(helmet());
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (env.CORS_ORIGIN.includes("*") || env.CORS_ORIGIN.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  })
);
app.use(
  express.json({
    limit: "2mb",
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
app.use("/api", rateLimit({ windowMs: 60_000, max: 300 }));

app.get("/", (_req, res) => res.json({ ok: true, service: "shri-radha-govind-api" }));
app.get("/api/health", (_req, res) => {
  const isDbReady = mongoose.connection.readyState === 1;
  const status = isDbReady ? 200 : 503;
  res.status(status).json({
    ok: isDbReady,
    status: isDbReady ? "healthy" : "db_disconnected",
    dbState: mongoose.connection.readyState,
    ts: Date.now(),
    commit: process.env.RENDER_GIT_COMMIT || "3d497e7+",
    roles: USER_ROLES,
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/admin/categories", adminCategoryRouter);
app.use("/api/orders", orderRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/inventory", inventoryRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/blogs", blogRoutes);
app.use("/api/postal", postalRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/checkout-sessions", checkoutSessionRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/admin/analytics", adminAnalyticsRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/admin/coupons", adminCouponRouter);
app.use("/api/loyalty", loyaltyRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/marketing", marketingRoutes);
app.use("/api/admin/retention", adminRetentionRoutes);
app.use("/api/returns", returnsRouter);
app.use("/api/admin/returns", adminReturnsRouter);
app.use("/api/support", supportRoutes);
app.use("/api/admin/support", adminSupportRoutes);
app.use(llmsRoutes);

if (process.env.NODE_ENV !== "test") {
  startSupportAutoCloseScheduler(30);
}

app.use(notFound);
app.use(errorHandler);
