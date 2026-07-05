import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  FileStack,
  Users,
  Network,
  ClipboardList,
  ShieldCheck,
  Bell,
  History,
  FileBarChart,
  HardHat,
  Tag,
  FolderTree,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Tableau de bord", icon: LayoutDashboard, end: true },
  { to: "/articles", label: "Articles", icon: Package },
  { to: "/articles-reference", label: "Articles de référence", icon: Tag },
  { to: "/classification", label: "Classification", icon: FolderTree },
  { to: "/marches", label: "Marchés", icon: FileStack },
  { to: "/agents", label: "Bénéficiaires", icon: Users },
  { to: "/organisation", label: "Organisation", icon: Network },
  { to: "/affectations", label: "Affectations", icon: ClipboardList },
  { to: "/controles", label: "Contrôles", icon: ShieldCheck },
  { to: "/alertes", label: "Alertes", icon: Bell },
  { to: "/historique", label: "Historique", icon: History },
  { to: "/rapports", label: "Rapports", icon: FileBarChart },
];

export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} />}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between gap-2 px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <HardHat className="h-4.5 w-4.5" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold">GEPI</p>
              <p className="text-[11px] text-sidebar-foreground/60">EPI / EPC — DTC</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-sidebar-foreground/70 hover:bg-sidebar-accent lg:hidden">
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-sidebar-border px-4 py-3 text-[11px] text-sidebar-foreground/50">
          ONEE — Direction Transport Casablanca
        </div>
      </aside>
    </>
  );
}
