import { readFile } from "node:fs/promises";
import { z } from "zod";

export type ProductionSurface = "app" | "marketing";
export type ProductionTarget = "local" | "preview" | "production";

export interface ProductionTargetInventory {
  readonly surface: ProductionSurface;
  readonly target: ProductionTarget;
  readonly projectId: string;
  readonly teamId?: string;
  readonly projectName?: string;
  readonly canonicalOrigin?: string;
  readonly gitRef?: string;
}

export interface ProductionInventory {
  readonly schemaVersion: 1;
  readonly targets: readonly ProductionTargetInventory[];
}

const identifierSchema = z.string().regex(/^[a-zA-Z0-9._-]+$/u);
const originSchema = z.url().refine((value) => {
  const url = new URL(value);
  return (
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    url.pathname === "/" &&
    url.search === "" &&
    url.hash === ""
  );
}, "Expected a public HTTPS root origin.");
const targetInventorySchema = z
  .object({
    surface: z.enum(["app", "marketing"]),
    target: z.enum(["local", "preview", "production"]),
    projectId: identifierSchema,
    teamId: identifierSchema.optional(),
    projectName: identifierSchema.optional(),
    canonicalOrigin: originSchema.optional(),
    gitRef: identifierSchema.optional(),
  })
  .strict();
const inventorySchema = z
  .object({
    schemaVersion: z.literal(1),
    targets: z.array(targetInventorySchema),
  })
  .strict()
  .superRefine((inventory, context) => {
    const keys = new Set<string>();
    for (const [index, target] of inventory.targets.entries()) {
      const key = `${target.surface}:${target.target}`;
      if (keys.has(key)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate production target: ${key}.`,
          path: ["targets", index],
        });
      }
      keys.add(key);
    }
  });

export async function readProductionInventory(
  path: string
): Promise<ProductionInventory> {
  try {
    return inventorySchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (error instanceof Error)
      throw new ProductionInventoryError(
        "Invalid production target inventory."
      );
    throw error;
  }
}

export function findProductionTarget(
  inventory: ProductionInventory,
  input: {
    readonly surface: ProductionSurface;
    readonly target: ProductionTarget;
  }
) {
  return inventory.targets.find(
    (target) =>
      target.surface === input.surface && target.target === input.target
  );
}

class ProductionInventoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductionInventoryError";
  }
}
