// 삭제 예정일(purge horizon) — soft-delete된 행이 영구삭제되는 날(복구 유예 §4.3 / security-privacy §4).
// 물리삭제는 유예 경과 후에만(0014 purge_trashed). 여기선 UI 표시용 순수 계산("N일 후 영구삭제").

export const PURGE_GRACE_DAYS = 30

/** deleted_at + graceDays = 영구삭제 예정일(ISO). */
export function purgeDate(deletedAt: string, graceDays = PURGE_GRACE_DAYS): string {
  return new Date(new Date(deletedAt).getTime() + graceDays * 86_400_000).toISOString()
}

/** 영구삭제까지 남은 일수(올림). 음수 없음 — 유예 경과/시점 도달 시 0. */
export function daysUntilPurge(deletedAt: string, graceDays = PURGE_GRACE_DAYS, now: Date = new Date()): number {
  const ms = new Date(purgeDate(deletedAt, graceDays)).getTime() - now.getTime()
  return Math.max(0, Math.ceil(ms / 86_400_000))
}
