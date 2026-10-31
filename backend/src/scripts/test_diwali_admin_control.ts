import assert from "node:assert/strict";
import {
  DEFAULT_DIWALI_EXPIRY_IST,
  normalizeISTExpiry,
  isDiwaliExpired,
  getDiwaliThemeStatus,
  isDiwaliThemeActive,
  formatISTDateTime,
} from "../utils/festiveTheme";
import { Settings } from "../models/Settings";

async function runTests() {
  console.log("==================================================================");
  console.log("  DIWALI ADMIN CONTROL & AUTOMATIC EXPIRY VERIFICATION SUITE      ");
  console.log("==================================================================\n");

  // -------------------------------------------------------------------------
  // Test 1: Mongoose Schema Defaults & Types
  // -------------------------------------------------------------------------
  console.log("Test 1: Verifying Settings Mongoose Schema Defaults & Types...");
  const schemaObj: any = Settings.schema.obj;
  assert.ok(schemaObj.diwaliThemeEnabled, "diwaliThemeEnabled must be in schema");
  assert.equal(schemaObj.diwaliThemeEnabled.type, Boolean, "diwaliThemeEnabled must be Boolean");
  assert.equal(schemaObj.diwaliThemeEnabled.default, true, "diwaliThemeEnabled must default to true");

  assert.ok(schemaObj.diwaliThemeExpiry, "diwaliThemeExpiry must be in schema");
  assert.equal(schemaObj.diwaliThemeExpiry.type, String, "diwaliThemeExpiry must be String");
  assert.equal(
    schemaObj.diwaliThemeExpiry.default,
    "2026-11-14T00:00:00+05:30",
    "diwaliThemeExpiry default must be 2026-11-14T00:00:00+05:30"
  );
  console.log("✓ Test 1 Passed: Schema defaults and types verified successfully.\n");

  // -------------------------------------------------------------------------
  // Test 2: Timezone Normalization (Asia/Kolkata +05:30)
  // -------------------------------------------------------------------------
  console.log("Test 2: Verifying Timezone Normalization to explicit IST offset...");
  assert.equal(
    normalizeISTExpiry("2026-11-14"),
    "2026-11-14T00:00:00+05:30",
    "YYYY-MM-DD should normalize to T00:00:00+05:30"
  );
  assert.equal(
    normalizeISTExpiry("2026-11-14T00:00"),
    "2026-11-14T00:00:00+05:30",
    "YYYY-MM-DDTHH:mm should normalize with seconds and +05:30"
  );
  assert.equal(
    normalizeISTExpiry("2026-11-14T00:00:00"),
    "2026-11-14T00:00:00+05:30",
    "YYYY-MM-DDTHH:mm:ss without offset should append +05:30"
  );
  assert.equal(
    normalizeISTExpiry("2026-11-14T00:00:00+05:30"),
    "2026-11-14T00:00:00+05:30",
    "Existing explicit IST ISO should be preserved"
  );
  assert.equal(
    normalizeISTExpiry(null),
    DEFAULT_DIWALI_EXPIRY_IST,
    "Null/empty should fallback to default"
  );
  console.log("✓ Test 2 Passed: Normalization guarantees explicit +05:30 offset.\n");

  // -------------------------------------------------------------------------
  // Test 3: Absolute Epoch Evaluation & Timezone Independence
  // -------------------------------------------------------------------------
  console.log("Test 3: Verifying Timezone Independence (Browser agnostic)...");
  // 14 Nov 2026 00:00:00 IST = 13 Nov 2026 18:30:00 UTC
  const expectedUtcMs = Date.UTC(2026, 10, 13, 18, 30, 0); // Month is 0-indexed: 10 = Nov
  const parsedEpoch = new Date(DEFAULT_DIWALI_EXPIRY_IST).getTime();
  assert.equal(
    parsedEpoch,
    expectedUtcMs,
    "2026-11-14T00:00:00+05:30 must parse to 13 Nov 2026 18:30:00 UTC regardless of runtime timezone"
  );
  console.log(`  Target Expiry IST : ${DEFAULT_DIWALI_EXPIRY_IST}`);
  console.log(`  Target Expiry UTC : ${new Date(parsedEpoch).toUTCString()}`);
  console.log(`  Formatted in IST  : ${formatISTDateTime(DEFAULT_DIWALI_EXPIRY_IST)}`);
  console.log("✓ Test 3 Passed: Absolute timestamp is 100% visitor-timezone independent.\n");

  // -------------------------------------------------------------------------
  // Test 4: Pre-expiry vs Post-expiry at Nov 14, 2026 00:00:00 IST
  // -------------------------------------------------------------------------
  console.log("Test 4: Verifying Boundary Conditions at Nov 14, 2026 00:00:00 IST...");
  // 1 second before expiry: 13 Nov 2026 23:59:59 IST
  const oneSecBeforeMs = expectedUtcMs - 1000;
  assert.equal(
    isDiwaliExpired(DEFAULT_DIWALI_EXPIRY_IST, oneSecBeforeMs),
    false,
    "1 second before Nov 14 00:00:00 IST must NOT be expired"
  );
  assert.equal(
    isDiwaliThemeActive(true, DEFAULT_DIWALI_EXPIRY_IST, oneSecBeforeMs),
    true,
    "Theme must be active before expiry when enabled"
  );

  // Exactly at expiry: 14 Nov 2026 00:00:00 IST
  assert.equal(
    isDiwaliExpired(DEFAULT_DIWALI_EXPIRY_IST, expectedUtcMs),
    true,
    "At Nov 14 00:00:00 IST, theme MUST be expired"
  );
  assert.equal(
    isDiwaliThemeActive(true, DEFAULT_DIWALI_EXPIRY_IST, expectedUtcMs),
    false,
    "At Nov 14 00:00:00 IST, decorations MUST automatically be OFF"
  );

  // 1 hour after expiry: 14 Nov 2026 01:00:00 IST
  const oneHourAfterMs = expectedUtcMs + 3600000;
  assert.equal(
    isDiwaliExpired(DEFAULT_DIWALI_EXPIRY_IST, oneHourAfterMs),
    true,
    "After expiry, theme must remain expired"
  );
  assert.equal(
    isDiwaliThemeActive(true, DEFAULT_DIWALI_EXPIRY_IST, oneHourAfterMs),
    false,
    "Decorations must remain OFF after expiry even if master toggle is still ON"
  );
  console.log("✓ Test 4 Passed: Boundary conditions behave precisely at Nov 14 00:00:00 IST.\n");

  // -------------------------------------------------------------------------
  // Test 5: Status Calculations ("Active", "Manually Disabled", "Expired")
  // -------------------------------------------------------------------------
  console.log("Test 5: Verifying Status States in Admin Settings UI...");
  // State A: Before expiry, toggle ON
  assert.equal(
    getDiwaliThemeStatus(true, DEFAULT_DIWALI_EXPIRY_IST, oneSecBeforeMs),
    "Active",
    "Should return 'Active' before expiry when enabled"
  );

  // State B: Before expiry, toggle OFF
  assert.equal(
    getDiwaliThemeStatus(false, DEFAULT_DIWALI_EXPIRY_IST, oneSecBeforeMs),
    "Manually Disabled",
    "Should return 'Manually Disabled' before expiry when disabled"
  );

  // State C: After expiry, toggle ON
  assert.equal(
    getDiwaliThemeStatus(true, DEFAULT_DIWALI_EXPIRY_IST, oneHourAfterMs),
    "Expired",
    "Should return 'Expired' after expiry even when toggle is ON"
  );

  // State D: After expiry, toggle OFF
  assert.equal(
    getDiwaliThemeStatus(false, DEFAULT_DIWALI_EXPIRY_IST, oneHourAfterMs),
    "Expired",
    "Should return 'Expired' after expiry when toggle is OFF"
  );
  console.log("✓ Test 5 Passed: All 3 status states (Active, Manually Disabled, Expired) accurate.\n");

  // -------------------------------------------------------------------------
  // Test 6: Settings Load Failure & Failsafe Evaluation
  // -------------------------------------------------------------------------
  console.log("Test 6: Verifying Storefront Failsafe Behavior on Settings Failure...");
  // If settings fail to load (undefined/null/false)
  assert.equal(isDiwaliThemeActive(false, DEFAULT_DIWALI_EXPIRY_IST, oneSecBeforeMs), false);
  assert.equal(isDiwaliThemeActive(undefined as any, DEFAULT_DIWALI_EXPIRY_IST, oneSecBeforeMs), false);
  assert.equal(isDiwaliThemeActive(null as any, DEFAULT_DIWALI_EXPIRY_IST, oneSecBeforeMs), false);
  console.log("✓ Test 6 Passed: Failsafe verified — decorations default to OFF on failure.\n");

  // -------------------------------------------------------------------------
  // Test 7: Current Live Evaluation (Oct 31, 2026)
  // -------------------------------------------------------------------------
  console.log("Test 7: Evaluating Current Live State (October 31, 2026)...");
  const nowMs = Date.now();
  const currentStatus = getDiwaliThemeStatus(true, DEFAULT_DIWALI_EXPIRY_IST, nowMs);
  const currentActive = isDiwaliThemeActive(true, DEFAULT_DIWALI_EXPIRY_IST, nowMs);
  console.log(`  Current Date/Time : ${formatISTDateTime(new Date(nowMs).toISOString())}`);
  console.log(`  Current Status    : ${currentStatus}`);
  console.log(`  Storefront Active : ${currentActive}`);
  assert.equal(currentStatus, "Active", "Currently (Oct 31, 2026), theme must be Active");
  assert.equal(currentActive, true, "Currently (Oct 31, 2026), storefront must be Active");
  console.log("✓ Test 7 Passed: Current live state verified successfully.\n");

  console.log("==================================================================");
  console.log("  ALL TESTS PASSED SUCCESSFULLY (7/7)                              ");
  console.log("==================================================================");
}

runTests().catch((e) => {
  console.error("Test failed with error:", e);
  process.exit(1);
});
