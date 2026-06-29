/**
 * GITHUB BACKUP SERVICE
 *
 * Pushes backups to a dedicated GitHub repository so they survive an
 * ephemeral/rebuilt environment (local backups are wiped on restart).
 *
 * Two modes:
 *  - DB only:  commits the database JSON export into the repo (small file)
 *  - Full:     zips the DB export + all PDFs and uploads it as a GitHub
 *              Release asset (Release assets allow files up to 2GB, whereas
 *              committed files are hard-capped at 100MB).
 *
 * Configuration (env vars):
 *  - GITHUB_BACKUP_TOKEN : a Personal Access Token with `contents` write
 *                          (classic: `repo`) scope on the backup repo
 *  - GITHUB_BACKUP_REPO  : "owner/repo", e.g. "OmarOufissa/turbo-journey-backups"
 */

import { createReadStream, createWriteStream, statSync, unlinkSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import os from "os";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { ZipArchive } from "archiver";
import { Open as unzipOpen } from "unzipper";
import { exportAllData, restoreFromBackup, BackupMetadata } from "./backupService";
import { PDFS_DIR, GENERATED_PDFS_DIR, SIGNED_PDFS_DIR } from "../utils/pathUtils";

const GITHUB_API = "https://api.github.com";
const GITHUB_UPLOADS = "https://uploads.github.com";

export interface GitHubBackupResult {
  success: boolean;
  backupId?: string;
  url?: string;
  fileSize?: number;
  errors: string[];
}

// Config is read fresh on each call: admin-saved settings take precedence,
// falling back to environment variables.
async function getConfig(): Promise<{ token: string | null; repo: string | null }> {
  const { getSetting } = await import("./settingsService");
  const token = (await getSetting("github_backup_token")) || process.env.GITHUB_BACKUP_TOKEN || null;
  const repo = (await getSetting("github_backup_repo")) || process.env.GITHUB_BACKUP_REPO || null;
  return { token, repo };
}

export async function getGitHubBackupRepo(): Promise<string | null> {
  return (await getConfig()).repo;
}

export async function isGitHubBackupConfigured(): Promise<boolean> {
  const { token, repo } = await getConfig();
  return Boolean(token && repo && repo.includes("/"));
}

function ghHeaders(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "gestion-habilitations-backup",
    ...extra,
  };
}

function notConfigured(): GitHubBackupResult {
  return {
    success: false,
    errors: [
      "Sauvegarde GitHub non configurée. Définissez GITHUB_BACKUP_TOKEN (PAT avec accès 'contents') et GITHUB_BACKUP_REPO (owner/repo).",
    ],
  };
}

// ── DB-only backup: commit the JSON export into the repo ──────────────────────
export async function pushDbBackupToGitHub(uploadedBy: string = "system"): Promise<GitHubBackupResult> {
  const { token, repo } = await getConfig();
  if (!token || !repo || !repo.includes("/")) return notConfigured();

  try {
    const data = await exportAllData();
    const json = JSON.stringify(data, null, 2);
    const filePath = `db-backups/${data.metadata.backupId}.json`;
    const url = `${GITHUB_API}/repos/${repo}/contents/${filePath}`;

    const res = await fetch(url, {
      method: "PUT",
      headers: ghHeaders(token, { "Content-Type": "application/json" }),
      body: JSON.stringify({
        message: `DB backup ${data.metadata.backupId} — ${data.metadata.totalEmployees} employés, ${data.metadata.totalVersions} versions (par ${uploadedBy})`,
        content: Buffer.from(json, "utf-8").toString("base64"),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { success: false, errors: [`GitHub API ${res.status}: ${body.slice(0, 300)}`] };
    }

    const result = (await res.json()) as any;
    console.log(`[GITHUB BACKUP] DB backup committed: ${filePath}`);
    return {
      success: true,
      backupId: data.metadata.backupId,
      url: result?.content?.html_url,
      fileSize: json.length,
      errors: [],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GITHUB BACKUP] DB backup failed:", err);
    return { success: false, errors: [msg] };
  }
}

// ── Full backup: zip DB export + all PDFs, upload as a Release asset ──────────
export async function pushFullBackupToGitHub(uploadedBy: string = "system"): Promise<GitHubBackupResult> {
  const { token, repo } = await getConfig();
  if (!token || !repo || !repo.includes("/")) return notConfigured();

  let zipPath: string | null = null;
  try {
    const data = await exportAllData();
    const dbJson = JSON.stringify(data, null, 2);
    const backupId = data.metadata.backupId;

    // 1. Build the zip in a temp file (streamed — never holds 1.3GB in memory)
    zipPath = path.join(os.tmpdir(), `${backupId}.zip`);
    await buildZip(zipPath, dbJson, PDFS_DIR);
    const zipSize = statSync(zipPath).size;
    console.log(`[GITHUB BACKUP] Zip built: ${(zipSize / 1024 / 1024).toFixed(1)} MB`);

    // 2. Create a Release to attach the asset to
    const releaseRes = await fetch(`${GITHUB_API}/repos/${repo}/releases`, {
      method: "POST",
      headers: ghHeaders(token, { "Content-Type": "application/json" }),
      body: JSON.stringify({
        tag_name: backupId,
        name: `Full backup ${backupId}`,
        body: `Sauvegarde complète (BD + PDFs)\n\n- Employés: ${data.metadata.totalEmployees}\n- Versions: ${data.metadata.totalVersions}\n- Créé par: ${uploadedBy}\n- Taille zip: ${(zipSize / 1024 / 1024).toFixed(1)} MB`,
      }),
    });

    if (!releaseRes.ok) {
      const body = await releaseRes.text();
      return { success: false, errors: [`GitHub release ${releaseRes.status}: ${body.slice(0, 300)}`] };
    }

    const release = (await releaseRes.json()) as any;
    const releaseId = release.id;

    // 3. Upload the zip as a Release asset (streamed)
    const assetName = `${backupId}.zip`;
    const uploadUrl = `${GITHUB_UPLOADS}/repos/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(assetName)}`;
    const fileStream = createReadStream(zipPath);

    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: ghHeaders(token, {
        "Content-Type": "application/zip",
        "Content-Length": String(zipSize),
      }),
      body: Readable.toWeb(fileStream) as any,
      // @ts-expect-error — Node fetch requires duplex for a streamed body
      duplex: "half",
    });

    if (!uploadRes.ok) {
      const body = await uploadRes.text();
      return { success: false, errors: [`GitHub asset upload ${uploadRes.status}: ${body.slice(0, 300)}`] };
    }

    const asset = (await uploadRes.json()) as any;
    console.log(`[GITHUB BACKUP] Full backup uploaded: ${assetName}`);
    return {
      success: true,
      backupId,
      url: asset?.browser_download_url ?? release?.html_url,
      fileSize: zipSize,
      errors: [],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GITHUB BACKUP] Full backup failed:", err);
    return { success: false, errors: [msg] };
  } finally {
    if (zipPath) {
      try { unlinkSync(zipPath); } catch { /* already gone */ }
    }
  }
}

// ── List backups stored on GitHub (DB commits + full-backup releases) ─────────
export async function listGitHubBackups(): Promise<{
  dbBackups: Array<{ backupId: string; url: string }>;
  fullBackups: Array<{ backupId: string; url: string; fileSize: number; createdAt: string }>;
  errors: string[];
}> {
  const { token, repo } = await getConfig();
  if (!token || !repo || !repo.includes("/")) {
    return { dbBackups: [], fullBackups: [], errors: notConfigured().errors };
  }

  const errors: string[] = [];
  const dbBackups: Array<{ backupId: string; url: string }> = [];
  const fullBackups: Array<{ backupId: string; url: string; fileSize: number; createdAt: string }> = [];

  // DB backups = files under db-backups/
  try {
    const res = await fetch(`${GITHUB_API}/repos/${repo}/contents/db-backups`, { headers: ghHeaders(token) });
    if (res.ok) {
      const files = (await res.json()) as any[];
      for (const f of files) {
        if (f.name?.endsWith(".json")) {
          dbBackups.push({ backupId: f.name.replace(/\.json$/, ""), url: f.html_url });
        }
      }
    } else if (res.status !== 404) {
      errors.push(`Liste BD: GitHub ${res.status}`);
    }
  } catch (err) {
    errors.push(`Liste BD: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Full backups = releases with an attached zip asset
  try {
    const res = await fetch(`${GITHUB_API}/repos/${repo}/releases?per_page=100`, { headers: ghHeaders(token) });
    if (res.ok) {
      const releases = (await res.json()) as any[];
      for (const r of releases) {
        const zip = (r.assets ?? []).find((a: any) => a.name?.endsWith(".zip"));
        if (zip) {
          fullBackups.push({
            backupId: r.tag_name,
            url: zip.browser_download_url,
            fileSize: zip.size ?? 0,
            createdAt: r.created_at,
          });
        }
      }
    } else {
      errors.push(`Liste complète: GitHub ${res.status}`);
    }
  } catch (err) {
    errors.push(`Liste complète: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { dbBackups, fullBackups, errors };
}

export interface GitHubRestoreResult {
  success: boolean;
  restored?: { employees: number; versions: number; pdfs?: number };
  errors: string[];
}

// ── Restore the DB from a db-backups/ JSON file stored on GitHub ──────────────
export async function restoreDbFromGitHub(backupId: string): Promise<GitHubRestoreResult> {
  const { token, repo } = await getConfig();
  if (!token || !repo || !repo.includes("/")) return { success: false, errors: notConfigured().errors };

  let tmpPath: string | null = null;
  try {
    const filePath = `db-backups/${backupId}.json`;
    // raw accept header gives the file content directly (handles files >1MB unlike the JSON API)
    const res = await fetch(`${GITHUB_API}/repos/${repo}/contents/${filePath}`, {
      headers: ghHeaders(token, { Accept: "application/vnd.github.raw+json" }),
    });
    if (!res.ok) {
      return { success: false, errors: [`Téléchargement BD: GitHub ${res.status}`] };
    }
    const json = await res.text();

    tmpPath = path.join(os.tmpdir(), `restore_${backupId}.json`);
    writeFileSync(tmpPath, json);

    const result = await restoreFromBackup(tmpPath);
    console.log(`[GITHUB BACKUP] DB restored from ${backupId}`);
    return {
      success: true,
      restored: { employees: result.restored.employees ?? 0, versions: result.restored.employeeVersions ?? 0 },
      errors: [],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GITHUB BACKUP] DB restore failed:", err);
    return { success: false, errors: [msg] };
  } finally {
    if (tmpPath) { try { unlinkSync(tmpPath); } catch { /* gone */ } }
  }
}

// ── Restore the full app (DB + PDFs) from a Release-asset zip on GitHub ───────
export async function restoreFullFromGitHub(backupId: string): Promise<GitHubRestoreResult> {
  const { token, repo } = await getConfig();
  if (!token || !repo || !repo.includes("/")) return { success: false, errors: notConfigured().errors };

  let zipPath: string | null = null;
  try {
    // 1. Find the release by tag and its zip asset id
    const relRes = await fetch(`${GITHUB_API}/repos/${repo}/releases/tags/${encodeURIComponent(backupId)}`, {
      headers: ghHeaders(token),
    });
    if (!relRes.ok) return { success: false, errors: [`Release introuvable: GitHub ${relRes.status}`] };
    const release = (await relRes.json()) as any;
    const asset = (release.assets ?? []).find((a: any) => a.name?.endsWith(".zip"));
    if (!asset) return { success: false, errors: ["Aucun fichier .zip attaché à cette sauvegarde"] };

    // 2. Download the asset (octet-stream on the asset endpoint returns the binary)
    const dlRes = await fetch(`${GITHUB_API}/repos/${repo}/releases/assets/${asset.id}`, {
      headers: ghHeaders(token, { Accept: "application/octet-stream" }),
    });
    if (!dlRes.ok || !dlRes.body) return { success: false, errors: [`Téléchargement zip: GitHub ${dlRes.status}`] };

    zipPath = path.join(os.tmpdir(), `restore_${backupId}.zip`);
    await pipeline(Readable.fromWeb(dlRes.body as any), createWriteStream(zipPath));

    // 3. Open the zip and restore DB + PDFs
    const directory = await unzipOpen.file(zipPath);

    const dbEntry = directory.files.find((f) => f.path === "database.json");
    if (!dbEntry) return { success: false, errors: ["database.json absent du zip"] };

    const dbBuffer = await dbEntry.buffer();
    const tmpDbPath = path.join(os.tmpdir(), `restore_${backupId}.json`);
    writeFileSync(tmpDbPath, dbBuffer);
    const dbResult = await restoreFromBackup(tmpDbPath);
    try { unlinkSync(tmpDbPath); } catch { /* gone */ }

    // 4. Extract PDFs into the live PDFs directory, preserving the
    //    generated/ and signed/ sub-folders.
    mkdirSync(GENERATED_PDFS_DIR, { recursive: true });
    mkdirSync(SIGNED_PDFS_DIR, { recursive: true });
    let pdfCount = 0;
    for (const entry of directory.files) {
      if (entry.type !== "File" || !entry.path.startsWith("pdfs/")) continue;
      const name = path.basename(entry.path);
      if (!name.toLowerCase().endsWith(".pdf")) continue;
      const rel = entry.path.slice("pdfs/".length);
      const targetDir = rel.startsWith("signed/")
        ? SIGNED_PDFS_DIR
        : rel.startsWith("generated/")
          ? GENERATED_PDFS_DIR
          : /_signed\.pdf$/i.test(name) ? SIGNED_PDFS_DIR : GENERATED_PDFS_DIR;
      await pipeline(entry.stream(), createWriteStream(path.join(targetDir, name)));
      pdfCount++;
    }

    console.log(`[GITHUB BACKUP] Full restore from ${backupId}: ${pdfCount} PDFs`);
    return {
      success: true,
      restored: {
        employees: dbResult.restored.employees ?? 0,
        versions: dbResult.restored.employeeVersions ?? 0,
        pdfs: pdfCount,
      },
      errors: [],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GITHUB BACKUP] Full restore failed:", err);
    return { success: false, errors: [msg] };
  } finally {
    if (zipPath) { try { unlinkSync(zipPath); } catch { /* gone */ } }
  }
}

// ── Helper: stream-build a zip of the DB JSON + the entire PDFs directory ─────
function buildZip(zipPath: string, dbJson: string, pdfsDir: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    // level 1: PDFs are already compressed, so keep CPU low and just store-ish
    const archive = new ZipArchive({ zlib: { level: 1 } });

    output.on("close", () => resolve(archive.pointer()));
    archive.on("warning", (err) => {
      if ((err as any).code !== "ENOENT") reject(err);
    });
    archive.on("error", reject);

    archive.pipe(output);
    archive.append(dbJson, { name: "database.json" });
    archive.directory(pdfsDir, "pdfs");
    archive.finalize();
  });
}

export default {
  isGitHubBackupConfigured,
  pushDbBackupToGitHub,
  pushFullBackupToGitHub,
  listGitHubBackups,
  restoreDbFromGitHub,
  restoreFullFromGitHub,
};
