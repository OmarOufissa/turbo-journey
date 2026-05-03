import { Layout } from "@/components/Layout";
import { Users, AlertCircle, CheckCircle, Clock, BarChart3 } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

interface StatsData {
  totalEmployees: number;
  totalHabilitations: number;
  totalHT: number;
  totalST: number;
  expiredCount: number;
  expiringCount: number;
  validCount: number;
  byDivision: Record<string, number>;
  byService: Record<string, number>;
}

export default function Stats() {
  const { toast } = useToast();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch("/api/employees", {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        });

        if (!response.ok) throw new Error("Failed to fetch data");

        const employees = await response.json();
        const today = new Date();

        const statsData: StatsData = {
          totalEmployees: employees.length,
          totalHabilitations: 0,
          totalHT: 0,
          totalST: 0,
          expiredCount: 0,
          expiringCount: 0,
          validCount: 0,
          byDivision: {},
          byService: {},
        };

        employees.forEach((emp: any) => {
          // Count divisions and services
          statsData.byDivision[emp.division] =
            (statsData.byDivision[emp.division] || 0) + 1;
          statsData.byService[emp.service] =
            (statsData.byService[emp.service] || 0) + 1;

          if (emp.habilitations) {
            emp.habilitations.forEach((hab: any) => {
              statsData.totalHabilitations++;

              if (hab.type === "HT") statsData.totalHT++;
              else if (hab.type === "ST") statsData.totalST++;

              const expDate = new Date(hab.date_expiration);
              const daysUntilExpiry = Math.ceil(
                (expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
              );

              if (daysUntilExpiry < 0) {
                statsData.expiredCount++;
              } else if (daysUntilExpiry <= 30) {
                statsData.expiringCount++;
              } else {
                statsData.validCount++;
              }
            });
          }
        });

        setStats(statsData);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Erreur de chargement";
        toast({
          title: "Erreur",
          description: message,
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center space-y-4">
            <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto" />
            <p className="text-muted-foreground">Chargement des statistiques...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!stats) {
    return (
      <Layout>
        <div className="glass p-8 rounded-xl text-center space-y-4">
          <p className="text-muted-foreground">Erreur de chargement</p>
        </div>
      </Layout>
    );
  }

  const StatCard = ({
    icon: Icon,
    label,
    value,
    color,
  }: {
    icon: React.ReactNode;
    label: string;
    value: number;
    color: string;
  }) => (
    <div className="glass p-6 rounded-xl space-y-3">
      <div className={`inline-block p-3 rounded-lg ${color}`}>
        {Icon}
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-3xl font-bold gradient-text">{value}</p>
      </div>
    </div>
  );

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold gradient-text">Statistiques</h1>
          <p className="text-muted-foreground mt-1">
            Vue d'ensemble de votre organisation
          </p>
        </div>

        {/* Key Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard
            icon={<Users className="w-6 h-6 text-blue-500" />}
            label="Total Employés"
            value={stats.totalEmployees}
            color="bg-blue-500/10"
          />

          <StatCard
            icon={<BarChart3 className="w-6 h-6 text-cyan-500" />}
            label="Total Habilitations"
            value={stats.totalHabilitations}
            color="bg-cyan-500/10"
          />

          <StatCard
            icon={<CheckCircle className="w-6 h-6 text-green-500" />}
            label="Habilitations Valides"
            value={stats.validCount}
            color="bg-green-500/10"
          />

          <StatCard
            icon={<Clock className="w-6 h-6 text-yellow-500" />}
            label="À Renouveler (<30j)"
            value={stats.expiringCount}
            color="bg-yellow-500/10"
          />

          <StatCard
            icon={<AlertCircle className="w-6 h-6 text-red-500" />}
            label="Expirées"
            value={stats.expiredCount}
            color="bg-red-500/10"
          />

          <StatCard
            icon={<BarChart3 className="w-6 h-6 text-purple-500" />}
            label="HT/ST"
            value={stats.totalHT}
            color="bg-purple-500/10"
          />
        </div>

        {/* Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* HT vs ST */}
          <div className="glass p-6 rounded-xl space-y-4">
            <h3 className="text-lg font-semibold">Répartition HT/ST</h3>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">HT (3 ans)</span>
                  <span className="font-semibold text-primary">
                    {stats.totalHT}
                  </span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-cyan-500"
                    style={{
                      width: `${stats.totalHabilitations > 0 ? (stats.totalHT / stats.totalHabilitations) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">ST (1 an)</span>
                  <span className="font-semibold text-secondary">
                    {stats.totalST}
                  </span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-teal-500"
                    style={{
                      width: `${stats.totalHabilitations > 0 ? (stats.totalST / stats.totalHabilitations) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Status Distribution */}
          <div className="glass p-6 rounded-xl space-y-4">
            <h3 className="text-lg font-semibold">État des Habilitations</h3>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Valides</span>
                  <span className="font-semibold text-green-600">
                    {stats.validCount}
                  </span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500"
                    style={{
                      width: `${stats.totalHabilitations > 0 ? (stats.validCount / stats.totalHabilitations) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">À renouveler</span>
                  <span className="font-semibold text-yellow-600">
                    {stats.expiringCount}
                  </span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-500"
                    style={{
                      width: `${stats.totalHabilitations > 0 ? (stats.expiringCount / stats.totalHabilitations) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Expirées</span>
                  <span className="font-semibold text-red-600">
                    {stats.expiredCount}
                  </span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500"
                    style={{
                      width: `${stats.totalHabilitations > 0 ? (stats.expiredCount / stats.totalHabilitations) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Division & Service Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* By Division */}
          <div className="glass p-6 rounded-xl space-y-4">
            <h3 className="text-lg font-semibold">Employés par Division</h3>
            <div className="space-y-2">
              {Object.entries(stats.byDivision).map(([division, count]) => (
                <div
                  key={division}
                  className="flex justify-between items-center py-2 border-b border-white/10"
                >
                  <span className="text-sm">{division}</span>
                  <span className="font-semibold">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* By Service */}
          <div className="glass p-6 rounded-xl space-y-4">
            <h3 className="text-lg font-semibold">Services</h3>
            <div className="space-y-2">
              {Object.entries(stats.byService)
                .slice(0, 6)
                .map(([service, count]) => (
                  <div
                    key={service}
                    className="flex justify-between items-center py-2 border-b border-white/10"
                  >
                    <span className="text-sm">{service}</span>
                    <span className="font-semibold">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
