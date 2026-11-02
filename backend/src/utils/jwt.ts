import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env";

export type JwtPayload = {
  sub: string;
  role?: "user" | "admin" | "shop_manager";
  email?: string;
  purpose?: string;
};

export const signToken = (p: { sub: string; role?: "user" | "admin" | "shop_manager"; email?: string }) =>
  jwt.sign(p, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"] });

export const signPurposeToken = (
  payload: { sub: string; email?: string; purpose: string },
  expiresIn: SignOptions["expiresIn"] = "15m"
) => jwt.sign(payload, env.JWT_SECRET, { expiresIn });

export const verifyToken = (token: string) => jwt.verify(token, env.JWT_SECRET) as JwtPayload;
