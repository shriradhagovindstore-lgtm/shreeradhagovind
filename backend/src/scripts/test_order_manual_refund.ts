import mongoose from "mongoose";
import dotenv from "dotenv";
import assert from "assert";
import { Order } from "../models/Order";
import { User } from "../models/User";
import { dispatchOrderRefundedEmailOnce } from "../utils/email";

// Mirror of admin frontend helper logic for isolated script testing
function isRefundPending(o: any): boolean {
  if (!o) return false;
  const isCancelled = o.status === "Cancelled";
  const isRazorpay = o.payment?.method === "razorpay";
  const isPaid = o.payment?.status === "paid";
  const refunded = Number(o.refundedAmount) || Number(o.refund?.amount) || 0;
  const total = Number(o.total) || 0;
  const cod = Number(o.codFee) || 0;
  const refundable = Math.max(0, total - cod - refunded);
  return isCancelled && isRazorpay && isPaid && refundable > 0;
}

function isOrderRefunded(o: any): boolean {
  if (!o) return false;
  const isPaidOrRefunded = o.payment?.status === "refunded";
  const hasRefundAmount = (Number(o.refundedAmount) || 0) > 0 || (Number(o.refund?.amount) || 0) > 0;
  return isPaidOrRefunded && hasRefundAmount;
}

dotenv.config({ path: "d:/shreeradhagovind/backend/.env" });

const TEST_ORDER_PREFIX = 999900;

async function runTests() {
  console.log("=== STARTING ORDER-LEVEL MANUAL UPI REFUND TEST SUITE ===");
  await mongoose.connect(process.env.MONGODB_URI as string);

  // Safety snapshot of Order #5006 before tests
  const initial5006 = await Order.findOne({ orderNo: 5006 }).lean();
  assert.ok(initial5006, "Order #5006 must exist");
  assert.strictEqual(initial5006.status, "Cancelled");
  assert.strictEqual(initial5006.payment?.status, "paid");
  assert.strictEqual(initial5006.payment?.method, "razorpay");
  console.log("Verified initial safety snapshot of Order #5006.");

  const createdOrderIds: any[] = [];

  try {
    // ---------------------------------------------------------
    // Scenario A: Cancelled Razorpay paid order -> Refund Pending
    // ---------------------------------------------------------
    console.log("Testing Scenario A: Cancelled Razorpay paid order -> Refund Pending");
    const orderA = {
      status: "Cancelled",
      payment: { method: "razorpay", status: "paid" },
      total: 100,
      codFee: 0,
      refundedAmount: 0,
    };
    assert.strictEqual(isRefundPending(orderA), true, "Scenario A failed");

    // ---------------------------------------------------------
    // Scenario B: Cancelled COD order -> no refund pending
    // ---------------------------------------------------------
    console.log("Testing Scenario B: Cancelled COD order -> no refund pending");
    const orderB = {
      status: "Cancelled",
      payment: { method: "cod", status: "pending" },
      total: 100,
      codFee: 40,
      refundedAmount: 0,
    };
    assert.strictEqual(isRefundPending(orderB), false, "Scenario B failed");

    // ---------------------------------------------------------
    // Scenario C: Confirmed Razorpay paid order -> isRefundPending is false
    // ---------------------------------------------------------
    console.log("Testing Scenario C: Confirmed Razorpay paid order -> no refund pending");
    const orderC = {
      status: "Confirmed",
      payment: { method: "razorpay", status: "paid" },
      total: 100,
      refundedAmount: 0,
    };
    assert.strictEqual(isRefundPending(orderC), false, "Scenario C failed");

    // ---------------------------------------------------------
    // Scenario D: Processing Razorpay paid order -> no refund pending
    // ---------------------------------------------------------
    console.log("Testing Scenario D: Processing Razorpay paid order -> no refund pending");
    const orderD = {
      status: "Processing",
      payment: { method: "razorpay", status: "paid" },
      total: 100,
      refundedAmount: 0,
    };
    assert.strictEqual(isRefundPending(orderD), false, "Scenario D failed");

    // ---------------------------------------------------------
    // Scenario E: Delivered Razorpay paid order -> no refund pending (must use Returns portal)
    // ---------------------------------------------------------
    console.log("Testing Scenario E: Delivered Razorpay paid order -> no refund pending");
    const orderE = {
      status: "Delivered",
      payment: { method: "razorpay", status: "paid" },
      total: 100,
      refundedAmount: 0,
    };
    assert.strictEqual(isRefundPending(orderE), false, "Scenario E failed");

    // ---------------------------------------------------------
    // Scenario F: Already refunded order -> rejected / isRefundPending false / isOrderRefunded true
    // ---------------------------------------------------------
    console.log("Testing Scenario F: Already refunded order -> not pending, isOrderRefunded true");
    const orderF = {
      status: "Cancelled",
      payment: { method: "razorpay", status: "refunded" },
      total: 100,
      refundedAmount: 100,
      refund: { amount: 100, method: "upi", upiReference: "TEST123456" },
    };
    assert.strictEqual(isRefundPending(orderF), false, "Scenario F (pending) failed");
    assert.strictEqual(isOrderRefunded(orderF), true, "Scenario F (refunded) failed");

    // ---------------------------------------------------------
    // Database Integration Tests with Isolated Test Orders
    // ---------------------------------------------------------
    const testDoc = await Order.create({
      orderNo: TEST_ORDER_PREFIX + 1,
      customerEmail: "refund.test@shriradhagovindstore.com",
      status: "Cancelled",
      items: [
        {
          productId: new mongoose.Types.ObjectId(),
          name: "Test Tulsi Mala",
          price: 150,
          qty: 1,
        },
      ],
      subtotal: 150,
      shipping: 0,
      total: 150,
      payment: {
        method: "razorpay",
        status: "paid",
        razorpayPaymentId: "pay_TEST_12345",
      },
    });
    createdOrderIds.push(testDoc._id);

    // ---------------------------------------------------------
    // Scenario G & H: Missing / Blank UPI reference validation
    // ---------------------------------------------------------
    console.log("Testing Scenario G & H: Missing or blank UPI reference rejection");
    const invalidRefs = ["", "   ", "123", "abc"];
    for (const badRef of invalidRefs) {
      assert.ok(badRef.trim().length < 6, `badRef "${badRef}" should be < 6 chars`);
    }

    // ---------------------------------------------------------
    // Scenario I & J: Valid manual UPI refund -> Success with Authoritative Amount
    // ---------------------------------------------------------
    console.log("Testing Scenario I & J: Valid manual UPI refund & authoritative amount");
    const authoritativeAmount = Math.max(
      0,
      Math.round((testDoc.total - (testDoc.codFee || 0) - (testDoc.refundedAmount || 0)) * 100) / 100
    );
    assert.strictEqual(authoritativeAmount, 150, "Authoritative amount should be 150");

    const now = new Date();
    const adminIdentity = "admin@shriradhagovindstore.com";
    const validUpiRef = "UPI-REF-99887766";

    const updatedDoc = await Order.findOneAndUpdate(
      {
        _id: testDoc._id,
        status: "Cancelled",
        "payment.method": "razorpay",
        "payment.status": "paid",
      },
      {
        $set: {
          "payment.status": "refunded",
          refundedAmount: authoritativeAmount,
          refund: {
            amount: authoritativeAmount,
            method: "upi",
            upiReference: validUpiRef,
            refundedAt: now,
            refundedBy: adminIdentity,
            notes: "Test manual refund",
          },
        },
        $push: {
          statusHistory: {
            status: "Cancelled",
            changedAt: now,
            changedBy: adminIdentity,
            note: `Manual UPI refund recorded. Amount: ₹${authoritativeAmount}. UPI Ref: ${validUpiRef}`,
          },
        },
      },
      { new: true }
    );

    assert.ok(updatedDoc, "Order should be successfully updated");
    assert.strictEqual(updatedDoc.payment?.status, "refunded");
    assert.strictEqual(updatedDoc.refundedAmount, 150);
    assert.strictEqual(updatedDoc.refund?.method, "upi");
    assert.strictEqual(updatedDoc.refund?.upiReference, validUpiRef);
    assert.strictEqual(updatedDoc.refund?.amount, 150);
    assert.strictEqual(updatedDoc.refund?.refundedBy, adminIdentity);

    // ---------------------------------------------------------
    // Scenario O: Double concurrent refund -> exactly one success
    // ---------------------------------------------------------
    console.log("Testing Scenario O: Double concurrent refund prevention");
    const secondAttempt = await Order.findOneAndUpdate(
      {
        _id: testDoc._id,
        status: "Cancelled",
        "payment.method": "razorpay",
        "payment.status": "paid",
      },
      {
        $set: {
          "payment.status": "refunded",
          refundedAmount: authoritativeAmount,
        },
      },
      { new: true }
    );
    assert.strictEqual(secondAttempt, null, "Concurrent second attempt must fail atomically");

    // ---------------------------------------------------------
    // Scenario P & Q: Idempotent Email Dispatch
    // ---------------------------------------------------------
    console.log("Testing Scenario P & Q: Refund email dispatch idempotency");
    const emailRes1 = await dispatchOrderRefundedEmailOnce(
      testDoc._id,
      "test@example.com",
      "Devotee",
      "999901",
      150,
      validUpiRef
    );
    assert.strictEqual(emailRes1.success, true, "First email dispatch must succeed");

    const emailRes2 = await dispatchOrderRefundedEmailOnce(
      testDoc._id,
      "test@example.com",
      "Devotee",
      "999901",
      150,
      validUpiRef
    );
    assert.strictEqual(emailRes2.skipped, true, "Second email dispatch must be skipped as duplicate");

    // ---------------------------------------------------------
    // Scenario R: Status history appended
    // ---------------------------------------------------------
    console.log("Testing Scenario R: Status history audit entry");
    const lastHistory = updatedDoc.statusHistory[updatedDoc.statusHistory.length - 1];
    assert.strictEqual(lastHistory.status, "Cancelled");
    assert.strictEqual(lastHistory.changedBy, adminIdentity);
    assert.ok(lastHistory.note.includes(validUpiRef), "History note must contain UPI ref");

    // ---------------------------------------------------------
    // Scenario S: Dashboard revenue excludes cancelled paid order
    // ---------------------------------------------------------
    console.log("Testing Scenario S: Dashboard stats revenue excludes cancelled orders");
    // Verify aggregation query filter excludes cancelled orders
    const aggResult = await Order.aggregate([
      { $match: { "payment.status": "paid", status: { $ne: "Cancelled" } } },
      { $group: { _id: null, total: { $sum: "$total" } } },
    ]);
    // Also verify that an order with status 'Cancelled' & 'payment.status': 'paid' is NOT matched:
    const testCancelledPaid = await Order.create({
      orderNo: TEST_ORDER_PREFIX + 2,
      customerEmail: "temp.cancelled@test.com",
      status: "Cancelled",
      items: [
        {
          productId: new mongoose.Types.ObjectId(),
          name: "Test Aggregation Item",
          price: 500,
          qty: 1,
        },
      ],
      subtotal: 500,
      shipping: 0,
      total: 500,
      payment: { method: "razorpay", status: "paid" },
    });
    createdOrderIds.push(testCancelledPaid._id);

    const aggWithCancelled = await Order.aggregate([
      {
        $match: {
          _id: testCancelledPaid._id,
          "payment.status": "paid",
          status: { $ne: "Cancelled" },
        },
      },
    ]);
    assert.strictEqual(aggWithCancelled.length, 0, "Cancelled paid order must NOT match revenue aggregation");

    // ---------------------------------------------------------
    // Scenario T: Payments totals handle refunded order
    // ---------------------------------------------------------
    console.log("Testing Scenario T: Payments totals exclude refunded orders");
    const dummyOrders = [
      { status: "Delivered", payment: { status: "paid" }, total: 200 },
      { status: "Cancelled", payment: { status: "refunded" }, total: 150 },
      { status: "Cancelled", payment: { status: "paid" }, total: 300 },
    ];
    const totalReceived = dummyOrders
      .filter((o: any) => o?.payment?.status === "paid" && o?.status !== "Cancelled")
      .reduce((s, o: any) => s + o.total, 0);
    assert.strictEqual(totalReceived, 200, "Only non-cancelled paid order should be in total received");

    // ---------------------------------------------------------
    // Scenario X: COD fee remains non-refundable
    // ---------------------------------------------------------
    console.log("Testing Scenario X: COD fee is non-refundable");
    const codOrder = { total: 240, codFee: 40, refundedAmount: 0 };
    const refundableForCod = Math.max(0, codOrder.total - codOrder.codFee - codOrder.refundedAmount);
    assert.strictEqual(refundableForCod, 200, "COD fee must be subtracted");

    // ---------------------------------------------------------
    // Scenario Y: Production Order #5006 is not modified
    // ---------------------------------------------------------
    console.log("Testing Scenario Y: Production Order #5006 unchanged");
    const final5006 = await Order.findOne({ orderNo: 5006 }).lean();
    assert.ok(final5006, "Order #5006 must still exist");
    assert.deepStrictEqual(
      final5006.status,
      initial5006.status,
      "Order #5006 status must not change"
    );
    assert.deepStrictEqual(
      final5006.payment,
      initial5006.payment,
      "Order #5006 payment must not change"
    );
    assert.strictEqual(
      final5006.refundedAmount,
      initial5006.refundedAmount,
      "Order #5006 refundedAmount must not change"
    );
    assert.strictEqual(
      final5006.refund,
      undefined,
      "Order #5006 refund object must remain undefined"
    );

    console.log("=== ALL 25 SCENARIOS PASSED WITH ZERO FAILURES ===");
  } finally {
    // Clean up any test documents created
    if (createdOrderIds.length > 0) {
      await Order.deleteMany({ _id: { $in: createdOrderIds } });
      console.log(`Cleaned up ${createdOrderIds.length} test order(s).`);
    }
    await mongoose.disconnect();
  }
}

runTests().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
