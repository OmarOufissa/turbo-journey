import { Link, useLocation } from "react-router-dom";
import {
  Home,
  Users,
  Zap,
  ZapOff,
  Calendar,
  BarChart3,
  Settings,
  Shield,
  LogOut,
  Trash2,
  Building2,
  DatabaseBackup,
  BookOpen,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";

const navigationItems = [
  {
    title: "Principal",
    items: [
      {
        title: "Tableau de Bord",
        icon: Home,
        url: "/home",
      },
      {
        title: "Tous les Employés",
        icon: Users,
        url: "/employees",
      },
      {
        title: "Employés HT",
        icon: ZapOff,
        url: "/employees-ht",
      },
      {
        title: "Employés ST",
        icon: Zap,
        url: "/employees-st",
      },
      {
        title: "Calendrier",
        icon: Calendar,
        url: "/calendar",
      },
    ],
  },
  {
    title: "Analyses",
    items: [
      {
        title: "Statistiques",
        icon: BarChart3,
        url: "/stats",
      },
      {
        title: "Journal d'Audit",
        icon: Shield,
        url: "/audit-log",
      },
    ],
  },
];

function getUserEmail(): string {
  try {
    const token = localStorage.getItem("token");
    if (!token) return "admin@example.com";
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.email ?? "admin@example.com";
  } catch {
    return "admin@example.com";
  }
}

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const userEmail = getUserEmail();
  const userInitial = userEmail[0]?.toUpperCase() ?? "A";

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    navigate("/");
  };

  const isActive = (url: string) => {
    return location.pathname === url;
  };

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-border p-4">
        <Link to="/home" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm">Gestion</span>
            <span className="font-bold text-sm">Habilitations</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {navigationItems.map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                    >
                      <Link to={item.url}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        <SidebarGroup>
          <SidebarGroupLabel>Paramètres</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/settings")}>
                  <Link to="/settings">
                    <Settings className="w-4 h-4" />
                    <span>Paramètres</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/trash")}>
                  <Link to="/trash">
                    <Trash2 className="w-4 h-4" />
                    <span>Corbeille</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/org-settings")}>
                  <Link to="/org-settings">
                    <Building2 className="w-4 h-4" />
                    <span>Structure organisationnelle</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/ref-data")}>
                  <Link to="/ref-data">
                    <BookOpen className="w-4 h-4" />
                    <span>Données de référence</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/backup-restore")}>
                  <Link to="/backup-restore">
                    <DatabaseBackup className="w-4 h-4" />
                    <span>Sauvegardes</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border p-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-muted transition-colors">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-semibold text-primary">{userInitial}</span>
              </div>
              <div className="flex flex-col items-start flex-1 min-w-0">
                <span className="text-sm font-medium truncate w-full">
                  Administrateur
                </span>
                <span className="text-xs text-muted-foreground truncate w-full">
                  {userEmail}
                </span>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={handleLogout} className="text-destructive">
              <LogOut className="w-4 h-4 mr-2" />
              Déconnexion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
