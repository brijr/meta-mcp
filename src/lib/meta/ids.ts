export function normalizeMetaId(value: string): string {
  return value.trim();
}

export function normalizeAdAccountId(value: string): string {
  const trimmed = normalizeMetaId(value);
  return trimmed.startsWith("act_") ? trimmed : `act_${trimmed}`;
}
