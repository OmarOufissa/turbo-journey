import { useState, useMemo } from "react";
import { HabilitationRow } from "@/types";

export type SortBy = "matricule" | "nom" | "expiration";

export function useEmployeeFilters(allHabilitations: HabilitationRow[]) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDivision, setFilterDivision] = useState("all");
  const [filterService, setFilterService] = useState("all");
  const [filterEquipe, setFilterEquipe] = useState("all");
  const [sortBy, setSortBy] = useState<SortBy>("matricule");

  const filteredAndSorted = useMemo(() => {
    let result = [...allHabilitations];

    // Apply search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      result = result.filter(
        (hab) =>
          hab.matricule.toLowerCase().includes(search) ||
          hab.nom.toLowerCase().includes(search) ||
          hab.prenom.toLowerCase().includes(search) ||
          hab.equipe.toLowerCase().includes(search)
      );
    }

    // Apply division filter
    if (filterDivision !== "all") {
      result = result.filter((hab) => hab.division === filterDivision);
    }

    // Apply service filter
    if (filterService !== "all") {
      result = result.filter((hab) => hab.service === filterService);
    }

    // Apply equipe filter
    if (filterEquipe !== "all") {
      result = result.filter((hab) => hab.equipe === filterEquipe);
    }

    // Apply sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case "matricule":
          return a.matricule.localeCompare(b.matricule);
        case "nom":
          return (a.nom + a.prenom).localeCompare(b.nom + b.prenom);
        case "expiration":
          return (
            new Date(a.date_expiration).getTime() -
            new Date(b.date_expiration).getTime()
          );
        default:
          return 0;
      }
    });

    return result;
  }, [allHabilitations, searchTerm, filterDivision, filterService, filterEquipe, sortBy]);

  return {
    searchTerm,
    setSearchTerm,
    filterDivision,
    setFilterDivision,
    filterService,
    setFilterService,
    filterEquipe,
    setFilterEquipe,
    sortBy,
    setSortBy,
    filteredAndSorted,
  };
}
