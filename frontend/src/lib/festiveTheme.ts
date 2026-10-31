/**
 * Festive Theme Configuration & Dynamic Evaluator — Shri Radha Govind Store
 *
 * Central seasonal configuration and dynamic evaluation based on:
 * 1. Admin Settings toggle (`settings.diwaliThemeEnabled`)
 * 2. Automatic Expiry in Asia/Kolkata timezone (`settings.diwaliThemeExpiry`, default Nov 14 2026 00:00:00 IST)
 * 3. Master code-level toggle (`FESTIVE_THEME_CONFIG.enabled`)
 *
 * Diwali 2026 Schedule:
 * - Main Diwali date: November 8, 2026
 * - Decoration remains eligible through: November 13, 2026
 * - Automatic expiry: November 14, 2026 at 00:00:00 IST
 */

export const DEFAULT_DIWALI_EXPIRY_IST = "2026-11-14T00:00:00+05:30";

export interface FestiveThemeConfig {
  /** Master code-level kill switch: set to false to completely disable all festive decorations */
  enabled: boolean;
  /** Toggle upper warm golden fairy-light string */
  showFairyLights: boolean;
  /** Toggle floating decorative brass diyas in lower corners */
  showDiyas: boolean;
  /** Toggle subtle warm golden ambient glow */
  showAmbientGlow: boolean;
  /** Toggle traditional marigold & mango-leaf toran below header */
  showToran: boolean;
  /** Toggle homepage Diwali greeting below hero */
  showGreeting: boolean;
  /** Toggle footer decorative diya/rangoli motif */
  showFooterRangoli: boolean;
}

export const FESTIVE_THEME_CONFIG: FestiveThemeConfig = {
  enabled: true,
  showFairyLights: true,
  showDiyas: true,
  showAmbientGlow: true,
  showToran: true,
  showGreeting: true,
  showFooterRangoli: true,
};

/**
 * Normalizes any date input string to an explicit ISO-8601 string with Asia/Kolkata (+05:30) offset.
 * Guarantees that time is evaluated deterministically without relying on the visitor's local browser timezone.
 */
export function normalizeISTExpiry(input?: string | null): string {
  if (!input || typeof input !== "string") return DEFAULT_DIWALI_EXPIRY_IST;
  let str = input.trim();
  if (!str) return DEFAULT_DIWALI_EXPIRY_IST;

  // If YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return `${str}T00:00:00+05:30`;
  }
  // If YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss without timezone offset
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(str)) {
    if (str.length === 16) str += ":00";
    return `${str}+05:30`;
  }
  return str;
}

/**
 * Evaluates whether the Diwali decoration period has expired in Asia/Kolkata.
 * Compares current epoch milliseconds against the expiry timestamp.
 * Note: ISO string with explicit timezone offset +05:30 is parsed deterministically
 * across any visitor timezone.
 */
export function isDiwaliExpired(expiryIso?: string | null, nowMs: number = Date.now()): boolean {
  const normalized = normalizeISTExpiry(expiryIso);
  const expiryEpoch = new Date(normalized).getTime();
  if (isNaN(expiryEpoch)) {
    return nowMs >= new Date(DEFAULT_DIWALI_EXPIRY_IST).getTime();
  }
  return nowMs >= expiryEpoch;
}

export type DiwaliThemeStatus = "Active" | "Manually Disabled" | "Expired";

/**
 * Computes current effective status: "Active" | "Manually Disabled" | "Expired"
 */
export function getDiwaliThemeStatus(
  enabled: boolean = false,
  expiryIso?: string | null,
  nowMs: number = Date.now()
): DiwaliThemeStatus {
  if (isDiwaliExpired(expiryIso, nowMs)) {
    return "Expired";
  }
  if (!enabled || !FESTIVE_THEME_CONFIG.enabled) {
    return "Manually Disabled";
  }
  return "Active";
}

/**
 * Determines whether Diwali decoration should render on the storefront.
 * Requires:
 * 1. Master code toggle enabled (`FESTIVE_THEME_CONFIG.enabled`)
 * 2. Admin settings toggle enabled (`settings.diwaliThemeEnabled === true`)
 * 3. Current time before automatic expiry timestamp in Asia/Kolkata
 */
export function isDiwaliThemeActive(
  enabled: boolean = false,
  expiryIso?: string | null,
  nowMs: number = Date.now()
): boolean {
  if (!FESTIVE_THEME_CONFIG.enabled) return false;
  if (!enabled) return false;
  if (isDiwaliExpired(expiryIso, nowMs)) return false;
  return true;
}

/**
 * Formats an ISO date string in Asia/Kolkata timezone for human display.
 * Example: "14 Nov 2026, 12:00:00 am IST"
 */
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
