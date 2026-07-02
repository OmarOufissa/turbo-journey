import "./global.css";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/lib/auth";
import { AppShell } from "@/components/layout/AppShell";

import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Articles from "@/pages/Articles";
import ArticleDetail from "@/pages/ArticleDetail";
import Marches from "@/pages/Marches";
import Agents from "@/pages/Agents";
import AgentDetail from "@/pages/AgentDetail";
import Organisation from "@/pages/Organisation";
import Affectations from "@/pages/Affectations";
import Controles from "@/pages/Controles";
import Alertes from "@/pages/Alertes";
import Historique from "@/pages/Historique";
import Rapports from "@/pages/Rapports";
import Utilisateurs from "@/pages/Utilisateurs";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } },
});

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== "administrateur") return <Navigate to="/" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <TooltipProvider delayDuration={200}>
        <Toaster />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                element={
                  <PrivateRoute>
                    <AppShell />
                  </PrivateRoute>
                }
              >
                <Route path="/" element={<Dashboard />} />
                <Route path="/articles" element={<Articles />} />
                <Route path="/articles/:id" element={<ArticleDetail />} />
                <Route path="/marches" element={<Marches />} />
                <Route path="/agents" element={<Agents />} />
                <Route path="/agents/:id" element={<AgentDetail />} />
                <Route path="/organisation" element={<Organisation />} />
                <Route path="/affectations" element={<Affectations />} />
                <Route path="/controles" element={<Controles />} />
                <Route path="/alertes" element={<Alertes />} />
                <Route path="/historique" element={<Historique />} />
                <Route path="/rapports" element={<Rapports />} />
                <Route
                  path="/utilisateurs"
                  element={
                    <AdminRoute>
                      <Utilisateurs />
                    </AdminRoute>
                  }
                />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

createRoot(document.getElementById("root")!).render(<App />);
