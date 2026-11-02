import { Schema, model, type Document, type Types } from "mongoose";

export interface IStockHistory extends Document {
  productId: Types.ObjectId;
  previousStock: number;
  newStock: number;
  delta: number;
  movementType:
    | "purchase"
    | "cancellation_restock"
    | "manual_adjustment"
    | "return_restock"
    | "admin_correction";
  reason: string;
  note: string;
  actorId?: Types.ObjectId | null;
  actorType: "customer" | "admin" | "system" | "guest" | "shop_manager";
  orderId?: Types.ObjectId | null;
  orderNo?: number | null;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}

const stockHistorySchema = new Schema<IStockHistory>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    previousStock: { type: Number, required: true },
    newStock: { type: Number, required: true },
    delta: { type: Number, required: true },
    movementType: {
      type: String,
      enum: [
        "purchase",
        "cancellation_restock",
        "manual_adjustment",
        "return_restock",
        "admin_correction",
      ],
      required: true,
      index: true,
    },
    reason: { type: String, required: true, trim: true },
    note: { type: String, default: "", trim: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    actorType: {
      type: String,
      enum: ["customer", "admin", "system", "guest", "shop_manager"],
      required: true,
      default: "system",
    },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", default: null, index: true },
    orderNo: { type: Number, default: null, index: true },
    source: { type: String, default: "web", trim: true },
  },
  { timestamps: true }
);

stockHistorySchema.index({ productId: 1, createdAt: -1 });

export const StockHistory = model<IStockHistory>("StockHistory", stockHistorySchema);
