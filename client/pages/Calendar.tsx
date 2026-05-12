import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getEmployees } from "@/api/employees";
import { getExpirationStatus, EXPIRATION_COLOR_CONFIG } from "@/types/habilitation";
import { cn } from "@/lib/utils";
import { Employee } from "@/types/employee";

interface DayEntry {
  employee: Employee;
  daysLeft: number;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay(); // 0=Sun
}

const MONTHS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const DAYS_FR = ["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"];

export default function Calendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // Fetch up to 500 to cover full calendar range
        const res = await getEmployees({ limit: 500 });
        if (res.success) setEmployees(res.data.employees.filter(e => e.currentVersion));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Group employees by expiration day for the current month/year
  const byDay: Record<number, DayEntry[]> = {};
  for (const emp of employees) {
    const ver = emp.currentVersion!;
    const exp = new Date(ver.dateExpiration);
    if (exp.getFullYear() === year && exp.getMonth() === month) {
      const d = exp.getDate();
      if (!byDay[d]) byDay[d] = [];
      const daysLeft = Math.ceil((exp.getTime() - Date.now()) / 864e5);
      byDay[d].push({ employee: emp, daysLeft });
    }
  }

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month); // 0=Sun

  const prev = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); setSelectedDay(null); };
  const next = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); setSelectedDay(null); };

  const selectedEntries = selectedDay ? (byDay[selectedDay] ?? []) : [];

  return (
    <Layout>
      <div className="p-6 space-y-4 max-w-5xl mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarIcon className="w-6 h-6" />Calendrier des expirations
          </h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={prev}><ChevronLeft className="w-4 h-4" /></Button>
            <span className="font-medium w-36 text-center">{MONTHS_FR[month]} {year}</span>
            <Button variant="outline" size="sm" onClick={next}><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Chargement...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Calendar grid */}
            <Card className="lg:col-span-2">
              <CardContent className="p-4">
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {DAYS_FR.map(d => (
                    <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {/* Empty cells before first day */}
                  {Array.from({ length: firstDay }).map((_, i) => (
                    <div key={`empty-${i}`} />
                  ))}
                  {/* Day cells */}
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                    const entries = byDay[day] ?? [];
                    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
                    const isSelected = selectedDay === day;
                    const hasExpired = entries.some(e => e.daysLeft < 0);
                    const hasCritical = entries.some(e => e.daysLeft >= 0 && e.daysLeft <= 90);

                    return (
                      <button
                        key={day}
                        onClick={() => setSelectedDay(day === selectedDay ? null : day)}
                        className={cn(
                          "min-h-[56px] p-1 rounded-lg border text-left transition-colors",
                          isToday && "border-primary",
                          isSelected && "bg-primary/10 border-primary",
                          !isSelected && !isToday && "border-border hover:bg-muted/50"
                        )}
                      >
                        <span className={cn("text-xs font-semibold block", isToday && "text-primary")}>{day}</span>
                        {entries.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {entries.slice(0, 2).map(e => (
                              <div
                                key={e.employee.id}
                                className={cn(
                                  "text-[10px] rounded px-1 truncate leading-4",
                                  e.daysLeft < 0 ? "bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-200" :
                                  e.daysLeft <= 90 ? "bg-orange-200 text-orange-800 dark:bg-orange-900 dark:text-orange-200" :
                                  "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                )}
                              >
                                {e.employee.matricule}
                              </div>
                            ))}
                            {entries.length > 2 && (
                              <div className="text-[10px] text-muted-foreground pl-1">+{entries.length - 2}</div>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Day detail panel */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  {selectedDay
                    ? `${selectedDay} ${MONTHS_FR[month]} ${year} — ${selectedEntries.length} expiration(s)`
                    : "Sélectionner un jour"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-96 overflow-auto">
                {selectedEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {selectedDay ? "Aucune expiration ce jour" : "Cliquez sur un jour pour voir les expirations"}
                  </p>
                ) : (
                  selectedEntries.map(({ employee: emp, daysLeft }) => {
                    const status = getExpirationStatus(emp.currentVersion!.dateExpiration);
                    const config = EXPIRATION_COLOR_CONFIG[status];
                    return (
                      <Link key={emp.id} to={`/employees/${emp.id}`}>
                        <div className={cn("p-3 rounded-lg border cursor-pointer hover:opacity-80 transition-opacity", config.bgColor)}>
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium text-sm">{emp.prenom} {emp.nom}</p>
                              <p className="text-xs text-muted-foreground font-mono">{emp.matricule}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                ST: {(emp.currentVersion!.stCodes.length > 0 ? emp.currentVersion!.stCodes : ["XXX"]).join(", ")} /
                                HT: {(emp.currentVersion!.htCodes.length > 0 ? emp.currentVersion!.htCodes : ["XXX"]).join(", ")}
                              </p>
                            </div>
                            <div className="text-right">
                              <Badge className={cn("text-xs", config.textColor)}>{config.name}</Badge>
                              {daysLeft >= 0 && (
                                <p className="text-xs text-muted-foreground mt-1">{daysLeft}j</p>
                              )}
                              {daysLeft < 0 && (
                                <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" />{Math.abs(daysLeft)}j
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Month summary */}
        {!loading && (
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-red-300" />
                  <span>Expirés: {Object.values(byDay).flat().filter(e => e.daysLeft < 0).length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-orange-300" />
                  <span>&lt;3 mois: {Object.values(byDay).flat().filter(e => e.daysLeft >= 0 && e.daysLeft <= 90).length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-blue-300" />
                  <span>Ce mois: {Object.values(byDay).flat().length} total</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
