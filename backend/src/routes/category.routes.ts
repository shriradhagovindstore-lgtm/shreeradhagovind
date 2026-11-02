import { Router } from "express";
import { z } from "zod";
import { Category } from "../models/Category";
import { Product } from "../models/Product";
import { requireAuth, requireAdmin, requireStaff } from "../middleware/auth";
import { logAuditEvent } from "../services/audit.service";
import { HttpError } from "../middleware/error";
import { OUT_OF_STOCK_WINDOW_MS } from "../services/inventory.service";

const r = Router();
const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const categorySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).optional(),
  parentId: z.string().nullable().optional(),
  image: z.string().optional().default(""),
  description: z.string().optional().default(""),
  metaTitle: z.string().optional().default(""),
  metaDescription: z.string().optional().default(""),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().optional().default(0),
});

async function withProductCounts(categoryFilter: any = {}, productFilter: any = { isActive: true }) {
  const [categories, counts] = await Promise.all([
    Category.find(categoryFilter).sort({ sortOrder: 1, name: 1 }),
    Product.aggregate([{ $match: productFilter }, { $group: { _id: "$category", count: { $sum: 1 } } }]),
  ]);
  const countMap = new Map(counts.map((x) => [x._id, x.count]));
  return categories.map((c: any) => ({ ...c.toObject(), productCount: countMap.get(c.name) ?? 0 }));
}

function getCustomerProductFilter() {
  const cutoff = new Date(Date.now() - OUT_OF_STOCK_WINDOW_MS);
  return {
    isActive: true,
    $or: [
      { stock: { $gt: 0 } },
      { stock: { $lte: 0 }, outOfStockSince: { $gt: cutoff } },
    ],
  };
}

function buildCustomerCategoryTree(categories: any[]) {
  const allIds = new Set(categories.map((c) => String(c._id)));
  const byParent = new Map<string, any[]>();
  for (const c of categories) {
    if (c.parentId && allIds.has(String(c.parentId))) {
      const pId = String(c.parentId);
      byParent.set(pId, [...(byParent.get(pId) ?? []), c]);
    }
  }

  function processCategory(c: any): any | null {
    const rawChildren = byParent.get(String(c._id)) ?? [];
    const processedChildren: any[] = [];
    for (const child of rawChildren) {
      if (child.isActive) {
        const processed = processCategory(child);
        if (processed) {
          processedChildren.push(processed);
        }
      }
    }

    const hasDirectProducts = (c.productCount ?? 0) > 0;
    const hasVisibleChildren = processedChildren.length > 0;

    if (!hasDirectProducts && !hasVisibleChildren) {
      return null;
    }

    return {
      ...c,
      children: processedChildren,
    };
  }

  const rootCategories = categories.filter((c) => !c.parentId || !allIds.has(String(c.parentId)));
  const visibleRoots: any[] = [];
  for (const root of rootCategories) {
    if (root.isActive) {
      const processed = processCategory(root);
      if (processed) {
        visibleRoots.push(processed);
      }
    }
  }

  return visibleRoots;
}

function flattenCategoryTree(tree: any[]): any[] {
  const flat: any[] = [];
  function walk(items: any[]) {
    for (const item of items) {
      const { children, ...rest } = item;
      flat.push(rest);
      if (children && children.length > 0) {
        walk(children);
      }
    }
  }
  walk(tree);
  return flat;
}

// Customer: List only categories that have customer-visible products
r.get("/", async (_req, res, next) => {
  try {
    const categories = await withProductCounts({ isActive: true }, getCustomerProductFilter());
    const tree = buildCustomerCategoryTree(categories);
    const visibleCategories = flattenCategoryTree(tree);
    res.json({ categories: visibleCategories });
  } catch (e) {
    next(e);
  }
});

// Customer: Category tree with non-empty categories only
r.get("/tree", async (_req, res, next) => {
  try {
    const categories = await withProductCounts({ isActive: true }, getCustomerProductFilter());
    const tree = buildCustomerCategoryTree(categories);
    res.json({ categories: tree });
  } catch (e) {
    next(e);
  }
});

// Admin: List all categories including empty ones
r.get(["/admin", "/admin/all"], requireAuth, requireStaff, async (_req, res, next) => {
  try {
    const categories = await withProductCounts();
    res.json({ categories });
  } catch (e) {
    next(e);
  }
});

// Admin: Category tree with all categories
r.get("/admin/tree", requireAuth, requireStaff, async (_req, res, next) => {
  try {
    const categories = await withProductCounts();
    const rootCategories = categories.filter((c) => !c.parentId);
    const byParent = new Map<string, any[]>();
    for (const c of categories) {
      if (c.parentId) {
        const pId = String(c.parentId);
        byParent.set(pId, [...(byParent.get(pId) ?? []), c]);
      }
    }
    const attach = (items: any[]): any[] =>
      items.map((c) => ({ ...c, children: attach(byParent.get(String(c._id)) ?? []) }));
    res.json({ categories: attach(rootCategories) });
  } catch (e) {
    next(e);
  }
});

// Dedicated Admin Category Router (mirroring existing admin routers like adminCouponRouter)
export const adminCategoryRouter = Router();
adminCategoryRouter.use(requireAuth, requireStaff);

adminCategoryRouter.get(["/", "/all"], async (_req, res, next) => {
  try {
    const categories = await withProductCounts();
    res.json({ categories });
  } catch (e) {
    next(e);
  }
});

adminCategoryRouter.get("/tree", async (_req, res, next) => {
  try {
    const categories = await withProductCounts();
    const rootCategories = categories.filter((c) => !c.parentId);
    const byParent = new Map<string, any[]>();
    for (const c of categories) {
      if (c.parentId) {
        const pId = String(c.parentId);
        byParent.set(pId, [...(byParent.get(pId) ?? []), c]);
      }
    }
    const attach = (items: any[]): any[] =>
      items.map((c) => ({ ...c, children: attach(byParent.get(String(c._id)) ?? []) }));
    res.json({ categories: attach(rootCategories) });
  } catch (e) {
    next(e);
  }
});

r.post("/", requireAuth, requireStaff, async (req, res, next) => {
  try {
    const data = categorySchema.parse(req.body);
    const baseSlug = slugify(data.slug ?? data.name);
    let slug = baseSlug;
    let counter = 1;
    while (await Category.findOne({ slug })) {
      slug = `${baseSlug}-${counter++}`;
    }
    const c = await Category.create({ ...data, slug, parentId: data.parentId || null });
    res.status(201).json({ category: c });
  } catch (e) {
    next(e);
  }
});

r.patch("/sort/bulk", requireAuth, requireStaff, async (req, res, next) => {
  try {
    const items = z.array(z.object({ id: z.string(), sortOrder: z.number(), parentId: z.string().nullable().optional() })).parse(req.body.items);
    await Promise.all(items.map((item) => Category.findByIdAndUpdate(item.id, { sortOrder: item.sortOrder, parentId: item.parentId || null })));
    res.json({ categories: await withProductCounts() });
  } catch (e) {
    next(e);
  }
});

r.patch("/:id", requireAuth, requireStaff, async (req, res, next) => {
  try {
    const data = categorySchema.partial().parse(req.body);
    const patch: any = { ...data };
    if (data.name || data.slug) {
      const baseSlug = slugify(data.slug ?? data.name!);
      let slug = baseSlug;
      let counter = 1;
      let existing = await Category.findOne({ slug, _id: { $ne: req.params.id } });
      while (existing) {
        slug = `${baseSlug}-${counter++}`;
        existing = await Category.findOne({ slug, _id: { $ne: req.params.id } });
      }
      patch.slug = slug;
    }
    if ("parentId" in data) patch.parentId = data.parentId || null;
    const prev = await Category.findById(req.params.id);
    if (!prev) throw new HttpError(404, "Not found");
    const c = await Category.findByIdAndUpdate(req.params.id, patch, { new: true });
    if (data.name && prev.name !== data.name) {
      await Product.updateMany({ category: prev.name }, { category: data.name });
    }
    res.json({ category: c });
  } catch (e) {
    next(e);
  }
});

r.delete("/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const c = await Category.findByIdAndDelete(req.params.id);
    if (c) {
      await Category.updateMany({ parentId: req.params.id }, { parentId: null });
      await Product.updateMany({ category: c.name }, { isActive: false });
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default r;
