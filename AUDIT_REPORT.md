# Gestion Habilitations — Pre-Production Audit Report
**Date:** 2026-06-12 | **Branch:** `claude/accept-user-prompt-VJuCK` | **Scope:** Full application (backend, frontend, PDF system, renewals, reports, Electron, code quality)

---

## CRITICAL ISSUES

### C1. `removeDemoEmployees()` runs on every server boot and will silently delete any new employee added through the UI
- **Severity:** Critical
- **Description:** `server/index.ts:35-42` (`initializeSeedOnStartup`) runs `removeDemoEmployees()` (`server/migrations/remove-demo-employees.ts:41-55`) unconditionally on **every** startup. It deletes any `employees` row whose `matricule` is not in the hardcoded 309-entry `VALID_MATRICULES` set.
- **Why it's a problem:** This was a one-time cleanup migration from the data-recovery session, but it's wired into the permanent startup sequence. Any employee created through "Ajouter un employé" has a matricule not in `VALID_MATRICULES`.
- **Impact on users:** A newly-added employee will exist fine until the next Electron app/server restart, at which point it's silently deleted — no audit log entry, no warning. This breaks the core "manage your own roster" use case going forward.
- **Recommended fix:** Remove `removeDemoEmployees()` from the startup path entirely (the 309-employee baseline is now established), or gate it behind a one-time "migrations applied" flag/table. Same applies to `addMissingEmployees`, `runNamesMigration`, `runPdfSeedMigration`, `runPdfImportMigration` — all are one-time data-fix migrations re-running every boot (see M-series findings).
- **Files:** `server/index.ts:35-63`, `server/migrations/remove-demo-employees.ts:7-55`

### C2. Backup "Restore" is completely unimplemented — UI button is a no-op, no server endpoint exists
- **Severity:** Critical
- **Description:** `client/pages/BackupRestore.tsx:646-649` — the "Restore" `AlertDialogAction` button has **no `onClick` handler** at all. Server-side, `server/index.ts:731-825` defines create/list/download/verify/statistics/cleanup/cloud endpoints, but **no `/api/backups/:id/restore`** route exists, and `backupService.ts` has no restore function.
- **Why it's a problem:** This is the entire "Restore" half of "Backup & Restore" — the core disaster-recovery feature. The UI presents a scary "this will overwrite all data" confirmation dialog for a feature that does nothing.
- **Impact on users:** In a disaster-recovery scenario (which this app just went through in this very session — full DB wipe), administrators have zero in-app way to restore. They need a manual script.
- **Recommended fix:** Implement `POST /api/backups/:id/restore` — read the backup JSON, verify checksum, transactional replace of `employees`, `employeeVersions`, `pendingRenewals`, `auditLogs`, `divisions`, `services`, `equipes` (mirroring `exportAllData`'s table list, `backupService.ts:67-94`). Wire the button's `onClick`.
- **Files:** `client/pages/BackupRestore.tsx:646-649`, `server/index.ts:731-825`, `server/services/backupService.ts`

### C3. `/uploads` static route serves all PDFs with zero authentication
- **Severity:** Critical
- **Description:** `server/index.ts:112` — `app.use("/uploads", express.static(...))` registered before any auth middleware. Every other PDF endpoint goes through `authMiddleware`, but the actual files (containing employee name, matricule, job title, division/service/équipe, habilitation codes, validity dates) are served to anyone, with predictable filenames `hab{matricule}_v{N}.pdf` and 5-digit numeric matricules.
- **Why it's a problem:** Trivially enumerable PII leak — full bypass of the login system for all 309 employees' certificates.
- **Impact on users:** Personal/professional data of the entire ONEE-DTC roster is publicly downloadable to anyone with network access to the server.
- **Recommended fix:** Either move PDF serving behind an authenticated endpoint (`/api/employees/:id/pdf`), or wrap the static route in `authMiddleware`. Note: client `<a>`/`<iframe>` usages (`PdfPreviewModal.tsx:29`, `EmployeeCard.tsx:251/256`) rely on direct URLs — cookie-based auth would work transparently, Bearer-in-localStorage would not, so a signed-URL or cookie fallback is needed.
- **Files:** `server/index.ts:112`, `client/components/employees/PdfPreviewModal.tsx:29`, `client/pages/EmployeeCard.tsx:250-256`

### C4. Hardcoded demo admin credentials shown directly on the login page
- **Severity:** Critical
- **Description:** `client/pages/Login.tsx:130-134` displays "Demo: **admin@example.com** / **admin123**" on the login screen. `server/db-pg.ts:137-152` auto-creates this exact user on every fresh DB init, logging the password to console.
- **Why it's a problem:** Shipping a published admin password for a national-utility employee-records system is a severe security hole.
- **Impact on users:** Anyone who sees the login page (or reads the source) can log in as admin and access/modify all employee data, audit logs, and (once C2 is fixed) restore/overwrite backups.
- **Recommended fix:** Remove the demo-credentials banner from `Login.tsx`. In `db-pg.ts`, require an admin password via env var on first run, or generate a random one-time password printed once to console with a forced password-change on first login.
- **Files:** `client/pages/Login.tsx:130-134`, `server/db-pg.ts:137-152`

### C5. AuditLog.tsx UI is built against fields that don't exist in the database — filtering and key columns are completely non-functional
- **Severity:** Critical
- **Description:** `client/pages/AuditLog.tsx` expects `entityType`, `matricule`, `revertedFromAuditLogId` on each log entry and sends `entityType`/`matricule`/`startDate`/`endDate` filters to `/api/audit-logs` and `/api/audit-logs/export`. The real `audit_logs` table (`server/schema.ts:108-120`) only has `id, action, entityId, userId, snapshotOld, snapshotNew, createdAt`. `getAuditLogs_Handler` (`server/routes/auditLog.ts:7-29`) builds a `$dynamic()` filtered query but then **discards it**, running a separate unfiltered query instead — not even `entityId`/`action` filters apply.
- **Why it's a problem:** The "Entité" and "Matricule" columns render blank/`undefined` for every row, and every filter combination (action, entity type, matricule, date range) returns the identical unfiltered top-100 results.
- **Impact on users:** Compliance reviewers cannot search/filter the audit trail at all — the page's core purpose is broken.
- **Recommended fix:** Extend `audit_logs` with `entityType` + denormalized `matricule` snapshot columns populated at write time, and rewrite `getAuditLogs_Handler` to actually apply the `$dynamic` filters (action, entityId, date range via `gte`/`lte` on `createdAt`). Alternatively, simplify the UI to match the real schema and resolve matricule via lookup.
- **Files:** `client/pages/AuditLog.tsx:48-59,153-158,239-241,281-287,435-440`, `server/routes/auditLog.ts:7-56`, `server/schema.ts:108-120`

### C6. PDF filename `_vN` suffix is desynced from the DB `version_number` for ~47% of employees
- **Severity:** Critical
- **Description:** `uploads/pdfs/` has 1,899 files across 350 matricules, but the DB has 310 `employee_versions` rows. `import-pdfs.ts:74-76` sets `pdfPath = cert.output_file` (e.g. `hab82649_v10.pdf`) onto whatever the current version is (e.g. `version_number: 1`), with no check that `_vN` matches `ver.versionNumber`. Confirmed: matricule 82649, `version_number=1`, `pdf_path='hab82649_v10.pdf'`. 145/309 employees affected.
- **Why it's a problem:** `process-pdfs.py`'s `get_next_version()` globs the filesystem (not the DB) for its `_vN` numbering, so repeated OCR runs increment filenames independent of actual DB version history.
- **Impact on users:** Admins see "Version 1" next to a file literally named `hab82649_v10.pdf` — looks like data corruption. 1.3GB of mostly-duplicate files on disk.
- **Recommended fix:** (a) base `process-pdfs.py` versioning on the DB's `employee_versions.version_number`, not a filesystem glob; (b) have `import-pdfs.ts` rename/copy the linked file to `hab{matricule}_v{ver.versionNumber}.pdf` on link; (c) one-time cleanup of superseded duplicate files.
- **Files:** `server/migrations/import-pdfs.ts:74-76`, `server/services/pdfService.ts:378`, `server/utils/pathUtils.ts:119-122`

### C7. Electron: backup/PDF directory paths computed from `process.cwd()`, ignoring the `userData` path the main process sets
- **Severity:** Critical
- **Description:** `electron/main.ts:11-17` sets `UPLOADS_BASE_DIR`/`UPLOADS_DIR`/`DATABASE_URL` env vars pointing into `app.getPath("userData")` for packaged builds. But `server/utils/pathUtils.ts:11-13` computes `UPLOADS_DIR`/`PDFS_DIR`/`BACKUPS_DIR` from `path.resolve(process.cwd(), "uploads")` at module-load time — never reading `UPLOADS_BASE_DIR`. `backupService.ts` and `healthCheck.ts` depend on these constants; only `server/index.ts:112` (static serving) and `:448` (multer) correctly use the env var.
- **Why it's a problem:** In a packaged app, `process.cwd()` isn't guaranteed writable/persistent. Backups would write to (or fail to write to) a different directory than where PDFs actually live, and could be wiped on app update.
- **Impact on users:** "Create Backup" may throw `EACCES`/`EROFS` in the packaged app, or silently write backups to a location that disappears on update — defeating the backup feature entirely. Health checks may report false PDF-missing errors.
- **Recommended fix:** Make `pathUtils.ts` derive `UPLOADS_DIR` from `process.env.UPLOADS_BASE_DIR ?? path.resolve(process.cwd(), "uploads")`, matching the pattern already used in `server/index.ts:112`.
- **Files:** `server/utils/pathUtils.ts:11-13`, `electron/main.ts:11-17`, `server/services/backupService.ts`, `server/utils/healthCheck.ts`

### C8. 47 matricule-groups of orphaned PDF certificates for employees no longer in the DB
- **Severity:** Critical (storage + data-retention/privacy)
- **Description:** 47 distinct matricules (e.g. `70876F`, `74173`, `76964`, `85978U`, etc.) have versioned PDFs in `uploads/pdfs/` but are not in `VALID_MATRICULES` — these employees were removed by `removeDemoEmployees()`, which never calls `deletePdf()` for their files.
- **Why it's a problem:** Real personal data (names, matricules, signatures) of people no longer tracked remains on disk indefinitely, and (combined with C3) is publicly downloadable.
- **Impact on users:** Disk bloat + GDPR/data-retention exposure for ex-employees' scanned certificates.
- **Recommended fix:** One-time cleanup migration: delete `hab{matricule}_*` files for matricules not in `VALID_MATRICULES` and not referenced by any `employee_versions.pdf_path`.
- **Files:** `server/migrations/remove-demo-employees.ts:41-55`, `server/services/pdfService.ts:396-399`

---

## HIGH-SEVERITY ISSUES

### H1. `OrgSettings.tsx` page — fully built, completely unreachable from the UI
- **Severity:** High
- **Description:** `client/pages/OrgSettings.tsx` (228 lines) is a complete Division/Service/Équipe CRUD UI wired to working `/api/org/*` endpoints, but is never imported/routed in `App.tsx` and has no sidebar link.
- **Why/Impact:** Admins cannot manage org structure (add a new équipe, division, etc.) through the UI at all, despite the backend fully supporting it.
- **Fix:** Add `<Route path="/org-settings" .../>` in `App.tsx` and a sidebar entry (e.g. under "Paramètres").
- **Files:** `client/pages/OrgSettings.tsx`, `client/App.tsx`, `client/components/AppSidebar.tsx`

### H2. `OrgSettings.tsx` équipes list is broken even if reachable — `parseInt("all")` → NaN crashes the query
- **Severity:** High
- **Description:** `OrgSettings.tsx:34,52` initializes `selSvcForEq = "all"` and a `useEffect` immediately calls `loadEquipes("all")` → `GET /api/services/all/equipes` → `getEquipesByService` does `parseInt("all")` = `NaN` → `eq(equipes.serviceId, NaN)` → libsql throws `"Only finite numbers..."`.
- **Why/Impact:** The équipes management section appears empty on load (44 équipes exist in DB) — looks like data loss; 500 error on every page load.
- **Fix:** Add a `GET /api/equipes` (all) endpoint, or special-case `"all"` in `getEquipesByService`, or don't call `loadEquipes` for `"all"` in the client.
- **Files:** `client/pages/OrgSettings.tsx:34,52`, `server/routes/employees-audit.ts:137-145`

### H3. BackupRestore page — fully built, completely unreachable
- **Severity:** High
- **Description:** Route `/backup-restore` exists (`App.tsx:214-221`, 655-line page with stats/list/verify/download/S3), but no sidebar link or button anywhere navigates there. `Settings.tsx` only has a bare "create backup now" button.
- **Why/Impact:** Backup history, integrity verification, download, and cloud management are all invisible to users.
- **Fix:** Add a sidebar link or a "Gérer les sauvegardes" button in `Settings.tsx` → `/backup-restore`.
- **Files:** `client/App.tsx:214-221`, `client/pages/Settings.tsx`, `client/components/AppSidebar.tsx`

### H4. Renewal "Undo" can corrupt the new employee_versions row
- **Severity:** High
- **Description:** After activating a renewal, `Renewals.tsx:88` surfaces an Undo toast that calls `POST /api/audit-logs/:id/revert`. For `ACTIVATE_RENEWAL` logs, `snapshotOld = { renewalId, snapshot: snap }` (`renewals.ts:119`), but `revertAuditLog_Handler` (`auditLog.ts:85-112`) reads `snap.divisionId` at the top level (it's nested under `.snapshot`), so `parseInt(undefined)` → `NaN`.
- **Why/Impact:** Clicking "Annuler" right after a renewal activation can insert a version with `divisionId: NaN`, violating the FK or producing a 500 — corrupting the employee's version/org-structure history.
- **Fix:** Either don't show Undo for `ACTIVATE_RENEWAL`, unwrap `snapshotOld.snapshot` in the revert handler for this action type, or store a flat snapshot in `activatePendingRenewal`.
- **Files:** `client/pages/Renewals.tsx:88`, `server/routes/auditLog.ts:85-121`, `server/routes/renewals.ts:119`

### H5. Renewal activation drops `habRows` and `pdfPath` — new "current" version loses its habilitation table content
- **Severity:** High
- **Description:** `RenewalForm.tsx:147-158` collects `habRows` (the official Domaine/Ouvrage/Indication table) into the snapshot, but both `activatePendingRenewal` (`renewals.ts:100-112`) and `autoActivateRenewalsJob` (`notificationJobs.ts:129-141`) omit `habRows`/`pdfPath` from the new `employee_versions` insert.
- **Why/Impact:** After every renewal (manual or automatic), the new "current" habilitation has `habRows = NULL` — directly affecting the official certificate document content/PDF generation.
- **Fix:** Add `habRows: snap.habRows ?? null` to both inserts; null out `pdfPath` explicitly (old PDF is stale).
- **Files:** `server/routes/renewals.ts:100-112`, `server/jobs/notificationJobs.ts:129-141`, `client/pages/RenewalForm.tsx:147-158`

### H6. Bulk "Renouveler" clones the current (already-expiring) snapshot verbatim — including the same `dateExpiration`
- **Severity:** High
- **Description:** `useBulkOperations.ts:103-109` POSTs `snapshot: emp.currentVersion` directly with no date input. When this pending renewal auto-activates (because `dateExpiration <= today`), the new version is created with the **same expired date**.
- **Why/Impact:** Bulk-renewed employees end up "renewed" but immediately expired again — defeats the purpose, likely re-triggers "expired" alerts instantly. `BatchRenewDialog.tsx` (which would prompt for new dates) exists but is never wired up.
- **Fix:** Wire `BatchRenewDialog` to collect a new validation/expiration date and build a proper snapshot.
- **Files:** `client/hooks/useBulkOperations.ts:103-109`, `client/components/employees/BatchRenewDialog.tsx`

### H7. Cron-based auto-activation has no startup catch-up — problematic for an Electron desktop app
- **Severity:** High
- **Description:** `autoActivateRenewalsJob` runs only via `node-cron` at daily midnight (`notificationJobs.ts:103-197`). `initializeNotificationJobs()` registers the schedule at startup but never runs the job immediately.
- **Why/Impact:** The embedded server only runs while the desktop app is open. If the app isn't open at midnight on an expiration day, that pending renewal stays un-activated — possibly for days — while `currentVersionId` still points at the expired version.
- **Fix:** Run `autoActivateRenewalsJob()` (and `dailyExpirationCheckJob()`) once immediately at startup, in addition to the cron schedule.
- **Files:** `server/jobs/notificationJobs.ts:103-197`, `server/index.ts:64-69`

### H8. `employees.currentVersionId` has no foreign-key constraint
- **Severity:** High
- **Description:** `server/schema.ts:47` — `currentVersionId: integer(...)` with no `.references()`. Confirmed via `PRAGMA foreign_key_list(employees)` → `[]`.
- **Why/Impact:** Nothing at the DB level prevents `currentVersionId` from pointing at a non-existent/deleted version row. All integrity relies entirely on app code keeping it in sync within transactions.
- **Fix:** Add `.references(() => employeeVersions.id)` with `onDelete: "restrict"`/`"set null"` — requires a SQLite table-rebuild migration.
- **Files:** `server/schema.ts:47`

### H9. Audit-log creation has major coverage gaps
- **Severity:** High
- **Description:** Logged: `CREATE/UPDATE/DELETE/RESTORE/PERMANENT_DELETE_EMPLOYEE`, `REVERT_VERSION`, `DELETE_PDF`, `ACTIVATE_RENEWAL`, `CANCEL_RENEWAL`, backups. **Not logged:** login/logout (`server/routes/auth.ts` — zero audit references), PDF generate/upload (single + per-version + bulk — the `UPLOAD_PDF` action type exists in `auditService.ts:15` but is never inserted), renewal **creation** (`POST /api/renewals`), and all 6 org-structure mutation endpoints (create/delete division/service/équipe).
- **Why/Impact:** For a compliance-driven habilitation tracker, reviewers can't answer "who logged in", "who (re)generated/uploaded this certificate", "who requested this renewal", or "who changed the org structure".
- **Fix:** Add audit inserts for login/logout, `POST /api/renewals`, all PDF generate/upload endpoints (use existing `UPLOAD_PDF` + new `GENERATE_PDF`), and the 6 org-structure endpoints.
- **Files:** `server/routes/auth.ts`, `server/index.ts:423-463,836-930,497-603`, `server/routes/renewals.ts:7-31`, `server/services/auditService.ts:15`

### H10. Audit-log "revert" can silently discard intervening edits
- **Severity:** High
- **Description:** `auditLog.ts:77-131` reverts to `log.snapshotOld` by creating a new version from that old snapshot — non-destructive (no deletes), but if versions 1→2→3→4(current) exist and the user reverts the 2→3 log entry, the new version 5 contains **version 2's** data, silently overwriting whatever changed in versions 3→4. The confirmation dialog (`AuditLog.tsx:535-543`) doesn't warn about this.
- **Why/Impact:** A user reverting an old log entry can unknowingly wipe out several more-recent legitimate edits.
- **Fix:** Detect if `currentVersionId` differs from the version created immediately after this log entry, and warn ("Cet employé a été modifié X fois depuis — la réversion écrasera ces changements").
- **Files:** `server/routes/auditLog.ts:77-131`, `client/pages/AuditLog.tsx:535-543`

### H11. `express.json()` default 100KB body limit breaks manual PDF upload
- **Severity:** High
- **Description:** `server/index.ts:85` — `app.use(express.json())`, no `limit`. `upload-pdf` (`server/index.ts:423-464`) expects a base64 PDF in the JSON body. Real PDFs average ~750KB (≈1MB base64); the blank template alone is 385KB.
- **Why/Impact:** Any real PDF upload >~75KB raw gets a 413 before reaching the handler. Both call sites (`AddEmployee.tsx:151-153`, `EditEmployee.tsx`) swallow the error as "non-fatal" — the employee saves, but the PDF silently never attaches.
- **Fix:** `express.json({ limit: "10mb" })` for this route, or switch to multipart/`multer`.
- **Files:** `server/index.ts:85,423-464`, `client/pages/AddEmployee.tsx:146-154`, `client/pages/EditEmployee.tsx:156-174`

### H12. `pdfService.ts` bypasses the path-safety utilities — latent path-traversal risk
- **Severity:** High
- **Description:** `pdfService.ts:378-399` builds filenames/paths via raw string concatenation + `path.join`, never calling `sanitizeFilename()`/`safeResolvePath()` from `server/utils/pathUtils.ts` (which exists specifically for this). `deletePdf(filename)` receives `ver.pdfPath` directly from the DB with no `path.basename()` stripping.
- **Why/Impact:** No exploit today (matricules constrained to `VALID_MATRICULES`), but any future code path allowing unvalidated matricule/filename input (e.g., manual creation) could write/delete files outside `UPLOAD_DIR` via `../` sequences.
- **Fix:** Route `pdfService.ts` filename construction through `buildPdfFilename()`/`sanitizeFilename()`, and `getPdfPath`/`deletePdf`/`pdfExists` through `resolvePdfPath()`/`safeResolvePath()`.
- **Files:** `server/services/pdfService.ts:378-399`, `server/utils/pathUtils.ts:78-122`

### H13. `_uploaded.pdf` has no version suffix — overwrites prior uploads, breaks immutable-version-history guarantee
- **Severity:** High
- **Description:** `server/index.ts:451` — `hab${matricule}_uploaded.pdf`, no version number. `upload-pdf` finds the **latest** version (`orderBy: [desc(versionNumber)]`) and overwrites this fixed filename on disk via `fs.writeFileSync`.
- **Why/Impact:** If a prior version's `pdfPath` also points at `hab{matricule}_uploaded.pdf`, that older "immutable" version's PDF link now silently shows the newly-uploaded file's content.
- **Fix:** Name uploaded PDFs `hab{matricule}_v{versionNumber}_uploaded.pdf`, consistent with `buildPdfFilename`.
- **Files:** `server/index.ts:423-464`, `server/utils/pathUtils.ts:119-122`

### H14. Electron: "Voir" (view PDF) likely silently broken — `setWindowOpenHandler` always denies
- **Severity:** High
- **Description:** PDF links use `target="_blank"` (`EmployeeCard.tsx:250-253,354-357`) → triggers `setWindowOpenHandler` (`electron/main.ts:97-102`). The handler calls `shell.openExternal()` only for non-allowed origins, then **unconditionally** `return { action: "deny" }` — so same-origin (`localhost:4399`) URLs are denied with no window opened and no external fallback.
- **Why/Impact:** Clicking "Voir" in the packaged Electron app does nothing visible. "Télécharger" (uses `download` attribute, not window.open) likely still works.
- **Fix:** Allow same-origin URLs to open (`{ action: "allow" }`) or load in a dedicated viewer window. Should be confirmed by actually running the packaged app.
- **Files:** `electron/main.ts:97-102`, `client/pages/EmployeeCard.tsx:250-253,354-357`

### H15. `/api/analytics` is a redundant, divergent duplicate of `/api/stats`
- **Severity:** High
- **Description:** `server/index.ts:156-265` (`/api/analytics`, consumed only by `Reports.tsx`'s analytics tab) computes `byDivision`/totals independently from `/api/stats` (`employees-audit.ts:650-752`, consumed by `Stats.tsx`/`Home.tsx`). The two endpoints can disagree on "Répartition par division" because `/api/stats`'s version includes expired/critical breakdowns and `/api/analytics`'s doesn't.
- **Why/Impact:** Two different "division breakdown" totals depending on which page the user is on — erodes trust in the numbers.
- **Fix:** Consolidate into one source of truth, or clearly separate concerns ("/api/analytics" = activity-over-time, "/api/stats" = current snapshot) with no overlapping breakdowns.
- **Files:** `server/index.ts:156-265`, `server/routes/employees-audit.ts:650-752`

### H16. "Expirations par mois (12 prochains mois)" forecast chart can include past/expired months
- **Severity:** High
- **Description:** `employees-audit.ts:708-710` buckets **every** employee's `dateExpiration` into `monthlyForecast[YYYY-MM]` regardless of whether it's already expired, then `.slice(0,12)` of chronologically-sorted months (`:723-726`). If there's a backlog of long-overdue (already-expired) habilitations, those old months occupy the "12 prochains mois" slots, displacing the actual upcoming months.
- **Why/Impact:** The forecast/planning chart on Home and Stats could show entirely the wrong window — likely scenario for a real habilitation-tracking dataset with a renewal backlog.
- **Fix:** Filter to `ym >= currentMonth` and/or zero-fill the next 12 calendar months explicitly.
- **Files:** `server/routes/employees-audit.ts:708-726`, `client/pages/Stats.tsx:200-221`, `client/pages/Home.tsx:122-142`

---

## MEDIUM-SEVERITY ISSUES

| # | Issue | Why / Impact | Fix | Files |
|---|---|---|---|---|
| M1 | `resetNotificationLogsForEmployee()` defined but never called after edit/renewal/revert/restore | `notification_logs` unique `(employeeId, threshold)` rows from a prior cycle block future 3m/6m/9m/expired alerts after any renewal — safety-relevant silent suppression | Call it inside `updateEmployee`, `activatePendingRenewal`, `autoActivateRenewalsJob`, `revertToVersion`, `restoreEmployee` transactions | `server/jobs/notificationJobs.ts:80-86` |
| M2 | `server/seeds/organizationStructure.ts` defines a completely different ("Operations/Support/Administration") org structure, dormant but dangerous | If primary seed (`seedDatabasePG`) ever fails silently leaving `divisions` empty, this wrong structure gets seeded, and `addMissingEmployees` would then skip all 309 real employees (division name mismatch) | Remove this file + its call in `index.ts:27-33`, or point it at the real `ORGANIZATIONAL_STRUCTURE` | `server/seeds/organizationStructure.ts`, `server/index.ts:27-33` |
| M3 | `db-pg.ts` raw `CREATE TABLE` schema diverges from `schema.ts` (`service_id NOT NULL` vs nullable) + misleading "pg" naming throughout (`db-pg.ts`, `seed-pg.ts`, `seedDatabasePG`) on a SQLite/libsql stack | Drizzle-kit diff/migration mismatches; confusing for onboarding, risk of someone reintroducing Postgres-specific code | Rename `db-pg.ts`→`db.ts`, `seed-pg.ts`→`seed.ts` (note: dead `seed.ts` already exists, see L-series), align `service_id` nullability | `server/db-pg.ts:68`, `server/schema.ts:72` |
| M4 | Permanent employee delete doesn't remove the employee's PDF files from disk | FK cascade removes DB rows but `permanentDeleteEmployee` never calls `deletePdf()` — orphaned PDFs accumulate, privacy concern for "permanently deleted" data | Fetch all `employee_versions.pdfPath` before delete and `deletePdf()` each | `server/routes/employees-audit.ts:553-584` |
| M5 | `EmployeeHistory.tsx` page (290 lines, date-filter + JSON export) is fully built but unreachable — `EmployeeCard.tsx` has its own separate inline history/diff implementation | Two divergent diff implementations that can drift; useful export/filter feature is invisible | Add a link from `EmployeeCard.tsx` to `/employees/:id/history`, or remove the route/page and port export+filter into `EmployeeCard` | `client/pages/EmployeeHistory.tsx`, `client/pages/EmployeeCard.tsx:281-413`, `client/App.tsx:141-148` |
| M6 | No audit log for "create pending renewal"; `userId` never set on `ACTIVATE_RENEWAL`/`CANCEL_RENEWAL` audit rows (raw `tx.insert` bypasses `logAuditActionSafe`) | Can't see who created a renewal request or who activated/cancelled it — accountability gap | Insert `CREATE_RENEWAL` audit log on creation; pass `req.user.id` through to all renewal audit inserts | `server/routes/renewals.ts:7-34,94-150` |
| M7 | TOCTOU race: `createPendingRenewal` checks-then-inserts with no unique DB constraint on `pending_renewals.employee_id` | Two concurrent requests can create duplicate pending renewals for one employee; auto-activation would process both, flip-flopping `currentVersionId` | Add a unique index on `pending_renewals.employee_id`, handle the constraint violation as 409 | `server/routes/renewals.ts:18-22`, `server/db-pg.ts:78-83` |
| M8 | 5+ independent reimplementations of "days until expiration / threshold" logic (server: `alertService.ts`, `notificationJobs.ts`, `dateUtils.ts`; client: `habilitation.ts`, `ExpirationColorHelper.tsx`, `Renewals.tsx`) with inconsistent local/UTC handling | Renewals page, dashboard, notification jobs, and employee list can disagree on whether a habilitation is "expired" on boundary days | Consolidate all on `server/utils/dateUtils.ts` / `client/lib/dateUtils.ts` (the documented canonical UTC-safe versions); delete the rest | `server/services/alertService.ts:33-49`, `server/jobs/notificationJobs.ts:16-22`, `client/types/habilitation.ts:49-62` |
| M9 | `emailService.ts` is a pure stub — `sendViaProvider`/`logEmail` only `console.log`, no SMTP config anywhere, and its `send*` functions are never called by `notificationJobs.ts` | No actual email notifications are ever sent for approaching/expired habilitations, with no indication to admins that it's "not configured" | Either wire up real SMTP/provider with env config + clear logging, or remove and document that in-app `Renewals`/dashboard are the sole notification mechanism | `server/services/emailService.ts` (entire file) |
| M10 | `DashboardAlerts.tsx`/`ExpirationBanner.tsx` are dead, English-language, and call a non-existent `/api/alerts/statistics` endpoint | Would 404/hang forever ("Loading alert data...") if ever mounted; duplicates `Home.tsx`'s working alert banner | Delete both components | `client/components/DashboardAlerts.tsx`, `client/components/ExpirationBanner.tsx` |
| M11 | `AuditLog.tsx` action-filter dropdown offers non-existent `RENEW_HABILITATION` and is missing the real `ACTIVATE_RENEWAL`/`CANCEL_RENEWAL`; entity-type filter `"renewal"` has no server-side handling | Renewal-related audit entries are effectively unfilterable; the bogus option silently returns zero results | Replace `RENEW_HABILITATION` with `ACTIVATE_RENEWAL`/`CANCEL_RENEWAL`; remove/implement the `"renewal"` entity-type filter | `client/pages/AuditLog.tsx:339,361` |
| M12 | `notification_logs.version_id` and `employee_versions.{division_id,service_id,equipe_id}` FKs use `ON DELETE NO ACTION`; org-structure delete endpoints for divisions/services only check direct-child counts, not historical `employee_versions` references | Deleting an "empty" division/service that still has historical version rows throws a raw `SQLITE_CONSTRAINT` 500 instead of the friendly French message used for équipes | Add the same `employeeVersions.{divisionId,serviceId}` reference-count check used for équipes to division/service delete handlers | `server/index.ts:513-569`, `server/schema.ts:71-73,103` |
| M13 | `seedDatabasePG()` (full destructive wipe-and-reseed of employees/versions/org structure) + its CLI entrypoint remain in `seed-pg.ts`, unused by startup but invokable via `node server/seed-pg.ts` | If ever run (npm script, CI, future "reset" feature), would destroy the entire recovered 309-employee DB and all version history/PDF links not derivable from the Excel | Remove the function + CLI entrypoint, or gate behind an explicit `--force-wipe` flag + confirmation | `server/seed-pg.ts:269-417` |
| M14 | `seed-pdfs.ts`'s 114-entry `SEED_ENTRIES` list has drifted from the 153 actual `_seed.pdf` files on disk; 6 valid-roster matricules (77889, 78955, 83407, 85865, 85872, 85978) appear to have only a placeholder seed PDF, no real OCR cert | These 6 employees may be showing a generic placeholder instead of their real scanned certificate, with no UI indicator distinguishing the two | Cross-reference these 6 against `process-report.json`'s `review_queue`; manually resolve/assign real certs | `server/migrations/seed-pdfs.ts:13-128` |
| M15 | `GlobalSearchBar.tsx` (167 lines, working debounced server search) and `NotificationPanel.tsx` (165 lines, alert dropdown + `useNotifications` hook) are fully built but never rendered in `Header.tsx`/`Layout.tsx` | No global search capability anywhere in the UI (Employees page only searches its own loaded page); no in-app notification bell despite the infrastructure existing | Render `<GlobalSearchBar />` and `<NotificationPanel />` in `Header.tsx`, or remove if superseded | `client/components/GlobalSearchBar.tsx`, `client/components/NotificationPanel.tsx`, `client/components/Header.tsx` |
| M16 | PDF generate/upload (single, per-version, and bulk) are never audit-logged — only `DELETE_PDF` is | Compliance reviewers can see "PDF deleted on X" but never "PDF (re)generated/uploaded on Y by Z" for the actual certificate artifact | Add `GENERATE_PDF`/`UPLOAD_PDF` (type already declared, unused) audit inserts to all 4 endpoints | `server/index.ts:423-464,836-930` |
| M17 | `parseInt` coercion of `snap.divisionId`/`serviceId` in the audit-revert handler can produce `NaN` for malformed/old snapshots, causing an opaque 500 | A revert of a very old log entry could fail with "Erreur serveur" with no actionable message | Validate snapshot fields are numeric before insert; return a clear 400 if not | `server/routes/auditLog.ts:107-109` |
| M18 | `/api/audit-logs/export` ignores all query-string filters (`action`/`entityType`/`startDate`/`endDate`) — always exports the last 10,000 rows unfiltered, while `AuditLog.tsx` builds a filtered export URL | A user filtering to "CREATE_EMPLOYEE in March" and exporting gets the entire unfiltered dump — privacy/scope concern for a government utility | Apply the same filters (once C5 is fixed) to the export query | `server/routes/auditLog.ts:47-56`, `client/pages/AuditLog.tsx:236-249` |
| M19 | `Reports.tsx`'s period selector (3m/6m/9m/annual) only affects the "Rapport d'expiration" tab; the "Tableau de bord analytique" tab (`/api/analytics`) hardcodes a 12-month window with no period param | Switching periods has zero visible effect on the analytics tab; "12 mois" label is a hardcoded assumption in both client and server | Either parameterize `/api/analytics` by period, or make clear in the UI that the selector is scoped to the expiration-report tab only | `client/pages/Reports.tsx:47-52,87,126,196-337`, `server/index.ts:183,214,228,242` |
| M20 | `/api/reports/expiration` and PDF export compute "days until expiration" via wall-clock `new Date()`/`toISOString()` with a time-of-day component, while `/api/stats` uses pure date-string comparison — can disagree on same-day-expiration classification | An employee expiring "today" could show as expired in one view and not-yet-expired in another, on the single most time-critical day | Normalize both to date-only (midnight UTC) comparisons; use a consistent `<` vs `<=` convention everywhere | `server/routes/reports.ts:45-89`, `server/routes/employees-audit.ts:652,682` |
| M21 | `uploads/imports/` directory created and health-checked but never read/written by any code path | Implies a planned "upload Excel file via UI" import feature that was never built; current import is remote-URL-only | Remove from `REQUIRED_DIRS` if not planned, or build the local-file-import feature | `server/utils/pathUtils.ts:15,19` |
| M22 | `@libsql/client`'s native binary likely not included in electron-builder's `asarUnpack` | Packaged Electron app could fail to load the DB driver entirely (`Cannot find module` for `.node` file inside asar) — unverified, needs an actual packaged-build test | Add `**/node_modules/@libsql/**` to `asarUnpack` in `package.json`, then run/launch the packaged build | `package.json` (build config) |

---

## LOW-SEVERITY ISSUES

| # | Issue | Files |
|---|---|---|
| L1 | `employees.deletedAt` set to `null` on restore but never set to a timestamp on delete — dead/write-only column, blocks any future retention-based Trash purge | `server/schema.ts:49`, `employees-audit.ts:452-478,524-529` |
| L2 | `employeeVersions.createdBy` (FK to users) never populated by any insert | `server/schema.ts:79` |
| L3 | `drizzle.config.ts` defaults to `file:./habilitations.db`, runtime uses `app.db` — `drizzle-kit` commands without `DATABASE_URL` operate on the wrong/non-existent file | `drizzle.config.ts:8`, `server/db-pg.ts:15` |
| L4 | Global search (`/api/search`) loads **all** employees into memory and filters/scores in JS on every keystroke — fine at 309 rows, won't scale | `server/routes/search.ts:70-150` |
| L5 | `habRows` Zod schema accepts arbitrary string keys instead of the 6 documented row keys — unvalidated JSON can accumulate in DB | `server/routes/employees-audit.ts:24` |
| L6 | Dead seed/import files: `server/seed.ts`, `server/seeds/employees-seed.ts`, `employees-demo-50.ts`, `import-excel-data.ts`, and `server/import-employees.ts` (a fully-built Excel-import-with-diff-preview feature, zero callers outside its own tests) | `server/seed.ts`, `server/seeds/*.ts`, `server/import-employees.ts` |
| L7 | `EditEmployee.tsx` never sends `expectedUpdatedAt` — the optimistic-concurrency check in `updateEmployee` is dead code | `client/pages/EditEmployee.tsx:78-154`, `server/routes/employees-audit.ts:42-48,389-391` |
| L8 | Version-number race: concurrent edits to the same employee could hit the unique `(employeeId, versionNumber)` index and surface a generic "Erreur serveur" | `server/routes/employees-audit.ts` (update/restore/revert/renew transactions) |
| L9 | `client/components/employees/*` — 8 files (~780 lines: BatchActionsToolbar, BatchPdfDialog, BatchRenewDialog, BulkActionBar, EmployeeTableHeader, EmployeeTableRow, ExportDialog, PdfPreviewModal) + `client/utils/exportToExcel.ts` — all dead, zero imports outside themselves | `client/components/employees/*`, `client/utils/exportToExcel.ts` |
| L10 | `Trash.tsx` hardcodes `limit: 100` with no pagination UI and shows `employees.length` instead of API `total` | `client/pages/Trash.tsx:30` |
| L11 | `server/routes/employees-audit.ts` (928 lines, the main employees CRUD route) is misleadingly named — actual audit logging lives in `auditLog.ts` | `server/routes/employees-audit.ts` |
| L12 | `import-pdfs.ts`/`seed-pdfs.ts` resolve seed-PDF paths via `import.meta.url`, fragile under Electron's asar packaging — could silently no-op all 114 seed-PDF links in the packaged app | `server/migrations/seed-pdfs.ts:131-134`, `server/migrations/import-pdfs.ts:23-26` |
| L13 | `upload-pdf` mutates the latest `employee_versions` row's `pdfPath` in place (no new version, no audit log) — inconsistent with the immutable-version model used by `deletePdf`/`revertToVersion` | `server/index.ts:423-464` |
| L14 | `employees.matricule` validated as exactly `/^\d{5}$/`, but `import-pdfs.ts` has fuzzy-matching logic implying alphanumeric matricules exist in source PDFs (e.g. "83192A") | `server/db-pg.ts:192-194`, `server/routes/employees-audit.ts:36`, `server/migrations/import-pdfs.ts:54-59` |
| L15 | `audit_logs.entityId` has no FK and uses `0` as a magic "no entity" sentinel instead of `null` | `server/schema.ts:111`, `server/services/auditService.ts:28` |
| L16 | `idx_emp_versions_division`/`idx_emp_versions_service` exist in `schema.ts` but are missing from `db-pg.ts`'s raw `CREATE INDEX` bootstrap — a fresh DB created via raw SQL wouldn't have them | `server/schema.ts:84-85`, `server/db-pg.ts:101-115` |
| L17 | `formatDateFrench` in `pdfService.ts` can render `"NaN undefined NaN"` on a generated PDF for malformed dates instead of throwing — `validate()` doesn't catch this | `server/services/pdfService.ts:46-68` |
| L18 | `auditService.ts` exports `getAuditLogs`/`getAuditLogEntry`/`exportAuditLogsAsJSON` — dead, duplicated by `routes/auditLog.ts`'s own implementations; `logAuditActionSafe` is only used by backup routes, not employee/renewal routes | `server/services/auditService.ts:19-56` |
| L19 | `revertAuditLog_Handler`'s `req.params.id ?? req.params.logId` fallback is dead (route only registers `:id`) | `server/routes/auditLog.ts:79` |
| L20 | `/api/audit-logs/export` returns raw internal JSON (DB column names, bare numeric `entityId`) — no resolved employee name/matricule, no CSV option | `server/routes/auditLog.ts:47-56` |
| L21 | `ExpirationTrendChart.tsx`/`StatusPieChart.tsx` (dashboard components) — unused, superseded by server-computed charts | `client/components/dashboard/ExpirationTrendChart.tsx`, `StatusPieChart.tsx` |
| L22 | `Analytics.tsx` is an 8-line redirect-to-`/stats` stub, with its own "Analyses" sidebar entry duplicating "Statistiques" | `client/pages/Analytics.tsx`, `client/components/AppSidebar.tsx:79-83` |
| L23 | `ConfirmDialog.tsx` (styled confirmation component) unused — ~7 destructive actions use native `window.confirm()` instead, while BackupRestore/AuditLog use raw `AlertDialog` directly — 3 inconsistent confirmation patterns | `client/components/ConfirmDialog.tsx`, `client/pages/Employees.tsx:111`, `EmployeeCard.tsx:44,78,118`, `OrgSettings.tsx:76,83,90`, `Renewals.tsx:98` |
| L24 | 3 unused/duplicate hooks from an abandoned React-Query architecture: `useEmployees.ts`, `useFilterPresets.ts` (different localStorage key than the inline reimplementation!), `usePagination.ts` | `client/hooks/useEmployees.ts`, `useFilterPresets.ts`, `usePagination.ts` |
| L25 | `Employees.tsx` fetches `limit: 500` with no pagination UI/warning — would silently truncate past 500 employees | `client/pages/Employees.tsx:85` |
| L26 | `NotFound.tsx` is in English, uses `<a href>` (full reload) instead of `<Link>`, and `bg-gray-100` (breaks dark mode) — rest of app is French/themed | `client/pages/NotFound.tsx:17-21` |
| L27 | No user-facing "re-sync from Excel now" admin action — new-employee sync only happens via startup migration (which itself needs fixing per C1) | `server/index.ts:41-42,720-721` |
| L28 | "Renewal rate" KPI (renewed-in-time vs lapsed) not computed anywhere | `server/routes/employees-audit.ts`, `server/index.ts:156-265` |

---

## POSITIVE / VERIFIED-CORRECT FINDINGS (no action needed)

- **Create/Edit/Revert/Restore/Permanent-delete employee flows** — all transactional, correctly versioned, `currentVersionId` kept in sync, audit-logged. (`server/routes/employees-audit.ts:317-644`)
- **Real ONEE org structure** ("Division Exploitation Casa/El Jadida/Afourer" with correct services/équipes) is what's actually seeded and live in `app.db` — 3 divisions, 6 services, 44 équipes, 309 employees, matches `server/org-structure.ts`.
- **Soft-delete + `currentVersionId` joins** are correctly applied across `getEmployees`, `getStats`, `exportEmployees`, `/api/reports/expiration`, `/api/analytics`, search, bulk-PDF — no orphan-record leaks found in live DB (0 orphaned versions/pending_renewals/notification_logs verified).
- **`pending_renewals`/`activatePendingRenewal`/`autoActivateRenewalsJob`/`deletePendingRenewal`** core CRUD is sound and transactional, correctly increments `versionNumber` and updates `currentVersionId`.
- **PDF generation engine** (`pdfService.ts`, `pdf-lib`-based template fill) — correct, including dev-vs-bundled template path resolution.
- **Per-version PDF delete** correctly creates a new immutable version + audit log.
- **Health check system** (`healthCheck.ts`) correctly detects and auto-repairs orphaned PDF references.
- **Org-structure cascade-delete protection** for équipes (checks `employeeVersions.equipeId` references before allowing delete) is well-designed — gap is only for divisions/services (M12).
- **Electron security hardening** — `contextIsolation`, `sandbox`, strict preload whitelist, CSP headers, navigation blocking — solid, best-practice implementation.
- **Electron DB location** (`userData/habilitations.db`) — correctly persistent across updates.
- **AWS S3 cloud backup** — gracefully degrades with clear in-app guidance when unconfigured.
- **`missingPdf` stat** — live, correct (currently 0/309, matches recovered DB state).
- **309 employees / 310 versions, idempotent across restarts** — confirmed stable from this session's recovery work (though see C1 for why this stability is fragile going forward).

---

# Summary by Category

## Fully Complete
- Employee CRUD (create/edit/revert/restore/permanent-delete) with full versioning + audit trail
- Org structure data (real ONEE hierarchy, correctly seeded)
- Search, filtering, sorting, pagination, export for Employees list (at current ~309-record scale)
- PDF generation engine + template handling
- Per-version PDF deletion (with versioning + audit log)
- Renewal create/activate/cancel core mechanics
- Health-check / orphaned-PDF auto-repair
- Electron security model, DB location
- AWS S3 cloud backup graceful degradation

## Partially Complete
- Renewal workflow (activation drops habRows/pdfPath, bulk renewal broken-by-design, undo can corrupt, no startup catch-up, notification suppression after renewal)
- Audit logging (covers CRUD/revert/delete-pdf but not login, PDF generate/upload, renewal creation, org-structure changes; revert lacks safeguards)
- Reports/Stats/Analytics (core counts correct, but `/api/analytics` duplicates `/api/stats` inconsistently, forecast chart can show wrong months, period selector doesn't apply to analytics tab)
- Backups (create/list/verify/download work; restore entirely missing; Electron path config likely broken)
- PDF system (generation/viewing/deletion solid; upload broken by body-size limit; version-numbering desynced for ~47% of employees; path-safety bypassed)
- Manual PDF upload (broken by 100KB JSON limit)
- Notifications (in-app banner exists; email stub never sends; bell/panel built but unmounted)

## Broken
- `AuditLog.tsx` filtering/columns (schema mismatch — non-functional)
- Backup "Restore" (no client handler, no server endpoint)
- `OrgSettings.tsx` équipes list (`parseInt("all")` crash)
- Renewal undo (NaN division/service on revert of `ACTIVATE_RENEWAL`)
- PDF/version filename correspondence for ~145 employees
- `/uploads` route (security, not functionality — but effectively "broken" as an access-controlled resource)
- Electron "Voir" PDF button (likely no-ops)
- Electron backup/PDF directories (likely wrong path in packaged build)
- `removeDemoEmployees` will break "add new employee" on next restart

## Missing
- Backup restore endpoint/UI wiring
- Audit logging for login/logout, PDF generate/upload, renewal creation, org-structure CRUD
- DB-level FK on `employees.currentVersionId`
- Real email notification delivery
- Renewal-rate KPI
- Cleanup of orphaned PDFs for removed employees
- Pagination for Trash / Employees beyond 500

## Obsolete — Should Be Removed
- `client/components/employees/*` (8 files) + `exportToExcel.ts`
- `client/pages/Analytics.tsx` + its sidebar entry + route
- `client/components/DashboardAlerts.tsx`, `ExpirationBanner.tsx`, `ExpirationColorHelper.tsx`
- `client/components/dashboard/ExpirationTrendChart.tsx`, `StatusPieChart.tsx`
- `client/hooks/useEmployees.ts`, `useFilterPresets.ts`, `usePagination.ts`
- `server/seed.ts`, `server/seeds/employees-seed.ts`, `employees-demo-50.ts`, `import-excel-data.ts`, `server/import-employees.ts`
- `server/seeds/organizationStructure.ts` (+ its startup call)
- `server/seed-pg.ts`'s `seedDatabasePG()` + CLI entrypoint (destructive, superseded)
- `removeDemoEmployees()`, `addMissingEmployees()`, `runNamesMigration()`, `runPdfSeedMigration()`, `runPdfImportMigration()` from the **per-boot** startup path (one-time migrations, now done)
- Hardcoded demo-credentials banner + auto-created demo admin
- 47 matricule-groups of orphaned PDF files (~hundreds of files)
- Duplicate `_v2`-`_v28` PDF files from repeated OCR re-runs (keep only the referenced/genuinely-distinct ones)
- `auditService.ts`'s unused `getAuditLogs`/`getAuditLogEntry`/`exportAuditLogsAsJSON`

---

# Priority Order of Remaining Work

1. **C1** — Remove one-time migrations (`removeDemoEmployees` etc.) from per-boot startup — prevents silent data loss of newly-added employees. *(Launch-blocking)*
2. **C4** — Remove hardcoded demo admin credentials / login banner. *(Launch-blocking, security)*
3. **C3** — Authenticate `/uploads` PDF serving. *(Launch-blocking, security/privacy)*
4. **C5** — Fix `AuditLog.tsx`/`getAuditLogs_Handler` schema mismatch — core compliance feature is non-functional.
5. **C2** — Implement backup restore (client + server) — core disaster-recovery feature is a no-op.
6. **C7** — Fix Electron `pathUtils.ts` to respect `UPLOADS_BASE_DIR` — backups/PDFs likely broken in packaged app.
7. **H5 / H6 / H4 / M1** — Fix renewal-activation data loss (`habRows`/`pdfPath`), bulk-renewal expiring-date bug, undo corruption, notification-log reset — all directly affect the safety-critical renewal cycle.
8. **H7** — Add startup catch-up for auto-activation job (Electron daily-cron gap).
9. **C6 / C8** — PDF filename/version desync + orphaned PDF cleanup (data hygiene + disk + privacy).
10. **H11 / H13 / H12** — Fix PDF upload body-size limit, versioned upload filenames, path-safety bypass.
11. **H1 / H2 / H3** — Wire up `OrgSettings` and `BackupRestore` pages into navigation (and fix the équipes-list crash).
12. **H8 / H9 / H10** — DB-level FK on `currentVersionId`, audit-coverage gaps, revert-safeguard warning.
13. **H15 / H16** — Consolidate `/api/analytics` vs `/api/stats`, fix forecast-chart month windowing.
14. **M-series** — notification-threshold consolidation, email service decision, org-structure delete FK checks, dead-seed cleanup, GlobalSearchBar/NotificationPanel wiring or removal.
15. **L-series / Code-quality pass** — remove all dead components/hooks/files listed above, fix NotFound/Analytics, standardize confirmation dialogs, address minor schema/index drifts.

---

# Completion Percentage Estimates

| Area | Estimate | Rationale |
|---|---|---|
| **Backend completion** | **80%** | Core CRUD/versioning/renewals/PDF-gen/health-checks are solid and transactional; held back by the per-boot migration bug (C1), missing FK constraints, audit-coverage gaps, restore endpoint missing, and `/api/analytics` vs `/api/stats` duplication. |
| **Frontend completion** | **75%** | Most pages are fully built and functional, but ~5 fully-built pages/components are unreachable (OrgSettings, BackupRestore, EmployeeHistory, GlobalSearchBar, NotificationPanel), plus dead-code sprawl (8 batch components, 3 hooks, Analytics stub) and a critical security banner on Login. |
| **PDF system completion** | **65%** | Generation/viewing/deletion engine is solid, but upload is broken (body limit), version-numbering is desynced for ~47% of employees, security (`/uploads` unauth) is a major gap, and Electron "Voir" likely doesn't work. |
| **Renewal system completion** | **60%** | Mechanics (create/activate/cancel/version-bump) work, but activation drops `habRows`/PDF data, bulk-renewal produces immediately-expired results, undo can corrupt data, no startup catch-up, and post-renewal notification suppression — these are not edge cases, they hit the renewal happy-path. |
| **Reports completion** | **65%** | Core `/api/stats` numbers are live and accurate; `/api/analytics` is redundant/divergent, forecast chart can show wrong months, audit-log filtering/export is non-functional, period selector doesn't apply everywhere. |
| **Overall project completion** | **~70%** | A functionally rich, mostly-working application with a genuinely solid data-recovery state (309/309 employees, 0 orphans), but several launch-blocking security issues (C3, C4), a data-integrity time bomb (C1), a non-functional core compliance page (C5/AuditLog), and a missing core DR feature (C2/Restore) mean it is **not** production-ready as-is. |

---

*This report reflects a static-analysis audit (code reading + live DB queries against `app.db`) performed by 6 parallel specialist passes covering Database/Integrity, Employees/Org-Structure, Renewals, PDF/Imports, Reports/Stats/Audit-Logs, and UI/Electron/Code-Quality/Backups. No code changes were made. Runtime/UI verification (actually launching the app and clicking through flagged items, especially the Electron-specific findings C7/H14/M22) is recommended as a follow-up before acting on Electron-related findings.*
