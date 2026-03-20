import { ValidationError } from "../lib/errors";
import type { MetaPaging } from "../lib/meta/client";
import { deepMerge, omitUndefined } from "../lib/utils/object";

export interface BudgetInput {
  amount_minor: number;
  currency: string;
  period: "daily" | "lifetime";
}

export interface ScheduleInput {
  start_time: string;
  end_time?: string;
}

export function applyBudgetFields(
  payload: Record<string, unknown>,
  budget?: BudgetInput
): Record<string, unknown> {
  if (!budget) {
    return payload;
  }

  const next = { ...payload };
  if (budget.period === "daily") {
    next.daily_budget = String(budget.amount_minor);
    delete next.lifetime_budget;
  } else {
    next.lifetime_budget = String(budget.amount_minor);
    delete next.daily_budget;
  }
  next.currency = budget.currency.toUpperCase();
  return next;
}

export function applyScheduleFields(
  payload: Record<string, unknown>,
  schedule?: ScheduleInput
): Record<string, unknown> {
  if (!schedule) {
    return payload;
  }

  return omitUndefined({
    ...payload,
    start_time: schedule.start_time,
    end_time: schedule.end_time,
  });
}

export function withMetaOverrides(
  payload: Record<string, unknown>,
  metaOverrides?: Record<string, unknown>
): Record<string, unknown> {
  return metaOverrides ? deepMerge(payload, metaOverrides) : payload;
}

export function toMetaItemResult(item: Record<string, unknown>) {
  return { item };
}

export function toMetaListResult<T>(items: T[], page?: MetaPaging) {
  return { items, page: page ?? {} };
}

export function ensureOneOf(
  values: Array<string | undefined>,
  message: string
): string {
  const selected = values.filter((value): value is string => !!value);
  if (selected.length !== 1) {
    throw new ValidationError(message);
  }

  return selected[0];
}

export function filterByDateRange<T extends Record<string, unknown>>(
  items: T[],
  dateRange:
    | {
        since: string;
        until: string;
      }
    | undefined,
  fieldName: string
): T[] {
  if (!dateRange) {
    return items;
  }

  const start = new Date(dateRange.since).getTime();
  const end = new Date(dateRange.until).getTime();
  return items.filter((item) => {
    const raw = item[fieldName];
    if (typeof raw !== "string") {
      return false;
    }
    const current = new Date(raw).getTime();
    return current >= start && current <= end;
  });
}
