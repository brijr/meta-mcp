import { z } from "zod";

export const metaIdSchema = z.string().min(1).describe("Meta object ID.");
export const jsonObjectSchema = z
  .record(z.string(), z.any())
  .describe("Arbitrary Meta API override fields.");
export const dateRangeSchema = z.object({
  since: z.string().describe("Start date in YYYY-MM-DD format."),
  until: z.string().describe("End date in YYYY-MM-DD format."),
});
export const budgetSchema = z.object({
  amount_minor: z.number().int().nonnegative(),
  currency: z.string().length(3),
  period: z.enum(["daily", "lifetime"]),
});
export const scheduleSchema = z.object({
  start_time: z.string().describe("ISO 8601 timestamp."),
  end_time: z.string().optional().describe("ISO 8601 timestamp."),
});
export const paginationSchema = {
  limit: z.number().int().positive().max(500).optional(),
  after: z.string().optional(),
};

export const metaOverridesSchema = jsonObjectSchema.optional();
