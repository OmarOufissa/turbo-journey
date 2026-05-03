import { addMonths, addYears, format } from "date-fns";

export interface ServiceStructure {
  name: string;
  equipes: string[];
}

export interface DivisionStructure {
  name: string;
  services: ServiceStructure[];
}

export const ORGANIZATIONAL_STRUCTURE: DivisionStructure[] = [
  {
    name: "Division Exploitation Casa",
    services: [
      {
        name: "Service Conduite et Exploitation Casa",
        equipes: [
          "Equipe Conduite Casa",
          "Equipe Conduite Settat",
          "Equipe TST Postes Casa",
        ],
      },
      {
        name: "Service Maintenance Casa",
        equipes: [
          "Equipe Maintenance Lignes Casa",
          "Equipe Maintenance Lignes Settat",
          "Equipe Maintenance Postes Casa",
          "Equipe Maintenance Postes Settat",
          "Equipe Contrôle Commande et Télécom Casa",
          "Equipe Contrôle Commande et Télécom Settat",
          "Equipe TST Lignes Casa",
        ],
      },
    ],
  },
  {
    name: "Division Exploitation El Jadida",
    services: [
      {
        name: "Service Conduite et Exploitation El Jadida",
        equipes: [
          "Equipe Conduite El Jadida",
          "Equipe Conduite Safi",
          "Equipe Conduite Bouguedra",
          "Equipe TST Postes El Jadida",
        ],
      },
      {
        name: "Service Maintenance El Jadida",
        equipes: [
          "Equipe Maintenance Lignes El Jadida",
          "Equipe Maintenance Lignes Safi",
          "Equipe Maintenance Postes El Jadida",
          "Equipe Maintenance Postes Safi",
          "Equipe Maintenance Postes Bouguedra",
          "Equipe Contrôle Commande et Télécom El Jadida",
          "Equipe Contrôle Commande et Télécom Safi",
          "Equipe TST Lignes El Jadida",
        ],
      },
    ],
  },
  {
    name: "Division Exploitation Afourer",
    services: [
      {
        name: "Service Conduite et Exploitation Afourer",
        equipes: [
          "Equipe Conduite Afourer",
          "Equipe Conduite Kalaa",
          "Equipe Conduite Tadla",
          "Equipe Conduite Khouribga",
          "Equipe Conduite Benguerir",
          "Equipe TST Postes Afourer",
        ],
      },
      {
        name: "Service Maintenance Afourer",
        equipes: [
          "Equipe Maintenance Lignes Afourer",
          "Equipe Maintenance Lignes Kalaa",
          "Equipe Maintenance Lignes Tadla",
          "Equipe Maintenance Lignes Khouribga",
          "Equipe Maintenance Lignes Benguerir",
          "Equipe Maintenance Postes Afourer",
          "Equipe Maintenance Postes Kalaa",
          "Equipe Maintenance Postes Tadla",
          "Equipe Maintenance Postes Khouribga",
          "Equipe Maintenance Postes Benguerir",
          "Equipe Contrôle Commande et Télécom Afourer",
          "Equipe Contrôle Commande et Télécom Kalaa",
          "Equipe Contrôle Commande et Télécom Tadla",
          "Equipe Contrôle Commande et Télécom Khouribga",
          "Equipe Contrôle Commande et Télécom Benguerir",
          "Equipe TST Lignes Afourer",
        ],
      },
    ],
  },
];

export function fixCasing(text: string): string {
  if (!text || !text.trim()) return "";
  return text
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function normalizeName(text: string): string {
  const fixed = fixCasing(text);
  const normalized = fixed
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "")
    .toLowerCase();
  return normalized;
}

export function findMatchingDivision(raw: string): string | null {
  if (!raw || !raw.trim()) return null;
  const target = normalizeName(raw);

  for (const division of ORGANIZATIONAL_STRUCTURE) {
    if (normalizeName(division.name) === target) {
      return division.name;
    }
  }

  if (target.includes("casa")) {
    return "Division Exploitation Casa";
  }
  if (target.includes("jadida")) {
    return "Division Exploitation El Jadida";
  }
  if (target.includes("afourer")) {
    return "Division Exploitation Afourer";
  }

  return null;
}

export function findMatchingService(raw: string, divisionName: string): string | null {
  const division = ORGANIZATIONAL_STRUCTURE.find((d) => d.name === divisionName);
  if (!division) return null;
  if (!raw || !raw.trim()) return null;

  const target = normalizeName(raw);

  for (const service of division.services) {
    if (normalizeName(service.name) === target) {
      return service.name;
    }
  }

  if (target.includes("conduite") || target.includes("exploitation")) {
    const svc = division.services.find((s) => s.name.toLowerCase().includes("conduite"));
    if (svc) return svc.name;
  }

  if (target.includes("maintenance")) {
    const svc = division.services.find((s) => s.name.toLowerCase().includes("maintenance"));
    if (svc) return svc.name;
  }

  return null;
}

export function findMatchingEquipe(raw: string, divisionName: string, serviceName: string): string | null {
  const division = ORGANIZATIONAL_STRUCTURE.find((d) => d.name === divisionName);
  const service = division?.services.find((s) => s.name === serviceName);
  if (!service) return null;
  if (!raw || !raw.trim()) return null;

  const target = normalizeName(raw);

  for (const equipe of service.equipes) {
    if (normalizeName(equipe) === target) {
      return equipe;
    }
  }

  for (const equipe of service.equipes) {
    const normEquipe = normalizeName(equipe);
    if (normEquipe.includes(target) || target.includes(normEquipe)) {
      return equipe;
    }
  }

  return null;
}

export function calculateExpirationDate(dateValidation: string, type: "HT" | "ST"): string {
  try {
    let date: Date;

    if (dateValidation.includes("/")) {
      const [day, month, year] = dateValidation.split("/").map(Number);
      date = new Date(year, month - 1, day);
    } else {
      date = new Date(dateValidation);
    }

    if (Number.isNaN(date.getTime())) {
      date = new Date();
    }

    const expirationDate = type === "HT" ? addYears(date, 3) : addMonths(date, 12);

    return format(expirationDate, "yyyy-MM-dd");
  } catch {
    return format(new Date(), "yyyy-MM-dd");
  }
}
