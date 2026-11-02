import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { Product } from "../models/Product";

export type InvoiceItem = {
  productId?: string | any;
  name?: string;
  qty: number;
  price?: number;
  hsnCode?: string;
  gstRate?: number;
  gstInclusive?: boolean;
  taxableAmount?: number;
  gstAmount?: number;
  comboComponents?: Array<{
    name: string;
    qty: number;
    hsnCode?: string;
    gstRate?: number;
    gstInclusive?: boolean;
    baseValue?: number;
    allocatedPrice?: number;
    taxableAmount?: number;
    gstAmount?: number;
  }>;
};

export type InvoiceAddr = {
  name?: string;
  phone?: string;
  alternatePhone?: string;
  line1?: string;
  line2?: string;
  postOffice?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
};

export type InvoiceTax = {
  cgst?: number;
  sgst?: number;
  igst?: number;
  ratePercent?: number;
  taxableAmount?: number;
};

export type InvoiceData = {
  orderId: string;
  orderNo?: number | string | null;
  invoiceNo?: string;
  trackingId?: string;
  courier?: string | null;
  status?: string;
  customerName: string;
  customerEmail?: string;
  businessName?: string;
  gstin?: string;
  needsGstInvoice?: boolean;
  items: InvoiceItem[];
  subtotal: number;
  discount?: number;
  couponCode?: string;
  loyaltyPointsRedeemed?: number;
  loyaltyDiscount?: number;
  walletUsed?: number;
  shipping: number;
  shippingMethod?: string;
  packagingCost?: number;
  codFee?: number;
  total: number;
  tax?: InvoiceTax;
  address: InvoiceAddr;
  payment: {
    method: string;
    status: string;
    razorpayPaymentId?: string;
  };
  createdAt?: Date | string | number;
  packedByName?: string;
};

// Official Store Details (WordPress Reference Match)
const BRAND_NAME = "Shri Radha Govind Store";
const SELLER_LINE1 = "155, 2nd Floor,";
const SELLER_LINE2 = "Madan Mohan Ghera";
const SELLER_LINE3 = "Vrindavan 281121";
const SELLER_LINE4 = "Uttar Pradesh, India";
const SELLER_GSTIN = "GSTIN/UIN: 09CHYPN5573J1Z9";
const SELLER_EMAIL = "support@shriradhagovindstore.com";
const SELLER_PHONE = "+91 75005 33505";
const SELLER_WEBSITE = "www.shriradhagovindstore.com";

const round2 = (num: number): number => Math.round((Number(num) || 0) * 100) / 100;
const rupee = (n: number) => `Rs. ${round2(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type ComputedTaxLine = {
  name: string;
  hsnCode: string;
  qty: number;
  unitPrice: number;
  taxableUnit: number;
  taxableValue: number;
  gstRate: number;
  gstInclusive: boolean;
  taxAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  lineTotal: number;
  components?: Array<{
    name: string;
    hsnCode: string;
    qty: number;
    allocatedPrice: number;
    taxableValue: number;
    gstRate: number;
    taxAmount: number;
    cgst: number;
    sgst: number;
    igst: number;
  }>;
};

export type ComputedTaxSummary = {
  taxableSubtotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  taxTotal: number;
  isIntraState: boolean;
  state: string;
  lines: ComputedTaxLine[];
};

/**
 * Calculates accurate GST values for each line item and determines
 * intra-state (CGST + SGST) vs inter-state (IGST) breakdown based on delivery state.
 */
export function computeOrderTaxDetails(
  items: InvoiceItem[],
  address?: InvoiceAddr
): ComputedTaxSummary {
  const stateStr = (address?.state || "").trim().toLowerCase();
  // Seller is in Uttar Pradesh (UP). Intra-state if customer state is UP.
  const isIntraState =
    stateStr === "uttar pradesh" ||
    stateStr === "up" ||
    stateStr === "uttarpradesh" ||
    stateStr.includes("uttar pradesh") ||
    stateStr.includes("vrindavan") ||
    stateStr.includes("mathura");

  const lines: ComputedTaxLine[] = items.map((it) => {
    const name = it.name ?? "Sacred Item";
    const qty = Math.max(1, Number(it.qty) || 1);
    const unitPrice = round2(Number(it.price) || 0);
    const gstRate = round2(Number(it.gstRate) || 0);
    const gstInclusive = it.gstInclusive !== false; // default true
    const hsnCode = (it.hsnCode || "").trim();

    let taxableUnit = unitPrice;
    let unitTax = 0;
    let taxableValue = round2(unitPrice * qty);
    let taxAmount = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    let components: ComputedTaxLine["components"] = undefined;

    if (Array.isArray(it.comboComponents) && it.comboComponents.length > 0) {
      components = it.comboComponents.map((comp) => {
        const compName = (comp.name || "Component").trim();
        const compHsn = (comp.hsnCode || "").trim();
        if (!compHsn || compHsn === "-") {
          throw new Error(
            `Invalid GST configuration: Combo component "${compName}" is missing an HSN code. Cannot compute taxes or generate invoice without valid HSN.`
          );
        }
        if (comp.gstRate === undefined || comp.gstRate === null || isNaN(Number(comp.gstRate)) || Number(comp.gstRate) < 0 || Number(comp.gstRate) > 28) {
          throw new Error(
            `Invalid GST configuration: Combo component "${compName}" has an invalid GST rate (${comp.gstRate}). Cannot compute taxes or generate invoice.`
          );
        }
        const cTaxable = round2(comp.taxableAmount ?? 0);
        const cTax = round2(comp.gstAmount ?? 0);
        const cRate = round2(Number(comp.gstRate) || 0);
        let cCgst = 0;
        let cSgst = 0;
        let cIgst = 0;
        if (cTax > 0 || cRate > 0) {
          if (isIntraState) {
            cCgst = round2(cTax / 2);
            cSgst = round2(cTax - cCgst);
          } else {
            cIgst = cTax;
          }
        }
        return {
          name: comp.name,
          hsnCode: compHsn,
          qty: Math.max(1, Number(comp.qty) || 1),
          allocatedPrice: round2(comp.allocatedPrice ?? (cTaxable + cTax)),
          taxableValue: cTaxable,
          gstRate: cRate,
          taxAmount: cTax,
          cgst: cCgst,
          sgst: cSgst,
          igst: cIgst,
        };
      });

      taxableValue = round2(components.reduce((sum, c) => sum + c.taxableValue, 0));
      taxAmount = round2(components.reduce((sum, c) => sum + c.taxAmount, 0));
      cgst = round2(components.reduce((sum, c) => sum + c.cgst, 0));
      sgst = round2(components.reduce((sum, c) => sum + c.sgst, 0));
      igst = round2(components.reduce((sum, c) => sum + c.igst, 0));
      taxableUnit = round2(taxableValue / qty);
      unitTax = round2(taxAmount / qty);
    } else {
      // Strict priority: Use stored snapshot taxable/gst amounts if present on the historical order
      if (typeof it.taxableAmount === "number" && typeof it.gstAmount === "number" && (it.taxableAmount > 0 || it.gstAmount > 0)) {
        taxableValue = round2(it.taxableAmount);
        taxAmount = round2(it.gstAmount);
        taxableUnit = round2(taxableValue / qty);
        unitTax = round2(taxAmount / qty);
      } else if (gstRate > 0) {
        if (gstInclusive) {
          taxableUnit = round2(unitPrice / (1 + gstRate / 100));
          unitTax = round2(unitPrice - taxableUnit);
        } else {
          taxableUnit = unitPrice;
          unitTax = round2(unitPrice * (gstRate / 100));
        }
        taxableValue = round2(taxableUnit * qty);
        taxAmount = round2(unitTax * qty);
      }

      if (taxAmount > 0 || gstRate > 0) {
        if (isIntraState) {
          cgst = round2(taxAmount / 2);
          sgst = round2(taxAmount - cgst);
        } else {
          igst = taxAmount;
        }
      }
    }

    const lineTotal = gstInclusive ? round2(unitPrice * qty) : round2((unitPrice + unitTax) * qty);

    return {
      name,
      hsnCode: hsnCode || "-",
      qty,
      unitPrice,
      taxableUnit,
      taxableValue,
      gstRate,
      gstInclusive,
      taxAmount,
      cgst,
      sgst,
      igst,
      lineTotal,
      components,
    };
  });

  const taxableSubtotal = round2(lines.reduce((sum, l) => sum + l.taxableValue, 0));
  const cgstTotal = round2(lines.reduce((sum, l) => sum + l.cgst, 0));
  const sgstTotal = round2(lines.reduce((sum, l) => sum + l.sgst, 0));
  const igstTotal = round2(lines.reduce((sum, l) => sum + l.igst, 0));
  const taxTotal = round2(cgstTotal + sgstTotal + igstTotal);

  return {
    taxableSubtotal,
    cgstTotal,
    sgstTotal,
    igstTotal,
    taxTotal,
    isIntraState,
    state: address?.state || "Uttar Pradesh",
    lines,
  };
}

function findLogoPath(): string | null {
  const logoFile = "1080X1080Retina Llogo.png";
  const candidates = [
    // 1. In same backend assets dir relative to this file (__dirname is src/utils or dist/utils)
    path.join(__dirname, "../assets", logoFile),
    // 2. In src/assets relative to dist/utils when running compiled JS
    path.join(__dirname, "../../src/assets", logoFile),
    // 3. Process CWD based resolutions
    path.join(process.cwd(), "src/assets", logoFile),
    path.join(process.cwd(), "dist/assets", logoFile),
    path.join(process.cwd(), "backend/src/assets", logoFile),
    path.join(process.cwd(), "backend/dist/assets", logoFile),
    // 4. Fallback logo file names
    path.join(__dirname, "../assets/logo.png"),
    path.join(__dirname, "../../src/assets/logo.png"),
    path.join(process.cwd(), "src/assets/logo.png"),
    path.join(process.cwd(), "dist/assets/logo.png"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }
  return null;
}

export async function enrichInvoiceItems(items: InvoiceItem[]): Promise<InvoiceItem[]> {
  if (!Array.isArray(items) || items.length === 0) return [];

  // Identify items that lack historical GST snapshot
  const missingSnapshotItems = items.filter((it: any) => {
    const hasHsn = Boolean(it.hsnCode && String(it.hsnCode).trim());
    const hasGstRate = typeof it.gstRate === "number" && it.gstRate > 0;
    const hasTaxable = typeof it.taxableAmount === "number" && it.taxableAmount > 0;
    return !hasHsn && !hasGstRate && !hasTaxable;
  });

  let prodMap = new Map<string, any>();
  if (missingSnapshotItems.length > 0) {
    const productIds = missingSnapshotItems
      .map((i: any) => i.productId || i.product?.id || i.product?._id || i._id)
      .filter(Boolean);

    if (productIds.length > 0) {
      try {
        const prods = await Product.find({ _id: { $in: productIds } }).lean();
        prodMap = new Map(prods.map((p) => [String(p._id), p]));
      } catch {
        // ignore
      }
    }
  }

  return items.map((it: any) => {
    const hasHsn = Boolean(it.hsnCode && String(it.hsnCode).trim());
    const hasGstRate = typeof it.gstRate === "number" && it.gstRate > 0;
    const hasTaxable = typeof it.taxableAmount === "number" && it.taxableAmount > 0;
    const hasSnapshot = hasHsn || hasGstRate || hasTaxable;

    // Only lookup current Product collection as a fallback when the item genuinely lacks historical snapshot
    const prod = hasSnapshot ? null : prodMap.get(String(it.productId || it.product?.id || it.product?._id || it._id));

    const name = it.name || it.product?.name || prod?.name || "Sacred Item";
    const qty = Math.max(1, Number(it.qty) || 1);
    const price =
      typeof it.price === "number"
        ? it.price
        : typeof it.product?.price === "number"
          ? it.product.price
          : (prod?.price || 0);

    // Prioritize historical snapshot values
    const hsnCode = hasHsn
      ? String(it.hsnCode).trim()
      : (it.product?.hsnCode || prod?.hsnCode || "").trim();

    const gstRate = hasGstRate
      ? it.gstRate
      : Number(it.product?.gstRate ?? prod?.gstRate ?? 0);

    const gstInclusive =
      it.gstInclusive !== undefined
        ? it.gstInclusive
        : it.product?.gstInclusive !== undefined
          ? it.product.gstInclusive
          : (prod?.gstInclusive !== false);

    return {
      name,
      qty,
      price,
      hsnCode,
      gstRate,
      gstInclusive,
      taxableAmount: it.taxableAmount,
      gstAmount: it.gstAmount,
      comboComponents: it.comboComponents || it.product?.comboComponents || prod?.comboComponents,
    };
  });
}

/**
 * Generates a clean, professional A4 commercial tax invoice PDF matching the WordPress reference.
 */
export async function generateInvoicePDF(data: InvoiceData): Promise<Buffer> {
  const enrichedItems = await enrichInvoiceItems(data.items);
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 45,
        bufferPages: true,
      });

      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c as Buffer));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const left = 45;
      const right = doc.page.width - 45;
      const usableW = right - left;

      // Clean Order & Invoice Numbers
      const orderNumberStr =
        data.orderNo !== undefined && data.orderNo !== null && data.orderNo !== ""
          ? String(data.orderNo)
          : data.orderId.slice(-8).toUpperCase();

      const invoiceNumberStr = data.invoiceNo || `INV-${orderNumberStr}`;
      const orderDateStr = new Date(data.createdAt ?? Date.now()).toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });

      // Compute GST Breakdown
      const taxSummary = computeOrderTaxDetails(enrichedItems, data.address);
      const hasTaxBreakup = taxSummary.lines.some((l) => l.gstRate > 0);

      // ==========================================
      // 1. TOP HEADER (Logo on Left, Seller Info on Right)
      // ==========================================
      const topY = 40;
      const logoPath = findLogoPath();

      if (logoPath) {
        try {
          // Render logo neatly on the top left
          doc.image(logoPath, left, topY, { fit: [72, 72] });
        } catch (err: any) {
          console.warn("[Invoice] Warning: Could not embed logo image:", err?.message);
        }
      } else {
        console.warn("[Invoice] Notice: Logo asset not found at candidate paths");
      }

      // Seller Info on Right Side
      const sellerX = 320;
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827").text(BRAND_NAME, sellerX, topY);
      doc.font("Helvetica").fontSize(8.5).fillColor("#374151");
      let sellerY = topY + 14;
      doc.text(SELLER_LINE1, sellerX, sellerY); sellerY += 12;
      doc.text(SELLER_LINE2, sellerX, sellerY); sellerY += 12;
      doc.text(SELLER_LINE3, sellerX, sellerY); sellerY += 12;
      doc.text(SELLER_LINE4, sellerX, sellerY); sellerY += 12;
      doc.text(SELLER_GSTIN, sellerX, sellerY); sellerY += 16;
      doc.text(`Email: ${SELLER_EMAIL}`, sellerX, sellerY); sellerY += 12;
      doc.text(`Phone:${SELLER_PHONE}`, sellerX, sellerY);

      // ==========================================
      // 2. INVOICE HEADING
      // ==========================================
      let curY = Math.max(topY + 80, sellerY + 24);
      doc.font("Helvetica-Bold").fontSize(22).fillColor("#111827").text("INVOICE", left, curY);
      curY += 34;

      // ==========================================
      // 3. TWO-COLUMN METADATA (Customer vs Order Info)
      // ==========================================
      const colW = (usableW - 30) / 2;
      const col1X = left;
      const col2X = left + colW + 30;

      // Left: Customer Address
      let custY = curY;
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#111827").text(data.customerName || "Valued Customer", col1X, custY);
      custY += 13;

      doc.font("Helvetica").fontSize(8.5).fillColor("#374151");
      if (data.businessName && data.businessName.trim()) {
        doc.font("Helvetica-Bold").text(`Business: ${data.businessName.trim()}`, col1X, custY, { width: colW - 10 });
        doc.font("Helvetica");
        custY += 12;
      }
      if (data.gstin && data.gstin.trim()) {
        doc.font("Helvetica-Bold").text(`Customer GSTIN: ${data.gstin.trim()}`, col1X, custY, { width: colW - 10 });
        doc.font("Helvetica");
        custY += 12;
      }
      if (data.address?.line1 && data.address.line1.trim()) {
        doc.text(data.address.line1.trim(), col1X, custY, { width: colW - 10 });
        custY += doc.heightOfString(data.address.line1.trim(), { width: colW - 10 }) + 2;
      }
      if (data.address?.line2 && data.address.line2.trim()) {
        doc.text(data.address.line2.trim(), col1X, custY, { width: colW - 10 });
        custY += doc.heightOfString(data.address.line2.trim(), { width: colW - 10 }) + 2;
      }
      if (data.address?.postOffice && data.address.postOffice.trim()) {
        doc.text(`PO: ${data.address.postOffice.trim()}`, col1X, custY, { width: colW - 10 });
        custY += 12;
      }
      const cityPin = [data.address?.city, data.address?.pincode].filter(Boolean).join(" ");
      if (cityPin) {
        doc.text(cityPin, col1X, custY, { width: colW - 10 });
        custY += 12;
      }
      const stateCountry = [data.address?.state, data.address?.country || "India"].filter(Boolean).join(", ");
      if (stateCountry) {
        doc.text(stateCountry, col1X, custY, { width: colW - 10 });
        custY += 12;
      }
      if (data.address?.phone) {
        doc.text(data.address.phone, col1X, custY);
        custY += 12;
      }
      if (data.address?.alternatePhone && data.address.alternatePhone.trim()) {
        doc.text(`Alt: ${data.address.alternatePhone.trim()}`, col1X, custY);
        custY += 12;
      }
      if (data.customerEmail) {
        doc.text(data.customerEmail, col1X, custY, { width: colW - 10 });
        custY += 12;
      }

      // Right: Invoice & Order Metadata
      let metaY = curY;
      const payMethod = data.payment?.method || "";
      const payMethodLabel =
        payMethod === "cod"
          ? "Cash on Delivery (COD)"
          : payMethod === "razorpay"
          ? "UPI/Credit Card/Debit Card/NetBanking"
          : (payMethod || "Online Payment");

      const metaRows: [string, string][] = [
        ["Invoice Number:", invoiceNumberStr],
        ["Invoice Date:", orderDateStr],
        ["Order Number:", orderNumberStr],
        ["Order Date:", orderDateStr],
        ["Payment Method:", payMethodLabel],
      ];

      if (data.trackingId && data.trackingId.trim()) {
        metaRows.push(["Tracking ID:", data.trackingId.trim()]);
      }
      if (data.courier && data.courier.trim()) {
        metaRows.push(["Courier:", data.courier.trim()]);
      }

      metaRows.forEach(([label, val]) => {
        doc.font("Helvetica").fontSize(8.5).fillColor("#374151").text(label, col2X, metaY, { width: 100 });
        doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#111827").text(val, col2X + 105, metaY, { width: colW - 105 });
        metaY += Math.max(doc.heightOfString(val, { width: colW - 105 }), 12) + 4;
      });

      curY = Math.max(custY, metaY) + 24;

      // ==========================================
      // 4. PRODUCT TABLE (Dark Header matching WordPress Reference)
      // ==========================================
      const tableHeaderY = curY;
      const colDef = hasTaxBreakup
        ? {
            item: { x: left, w: 180 },
            hsn: { x: left + 180, w: 45, align: "center" as const },
            qty: { x: left + 225, w: 30, align: "center" as const },
            rate: { x: left + 255, w: 50, align: "right" as const },
            taxable: { x: left + 305, w: 50, align: "right" as const },
            gstRate: { x: left + 355, w: 40, align: "center" as const },
            taxAmt: { x: left + 395, w: 50, align: "right" as const },
            total: { x: left + 445, w: 60, align: "right" as const },
          }
        : {
            item: { x: left, w: 310 },
            hsn: { x: left + 310, w: 0, align: "center" as const },
            qty: { x: left + 310, w: 65, align: "center" as const },
            rate: { x: left + 375, w: 0, align: "right" as const },
            taxable: { x: left + 375, w: 0, align: "right" as const },
            gstRate: { x: left + 375, w: 0, align: "center" as const },
            taxAmt: { x: left + 375, w: 0, align: "right" as const },
            total: { x: left + 375, w: 130, align: "right" as const },
          };

      // Solid Dark Header Bar
      doc.rect(left, tableHeaderY, usableW, 20).fill("#000000");
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8.5);

      if (hasTaxBreakup) {
        doc.text("Product", colDef.item.x + 8, tableHeaderY + 5, { width: colDef.item.w - 12 });
        doc.text("HSN", colDef.hsn.x, tableHeaderY + 5, { width: colDef.hsn.w, align: colDef.hsn.align });
        doc.text("Qty", colDef.qty.x, tableHeaderY + 5, { width: colDef.qty.w, align: colDef.qty.align });
        doc.text("Rate", colDef.rate.x, tableHeaderY + 5, { width: colDef.rate.w, align: colDef.rate.align });
        doc.text("Taxable", colDef.taxable.x, tableHeaderY + 5, { width: colDef.taxable.w, align: colDef.taxable.align });
        doc.text("GST", colDef.gstRate.x, tableHeaderY + 5, { width: colDef.gstRate.w, align: colDef.gstRate.align });
        doc.text(taxSummary.isIntraState ? "Tax (C+S)" : "IGST", colDef.taxAmt.x, tableHeaderY + 5, { width: colDef.taxAmt.w, align: colDef.taxAmt.align });
        doc.text("Price", colDef.total.x - 8, tableHeaderY + 5, { width: colDef.total.w, align: colDef.total.align });
      } else {
        doc.text("Product", colDef.item.x + 8, tableHeaderY + 5, { width: colDef.item.w - 12 });
        doc.text("Quantity", colDef.qty.x, tableHeaderY + 5, { width: colDef.qty.w, align: colDef.qty.align });
        doc.text("Price", colDef.total.x - 8, tableHeaderY + 5, { width: colDef.total.w, align: colDef.total.align });
      }

      curY = tableHeaderY + 20;

      // Table Data Rows
      taxSummary.lines.forEach((line) => {
        const nameH = doc.heightOfString(line.name, { width: colDef.item.w - 12 });
        const rowH = Math.max(nameH + 10, 22);

        // Page break safety check
        if (curY + rowH > doc.page.height - 180) {
          doc.addPage();
          curY = 40;
        }

        doc.fillColor("#111827").font("Helvetica").fontSize(8.5);
        doc.text(line.name, colDef.item.x + 8, curY + 6, {
          width: colDef.item.w - 12,
        });

        if (hasTaxBreakup) {
          doc.fillColor("#4b5563").text(line.hsnCode, colDef.hsn.x, curY + 6, {
            width: colDef.hsn.w,
            align: colDef.hsn.align,
          });
          doc.fillColor("#111827").text(String(line.qty), colDef.qty.x, curY + 6, {
            width: colDef.qty.w,
            align: colDef.qty.align,
          });
          doc.text(rupee(line.unitPrice), colDef.rate.x, curY + 6, {
            width: colDef.rate.w,
            align: colDef.rate.align,
          });
          doc.text(rupee(line.taxableValue), colDef.taxable.x, curY + 6, {
            width: colDef.taxable.w,
            align: colDef.taxable.align,
          });
          doc.text(line.gstRate > 0 ? `${line.gstRate}%` : "0%", colDef.gstRate.x, curY + 6, {
            width: colDef.gstRate.w,
            align: colDef.gstRate.align,
          });
          doc.text(rupee(line.taxAmount), colDef.taxAmt.x, curY + 6, {
            width: colDef.taxAmt.w,
            align: colDef.taxAmt.align,
          });
          doc.text(rupee(line.lineTotal), colDef.total.x - 8, curY + 6, {
            width: colDef.total.w,
            align: colDef.total.align,
          });
        } else {
          doc.fillColor("#111827").text(String(line.qty), colDef.qty.x, curY + 6, {
            width: colDef.qty.w,
            align: colDef.qty.align,
          });
          doc.text(rupee(line.lineTotal), colDef.total.x - 8, curY + 6, {
            width: colDef.total.w,
            align: colDef.total.align,
          });
        }

        curY += rowH;

        if (line.components && line.components.length > 0) {
          line.components.forEach((comp) => {
            const compRowH = 15;
            if (curY + compRowH > doc.page.height - 180) {
              doc.addPage();
              curY = 40;
            }
            doc.fillColor("#6b7280").font("Helvetica-Oblique").fontSize(7.5);
            doc.text(`   • ${comp.name}`, colDef.item.x + 8, curY + 3, {
              width: colDef.item.w - 12,
            });
            if (hasTaxBreakup) {
              doc.text(comp.hsnCode, colDef.hsn.x, curY + 3, {
                width: colDef.hsn.w,
                align: colDef.hsn.align,
              });
              doc.text(String(comp.qty), colDef.qty.x, curY + 3, {
                width: colDef.qty.w,
                align: colDef.qty.align,
              });
              doc.text("-", colDef.rate.x, curY + 3, {
                width: colDef.rate.w,
                align: colDef.rate.align,
              });
              doc.text(rupee(comp.taxableValue), colDef.taxable.x, curY + 3, {
                width: colDef.taxable.w,
                align: colDef.taxable.align,
              });
              doc.text(comp.gstRate > 0 ? `${comp.gstRate}%` : "0%", colDef.gstRate.x, curY + 3, {
                width: colDef.gstRate.w,
                align: colDef.gstRate.align,
              });
              doc.text(rupee(comp.taxAmount), colDef.taxAmt.x, curY + 3, {
                width: colDef.taxAmt.w,
                align: colDef.taxAmt.align,
              });
              doc.text(rupee(comp.allocatedPrice), colDef.total.x - 8, curY + 3, {
                width: colDef.total.w,
                align: colDef.total.align,
              });
            }
            curY += compRowH;
          });
        }

        doc.moveTo(left, curY).lineTo(right, curY).strokeColor("#e5e7eb").lineWidth(0.5).stroke();
      });

      // ==========================================
      // 5. TOTALS SECTION (Exact WordPress Reference Alignment)
      // ==========================================
      curY += 8;
      const totalsW = 230;
      const totalsX = right - totalsW;

      const renderTotalRow = (label: string, value: string, isBold = false) => {
        doc.font(isBold ? "Helvetica-Bold" : "Helvetica").fontSize(isBold ? 9.5 : 8.5);
        doc.fillColor(isBold ? "#000000" : "#111827");
        doc.text(label, totalsX, curY, { width: 110, align: "left" });
        doc.text(value, totalsX + 110, curY, { width: totalsW - 110 - 8, align: "right" });
        curY += isBold ? 15 : 14;
      };

      renderTotalRow("Subtotal", rupee(data.subtotal));

      if (data.discount && data.discount > 0) {
        const discountLabel = data.couponCode ? `Coupon (${data.couponCode})` : "Discount";
        renderTotalRow(discountLabel, `-${rupee(data.discount)}`);
      }

      if (data.loyaltyDiscount && data.loyaltyDiscount > 0) {
        const pointsLabel = data.loyaltyPointsRedeemed ? `Loyalty Points (${data.loyaltyPointsRedeemed} pts)` : "Loyalty Discount";
        renderTotalRow(pointsLabel, `-${rupee(data.loyaltyDiscount)}`);
      }

      if (data.walletUsed && data.walletUsed > 0) {
        renderTotalRow("Wallet / Store Credit", `-${rupee(data.walletUsed)}`);
      }

      const shippingText =
        data.shipping === 0
          ? "FREE"
          : data.shippingMethod
          ? `${rupee(data.shipping)} via ${data.shippingMethod}`
          : rupee(data.shipping);

      renderTotalRow("Shipping", shippingText);

      if (data.codFee && data.codFee > 0) {
        renderTotalRow("COD Handling Fee", rupee(data.codFee));
      }

      if (data.packagingCost && data.packagingCost > 0) {
        renderTotalRow("Packaging Cost", rupee(data.packagingCost));
      }

      if (hasTaxBreakup) {
        renderTotalRow("Taxable Value", rupee(taxSummary.taxableSubtotal));
        if (taxSummary.taxTotal > 0) {
          if (taxSummary.isIntraState) {
            renderTotalRow("CGST (Central Tax)", rupee(taxSummary.cgstTotal));
            renderTotalRow("SGST (State Tax)", rupee(taxSummary.sgstTotal));
          } else {
            renderTotalRow("IGST (Integrated Tax)", rupee(taxSummary.igstTotal));
          }
        }
      }

      // Solid Top Border for Grand Total
      doc.moveTo(totalsX, curY).lineTo(right, curY).strokeColor("#000000").lineWidth(1).stroke();
      curY += 6;

      renderTotalRow("Total", rupee(data.total), true);

      // Solid Bottom Border for Grand Total
      doc.moveTo(totalsX, curY).lineTo(right, curY).strokeColor("#000000").lineWidth(1).stroke();
      curY += 8;

      if (hasTaxBreakup) {
        doc.font("Helvetica-Oblique").fontSize(7.5).fillColor("#6b7280");
        doc.text("Prices are inclusive of applicable GST.", totalsX, curY, {
          width: totalsW - 8,
          align: "right",
        });
      }

      // ==========================================
      // 6. FOOTER (Exact WordPress Reference Match)
      // ==========================================
      doc.page.margins.bottom = 0;
      const footerY = doc.page.height - 50;
      doc.font("Helvetica").fontSize(8.5).fillColor("#374151");
      doc.text(
        "Thank you for shopping with Shri Radha Govind Store\n" + SELLER_WEBSITE,
        left,
        footerY,
        {
          width: usableW,
          align: "center",
          lineGap: 3,
        }
      );

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}



/**
 * Generates an operational Packing Slip and Dispatch Manifest PDF for store packaging operations.
 * Guaranteed to fit on exactly ONE A4 portrait page for store fulfillment.
 */
export async function generatePackingSlipPDF(data: InvoiceData): Promise<Buffer> {
  const enrichedItems = await enrichInvoiceItems(data.items);
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 32,
        bufferPages: true,
        autoFirstPage: true,
      });

      // Prevent automatic page breaks pushing content onto page 2
      doc.page.margins.bottom = 0;
      doc.page.margins.top = 0;

      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c as Buffer));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const left = 32;
      const right = doc.page.width - 32;
      const usableW = right - left;

      // Clean Order & Date
      const orderNumberStr =
        typeof data.orderNo === "number"
          ? String(data.orderNo)
          : (data.orderNo || data.orderId.slice(-6)).toUpperCase();

      const orderDate = data.createdAt ? new Date(data.createdAt) : new Date();
      const orderDateStr = orderDate.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

      // 1. COMPACT BRANDED HEADER
      const headerY = 26;
      const headerH = 38;
      doc.rect(left, headerY, usableW, headerH).fill("#166F77");
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(13);
      doc.text("SHRI RADHA GOVIND STORE", left + 12, headerY + 7);
      doc.font("Helvetica").fontSize(7.5).fillColor("#e6f4f1");
      doc.text("PACKING SLIP & DISPATCH MANIFEST • VRINDAVAN DHAM", left + 12, headerY + 23);

      doc.font("Helvetica-Bold").fontSize(12).fillColor("#ffffff");
      doc.text(`ORDER #${orderNumberStr}`, right - 160, headerY + 7, { width: 148, align: "right" });
      doc.font("Helvetica").fontSize(7.5).fillColor("#e6f4f1");
      doc.text(`Date: ${orderDateStr}`, right - 160, headerY + 23, { width: 148, align: "right" });

      let curY = headerY + headerH + 6; // Y = 70

      // 2. COD / PREPAID ALERT BAR
      const isCod = (data.payment?.method || "").toLowerCase() === "cod";
      const alertH = 20;
      if (isCod) {
        doc.rect(left, curY, usableW, alertH).fillAndStroke("#fef3c7", "#f59e0b");
        doc.fillColor("#92400e").font("Helvetica-Bold").fontSize(8.5);
        doc.text(
          `CASH ON DELIVERY (COD) — COLLECT Rs. ${round2(data.total).toLocaleString("en-IN")}`,
          left + 10,
          curY + 5.5
        );
        doc.font("Helvetica").fontSize(7.5).fillColor("#78350f");
        doc.text("Affix COD Waybill Label and verify cash collection on delivery.", right - 260, curY + 6, {
          width: 250,
          align: "right",
        });
      } else {
        doc.rect(left, curY, usableW, alertH).fillAndStroke("#ecfdf5", "#10b981");
        doc.fillColor("#065f46").font("Helvetica-Bold").fontSize(8.5);
        doc.text("PREPAID ORDER — Rs. 0 DUE ON DELIVERY (DO NOT COLLECT CASH)", left + 10, curY + 5.5);
        doc.font("Helvetica").fontSize(7.5).fillColor("#047857");
        doc.text("Payment verified online via Razorpay.", right - 220, curY + 6, {
          width: 210,
          align: "right",
        });
      }

      curY += alertH + 7; // Y = 97

      // 3. TWO-COLUMN: RECIPIENT DELIVERY DETAILS & LOGISTICS
      const colGap = 12;
      const colW = (usableW - colGap) / 2;
      const col1X = left;
      const col2X = left + colW + colGap;

      // Pre-calculate Left Card Content
      const addrLines: string[] = [];
      if (data.address?.line1?.trim()) addrLines.push(data.address.line1.trim());
      if (data.address?.line2?.trim()) addrLines.push(`Landmark: ${data.address.line2.trim()}`);
      if (data.address?.postOffice?.trim()) addrLines.push(`PO: ${data.address.postOffice.trim()}`);
      const cityStatePin = [
        data.address?.city,
        data.address?.state,
        data.address?.pincode ? `PIN: ${data.address.pincode}` : "",
      ]
        .filter(Boolean)
        .join(", ");
      if (cityStatePin) addrLines.push(cityStatePin);

      const phoneParts: string[] = [];
      if (data.address?.phone) phoneParts.push(`Phone: ${data.address.phone}`);
      if (data.address?.alternatePhone) phoneParts.push(`Alt: ${data.address.alternatePhone}`);
      if (phoneParts.length > 0) addrLines.push(phoneParts.join(" | "));
      if (data.customerEmail) addrLines.push(`Email: ${data.customerEmail}`);

      // Dynamic Card Height (Calculated so cards are proportional and compact)
      const estimatedAddrHeight = 22 + addrLines.length * 11;
      const cardH = Math.max(102, Math.min(estimatedAddrHeight + 6, 120));

      // Draw Card 1: Customer & Delivery Address
      doc.rect(col1X, curY, colW, cardH).strokeColor("#d1d5db").lineWidth(0.75).stroke();
      doc.rect(col1X, curY, colW, 16).fill("#f3f4f6");
      doc.fillColor("#1f2937").font("Helvetica-Bold").fontSize(8);
      doc.text("CUSTOMER & DELIVERY ADDRESS", col1X + 8, curY + 4);

      let aY = curY + 20;
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#111827");
      doc.text(data.customerName || "Customer", col1X + 8, aY, { width: colW - 16, lineBreak: false });
      aY += 12;

      doc.font("Helvetica").fontSize(7.5).fillColor("#374151");
      addrLines.forEach((line) => {
        if (aY + 10 <= curY + cardH) {
          doc.text(line, col1X + 8, aY, { width: colW - 16, lineBreak: false, ellipsis: true });
          aY += 10.5;
        }
      });

      // Draw Card 2: Dispatch & Courier Manifest
      doc.rect(col2X, curY, colW, cardH).strokeColor("#d1d5db").lineWidth(0.75).stroke();
      doc.rect(col2X, curY, colW, 16).fill("#f3f4f6");
      doc.fillColor("#1f2937").font("Helvetica-Bold").fontSize(8);
      doc.text("DISPATCH & COURIER MANIFEST", col2X + 8, curY + 4);

      let dY = curY + 21;
      const dispatchRows: [string, string][] = [
        ["Order Number:", `#${orderNumberStr}`],
        ["Order Status:", data.status || "Processing"],
        ["Assigned Courier:", data.courier || "Pending Assignment"],
        ["Tracking / AWB:", data.trackingId || "Pending Generation"],
        ["Payment Mode:", isCod ? "COD" : "Prepaid"],
        ["Total Amount:", `Rs. ${round2(data.total).toLocaleString("en-IN")}`],
      ];

      dispatchRows.forEach(([label, val]) => {
        doc.font("Helvetica").fontSize(7.5).fillColor("#4b5563").text(label, col2X + 8, dY, { width: 90 });
        doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#111827").text(val, col2X + 98, dY, { width: colW - 106, lineBreak: false });
        dY += 12;
      });

      curY += cardH + 7;

      // 4. ITEMS TO PACK TABLE
      const isLargeOrder = enrichedItems.length > 5;
      const thH = 16;
      doc.rect(left, curY, usableW, thH).fill("#1f2937");
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(7.5);
      doc.text("PACK", left + 8, curY + 4, { width: 30 });
      doc.text("#", left + 40, curY + 4, { width: 16 });
      doc.text("PRODUCT / ITEM DESCRIPTION", left + 62, curY + 4, { width: 270 });
      doc.text("HSN", left + 342, curY + 4, { width: 55, align: "center" });
      doc.text("QTY TO PACK", right - 85, curY + 4, { width: 75, align: "center" });

      curY += thH;

      let totalUnitsToPack = 0;
      const baseRowH = isLargeOrder ? 17 : 20;

      enrichedItems.forEach((item, idx) => {
        const itemQty = Number(item.qty) || 1;
        totalUnitsToPack += itemQty;

        const hasCombos = item.comboComponents && item.comboComponents.length > 0;
        const comboCount = hasCombos && item.comboComponents ? item.comboComponents.length : 0;
        const rowH = hasCombos ? baseRowH + comboCount * 11 + 2 : baseRowH;

        // Alternating zebra stripe
        if (idx % 2 === 1) {
          doc.rect(left, curY, usableW, rowH).fill("#f9fafb");
        }
        doc.rect(left, curY, usableW, rowH).strokeColor("#e5e7eb").lineWidth(0.5).stroke();

        // Checkbox square for physical checking
        const boxSize = isLargeOrder ? 9 : 10;
        doc.rect(left + 12, curY + 4, boxSize, boxSize).strokeColor("#4b5563").lineWidth(0.75).stroke();

        // Index
        doc.font("Helvetica").fontSize(7.5).fillColor("#6b7280");
        doc.text(String(idx + 1), left + 40, curY + 5);

        // Product Name
        doc.font("Helvetica-Bold").fontSize(8).fillColor("#111827");
        doc.text(item.name || "Product", left + 62, curY + 5, { width: 270, lineBreak: false, ellipsis: true });

        // HSN
        doc.font("Helvetica").fontSize(7.5).fillColor("#4b5563");
        doc.text(item.hsnCode || "-", left + 342, curY + 5, { width: 55, align: "center" });

        // Qty
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#166F77");
        doc.text(`${itemQty} units`, right - 85, curY + 4.5, { width: 75, align: "center" });

        // Render Combo Components breakdown if applicable
        if (hasCombos && item.comboComponents) {
          let compY = curY + baseRowH - 1;
          item.comboComponents.forEach((comp) => {
            const compTotalUnits = (Number(comp.qty) || 1) * itemQty;
            doc.font("Helvetica").fontSize(7).fillColor("#4b5563");
            doc.text(`• Pack: ${comp.name} (${compTotalUnits} pcs)`, left + 72, compY, { width: 260, lineBreak: false, ellipsis: true });
            compY += 10.5;
          });
        }

        curY += rowH;
      });

      // Total Units Bar
      const totalBarH = 17;
      doc.rect(left, curY, usableW, totalBarH).fill("#f3f4f6");
      doc.rect(left, curY, usableW, totalBarH).strokeColor("#d1d5db").lineWidth(0.75).stroke();
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#111827");
      doc.text("TOTAL ITEMS TO PACK:", left + 10, curY + 4.5);
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#166F77");
      doc.text(`${totalUnitsToPack} units across ${enrichedItems.length} product(s)`, right - 220, curY + 4, {
        width: 210,
        align: "right",
      });

      curY += totalBarH + 7;

      // 5. PACKING VERIFICATION & QUALITY CHECK BOX
      const staffPackedBy = data.packedByName || "Govind Brajwasi (Shop Manager)";
      const boxH = 58;
      doc.rect(left, curY, usableW, boxH).strokeColor("#166F77").lineWidth(0.75).stroke();
      doc.rect(left, curY, usableW, 15).fill("#166F77");
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(7.5);
      doc.text("OPERATIONAL PACKING SIGN-OFF & QUALITY ASSURANCE", left + 8, curY + 3.5);

      let qY = curY + 20;
      doc.rect(left + 10, qY, 8.5, 8.5).strokeColor("#374151").lineWidth(0.75).stroke();
      doc.font("Helvetica").fontSize(7.5).fillColor("#1f2937");
      doc.text("Physical product quantity and quality inspected before sealing package.", left + 24, qY + 0.5);

      qY += 12;
      doc.rect(left + 10, qY, 8.5, 8.5).strokeColor("#374151").lineWidth(0.75).stroke();
      doc.text("Fragile/Devotional items protected with secure bubble wrap cushioning.", left + 24, qY + 0.5);

      // Sign-off line
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#111827");
      doc.text(`Packed By: ${staffPackedBy}`, left + 10, curY + 45);
      doc.font("Helvetica").fontSize(7.5).fillColor("#4b5563");
      doc.text("Signature: __________________________    Date: ______________", right - 240, curY + 45);

      // 6. EXACT SINGLE-PAGE FOOTER
      const footerY = doc.page.height - 24;
      doc.font("Helvetica").fontSize(7.5).fillColor("#6b7280");
      doc.text(
        "Shri Radha Govind Store • 155, 2nd Floor, Madan Mohan Ghera, Vrindavan 281121 • Ph: +91 75005 33505",
        left,
        footerY,
        { width: usableW, align: "center", lineBreak: false }
      );

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}