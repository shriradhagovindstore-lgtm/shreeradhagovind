import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { OAuth2Client } from "google-auth-library";
import { User } from "../models/User";
import { Order } from "../models/Order";
import { signToken, signPurposeToken, verifyToken } from "../utils/jwt";
import { sendEmail, tpl } from "../utils/email";
import { requireAuth } from "../middleware/auth";
import { HttpError } from "../middleware/error";
import { env } from "../config/env";

import { linkGuestOrdersForUser } from "../services/guestAccountLinking.service";

const r = Router();
const google = env.GOOGLE_CLIENT_ID ? new OAuth2Client(env.GOOGLE_CLIENT_ID) : null;

const safe = (u: any) => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  role: u.role,
  avatar: u.avatar,
  phone: u.phone,
  address: u.address ?? {},
  loyaltyPointsBalance: Math.max(0, u.loyaltyPointsBalance ?? 0),
  walletBalance: Math.max(0, u.walletBalance ?? 0),
  marketingEmailOptIn: u.marketingEmailOptIn !== false,
  emailVerified: Boolean(u.emailVerified),
});

async function claimUserGuestOrders(user: any) {
  if (!user?.email || !user?.emailVerified) return;
  try {
    await linkGuestOrdersForUser(user);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[claimUserGuestOrders:error]", e);
  }
}

r.post("/signup", async (req, res, next) => {
  try {
    const { name, email, password, phone, address } = z
      .object({
        name: z.string().min(1).max(80),
        email: z.string().email(),
        password: z.string().min(6),
        phone: z.string().min(5).max(20).optional(),
        address: z
          .object({
            line1: z.string().max(200).optional(),
            city: z.string().max(80).optional(),
            state: z.string().max(80).optional(),
            pincode: z.string().max(12).optional(),
          })
          .optional(),
      })
      .parse(req.body);
    const lower = email.toLowerCase();
    if (await User.findOne({ email: lower })) throw new HttpError(409, "Email already registered");
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email: lower,
      passwordHash,
      passwordSet: true,
      phone: phone ?? "",
      address: address ?? {},
    });
    sendEmail({ to: lower, ...tpl.welcome(name) }).catch(() => {});
    res.json({ token: signToken({ sub: String(user._id), role: user.role, email: user.email }), user: safe(user) });
  } catch (e) {
    next(e);
  }
});

r.post("/login", async (req, res, next) => {
  try {
    const { email, password } = z
      .object({ email: z.string().email(), password: z.string().min(1) })
      .parse(req.body);
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.passwordHash || user.passwordSet === false)
      throw new HttpError(401, "Invalid credentials or password not yet created. Please sign in with Email OTP.");
    if (user.isBlocked) throw new HttpError(403, "Your account has been blocked. Please contact support.");
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new HttpError(401, "Invalid credentials");
    user.lastLoginAt = new Date();
    await user.save();
    await claimUserGuestOrders(user);
    res.json({ token: signToken({ sub: String(user._id), role: user.role, email: user.email }), user: safe(user) });
  } catch (e) {
    next(e);
  }
});

r.post("/send-login-otp", async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const lower = email.trim().toLowerCase();
    let user = await User.findOne({ email: lower });
    if (!user) {
      // Auto create account with passwordSet=false for brand-new customer
      user = await User.create({
        name: lower.split("@")[0] || "Customer",
        email: lower,
        passwordHash: "",
        passwordSet: false,
        role: "user",
      });
    }
    if (user.isBlocked) throw new HttpError(403, "Your account has been blocked. Please contact support.");
    if (user.loginOtpLastSentAt && Date.now() - user.loginOtpLastSentAt.getTime() < 60000) {
      const remaining = Math.ceil((60000 - (Date.now() - user.loginOtpLastSentAt.getTime())) / 1000);
      throw new HttpError(429, `Please wait ${remaining}s before requesting another OTP.`);
    }
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    user.loginOtpHash = await bcrypt.hash(otp, 10);
    user.loginOtpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    user.loginOtpAttempts = 0;
    user.loginOtpLastSentAt = new Date();
    await user.save();
    sendEmail({ to: lower, ...tpl.loginOtp(user.name, otp) }).catch(() => {});
    res.json({ ok: true, message: "A 6-digit OTP has been sent to your email." });
  } catch (e) {
    next(e);
  }
});

r.post("/verify-login-otp", async (req, res, next) => {
  try {
    const { email, otp } = z
      .object({ email: z.string().email(), otp: z.string().min(4).max(8) })
      .parse(req.body);
    const lower = email.trim().toLowerCase();
    const user = await User.findOne({ email: lower });
    if (!user?.loginOtpHash || !user.loginOtpExpiresAt || user.loginOtpExpiresAt.getTime() < Date.now()) {
      throw new HttpError(400, "OTP expired or invalid. Please request a new OTP.");
    }
    if ((user.loginOtpAttempts ?? 0) >= 5) {
      user.loginOtpHash = "";
      user.loginOtpExpiresAt = null;
      await user.save();
      throw new HttpError(429, "Too many invalid attempts. Please request a new OTP.");
    }
    const ok = await bcrypt.compare(otp, user.loginOtpHash);
    if (!ok) {
      user.loginOtpAttempts = (user.loginOtpAttempts ?? 0) + 1;
      await user.save();
      throw new HttpError(400, "Invalid OTP. Please check the code sent to your email.");
    }
    // Invalidate OTP immediately and mark email as verified
    user.loginOtpHash = "";
    user.loginOtpExpiresAt = null;
    user.loginOtpAttempts = 0;
    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
    await user.save();
    await linkGuestOrdersForUser(user);

    const needsPassword = user.passwordSet === false || !user.passwordHash;
    if (needsPassword) {
      const setPasswordToken = signPurposeToken(
        { sub: String(user._id), email: user.email, purpose: "set_password" },
        "15m"
      );
      res.json({
        requiresPasswordSet: true,
        setPasswordToken,
        user: safe(user),
      });
    } else {
      user.lastLoginAt = new Date();
      await user.save();
      res.json({
        requiresPasswordSet: false,
        token: signToken({ sub: String(user._id), role: user.role, email: user.email }),
        user: safe(user),
      });
    }
  } catch (e) {
    next(e);
  }
});

r.post("/create-password", async (req, res, next) => {
  try {
    const { token, password } = z
      .object({
        token: z.string().min(10),
        password: z.string().min(6, "Password must be at least 6 characters"),
      })
      .parse(req.body);

    let payload: any;
    try {
      payload = verifyToken(token);
    } catch {
      throw new HttpError(401, "Session expired or invalid. Please verify OTP again.");
    }
    if (payload.purpose !== "set_password" || !payload.sub) {
      throw new HttpError(403, "Unauthorized password creation request.");
    }
    const user = await User.findById(payload.sub);
    if (!user) throw new HttpError(404, "User not found.");

    user.passwordHash = await bcrypt.hash(password, 10);
    user.passwordSet = true;
    user.provider = "password";
    user.lastLoginAt = new Date();
    await user.save();
    await claimUserGuestOrders(user);

    res.json({
      token: signToken({ sub: String(user._id), role: user.role, email: user.email }),
      user: safe(user),
    });
  } catch (e) {
    next(e);
  }
});

r.post("/forgot-password", async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const lower = email.toLowerCase();
    const user = await User.findOne({ email: lower });
    if (user) {
      if (user.resetOtpLastSentAt && Date.now() - user.resetOtpLastSentAt.getTime() < 60000) {
        const remaining = Math.ceil((60000 - (Date.now() - user.resetOtpLastSentAt.getTime())) / 1000);
        throw new HttpError(429, `Please wait ${remaining}s before requesting another reset code.`);
      }
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      user.resetOtpHash = await bcrypt.hash(otp, 10);
      user.resetOtpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
      user.resetOtpVerifiedAt = null;
      user.resetOtpAttempts = 0;
      user.resetOtpLastSentAt = new Date();
      await user.save();
      sendEmail({ to: lower, ...tpl.passwordResetOtp(user.name, otp) }).catch(() => {});
    }
    res.json({ ok: true, message: "If an account exists, an OTP has been sent." });
  } catch (e) {
    next(e);
  }
});

r.post("/verify-reset-otp", async (req, res, next) => {
  try {
    const { email, otp } = z.object({ email: z.string().email(), otp: z.string().min(4).max(8) }).parse(req.body);
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user?.resetOtpHash || !user.resetOtpExpiresAt || user.resetOtpExpiresAt.getTime() < Date.now()) {
      throw new HttpError(400, "OTP expired or invalid");
    }
    if ((user.resetOtpAttempts ?? 0) >= 5) {
      user.resetOtpHash = "";
      user.resetOtpExpiresAt = null;
      await user.save();
      throw new HttpError(429, "Too many invalid attempts. Please request a new OTP.");
    }
    const ok = await bcrypt.compare(otp, user.resetOtpHash);
    if (!ok) {
      user.resetOtpAttempts = (user.resetOtpAttempts ?? 0) + 1;
      await user.save();
      throw new HttpError(400, "Invalid OTP. Please check the code sent to your email.");
    }
    user.resetOtpVerifiedAt = new Date();
    user.resetOtpAttempts = 0;
    await user.save();
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

r.post("/reset-password", async (req, res, next) => {
  try {
    const { email, password } = z.object({ email: z.string().email(), password: z.string().min(6) }).parse(req.body);
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user?.resetOtpVerifiedAt || !user.resetOtpExpiresAt || user.resetOtpExpiresAt.getTime() < Date.now()) {
      throw new HttpError(400, "Please verify the OTP again");
    }
    user.passwordHash = await bcrypt.hash(password, 10);
    user.passwordSet = true;
    user.provider = "password";
    user.resetOtpHash = "";
    user.resetOtpExpiresAt = null;
    user.resetOtpVerifiedAt = null;
    user.resetOtpAttempts = 0;
    user.lastLoginAt = new Date();
    await user.save();
    await claimUserGuestOrders(user);
    res.json({ token: signToken({ sub: String(user._id), role: user.role, email: user.email }), user: safe(user) });
  } catch (e) {
    next(e);
  }
});

r.post("/google", async (req, res, next) => {
  try {
    if (!google) throw new HttpError(400, "Google sign-in not configured");
    const { credential } = z.object({ credential: z.string().min(10) }).parse(req.body);
    let ticket;
    try {
      ticket = await google.verifyIdToken({ idToken: credential, audience: env.GOOGLE_CLIENT_ID });
    } catch {
      throw new HttpError(401, "Google token invalid");
    }
    const p = ticket.getPayload();
    if (!p?.email) throw new HttpError(401, "Google token invalid");
    const lower = p.email.toLowerCase();
    let user = await User.findOne({ email: lower });
    if (!user) {
      user = await User.create({
        name: p.name || lower.split("@")[0],
        email: lower,
        provider: "google",
        avatar: p.picture || "",
      });
      sendEmail({ to: lower, ...tpl.welcome(user.name) }).catch(() => {});
    }
    user.emailVerified = true;
    if (!user.emailVerifiedAt) user.emailVerifiedAt = new Date();
    user.lastLoginAt = new Date();
    await user.save();
    await linkGuestOrdersForUser(user);
    res.json({ token: signToken({ sub: String(user._id), role: user.role, email: user.email }), user: safe(user) });
  } catch (e) {
    next(e);
  }
});

r.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user!.sub);
    if (!user) throw new HttpError(404, "User not found");
    res.json({ user: safe(user) });
  } catch (e) {
    next(e);
  }
});

r.patch("/me", requireAuth, async (req, res, next) => {
  try {
    const data = z.object({
      name: z.string().trim().min(1).max(80).optional(),
      phone: z.string().trim().max(20).optional(),
      avatar: z.string().url().or(z.literal("")).optional(),
      address: z.object({
        line1: z.string().trim().max(200).optional(),
        city: z.string().trim().max(80).optional(),
        state: z.string().trim().max(80).optional(),
        pincode: z.string().trim().max(12).optional(),
      }).optional(),
    }).parse(req.body);
    const user = await User.findByIdAndUpdate(req.user!.sub, { $set: data }, { new: true, runValidators: true });
    if (!user) throw new HttpError(404, "User not found");
    res.json({ user: safe(user) });
  } catch (e) {
    next(e);
  }
});

r.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = z
      .object({
        currentPassword: z.string().min(1, "Current password required"),
        newPassword: z.string().min(6, "New password must be at least 6 characters"),
      })
      .parse(req.body);

    const user = await User.findById(req.user!.sub);
    if (!user) throw new HttpError(404, "User not found");
    if (!user.passwordHash) throw new HttpError(400, "Password not set for this account");

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new HttpError(400, "Incorrect current password");

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordSet = true;
    await user.save();

    res.json({ ok: true, message: "Password updated successfully." });
  } catch (e) {
    next(e);
  }
});

export default r;
