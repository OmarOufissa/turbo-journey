/**
 * PHASE 3: EXPIRATION BANNER
 * 
 * Prominent warning banner at top of dashboard
 * Shows critical alerts and links to action
 * Dismissible per session
 */

import { useState, useEffect } from "react";
import { AlertTriangle, X, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "./ui/button";

interface AlertStats {
  totalEmployees: number;
  employeesWithAlerts: number;
  totalAlerts: number;
  criticalCount: number;
  warningCount: number;
  noticeCount: number;
  percentageWithAlerts: number;
}

export function ExpirationBanner() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<AlertStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetchAlertStats();
  }, []);

  const fetchAlertStats = async () => {
    try {
      // Fetch alert statistics
      // This would be a new API endpoint
      const response = await fetch("/api/alerts/statistics");
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Error fetching alert statistics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !stats || dismissed || stats.criticalCount === 0) {
    return null;
  }

  const severity = stats.criticalCount > 0 ? "critical" : "warning";

  return (
    <div
      className={`${
        severity === "critical"
          ? "bg-red-50 border-red-200 text-red-900"
          : "bg-yellow-50 border-yellow-200 text-yellow-900"
      } border-l-4 p-4 mb-6`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <AlertTriangle
            className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
              severity === "critical" ? "text-red-600" : "text-yellow-600"
            }`}
          />
          <div className="flex-1">
            <h3 className="font-semibold text-lg">
              {severity === "critical"
                ? "Critical: Habilitations Expiring Soon"
                : "Warning: Habilitations Expiring"}
            </h3>
            <div className="mt-2 space-y-1 text-sm">
              <p>
                <strong>{stats.criticalCount}</strong> habilitation(s) expiring
                within 7 days
              </p>
              <p>
                <strong>{stats.warningCount}</strong> habilitation(s) expiring
                within 30 days
              </p>
              <p className="mt-3">
                {stats.employeesWithAlerts} out of {stats.totalEmployees}{" "}
                employees have expiring habilitations (
                {stats.percentageWithAlerts}%)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            onClick={() => navigate("/renewals")}
            className={`gap-2 ${
              severity === "critical"
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-yellow-600 hover:bg-yellow-700 text-white"
            }`}
          >
            View Renewals
            <ArrowRight className="w-4 h-4" />
          </Button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1 hover:bg-black/10 rounded"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default ExpirationBanner;
