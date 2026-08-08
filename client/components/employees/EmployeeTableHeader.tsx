import { Checkbox } from "@/components/ui/checkbox";

interface EmployeeTableHeaderProps {
  allSelected: boolean;
  onSelectAll: (checked: boolean) => void;
}

export function EmployeeTableHeader({
  allSelected,
  onSelectAll,
}: EmployeeTableHeaderProps) {
  return (
    <tr className="border-b border-border bg-muted/50">
      <th className="px-2 py-3 text-left">
        <Checkbox checked={allSelected} onCheckedChange={onSelectAll} />
      </th>
      <th className="px-4 py-3 text-left text-sm font-semibold">Matricule</th>
      <th className="px-4 py-3 text-left text-sm font-semibold">Nom Prénom</th>
      <th className="hidden sm:table-cell px-4 py-3 text-left text-sm font-semibold">
        Division
      </th>
      <th className="hidden md:table-cell px-4 py-3 text-left text-sm font-semibold">
        Service
      </th>
      <th className="hidden lg:table-cell px-4 py-3 text-left text-sm font-semibold">
        Équipe
      </th>
      <th className="px-4 py-3 text-left text-sm font-semibold">Codes</th>
      <th className="hidden sm:table-cell px-4 py-3 text-left text-sm font-semibold">
        N° Titre
      </th>
      <th className="hidden md:table-cell px-4 py-3 text-left text-sm font-semibold">
        Date Validation
      </th>
      <th className="hidden lg:table-cell px-4 py-3 text-left text-sm font-semibold">
        Date Expiration
      </th>
      <th className="px-4 py-3 text-left text-sm font-semibold">Statut</th>
      <th className="px-4 py-3 text-left text-sm font-semibold">Actions</th>
    </tr>
  );
}
