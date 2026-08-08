import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Users, AlertCircle, CheckCircle, Clock, BarChart3, Plus, FileText, TrendingUp } from "lucide-react";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { ExpirationTrendChart } from "@/components/dashboard/ExpirationTrendChart";
import { StatusPieChart } from "@/components/dashboard/StatusPieChart";
import { DashboardAlerts } from "@/components/DashboardAlerts";
import { ExpirationBanner } from "@/components/ExpirationBanner";
import { Employee } from "@/types";

interface DashboardStats {
  totalEmployees: number;
  totalHT: number;
  totalST: number;
  expiredCount: number;
  expiringImminently: number;
  expiringIn30Days: number;
  validCount: number;
}

export default function Home() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalEmployees: 0,
    totalHT: 0,
    totalST: 0,
    expiredCount: 0,
    expiringImminently: 0,
    expiringIn30Days: 0,
    validCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem("token");
        const response = await fetch("/api/employees", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) throw new Error("Failed to fetch");

        const fetchedEmployees = await response.json();
        setEmployees(fetchedEmployees);

        let totalHT = 0;
        let totalST = 0;
        let expiredCount = 0;
        let expiringImminently = 0;
        let expiringIn30Days = 0;
        let validCount = 0;

        const today = new Date();

        fetchedEmployees.forEach((emp: any) => {
          if (emp.habilitations) {
            emp.habilitations.forEach((hab: any) => {
              if (hab.type === "HT") totalHT++;
              else if (hab.type === "ST") totalST++;

              const expDate = new Date(hab.date_expiration);
              const daysUntilExp = Math.floor((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

              if (daysUntilExp < 0) expiredCount++;
              else if (daysUntilExp <= 7) expiringImminently++;
              else if (daysUntilExp <= 30) expiringIn30Days++;
              else validCount++;
            });
          }
        });

        setStats({
          totalEmployees: fetchedEmployees.length,
          totalHT,
          totalST,
          expiredCount,
          expiringImminently,
          expiringIn30Days,
          validCount,
        });
      } catch (err) {
        console.error("Failed to fetch stats:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const StatCard = ({ title, value, icon: Icon, gradient }: { title: string; value: number | string; icon: any; gradient: string }) => (
    <Card className={`p-6 rounded-3xl shadow-xl border-0 ${gradient} relative overflow-hidden`}>
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm">
            <Icon className="w-6 h-6 text-white" />
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-white/80 text-sm font-semibold">{title}</p>
          <p className="text-4xl font-black text-white">
            {loading ? "..." : value}
          </p>
        </div>
      </div>
      <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
    </Card>
  );

  const StatusItem = ({ color, label, count }: { color: string; label: string; count: number }) => (
    <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/50 hover:bg-muted transition-colors">
      <div className="flex items-center gap-3">
        <div className={`w-3 h-3 rounded-full ${color}`}></div>
        <span className="font-semibold text-foreground">{label}</span>
      </div>
      <span className="text-2xl font-black text-foreground">
        {loading ? "-" : count}
      </span>
    </div>
  );

  return (
    <Layout>
      <div className="space-y-8 animate-fade-in">
        {/* Expiration Alert Banner */}
        {stats.expiredCount + stats.expiringImminently > 0 && (
          <ExpirationBanner
            criticalCount={stats.expiredCount + stats.expiringImminently}
          />
        )}

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black text-foreground tracking-tight">
              Tableau de Bord
            </h1>
            <p className="text-muted-foreground mt-2 font-medium">
              Vue d'ensemble des habilitations et employés
            </p>
          </div>
          <Link to="/employees/add">
            <Button className="h-14 px-8 text-base font-bold rounded-2xl shadow-xl hover:shadow-2xl transition-all">
              <Plus className="w-5 h-5 mr-2" />
              Ajouter Employé
            </Button>
          </Link>
        </div>

        {/* Statistics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Total Employés"
            value={stats.totalEmployees}
            icon={Users}
            gradient="bg-gradient-to-br from-blue-500 to-blue-600"
          />
          <StatCard
            title="Habilitations HT"
            value={stats.totalHT}
            icon={CheckCircle}
            gradient="bg-gradient-to-br from-purple-500 to-purple-600"
          />
          <StatCard
            title="Habilitations ST"
            value={stats.totalST}
            icon={FileText}
            gradient="bg-gradient-to-br from-emerald-500 to-emerald-600"
          />
          <StatCard
            title="Alertes Actives"
            value={stats.expiredCount + stats.expiringImminently}
            icon={AlertCircle}
            gradient="bg-gradient-to-br from-red-500 to-red-600"
          />
        </div>

        {/* Status and Navigation Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Alert Dashboard Widget */}
          <div className="lg:col-span-1">
            <DashboardAlerts />
          </div>

          {/* Status Breakdown */}
          <Card className="p-8 rounded-3xl shadow-xl border border-border">
            <h2 className="text-2xl font-black text-foreground mb-6">
              État des Habilitations
            </h2>
            <div className="space-y-3">
              <StatusItem
                color="bg-red-500"
                label="Expirées"
                count={stats.expiredCount}
              />
              <StatusItem
                color="bg-orange-500"
                label="À renouveler (7j)"
                count={stats.expiringImminently}
              />
              <StatusItem
                color="bg-yellow-500"
                label="À renouveler (30j)"
                count={stats.expiringIn30Days}
              />
              <StatusItem
                color="bg-green-500"
                label="Valides"
                count={stats.validCount}
              />
            </div>
          </Card>

          {/* Quick Navigation */}
          <Card className="p-8 rounded-3xl shadow-xl border border-border">
            <h2 className="text-2xl font-black text-foreground mb-6">
              Navigation Rapide
            </h2>
            <div className="space-y-3">
              <Link to="/employees">
                <Button
                  variant="outline"
                  className="w-full h-16 justify-start text-base font-bold rounded-2xl hover:bg-primary hover:text-primary-foreground transition-all"
                >
                  <Users className="w-6 h-6 mr-4" />
                  Liste des Employés
                </Button>
              </Link>
              <Link to="/renewals">
                <Button
                  variant="outline"
                  className="w-full h-16 justify-start text-base font-bold rounded-2xl hover:bg-primary hover:text-primary-foreground transition-all"
                >
                  <Clock className="w-6 h-6 mr-4" />
                  Renouvellements
                </Button>
              </Link>
              <Link to="/analytics">
                <Button
                  variant="outline"
                  className="w-full h-16 justify-start text-base font-bold rounded-2xl hover:bg-primary hover:text-primary-foreground transition-all"
                >
                  <BarChart3 className="w-6 h-6 mr-4" />
                  Analyses & Stats
                </Button>
              </Link>
            </div>
          </Card>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ExpirationTrendChart employees={employees} />
          <StatusPieChart employees={employees} />
        </div>
      </div>
    </Layout>
  );
}
