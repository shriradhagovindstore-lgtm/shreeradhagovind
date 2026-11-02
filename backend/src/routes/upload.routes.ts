import { Router } from "express";
import { uploadBufferToImageKit } from "../config/imagekit";
import { upload } from "../middleware/upload";
import { requireAuth, requireStaff } from "../middleware/auth";
import { HttpError } from "../middleware/error";

const r = Router();

r.post("/image", requireAuth, requireStaff, upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) throw new HttpError(400, "No file uploaded");
    const result = await uploadBufferToImageKit(req.file);
    res.json({ url: result.url, publicId: result.fileId, format: result.format, originalBytes: result.originalBytes, optimizedBytes: result.optimizedBytes });
  } catch (e) {
    next(e);
  }
});

export default r;
