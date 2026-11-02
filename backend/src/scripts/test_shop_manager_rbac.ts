import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
import assert from "node:assert/strict";
import http from "node:http";
import bcrypt from "bcryptjs";
import { connectDB } from "../config/db";
import { app } from "../app";
import { User } from "../models/User";
import { Product } from "../models/Product";
import { Category } from "../models/Category";
import { Order } from "../models/Order";
import { StockHistory } from "../models/StockHistory";
import { AuditLog } from "../models/AuditLog";

async function runRBACSecuritySuite() {
  console.log("==================================================================");
  console.log("  SHOP MANAGER ROLE-BASED ACCESS CONTROL (RBAC) SECURITY SUITE    ");
  console.log("==================================================================\n");

  await connectDB();

  // Start ephemeral server
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Ephemeral test API listening on ${baseUrl}\n`);

  const timestamp = Date.now();
  const superAdminEmail = `test_admin_${timestamp}@shriradhagovindtest.com`;
  const superAdminPassword = "SuperAdminPassword123!";
  const managerEmail = `test_manager_${timestamp}@shriradhagovindtest.com`;
  const managerPassword = "ManagerPassword123!";
  const managerNewPassword = "NewManagerPassword456!";

  // Track created test IDs for 100% clean-up
  const createdUserIds: any[] = [];
  const createdProductIds: any[] = [];
  const createdCategoryIds: any[] = [];
  const createdOrderIds: any[] = [];
  const createdAuditLogIds: any[] = [];

  let superAdminToken = "";
  let managerToken = "";
  let managerId = "";
  let testProductId = "";
  let testCategoryId = "";
  let testOrderId = "";

  let passedTests = 0;
  let failedTests = 0;

  async function step(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passedTests++;
    } catch (err: any) {
      console.error(`  [FAIL] ${name}`);
      console.error(`         Error: ${err.message || err}`);
      failedTests++;
      throw err;
    }
  }

  try {
    // -------------------------------------------------------------------------
    // STEP 1: Create Super Admin and Log In
    // -------------------------------------------------------------------------
    await step("1. Super Admin authentication and JWT token issuance", async () => {
      const hash = await bcrypt.hash(superAdminPassword, 10);
      const adminUser = await User.create({
        name: "Test Super Admin",
        email: superAdminEmail,
        passwordHash: hash,
        passwordSet: true,
        role: "admin",
        emailVerified: true,
      });
      createdUserIds.push(adminUser._id);

      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: superAdminEmail, password: superAdminPassword }),
      });
      const data: any = await res.json();
      assert.equal(res.status, 200, `Login failed: ${JSON.stringify(data)}`);
      assert.ok(data.token, "JWT token must be present");
      assert.equal(data.user.role, "admin", "Role must be admin");
      superAdminToken = data.token;
    });

    // -------------------------------------------------------------------------
    // STEP 2: Super Admin Creates a Shop Manager
    // -------------------------------------------------------------------------
    await step("2. Super Admin creates Shop Manager account via POST /api/admin/managers", async () => {
      const res = await fetch(`${baseUrl}/api/admin/managers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${superAdminToken}`,
        },
        body: JSON.stringify({
          name: "Govind Shop Manager",
          email: managerEmail,
          password: managerPassword,
          phone: "+91 9876543210",
        }),
      });
      const data: any = await res.json();
      assert.equal(res.status, 201, `Create manager failed: ${JSON.stringify(data)}`);
      assert.ok(data.manager.id, "Manager id must be returned");
      assert.equal(data.manager.role, "shop_manager", "Role must be shop_manager");
      assert.equal(data.manager.isBlocked, false, "Manager must be active");
      managerId = data.manager.id;
      createdUserIds.push(managerId);
    });

    // -------------------------------------------------------------------------
    // STEP 3: Super Admin Lists Shop Managers
    // -------------------------------------------------------------------------
    await step("3. Super Admin retrieves managers list via GET /api/admin/managers", async () => {
      const res = await fetch(`${baseUrl}/api/admin/managers`, {
        headers: { Authorization: `Bearer ${superAdminToken}` },
      });
      const data: any = await res.json();
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(data.managers), "managers array must be returned");
      const found = data.managers.find((m: any) => m.id === managerId);
      assert.ok(found, "Newly created manager must be in the list");
      assert.equal(found.email, managerEmail);
    });

    // -------------------------------------------------------------------------
    // STEP 4: Shop Manager Authentication
    // -------------------------------------------------------------------------
    await step("4. Shop Manager logs in and receives JWT with role shop_manager", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: managerEmail, password: managerPassword }),
      });
      const data: any = await res.json();
      assert.equal(res.status, 200, `Manager login failed: ${JSON.stringify(data)}`);
      assert.ok(data.token, "Token must be present");
      assert.equal(data.user.role, "shop_manager", "User role in response must be shop_manager");
      managerToken = data.token;
    });

    // -------------------------------------------------------------------------
    // STEP 5: Shop Manager Product Management (Create & Edit Allowed, Cost Price Stripped)
    // -------------------------------------------------------------------------
    await step("5. Shop Manager Product CRUD (Create, Edit allowed; Cost Price hidden; Delete forbidden)", async () => {
      // 5a. Create product
      const createRes = await fetch(`${baseUrl}/api/products`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          name: `Test Tulsi Mala ${timestamp}`,
          slug: `test-tulsi-mala-${timestamp}`,
          description: "Authentic Vrindavan Tulsi Mala for Japa",
          price: 499,
          mrp: 999,
          costPrice: 200, // Should be saved or ignored
          stock: 50,
          category: "Vrindavan Specials",
          image: "/tulsi.jpg",
        }),
      });
      const createData: any = await createRes.json();
      assert.equal(createRes.status, 201, `Manager product create failed: ${JSON.stringify(createData)}`);
      testProductId = createData.product._id || createData.product.id;
      createdProductIds.push(testProductId);

      // 5b. Verify Cost Price is STRIPPED when manager fetches products
      const listRes = await fetch(`${baseUrl}/api/products`, {
        headers: { Authorization: `Bearer ${managerToken}` },
      });
      const listData: any = await listRes.json();
      assert.equal(listRes.status, 200);
      const fetchedProduct = listData.products.find((p: any) => String(p._id) === String(testProductId));
      assert.ok(fetchedProduct, "Product must be present in staff product list");
      assert.equal(fetchedProduct.costPrice, undefined, "costPrice MUST be stripped for Shop Manager");

      // Verify Cost Price is also STRIPPED on single product fetch
      const singleRes = await fetch(`${baseUrl}/api/products/${testProductId}`, {
        headers: { Authorization: `Bearer ${managerToken}` },
      });
      const singleData: any = await singleRes.json();
      assert.equal(singleRes.status, 200);
      assert.equal(singleData.product.costPrice, undefined, "costPrice MUST be stripped on single product query");

      // 5c. Update product
      const patchRes = await fetch(`${baseUrl}/api/products/${testProductId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          price: 549,
          description: "Updated description by Shop Manager",
        }),
      });
      assert.equal(patchRes.status, 200, "Manager must be authorized to update products");

      // 5d. Delete product MUST FAIL (HTTP 403)
      const delRes = await fetch(`${baseUrl}/api/products/${testProductId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${managerToken}` },
      });
      assert.equal(delRes.status, 403, "Shop Manager must be forbidden (HTTP 403) from deleting products");
    });

    // -------------------------------------------------------------------------
    // STEP 6: Shop Manager Category Management
    // -------------------------------------------------------------------------
    await step("6. Shop Manager Category Management (Create/Update allowed; Delete forbidden)", async () => {
      // 6a. Create Category
      const catRes = await fetch(`${baseUrl}/api/categories`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          name: `Test Category ${timestamp}`,
          slug: `test-cat-${timestamp}`,
          description: "Test category created by manager",
        }),
      });
      const catData: any = await catRes.json();
      assert.equal(catRes.status, 201, `Manager category create failed: ${JSON.stringify(catData)}`);
      testCategoryId = catData.category._id || catData.category.id;
      createdCategoryIds.push(testCategoryId);

      // 6b. Update Category
      const patchCatRes = await fetch(`${baseUrl}/api/categories/${testCategoryId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          description: "Updated category description",
        }),
      });
      assert.equal(patchCatRes.status, 200, "Manager must be authorized to update categories");

      // 6c. Delete Category MUST FAIL (HTTP 403)
      const delCatRes = await fetch(`${baseUrl}/api/categories/${testCategoryId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${managerToken}` },
      });
      assert.equal(delCatRes.status, 403, "Shop Manager must be forbidden (HTTP 403) from deleting categories");
    });

    // -------------------------------------------------------------------------
    // STEP 7: Shop Manager Inventory Adjustments
    // -------------------------------------------------------------------------
    await step("7. Shop Manager Inventory Adjustments (Audited with actorType: shop_manager)", async () => {
      // 7a. Adjust stock with valid reason
      const adjRes = await fetch(`${baseUrl}/api/admin/inventory/adjust`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          productId: testProductId,
          action: "add",
          quantity: 15,
          reason: "Received New Stock",
          note: "New bulk shipment arrived from Mathura",
        }),
      });
      const adjData: any = await adjRes.json();
      assert.equal(adjRes.status, 200, `Stock adjustment failed: ${JSON.stringify(adjData)}`);
      assert.equal(adjData.product.stock, 65, "Stock must increase by 15 (50 + 15 = 65)");

      // 7b. Verify StockHistory record has actorType: shop_manager
      const history = await StockHistory.findOne({ productId: testProductId }).sort({ createdAt: -1 });
      assert.ok(history, "StockHistory record must be saved");
      assert.equal(history.actorType, "shop_manager", "StockHistory actorType must be shop_manager");

      // 7c. Mandatory note validation when reason is 'Other'
      const invalidAdj = await fetch(`${baseUrl}/api/admin/inventory/adjust`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          productId: testProductId,
          action: "remove",
          quantity: 2,
          reason: "Other",
          note: "", // Empty note must fail
        }),
      });
      assert.equal(invalidAdj.status, 400, "Reason 'Other' without note must be rejected with HTTP 400");
    });

    // -------------------------------------------------------------------------
    // STEP 8: Shop Manager Order Management & Financial Stripping
    // -------------------------------------------------------------------------
    await step("8. Shop Manager Order Operations & Strict Financial Redaction", async () => {
      // Create a test order
      const order = await Order.create({
        orderNo: 999001,
        items: [
          {
            productId: testProductId,
            name: "Test Tulsi Mala",
            qty: 2,
            price: 549,
            costPrice: 200,
          },
        ],
        subtotal: 1098,
        total: 1098,
        customerEmail: "courier-test@shriradhagovindstore.com",
        alternatePhone: "9811223344",
        guestAccessToken: "SECRET_GUEST_TOKEN_12345",
        invoiceOneTimeToken: "SECRET_INVOICE_TOKEN_67890",
        refund: {
          amount: 200,
          method: "upi",
          upiReference: "UPI987654321012",
        },
        payment: {
          method: "cod",
          status: "pending",
        },
        status: "Placed",
        productCost: 400,
        packagingCost: 25,
        razorpayFee: 0,
        courierCharge: 80,
        totalExpense: 505,
        netProfit: 593,
        address: {
          name: "Radha Bhakt",
          phone: "9876543210",
          alternatePhone: "9811223344",
          line1: "Near Bankey Bihari Temple",
          line2: "Opposite Prem Mandir Road",
          postOffice: "Vrindavan PO",
          city: "Vrindavan",
          state: "Uttar Pradesh",
          pincode: "281121",
        },
      });
      testOrderId = String(order._id);
      createdOrderIds.push(testOrderId);

      // 8a. Shop Manager lists orders -> Financial fields stripped, delivery info and COD collection preserved
      const ordersRes = await fetch(`${baseUrl}/api/admin/orders`, {
        headers: { Authorization: `Bearer ${managerToken}` },
      });
      const ordersData: any = await ordersRes.json();
      assert.equal(ordersRes.status, 200);
      const managerOrder = ordersData.orders.find((o: any) => String(o._id || o.id) === testOrderId);
      assert.ok(managerOrder, "Order must be visible to manager");
      assert.equal(managerOrder.productCost, undefined, "productCost must be stripped");
      assert.equal(managerOrder.packagingCost, undefined, "packagingCost must be stripped");
      assert.equal(managerOrder.netProfit, undefined, "netProfit must be stripped");
      assert.equal(managerOrder.totalExpense, undefined, "totalExpense must be stripped");
      assert.equal(managerOrder.courierCharge, undefined, "courierCharge must be stripped");
      assert.equal(managerOrder.total, 1098, "Grand total for COD collection must remain visible");

      // Verify complete customer delivery information access for operational purposes
      assert.equal(managerOrder.address?.name, "Radha Bhakt", "Customer name must be visible");
      assert.equal(managerOrder.address?.phone, "9876543210", "Primary phone must be visible");
      assert.equal(managerOrder.address?.alternatePhone, "9811223344", "Alternate phone must be visible");
      assert.equal(managerOrder.customerEmail, "courier-test@shriradhagovindstore.com", "Customer email must be visible");
      assert.equal(managerOrder.address?.line1, "Near Bankey Bihari Temple", "Line 1 house/street must be visible");
      assert.equal(managerOrder.address?.line2, "Opposite Prem Mandir Road", "Line 2 landmark/area must be visible");
      assert.equal(managerOrder.address?.postOffice, "Vrindavan PO", "Post office must be visible");
      assert.equal(managerOrder.address?.city, "Vrindavan", "City must be visible");
      assert.equal(managerOrder.address?.state, "Uttar Pradesh", "State must be visible");
      assert.equal(managerOrder.address?.pincode, "281121", "Pincode must be visible");

      // Verify ordered products and quantities
      assert.ok(Array.isArray(managerOrder.items) && managerOrder.items.length === 1, "Items array must be visible");
      assert.equal(managerOrder.items[0].name, "Test Tulsi Mala");
      assert.equal(managerOrder.items[0].qty, 2);
      assert.equal(managerOrder.items[0].costPrice, undefined, "Item internal costPrice must be stripped");

      // Security: verify sensitive tokens and payment secrets are NOT exposed
      assert.equal(managerOrder.guestAccessToken, undefined, "guestAccessToken must be stripped");
      assert.equal(managerOrder.invoiceOneTimeToken, undefined, "invoiceOneTimeToken must be stripped");
      assert.equal(managerOrder.refund, undefined, "refund and UPI reference must be stripped");
      assert.equal(managerOrder.payment?.razorpayPaymentId, undefined, "razorpayPaymentId must be stripped");
      assert.equal(managerOrder.payment?.razorpayOrderId, undefined, "razorpayOrderId must be stripped");

      // Test invoice download by manager
      const invoiceRes = await fetch(`${baseUrl}/api/admin/orders/${testOrderId}/invoice`, {
        headers: { Authorization: `Bearer ${managerToken}` },
      });
      assert.equal(invoiceRes.status, 200, "Manager must be able to download invoice PDF");
      assert.ok(invoiceRes.headers.get("content-type")?.includes("application/pdf"), "Invoice must be PDF");

      // Test packing slip download by manager
      const packingRes = await fetch(`${baseUrl}/api/admin/orders/${testOrderId}/packing-slip`, {
        headers: { Authorization: `Bearer ${managerToken}` },
      });
      assert.equal(packingRes.status, 200, "Manager must be able to download packing slip PDF");
      assert.ok(packingRes.headers.get("content-type")?.includes("application/pdf"), "Packing slip must be PDF");

      // 8b. Transition Placed -> Confirmed
      const st1 = await fetch(`${baseUrl}/api/admin/orders/${testOrderId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({ status: "Confirmed", note: "Order verified" }),
      });
      assert.equal(st1.status, 200, "Manager must be able to confirm order");

      // 8c. Transition Confirmed -> Processing
      const st2 = await fetch(`${baseUrl}/api/admin/orders/${testOrderId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({ status: "Processing" }),
      });
      assert.equal(st2.status, 200, "Manager must be able to move order to Processing");

      // 8d. Transition Processing -> Packed
      const st3 = await fetch(`${baseUrl}/api/admin/orders/${testOrderId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({ status: "Packed" }),
      });
      assert.equal(st3.status, 200, "Manager must be able to move order to Packed");

      // 8e. Attempt Shipped WITHOUT courier and trackingId MUST FAIL (HTTP 400)
      const stShippedNoAwb = await fetch(`${baseUrl}/api/admin/orders/${testOrderId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({ status: "Shipped" }),
      });
      assert.equal(stShippedNoAwb.status, 400, "Marking Shipped without courier/AWB must be rejected with HTTP 400");

      // 8f. Valid Shipped transition with Courier and Tracking ID
      const stShippedValid = await fetch(`${baseUrl}/api/admin/orders/${testOrderId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          status: "Shipped",
          courier: "DTDC",
          trackingId: "DTDC987654321",
        }),
      });
      assert.equal(stShippedValid.status, 200, "Marking Shipped with courier/AWB must succeed");
    });

    // -------------------------------------------------------------------------
    // STEP 9: Forbidden Actions for Shop Manager (HTTP 403 Verification)
    // -------------------------------------------------------------------------
    await step("9. Verify HTTP 403 Forbidden on all sensitive/financial endpoints", async () => {
      // 9a. Order cancellation forbidden for manager
      const cancelRes = await fetch(`${baseUrl}/api/admin/orders/${testOrderId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({ status: "Cancelled" }),
      });
      assert.equal(cancelRes.status, 403, "Manager must not be allowed to cancel orders");

      // 9b. Order delivered forbidden for manager
      const deliverRes = await fetch(`${baseUrl}/api/admin/orders/${testOrderId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({ status: "Delivered" }),
      });
      assert.equal(deliverRes.status, 403, "Manager must not be allowed to mark orders Delivered");

      // 9c. Courier charge financial modification forbidden
      const chargeRes = await fetch(`${baseUrl}/api/admin/orders/${testOrderId}/courier-charge`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({ courierCharge: 120 }),
      });
      assert.equal(chargeRes.status, 403, "Manager must not be allowed to modify courier charge");

      // 9d. Manual refund execution forbidden
      const refundRes = await fetch(`${baseUrl}/api/admin/orders/${testOrderId}/refund`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({ upiReference: "UPI987654321", notes: "test refund" }),
      });
      assert.equal(refundRes.status, 403, "Manager must not be allowed to execute refunds");

      // 9e. Business stats & revenue forbidden
      const statsRes = await fetch(`${baseUrl}/api/admin/stats`, {
        headers: { Authorization: `Bearer ${managerToken}` },
      });
      assert.equal(statsRes.status, 403, "Manager must not access business stats");

      // 9f. Registered user list forbidden
      const usersRes = await fetch(`${baseUrl}/api/admin/users`, {
        headers: { Authorization: `Bearer ${managerToken}` },
      });
      assert.equal(usersRes.status, 403, "Manager must not access user accounts");

      // 9g. Manager accounts management forbidden
      const managersRes = await fetch(`${baseUrl}/api/admin/managers`, {
        headers: { Authorization: `Bearer ${managerToken}` },
      });
      assert.equal(managersRes.status, 403, "Manager must not access manager accounts");

      // 9h. Settings modification forbidden
      const settingsRes = await fetch(`${baseUrl}/api/settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({ siteName: "Hacked" }),
      });
      assert.equal(settingsRes.status, 403, "Manager must not modify store settings");

      // 9i. Coupon creation forbidden
      const couponRes = await fetch(`${baseUrl}/api/admin/coupons`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({ code: "DISCOUNT50", type: "flat", value: 50 }),
      });
      assert.equal(couponRes.status, 403, "Manager must not create coupons");
    });

    // -------------------------------------------------------------------------
    // STEP 10: Shop Manager Account Lifecycle (Deactivate, Reactivate, Reset Pw, Delete)
    // -------------------------------------------------------------------------
    await step("10. Super Admin Manager Lifecycle Management (Deactivate, Reactivate, Reset PW, Delete)", async () => {
      // 10a. Deactivate manager
      const blockRes = await fetch(`${baseUrl}/api/admin/managers/${managerId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${superAdminToken}`,
        },
        body: JSON.stringify({ isBlocked: true }),
      });
      assert.equal(blockRes.status, 200);

      // Verify deactivated manager cannot log in
      const blockLogin = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: managerEmail, password: managerPassword }),
      });
      assert.equal(blockLogin.status, 403, "Deactivated manager login must return HTTP 403");

      // 10b. Reactivate manager
      const unblockRes = await fetch(`${baseUrl}/api/admin/managers/${managerId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${superAdminToken}`,
        },
        body: JSON.stringify({ isBlocked: false }),
      });
      assert.equal(unblockRes.status, 200);

      // 10c. Reset manager password
      const pwRes = await fetch(`${baseUrl}/api/admin/managers/${managerId}/password`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${superAdminToken}`,
        },
        body: JSON.stringify({ password: managerNewPassword }),
      });
      assert.equal(pwRes.status, 200);

      // Old password fails
      const oldPwLogin = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: managerEmail, password: managerPassword }),
      });
      assert.notEqual(oldPwLogin.status, 200, "Old password must fail");

      // New password succeeds
      const newPwLogin = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: managerEmail, password: managerNewPassword }),
      });
      assert.equal(newPwLogin.status, 200, "New password must succeed");

      // 10d. Delete manager
      const delManagerRes = await fetch(`${baseUrl}/api/admin/managers/${managerId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${superAdminToken}` },
      });
      assert.equal(delManagerRes.status, 200, "Super admin must be able to delete manager");

      // Deleted manager cannot log in
      const delLogin = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: managerEmail, password: managerNewPassword }),
      });
      assert.equal(delLogin.status, 401, "Deleted manager login must return HTTP 401");
    });

    // -------------------------------------------------------------------------
    // STEP 11: Audit Trail Verification
    // -------------------------------------------------------------------------
    await step("11. Super Admin Audit Log Verification", async () => {
      const logsRes = await fetch(`${baseUrl}/api/admin/audit-logs`, {
        headers: { Authorization: `Bearer ${superAdminToken}` },
      });
      assert.equal(logsRes.status, 200);
      const logsData: any = await logsRes.json();
      assert.ok(Array.isArray(logsData.logs), "logs array must be returned");

      // Check for actions performed by shop_manager
      const managerLogs = logsData.logs.filter((l: any) => l.actorRole === "shop_manager");
      assert.ok(managerLogs.length >= 2, "Audit trail must have records for shop_manager actions");

      const hasStockAdjust = managerLogs.some((l: any) => l.action === "stock.adjust");
      assert.ok(hasStockAdjust, "stock.adjust audit log must be present");

      const hasProductCreate = managerLogs.some((l: any) => l.action === "product.create");
      assert.ok(hasProductCreate, "product.create audit log must be present");

      const hasStatusUpdate = managerLogs.some((l: any) => l.action === "order.status_update");
      assert.ok(hasStatusUpdate, "order.status_update audit log must be present");
    });

    console.log("\n==================================================================");
    console.log(`  ALL RBAC SECURITY & FUNCTIONALITY TESTS PASSED (${passedTests}/${passedTests})!`);
    console.log("==================================================================\n");
  } finally {
    console.log("Running comprehensive cleanup of test artifacts...");
    try {
      if (createdUserIds.length > 0) {
        await User.deleteMany({ _id: { $in: createdUserIds } });
      }
      if (createdProductIds.length > 0) {
        await Product.deleteMany({ _id: { $in: createdProductIds } });
      }
      if (createdCategoryIds.length > 0) {
        await Category.deleteMany({ _id: { $in: createdCategoryIds } });
      }
      if (createdOrderIds.length > 0) {
        await Order.deleteMany({ _id: { $in: createdOrderIds } });
      }
      if (createdProductIds.length > 0) {
        await StockHistory.deleteMany({ productId: { $in: createdProductIds } });
      }
      await AuditLog.deleteMany({
        $or: [
          { actorEmail: { $in: [superAdminEmail, managerEmail] } },
          { targetIdentifier: { $in: [superAdminEmail, managerEmail] } },
        ],
      });
      console.log("✓ All test artifacts cleanly deleted from database.");
    } catch (cleanErr: any) {
      console.error("Cleanup error:", cleanErr.message);
    }

    server.close();
  }
}

runRBACSecuritySuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test suite encountered fatal error:", err);
    process.exit(1);
  });
