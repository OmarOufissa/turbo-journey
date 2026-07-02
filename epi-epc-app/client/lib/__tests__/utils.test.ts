import { describe, it, expect } from "vitest";
import { formatDate, formatMoney, initials, cn } from "../utils";
import { coverageColor, categoricalColor, STATUS } from "../chartColors";

describe("formatDate", () => {
  it("formate une date ISO en format français", () => {
    expect(formatDate("2026-07-02")).toBe(new Date("2026-07-02").toLocaleDateString("fr-FR"));
  });
  it("renvoie un tiret pour une valeur absente", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
  });
});

describe("formatMoney", () => {
  // Intl.NumberFormat("fr-FR") sépare les milliers par une espace fine insécable (U+202F)
  const norm = (s: string) => s.replace(/ /g, " ");

  it("formate un nombre en MAD", () => {
    expect(norm(formatMoney(1500))).toBe("1 500 MAD");
  });
  it("accepte une chaîne numérique (valeur numeric de Postgres)", () => {
    expect(norm(formatMoney("2500.00"))).toBe("2 500 MAD");
  });
  it("renvoie un tiret pour une valeur nulle ou invalide", () => {
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney("abc")).toBe("—");
  });
});

describe("initials", () => {
  it("prend les deux premières initiales d'un nom complet", () => {
    expect(initials("AAKRACH Abdelhak")).toBe("AA");
  });
  it("gère un nom à un seul mot", () => {
    expect(initials("Admin")).toBe("A");
  });
});

describe("cn", () => {
  it("fusionne les classes tailwind en résolvant les conflits", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});

describe("coverageColor", () => {
  it("classe en critique sous 50%", () => {
    expect(coverageColor(0)).toBe(STATUS.critical);
    expect(coverageColor(49)).toBe(STATUS.critical);
  });
  it("classe en attention entre 50 et 99%", () => {
    expect(coverageColor(75)).toBe(STATUS.warning);
  });
  it("classe en bon au-delà de 100%", () => {
    expect(coverageColor(100)).toBe(STATUS.good);
    expect(coverageColor(140)).toBe(STATUS.good);
  });
});

describe("categoricalColor", () => {
  it("boucle sur la palette fixe au-delà de sa longueur", () => {
    expect(categoricalColor(0)).toBe(categoricalColor(6));
  });
});
