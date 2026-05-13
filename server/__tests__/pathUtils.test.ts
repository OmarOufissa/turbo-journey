/**
 * Tests for server/utils/pathUtils.ts — path traversal prevention.
 */

import { describe, it, expect } from "vitest";
import {
  sanitizeFilename,
  buildPdfFilename,
  safeResolvePath,
} from "../utils/pathUtils";
import path from "path";

describe("sanitizeFilename", () => {
  it("strips path separators", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
  });

  it("removes null bytes", () => {
    expect(sanitizeFilename("file\0name.pdf")).toBe("filename.pdf");
  });

  it("replaces dangerous characters", () => {
    expect(sanitizeFilename("file name!.pdf")).toBe("file_name_.pdf");
  });

  it("prefixes hidden files", () => {
    expect(sanitizeFilename(".hidden")).toBe("_hidden");
  });

  it("preserves valid filenames", () => {
    expect(sanitizeFilename("hab12345_v3.pdf")).toBe("hab12345_v3.pdf");
  });

  it("returns 'file' for empty input", () => {
    expect(sanitizeFilename("")).toBe("file");
  });

  it("handles French accented chars", () => {
    // French accented chars are in the allowed range
    expect(sanitizeFilename("employé.pdf")).toMatch(/employé\.pdf/);
  });
});

describe("buildPdfFilename", () => {
  it("generates correct filename pattern", () => {
    expect(buildPdfFilename("12345", 3)).toBe("hab12345_v3.pdf");
  });

  it("sanitizes matricule in filename (strips path separators via basename)", () => {
    // path.basename("../attack") = "attack" — directory traversal stripped
    expect(buildPdfFilename("../attack", 1)).toBe("habattack_v1.pdf");
  });
});

describe("safeResolvePath", () => {
  const baseDir = "/tmp/test-pdfs";

  it("resolves a safe filename", () => {
    const result = safeResolvePath(baseDir, "hab123_v1.pdf");
    expect(result).toBe(path.join(baseDir, "hab123_v1.pdf"));
  });

  it("strips traversal sequences by using only basename (path traversal safe)", () => {
    // path.basename("../../../etc/passwd") = "passwd" — traversal is neutralized
    const result = safeResolvePath(baseDir, "../../../etc/passwd");
    expect(result).toBe(path.join(baseDir, "passwd"));
  });

  it("strips path prefix and uses only basename", () => {
    // Even if the name includes slashes, only basename is used
    const result = safeResolvePath(baseDir, "/absolute/path/file.pdf");
    expect(result).toBe(path.join(baseDir, "file.pdf"));
  });

  it("throws for empty filename", () => {
    expect(() => safeResolvePath(baseDir, "")).toThrow();
  });

  it("throws for . and ..", () => {
    expect(() => safeResolvePath(baseDir, ".")).toThrow();
    expect(() => safeResolvePath(baseDir, "..")).toThrow();
  });
});
