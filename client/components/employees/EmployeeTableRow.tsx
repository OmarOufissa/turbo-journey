import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Eye, Edit, Trash2, Calendar, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  HabilitationRow,
  getHabilitationStatus,
  getDaysUntilExpiry,
  getStatusColor,
} from "@/types";

interface EmployeeTableRowProps {
  hab: HabilitationRow;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onDelete: () => void;
}

export function EmployeeTableRow({
  hab,
  selected,
  onSelect,
  onDelete,
}: EmployeeTableRowProps) {
  const navigate = useNavigate();
  const status = getHabilitationStatus(hab);
  const daysUntilExpiry = getDaysUntilExpiry(hab.date_expiration);

  return (
    <tr className="border-b border-border hover:bg-muted/50 transition-colors">
      <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={selected} onCheckedChange={onSelect} />
      </td>
      <td
        className="px-4 py-3 text-sm font-mono font-semibold cursor-pointer hover:text-primary"
        onClick={() => navigate(`/employees/${hab.employee_id}`)}
      >
        {hab.matricule}
      </td>
      <td className="px-4 py-3 text-sm">
        <div className="font-medium">
          {hab.nom} {hab.prenom}
        </div>
      </td>
      <td className="hidden sm:table-cell px-4 py-3 text-sm text-muted-foreground">
        {hab.division}
      </td>
      <td className="hidden md:table-cell px-4 py-3 text-sm text-muted-foreground">
        {hab.service}
      </td>
      <td className="hidden lg:table-cell px-4 py-3 text-sm text-muted-foreground">
        {hab.equipe}
      </td>
      <td className="px-4 py-3 text-sm">
        <div className="text-xs bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-200 px-2 py-1 rounded inline-block">
          {hab.codes.join(", ")}
        </div>
      </td>
      <td className="hidden sm:table-cell px-4 py-3 text-sm font-mono text-muted-foreground">
        {hab.numero || "—"}
      </td>
      <td className="hidden md:table-cell px-4 py-3 text-sm">
        {format(new Date(hab.date_validation), "dd/MM/yyyy")}
      </td>
      <td className="hidden lg:table-cell px-4 py-3 text-sm">
        {format(new Date(hab.date_expiration), "dd/MM/yyyy")}
      </td>
      <td className={cn("px-4 py-3 text-sm font-medium", getStatusColor(status))}>
        <div className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          {daysUntilExpiry > 0 ? `${daysUntilExpiry}j` : "Expiré"}
        </div>
      </td>
      <td className="px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate(`/employees/${hab.employee_id}`)}>
              <Eye className="w-4 h-4 mr-2" />
              Voir profil
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => navigate(`/employees/${hab.employee_id}/edit`)}
            >
              <Edit className="w-4 h-4 mr-2" />
              Éditer employé
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onDelete}
              className="text-red-600 dark:text-red-400"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}
