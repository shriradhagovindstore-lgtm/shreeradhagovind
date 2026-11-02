import type { Request, Response, NextFunction } from "express";
import { verifyToken, type JwtPayload } from "../utils/jwt";
import { HttpError } from "./error";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export const requireAuth = (req: Request, _res: Response, next: NextFunction) => {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return next(new HttpError(401, "Missing token"));
  try {
    const payload = verifyToken(h.slice(7));
    if (payload.purpose) return next(new HttpError(401, "Invalid token purpose"));
    req.user = payload;
    next();
  } catch {
    next(new HttpError(401, "Invalid token"));
  }
};

export const requireAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (req.user?.role !== "admin") return next(new HttpError(403, "Admin only"));
  next();
};

export const requireSuperAdmin = requireAdmin;

export const requireStaff = (req: Request, _res: Response, next: NextFunction) => {
  if (req.user?.role !== "admin" && req.user?.role !== "shop_manager") {
    return next(new HttpError(403, "Staff access required"));
  }
  next();
};

export const optionalAuth = (req: Request, _res: Response, next: NextFunction) => {
  const h = req.headers.authorization;
  if (h?.startsWith("Bearer ")) {
    try {
      const payload = verifyToken(h.slice(7));
      if (!payload.purpose) {
        req.user = payload;
      }
    } catch {
      /* ignore */
    }
  }
  next();
};
