/**
 * PHASE 2: EMPLOYEE HISTORY PAGE
 * 
 * View complete timeline of employee state changes:
 * - Vertical timeline of all mutations
 * - Click to see before/after for each change
 * - Filter by date range and action type
 * - Export history as JSON
 * - Link from employee detail page
 */

import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { format, parseISO } from "date-fns";
import { ChevronDown, ChevronUp, Download, ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface HistoryEvent {
  index: number;
  id: number;
  action: string;
  entityType: string;
  timestamp: string;
  changeSummary: string;
  userId: number | null;
  canRevert: boolean;
}

interface EmployeeHistoryResponse {
  employeeId: number;
  matricule: string;
  totalEvents: number;
  timeline: HistoryEvent[];
}

interface HistoryFilter {
  action?: string;
  startDate?: string;
  endDate?: string;
}

const ACTION_COLORS: Record<string, string> = {
  CREATE_EMPLOYEE: "bg-green-100 text-green-800",
  UPDATE_EMPLOYEE: "bg-blue-100 text-blue-800",
  DELETE_EMPLOYEE: "bg-red-100 text-red-800",
  CREATE_HABILITATION: "bg-green-100 text-green-800",
  UPDATE_HABILITATION: "bg-blue-100 text-blue-800",
  DELETE_HABILITATION: "bg-red-100 text-red-800",
  RENEW_HABILITATION: "bg-purple-100 text-purple-800",
  UPLOAD_PDF: "bg-yellow-100 text-yellow-800",
  DELETE_PDF: "bg-orange-100 text-orange-800",
  REVERT_EMPLOYEE: "bg-indigo-100 text-indigo-800",
  REVERT_HABILITATION: "bg-indigo-100 text-indigo-800",
};

export default function EmployeeHistory() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [filteredHistory, setFilteredHistory] = useState<HistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filters, setFilters] = useState<HistoryFilter>({});
  const [matricule, setMatricule] = useState<string>("");

  // Fetch employee history
  useEffect(() => {
    if (!employeeId) {
      navigate("/employees");
      return;
    }
    fetchEmployeeHistory();
  }, [employeeId]);

  // Apply filters
  useEffect(() => {
    let filtered = [...history];

    if (filters.action) {
      filtered = filtered.filter((event) =>
        event.action.toLowerCase().includes(filters.action!.toLowerCase())
      );
    }

    if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      filtered = filtered.filter((event) => new Date(event.timestamp) >= startDate);
    }

    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter((event) => new Date(event.timestamp) <= endDate);
    }

    setFilteredHistory(filtered);
  }, [history, filters]);

  const fetchEmployeeHistory = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/employees/${employeeId}/history/timeline`);

      if (!response.ok) {
        throw new Error("Failed to fetch employee history");
      }

      const data: EmployeeHistoryResponse = await response.json();
      setHistory(data.timeline);
      setMatricule(data.matricule);
    } catch (error) {
      console.error("Error fetching history:", error);
      toast({
        title: "Error",
        description: "Failed to load employee history",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const exportHistory = () => {
    try {
      const exportData = {
        employeeId,
        matricule,
        exportedAt: new Date().toISOString(),
        events: filteredHistory,
      };

      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `employee-${matricule}-history-${format(new Date(), "yyyy-MM-dd")}.json`;
      a.click();
      window.URL.revokeObjectURL(url);

      toast({
        title: "Success",
        description: "History exported as JSON",
      });
    } catch (error) {
      console.error("Error exporting history:", error);
      toast({
        title: "Error",
        description: "Failed to export history",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center items-center min-h-screen">
          <LoadingSpinner />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/employees")}
              title="Back to employees"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Employee History</h1>
              <p className="text-gray-600 mt-2">
                Matricule: <span className="font-semibold">{matricule}</span>
              </p>
            </div>
          </div>
          <Button onClick={exportHistory} variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            Export
          </Button>
        </div>

        {/* Filters */}
        <Card className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="filter-action">Action Type</Label>
              <Input
                id="filter-action"
                placeholder="Filter by action..."
                value={filters.action || ""}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    action: e.target.value || undefined,
                  })
                }
              />
            </div>

            <div>
              <Label htmlFor="filter-start-date">Start Date</Label>
              <Input
                id="filter-start-date"
                type="date"
                value={filters.startDate || ""}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    startDate: e.target.value || undefined,
                  })
                }
              />
            </div>

            <div>
              <Label htmlFor="filter-end-date">End Date</Label>
              <Input
                id="filter-end-date"
                type="date"
                value={filters.endDate || ""}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    endDate: e.target.value || undefined,
                  })
                }
              />
            </div>
          </div>

          {(filters.action || filters.startDate || filters.endDate) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilters({})}
              className="mt-4"
            >
              Clear Filters
            </Button>
          )}
        </Card>

        {/* Statistics */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="text-sm text-gray-600">Total Events</div>
            <div className="text-2xl font-bold">{history.length}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-gray-600">Filtered Events</div>
            <div className="text-2xl font-bold">{filteredHistory.length}</div>
          </Card>
        </div>

        {/* Timeline */}
        {filteredHistory.length === 0 ? (
          <EmptyState
            title="No history"
            description="No events match the selected filters"
          />
        ) : (
          <div className="space-y-0">
            {filteredHistory.map((event) => (
              <div
                key={event.id}
                className="border-l-4 border-gray-300 hover:border-blue-500 transition-colors"
              >
                <div
                  className="p-4 bg-white hover:bg-gray-50 cursor-pointer transition-colors border-b"
                  onClick={() =>
                    setExpandedId(expandedId === event.id ? null : event.id)
                  }
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      {/* Timeline dot */}
                      <div className="mt-1.5 flex-shrink-0">
                        <div className="w-3 h-3 rounded-full bg-blue-500 border-4 border-white relative -left-5.5" />
                      </div>

                      {/* Event details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            className={ACTION_COLORS[event.action] || "bg-gray-100 text-gray-800"}
                          >
                            {event.action}
                          </Badge>
                          <span className="text-xs text-gray-500">
                            {event.entityType}
                          </span>
                          <span className="text-xs text-gray-400">
                            {format(parseISO(event.timestamp), "PPp")}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                          {event.changeSummary}
                        </p>
                      </div>
                    </div>

                    {/* Expand toggle */}
                    <div className="ml-2">
                      {expandedId === event.id ? (
                        <ChevronUp className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {/* Expanded details */}
                  {expandedId === event.id && (
                    <div className="mt-4 p-4 bg-gray-50 rounded border border-gray-200 text-sm font-mono">
                      <div className="whitespace-pre-wrap break-words overflow-x-auto">
                        {event.changeSummary}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
