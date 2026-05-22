import { useNavigate } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Eye, Edit, Trash2, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Employee, getExpirationStatus, EXPIRATION_COLOR_CONFIG, getDaysUntilExpiry } from "@/types";

interface EmployeeTableRowProps {
  employee: Employee;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onDelete: () => void;
}

export function EmployeeTableRow({ employee, selected, onSelect, onDelete }: EmployeeTableRowProps) {
  const navigate = useNavigate();
  const ver = employee.currentVersion;
  const status = ver ? getExpirationStatus(ver.dateExpiration) : "valid";
  const config = EXPIRATION_COLOR_CONFIG[status];
  const daysUntilExpiry = ver ? getDaysUntilExpiry(ver.dateExpiration) : 0;

  return (
    <tr className="border-b border-border hover:bg-muted/50 transition-colors">
      <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={selected} onCheckedChange={onSelect} />
      </td>
      <td className="px-4 py-3 text-sm font-mono font-semibold cursor-pointer hover:text-primary"
        onClick={() => navigate(`/employees/${employee.id}`)}>
        {employee.matricule}
      </td>
      <td className="px-4 py-3 text-sm">
        <div className="font-medium">{employee.nom} {employee.prenom}</div>
      </td>
      <td className="hidden sm:table-cell px-4 py-3 text-sm text-muted-foreground">{ver?.division ?? "—"}</td>
      <td className="hidden md:table-cell px-4 py-3 text-sm text-muted-foreground">{ver?.service ?? "—"}</td>
      <td className="px-4 py-3 text-sm font-mono text-xs">
        ST: {ver && ver.stCodes.length > 0 ? ver.stCodes.join(", ") : "XXX"} / HT: {ver && ver.htCodes.length > 0 ? ver.htCodes.join(", ") : "XXX"}
      </td>
      <td className={cn("px-4 py-3 text-sm font-medium", config.textColor)}>
        {ver ? (daysUntilExpiry > 0 ? `${daysUntilExpiry}j` : "Expiré") : "—"}
      </td>
      <td className="px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0"><MoreVertical className="w-4 h-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate(`/employees/${employee.id}`)}>
              <Eye className="w-4 h-4 mr-2" />Voir profil
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(`/employees/${employee.id}/edit`)}>
              <Edit className="w-4 h-4 mr-2" />Éditer
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-red-600 dark:text-red-400">
              <Trash2 className="w-4 h-4 mr-2" />Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}
