import fs from "fs";
import path from "path";
import assert from "assert";
import { generatePackingSlipPDF, type InvoiceData } from "../utils/invoice";

function countPdfPages(buffer: Buffer): number {
  const content = buffer.toString("latin1");
  const matches = content.match(/\/Type\s*\/Page\b/g);
  return matches ? matches.length : 0;
}

async function runTests() {
  console.log("==================================================================");
  console.log("  PACKING SLIP SINGLE-PAGE PDF VERIFICATION SUITE                 ");
  console.log("==================================================================");

  const outDir = path.resolve(__dirname, "../../../scratch");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const results: Array<{ caseNum: number; name: string; pages: number; sizeBytes: number; file: string }> = [];

  // -------------------------------------------------------------------------
  // SCENARIO 1: Order #5012 (Reference Order)
  // -------------------------------------------------------------------------
  console.log("\nTesting Scenario 1: Order #5012 (Reference Order)...");
  const case1Data: InvoiceData = {
    orderId: "6ae883c9801be42b29ccd8dd",
    orderNo: 5012,
    customerName: "Manoj",
    customerEmail: "manojsen85damoh@gmail.com",
    status: "Processing",
    courier: "Pending Assignment",
    trackingId: "Pending Generation",
    total: 1,
    subtotal: 1,
    shipping: 0,
    address: {
      name: "Manoj",
      line1: "155, 2nd Floor, Madan Mohan Ghera, Vrindavan",
      line2: "Near Banke Bihari Temple",
      postOffice: "Badamalehara",
      city: "Chhatarpur",
      state: "Madhya Pradesh",
      pincode: "471311",
      phone: "6396147954",
    },
    payment: {
      method: "razorpay",
      status: "paid",
    },
    items: [
      {
        name: "Original Scented Gopi Chandan Tika",
        qty: 1,
        hsnCode: "33049940",
      },
    ],
    packedByName: "Govind Brajwasi (Shop Manager)",
    createdAt: "2026-10-04T10:30:00.000Z",
  };

  const pdf1 = await generatePackingSlipPDF(case1Data);
  const p1 = countPdfPages(pdf1);
  const f1 = path.join(outDir, "PackingSlip-5012.pdf");
  fs.writeFileSync(f1, pdf1);
  // Also copy to artifact dir
  const artifactDir = "C:/Users/acer/.gemini/antigravity/brain/fb3977b2-9c8c-4c78-86f2-62f24285f8d0";
  if (fs.existsSync(artifactDir)) {
    fs.writeFileSync(path.join(artifactDir, "PackingSlip-5012.pdf"), pdf1);
  }
  console.log(`  -> Scenario 1 Page Count: ${p1} (Buffer size: ${pdf1.length} bytes)`);
  assert.strictEqual(p1, 1, "Order #5012 must be exactly ONE page");
  results.push({ caseNum: 1, name: "Order #5012 (Reference)", pages: p1, sizeBytes: pdf1.length, file: f1 });

  // -------------------------------------------------------------------------
  // SCENARIO 2: Order with Long Multi-Line Address & Full Details
  // -------------------------------------------------------------------------
  console.log("\nTesting Scenario 2: Order with Long Multi-Line Address...");
  const case2Data: InvoiceData = {
    orderId: "6ae883c9801be42b29ccd8de",
    orderNo: 5013,
    customerName: "Shrimati Radharani Sevak Sunderlal Sharma",
    customerEmail: "sunderlal.radhabhakt.vrindavandham@domain-name-with-extra-length.org",
    status: "Processing",
    courier: "DTDC Express Logistics",
    trackingId: "DTDC9876543210123",
    total: 899,
    subtotal: 849,
    shipping: 50,
    address: {
      name: "Shrimati Radharani Sevak Sunderlal Sharma",
      line1: "Flat No. B-404, 4th Floor, Shree Krishna Janmabhoomi Enclave, Phase 2 Extension",
      line2: "Opposite Prem Mandir Gate No. 3, Near Old Parikrama Marg Crossroad",
      postOffice: "Raman Reti Sub Post Office",
      city: "Mathura Vrindavan Twin Holy City",
      state: "Uttar Pradesh",
      pincode: "281121",
      phone: "+91 98765 43210",
      alternatePhone: "+91 94123 45678",
    },
    payment: {
      method: "razorpay",
      status: "paid",
    },
    items: [
      {
        name: "Shri Radha Kripa Kataksha Stotra Wall Frame (Antique Gold Finish)",
        qty: 2,
        hsnCode: "49119900",
      },
    ],
    packedByName: "Govind Brajwasi (Shop Manager)",
    createdAt: "2026-11-02T14:15:00.000Z",
  };

  const pdf2 = await generatePackingSlipPDF(case2Data);
  const p2 = countPdfPages(pdf2);
  const f2 = path.join(outDir, "PackingSlip-LongAddress.pdf");
  fs.writeFileSync(f2, pdf2);
  console.log(`  -> Scenario 2 Page Count: ${p2} (Buffer size: ${pdf2.length} bytes)`);
  assert.strictEqual(p2, 1, "Long Address order must be exactly ONE page");
  results.push({ caseNum: 2, name: "Long Address Order", pages: p2, sizeBytes: pdf2.length, file: f2 });

  // -------------------------------------------------------------------------
  // SCENARIO 3: Order with Multiple Products (6 distinct items)
  // -------------------------------------------------------------------------
  console.log("\nTesting Scenario 3: Order with Multiple Products (6 distinct items)...");
  const case3Data: InvoiceData = {
    orderId: "6ae883c9801be42b29ccd8df",
    orderNo: 5014,
    customerName: "Anand Krishna Das",
    customerEmail: "anand.das@krishna.com",
    status: "Packed",
    courier: "Delhivery Air Express",
    trackingId: "DLV1234567890",
    total: 2450,
    subtotal: 2450,
    shipping: 0,
    address: {
      name: "Anand Krishna Das",
      line1: "House No. 12, Bhakti Vedanta Colony",
      line2: "Behind ISKCON Temple",
      postOffice: "Vrindavan PO",
      city: "Vrindavan",
      state: "Uttar Pradesh",
      pincode: "281121",
      phone: "9823012345",
    },
    payment: {
      method: "razorpay",
      status: "paid",
    },
    items: [
      { name: "Original Scented Gopi Chandan Tika", qty: 3, hsnCode: "33049940" },
      { name: "Pure Tulsi Kanthi Mala 3-Round with Silver Radha Pendant", qty: 1, hsnCode: "71179090" },
      { name: "Vrindavan Raj Sacred Dust in Brass Container", qty: 2, hsnCode: "25051000" },
      { name: "Natural Radha Ashtagandha Chandan Paste 100g", qty: 2, hsnCode: "33074100" },
      { name: "Braj Kasturi Agarbatti Incense Pack of 6", qty: 4, hsnCode: "33074100" },
      { name: "Handmade Brass Pooja Bell with Garuda Emblem", qty: 1, hsnCode: "83061000" },
    ],
    packedByName: "Govind Brajwasi (Shop Manager)",
    createdAt: "2026-11-02T15:00:00.000Z",
  };

  const pdf3 = await generatePackingSlipPDF(case3Data);
  const p3 = countPdfPages(pdf3);
  const f3 = path.join(outDir, "PackingSlip-MultiProduct.pdf");
  fs.writeFileSync(f3, pdf3);
  console.log(`  -> Scenario 3 Page Count: ${p3} (Buffer size: ${pdf3.length} bytes)`);
  assert.strictEqual(p3, 1, "Multiple products order must be exactly ONE page");
  results.push({ caseNum: 3, name: "Multiple Products Order (6 items)", pages: p3, sizeBytes: pdf3.length, file: f3 });

  // -------------------------------------------------------------------------
  // SCENARIO 4: Order with Combo Items (Bundle Contents Breakdown)
  // -------------------------------------------------------------------------
  console.log("\nTesting Scenario 4: Order with Combo Items (Bundle with Sub-items)...");
  const case4Data: InvoiceData = {
    orderId: "6ae883c9801be42b29ccd8e0",
    orderNo: 5015,
    customerName: "Pooja Verma",
    customerEmail: "pooja.verma@example.com",
    status: "Processing",
    courier: "Blue Dart Express",
    trackingId: "BLUEDART87654321",
    total: 1299,
    subtotal: 1299,
    shipping: 0,
    address: {
      name: "Pooja Verma",
      line1: "A-102, Gokul Dham Apartments",
      line2: "Near Radha Damodar Temple",
      city: "Vrindavan",
      state: "Uttar Pradesh",
      pincode: "281121",
      phone: "9812345678",
    },
    payment: {
      method: "razorpay",
      status: "paid",
    },
    items: [
      {
        name: "Complete Braj Seva & Japa Sadhana Gift Set",
        qty: 2,
        hsnCode: "71179090",
        comboComponents: [
          { name: "108-Bead Pure Tulsi Japa Mala with Guru Bead", qty: 1 },
          { name: "Embroidered Cotton Japa Gomukhi Bag (Radha Naam)", qty: 1 },
          { name: "Neem Wood Mala Counter Beads (27 count)", qty: 1 },
          { name: "Mini Brass Gopala Puja Murti", qty: 1 },
        ],
      },
      {
        name: "Vrindavan Rose Dhoop Sticks 200g",
        qty: 1,
        hsnCode: "33074100",
      },
    ],
    packedByName: "Govind Brajwasi (Shop Manager)",
    createdAt: "2026-11-02T16:00:00.000Z",
  };

  const pdf4 = await generatePackingSlipPDF(case4Data);
  const p4 = countPdfPages(pdf4);
  const f4 = path.join(outDir, "PackingSlip-ComboItems.pdf");
  fs.writeFileSync(f4, pdf4);
  console.log(`  -> Scenario 4 Page Count: ${p4} (Buffer size: ${pdf4.length} bytes)`);
  assert.strictEqual(p4, 1, "Combo items order must be exactly ONE page");
  results.push({ caseNum: 4, name: "Combo Items Bundle Order", pages: p4, sizeBytes: pdf4.length, file: f4 });

  // -------------------------------------------------------------------------
  // SCENARIO 5: COD (Cash on Delivery) Order
  // -------------------------------------------------------------------------
  console.log("\nTesting Scenario 5: COD (Cash on Delivery) Order with Cash Collection...");
  const case5Data: InvoiceData = {
    orderId: "6ae883c9801be42b29ccd8e1",
    orderNo: 5016,
    customerName: "Vikramaditya Rathore",
    customerEmail: "vikram.rathore@rajasthan.in",
    status: "Processing",
    courier: "India Post Speed Post",
    trackingId: "SP654321098IN",
    total: 1850,
    subtotal: 1770,
    shipping: 0,
    codFee: 80,
    address: {
      name: "Vikramaditya Rathore",
      line1: "Haveli 7, Near Clock Tower",
      line2: "Tripolia Bazaar",
      postOffice: "Tripolia Head Post Office",
      city: "Jaipur",
      state: "Rajasthan",
      pincode: "302002",
      phone: "9414012345",
      alternatePhone: "9829054321",
    },
    payment: {
      method: "cod",
      status: "pending",
    },
    items: [
      {
        name: "Pure Silver Radha Naam Pendant with Tulsi Mala",
        qty: 1,
        hsnCode: "71131120",
      },
      {
        name: "Vrindavan Kasturi Dhoop Cones",
        qty: 2,
        hsnCode: "33074100",
      },
    ],
    packedByName: "Govind Brajwasi (Shop Manager)",
    createdAt: "2026-11-02T16:30:00.000Z",
  };

  const pdf5 = await generatePackingSlipPDF(case5Data);
  const p5 = countPdfPages(pdf5);
  const f5 = path.join(outDir, "PackingSlip-COD.pdf");
  fs.writeFileSync(f5, pdf5);
  console.log(`  -> Scenario 5 Page Count: ${p5} (Buffer size: ${pdf5.length} bytes)`);
  assert.strictEqual(p5, 1, "COD order must be exactly ONE page");
  results.push({ caseNum: 5, name: "Cash on Delivery (COD) Order", pages: p5, sizeBytes: pdf5.length, file: f5 });

  console.log("\n==================================================================");
  console.log("  ALL 5 PACKING SLIP SCENARIOS GENERATED EXACTLY 1 PAGE!          ");
  console.log("==================================================================");
  console.table(results);
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
