import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";
import { UndoToast } from "./components/UndoButton";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Employees from "./pages/Employees";
import EmployeeList from "./pages/EmployeeList";
import AgentForm from "./pages/AgentForm";
import AddEmployee from "./pages/AddEmployee";
import EditEmployee from "./pages/EditEmployee";
import EmployeeCard from "./pages/EmployeeCard";
import Trash from "./pages/Trash";
import Stats from "./pages/Stats";
import Reports from "./pages/Reports";
import Calendar from "./pages/Calendar";
import AuditLog from "./pages/AuditLog";
import EmployeeHistory from "./pages/EmployeeHistory";
import BackupRestore from "./pages/BackupRestore";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import RenewalForm from "./pages/RenewalForm";
import OrgSettings from "./pages/OrgSettings";
import RefDataSettings from "./pages/RefDataSettings";

const queryClient = new QueryClient();

interface ProtectedRouteProps {
  children: ReactNode;
}

function ProtectedRoute({ children }: ProtectedRouteProps) {
  const location = useLocation();
  const token = localStorage.getItem("token");

  if (!token) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <UndoToast />
            <BrowserRouter>
              <Routes>
          <Route path="/" element={<Login />} />
          <Route
            path="/home"
            element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            }
          />

          {/* Protected Routes */}
          <Route
            path="/employees"
            element={
              <ProtectedRoute>
                <Employees />
              </ProtectedRoute>
            }
          />
          <Route
            path="/employees-ht"
            element={
              <ProtectedRoute>
                <EmployeeList key="ht" habType="HT" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/employees-st"
            element={
              <ProtectedRoute>
                <EmployeeList key="st" habType="ST" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/agents/add"
            element={
              <ProtectedRoute>
                <AgentForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/agents/:id/edit"
            element={
              <ProtectedRoute>
                <AgentForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/employees/add"
            element={
              <ProtectedRoute>
                <AddEmployee />
              </ProtectedRoute>
            }
          />
          <Route
            path="/employees/:id"
            element={
              <ProtectedRoute>
                <EmployeeCard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/employees/:id/edit"
            element={
              <ProtectedRoute>
                <EditEmployee />
              </ProtectedRoute>
            }
          />
          <Route
            path="/employees/:id/renew"
            element={
              <ProtectedRoute>
                <RenewalForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/employees/:employeeId/history"
            element={
              <ProtectedRoute>
                <EmployeeHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/trash"
            element={
              <ProtectedRoute>
                <Trash />
              </ProtectedRoute>
            }
          />
          <Route
            path="/stats"
            element={
              <ProtectedRoute>
                <Stats />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <Reports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/calendar"
            element={
              <ProtectedRoute>
                <Calendar />
              </ProtectedRoute>
            }
          />
          <Route
            path="/audit-log"
            element={
              <ProtectedRoute>
                <AuditLog />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />

          <Route
            path="/backup-restore"
            element={
              <ProtectedRoute>
                <BackupRestore />
              </ProtectedRoute>
            }
          />

          <Route
            path="/org-settings"
            element={
              <ProtectedRoute>
                <OrgSettings />
              </ProtectedRoute>
            }
          />

          <Route
            path="/ref-data"
            element={
              <ProtectedRoute>
                <RefDataSettings />
              </ProtectedRoute>
            }
          />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

const root = document.getElementById("root");
if (root && !root.hasAttribute('data-root-initialized')) {
  root.setAttribute('data-root-initialized', 'true');
  createRoot(root).render(<App />);
}
