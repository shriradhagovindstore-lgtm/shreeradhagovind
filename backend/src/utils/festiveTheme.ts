/**
 * Festive Theme Utility — Backend (Shri Radha Govind Store)
 *
 * Provides central seasonal configuration and dynamic evaluation based on:
 * 1. Admin Settings toggle (`diwaliThemeEnabled`)
 * 2. Automatic Expiry in Asia/Kolkata timezone (`diwaliThemeExpiry`, default Nov 14 2026 00:00:00 IST)
 *
 * Diwali 2026 Schedule:
 * - Main Diwali date: November 8, 2026
 * - Decoration remains eligible through: November 13, 2026
 * - Automatic expiry: November 14, 2026 at 00:00:00 IST
 */

export const DEFAULT_DIWALI_EXPIRY_IST = "2026-11-14T00:00:00+05:30";

export function normalizeISTExpiry(input?: string | null): string {
  if (!input || typeof input !== "string") return DEFAULT_DIWALI_EXPIRY_IST;
  let str = input.trim();
  if (!str) return DEFAULT_DIWALI_EXPIRY_IST;

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return `${str}T00:00:00+05:30`;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(str)) {
    if (str.length === 16) str += ":00";
    return `${str}+05:30`;
  }
  return str;
}

export function isDiwaliExpired(expiryIso?: string | null, nowMs: number = Date.now()): boolean {
  const normalized = normalizeISTExpiry(expiryIso);
  const expiryEpoch = new Date(normalized).getTime();
  if (isNaN(expiryEpoch)) {
    return nowMs >= new Date(DEFAULT_DIWALI_EXPIRY_IST).getTime();
  }
  return nowMs >= expiryEpoch;
}

export type DiwaliThemeStatus = "Active" | "Manually Disabled" | "Expired";

export function getDiwaliThemeStatus(
  enabled: boolean = false,
  expiryIso?: string | null,
  nowMs: number = Date.now()
): DiwaliThemeStatus {
  if (isDiwaliExpired(expiryIso, nowMs)) {
    return "Expired";
  }
  if (!enabled) {
    return "Manually Disabled";
  }
  return "Active";
}

export function isDiwaliThemeActive(
  enabled: boolean = false,
  expiryIso?: string | null,
  nowMs: number = Date.now()
): boolean {
  if (!enabled) return false;
  if (isDiwaliExpired(expiryIso, nowMs)) return false;
  return true;
}

export function formatISTDateTime(isoString?: string | null): string {
  const normalized = normalizeISTExpiry(isoString);
  try {
    const d = new Date(normalized);
    if (isNaN(d.getTime())) return normalized;
    return (
      new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }).format(d) + " IST"
    );
  } catch {
    return normalized;
  }
}
