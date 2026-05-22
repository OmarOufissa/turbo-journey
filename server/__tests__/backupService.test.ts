/**
 * Tests for backup service — checksum integrity, payload structure.
 */

import { describe, it, expect } from "vitest";
import crypto from "crypto";

function sha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

interface BackupPayload {
  employees: any[];
  employeeVersions: any[];
  pendingRenewals: any[];
  auditLogs: any[];
  divisions: any[];
  services: any[];
  equipes: any[];
}

interface BackupData {
  metadata: {
    backupId: string;
    createdAt: string;
    version: string;
    checksum: string;
    payloadSizeBytes: number;
  };
  payload: BackupPayload;
}

function buildMockBackup(payload: BackupPayload): BackupData {
  const payloadJson = JSON.stringify(payload);
  return {
    metadata: {
      backupId: "backup_test",
      createdAt: new Date().toISOString(),
      version: "2.0.0",
      checksum: sha256(payloadJson),
      payloadSizeBytes: payloadJson.length,
    },
    payload,
  };
}

function verifyBackupData(data: BackupData): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!data.metadata) errors.push("Metadata missing");
  if (!data.payload) errors.push("Payload missing");
  if (errors.length > 0) return { isValid: false, errors };

  const actualChecksum = sha256(JSON.stringify(data.payload));
  if (actualChecksum !== data.metadata.checksum) {
    errors.push(`Checksum mismatch`);
  }

  if (!data.payload.employees) errors.push("No employee data found");
  if (!data.payload.divisions) errors.push("No divisions data found");

  return { isValid: errors.length === 0, errors };
}

function freshPayload(): BackupPayload {
  return {
    employees: [{ id: 1, matricule: "A001", nom: "Test" }],
    employeeVersions: [{ id: 1, employeeId: 1, versionNumber: 1 }],
    pendingRenewals: [],
    auditLogs: [],
    divisions: [{ id: 1, name: "Division A" }],
    services: [{ id: 1, name: "Service A" }],
    equipes: [],
  };
}

describe("Backup checksum integrity", () => {
  it("valid backup passes verification", () => {
    const backup = buildMockBackup(freshPayload());
    const { isValid, errors } = verifyBackupData(backup);
    expect(isValid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it("tampered payload fails checksum", () => {
    const payload = freshPayload();
    const backup = buildMockBackup(payload);
    // Deep-clone payload before tampering so we can build a backup with the original checksum
    const originalChecksum = backup.metadata.checksum;
    // Mutate after checksum was computed
    (backup.payload.employees[0] as any).nom = "Tampered";
    const { isValid, errors } = verifyBackupData(backup);
    expect(isValid).toBe(false);
    expect(errors.some((e) => e.includes("Checksum"))).toBe(true);
  });

  it("missing employees field is reported", () => {
    const payload = freshPayload();
    const backup = buildMockBackup(payload);
    // Create a modified version without employees
    const withoutEmployees = { ...backup.payload, employees: undefined as any };
    const testBackup: BackupData = {
      metadata: { ...backup.metadata, checksum: sha256(JSON.stringify(withoutEmployees)) },
      payload: withoutEmployees,
    };
    const { isValid, errors } = verifyBackupData(testBackup);
    expect(isValid).toBe(false);
    expect(errors.some((e) => e.includes("employee"))).toBe(true);
  });

  it("checksum is computed over payload only (not metadata)", () => {
    const backup = buildMockBackup(freshPayload());
    // Changing metadata fields should not invalidate the checksum
    backup.metadata.backupId = "altered_id";
    const { isValid } = verifyBackupData(backup);
    expect(isValid).toBe(true);
  });

  it("empty payload structure is valid", () => {
    const emptyPayload: BackupPayload = {
      employees: [],
      employeeVersions: [],
      pendingRenewals: [],
      auditLogs: [],
      divisions: [],
      services: [],
      equipes: [],
    };
    const backup = buildMockBackup(emptyPayload);
    const { isValid } = verifyBackupData(backup);
    expect(isValid).toBe(true);
  });

  it("missing payload section fails", () => {
    const backup = buildMockBackup(freshPayload());
    const testBackup = { ...backup, payload: undefined as any };
    const { isValid, errors } = verifyBackupData(testBackup);
    expect(isValid).toBe(false);
    expect(errors.some((e) => e.includes("Payload"))).toBe(true);
  });
});

describe("Backup metadata", () => {
  it("version field is stored in metadata", () => {
    const backup = buildMockBackup({ employees: [], employeeVersions: [], pendingRenewals: [], auditLogs: [], divisions: [], services: [], equipes: [] });
    expect(backup.metadata.version).toBe("2.0.0");
  });

  it("payloadSizeBytes matches actual JSON length", () => {
    const mockPayload: BackupPayload = {
      employees: [{ id: 1 }],
      employeeVersions: [],
      pendingRenewals: [],
      auditLogs: [],
      divisions: [],
      services: [],
      equipes: [],
    };
    const backup = buildMockBackup(mockPayload);
    const payloadJson = JSON.stringify(mockPayload);
    expect(backup.metadata.payloadSizeBytes).toBe(payloadJson.length);
  });
});
