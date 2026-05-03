/**
 * PHASE 3: DASHBOARD ALERTS WIDGET
 * 
 * Displays alert statistics in widget format
 * Color-coded by severity
 * Actionable quick links
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { AlertCircle, Clock, CheckCircle, ArrowRight, RefreshCw } from "lucide-react";

interface AlertStats {
  totalEmployees: number;
  employeesWithAlerts: number;
  totalAlerts: number;
  criticalCount: number;
  warningCount: number;
  noticeCount: number;
  percentageWithAlerts: number;
}

export function DashboardAlerts() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<AlertStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchAlertStats();
  }, []);

  const fetchAlertStats = async () => {
    try {
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

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAlertStats();
    setRefreshing(false);
  };

  if (loading || !stats) {
    return (
      <Card className="p-6">
        <div className="text-center text-gray-500">Loading alert data...</div>
      </Card>
    );
  }

  const hasAlerts = stats.totalAlerts > 0;
  const hasCritical = stats.criticalCount > 0;

  return (
    <Card className={`p-6 ${hasCritical ? "border-red-300 bg-red-50" : ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          {hasCritical ? (
            <AlertCircle className="w-6 h-6 text-red-600" />
          ) : hasAlerts ? (
            <Clock className="w-6 h-6 text-yellow-600" />
          ) : (
            <CheckCircle className="w-6 h-6 text-green-600" />
          )}
          <h3 className="text-lg font-semibold">
            {hasCritical ? "Critical Alerts" : hasAlerts ? "Pending Renewals" : "All Clear"}
          </h3>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-1 hover:bg-black/10 rounded transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Alert Statistics Grid */}
      {hasAlerts && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {/* Critical */}
          <div className="bg-red-100 rounded p-3">
            <div className="text-sm text-red-600 font-medium">Critical</div>
            <div className="text-2xl font-bold text-red-700">{stats.criticalCount}</div>
            <div className="text-xs text-red-600 mt-1">Expiring in &lt;7 days</div>
          </div>

          {/* Warning */}
          <div className="bg-yellow-100 rounded p-3">
            <div className="text-sm text-yellow-600 font-medium">Warning</div>
            <div className="text-2xl font-bold text-yellow-700">{stats.warningCount}</div>
            <div className="text-xs text-yellow-600 mt-1">Expiring in 7-30 days</div>
          </div>

          {/* Notice */}
          <div className="bg-blue-100 rounded p-3">
            <div className="text-sm text-blue-600 font-medium">Notice</div>
            <div className="text-2xl font-bold text-blue-700">{stats.noticeCount}</div>
            <div className="text-xs text-blue-600 mt-1">Expiring in 30+ days</div>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="mb-6 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Total Alerts:</span>
          <span className="font-semibold">{stats.totalAlerts}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Affected Employees:</span>
          <span className="font-semibold">
            {stats.employeesWithAlerts} of {stats.totalEmployees}{" "}
            <span className="text-gray-500">({stats.percentageWithAlerts}%)</span>
          </span>
        </div>
      </div>

      {/* Status Badge */}
      {!hasAlerts && (
        <div className="mb-6 p-4 bg-green-100 rounded border border-green-300">
          <p className="text-sm text-green-800">
            ✓ All habilitations are current. No renewals needed in the next 30 days.
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button
          onClick={() => navigate("/renewals")}
          className="flex-1 gap-2"
          variant={hasCritical ? "destructive" : "default"}
        >
          View Renewals
          <ArrowRight className="w-4 h-4" />
        </Button>
        <Button
          onClick={() => navigate("/audit-log")}
          variant="outline"
          className="flex-1"
        >
          Audit Log
        </Button>
      </div>

      {/* Last Updated */}
      <div className="mt-4 text-xs text-gray-500 text-center">
        Last updated: {new Date().toLocaleTimeString()}
      </div>
    </Card>
  );
}

export default DashboardAlerts;
