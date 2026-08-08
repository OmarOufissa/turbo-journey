import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";
import { Division, Service, Equipe } from "@/types";
import { SortBy } from "@/hooks/useEmployeeFilters";

interface FilterBarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  filterDivision: string;
  onDivisionChange: (value: string) => void;
  filterService: string;
  onServiceChange: (value: string) => void;
  filterEquipe: string;
  onEquipeChange: (value: string) => void;
  sortBy: SortBy;
  onSortChange: (value: SortBy) => void;
  divisions: Division[];
  services: Service[];
  equipes: Equipe[];
}

export function FilterBar({
  searchTerm,
  onSearchChange,
  filterDivision,
  onDivisionChange,
  filterService,
  onServiceChange,
  filterEquipe,
  onEquipeChange,
  sortBy,
  onSortChange,
  divisions,
  services,
  equipes,
}: FilterBarProps) {
  return (
    <div className="border rounded-lg p-6 space-y-4 bg-card">
      <h3 className="font-semibold">Filtres et recherche</h3>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Chercher par nom, matricule..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={filterDivision} onValueChange={onDivisionChange}>
          <SelectTrigger>
            <SelectValue placeholder="Division" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les divisions</SelectItem>
            {divisions.map((div) => (
              <SelectItem key={div.id} value={div.name}>
                {div.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filterService}
          onValueChange={onServiceChange}
          disabled={filterDivision === "all"}
        >
          <SelectTrigger>
            <SelectValue placeholder="Service" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les services</SelectItem>
            {services.map((svc) => (
              <SelectItem key={svc.id} value={svc.name}>
                {svc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filterEquipe}
          onValueChange={onEquipeChange}
          disabled={filterService === "all"}
        >
          <SelectTrigger>
            <SelectValue placeholder="Équipe" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les équipes</SelectItem>
            {equipes.map((eq) => (
              <SelectItem key={eq.id} value={eq.name}>
                {eq.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={(value) => onSortChange(value as SortBy)}>
          <SelectTrigger>
            <SelectValue placeholder="Trier par" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="matricule">Matricule</SelectItem>
            <SelectItem value="nom">Nom</SelectItem>
            <SelectItem value="expiration">Expiration</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
