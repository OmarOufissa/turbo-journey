// Detects a SQLite UNIQUE constraint violation, e.g. the race on the
// (employeeId, versionNumber) index when two requests compute the same
// "next version number" concurrently.
export function isUniqueConstraintError(err: any): boolean {
  return err?.code === "SQLITE_CONSTRAINT" || /UNIQUE constraint failed/i.test(err?.message ?? "");
}
