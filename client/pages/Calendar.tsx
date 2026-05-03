import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar as CalendarIcon, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";

interface ExpirationEvent {
  id: number;
  employee: string;
  matricule: string;
  type: "HT" | "ST";
  codes: string[];
  dateExpiration: string;
  daysUntilExpiration: number;
}

export default function Calendar() {
  const [events, setEvents] = useState<ExpirationEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchExpirations();
  }, []);

  async function fetchExpirations() {
    try {
      const response = await fetch("/api/employees", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (!response.ok) throw new Error("Failed to fetch");

      const employees = await response.json();
      const expirations: ExpirationEvent[] = [];

      employees.forEach((emp: any) => {
        emp.habilitations?.forEach((hab: any) => {
          const expDate = new Date(hab.date_expiration);
          const today = new Date();
          const diffTime = expDate.getTime() - today.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays <= 90) {
            expirations.push({
              id: hab.id,
              employee: `${emp.prenom} ${emp.nom}`,
              matricule: emp.matricule,
              type: hab.type,
              codes: hab.codes,
              dateExpiration: hab.date_expiration,
              daysUntilExpiration: diffDays,
            });
          }
        });
      });

      expirations.sort((a, b) => a.daysUntilExpiration - b.daysUntilExpiration);
      setEvents(expirations);
    } catch (err) {
      console.error("Error fetching expirations:", err);
    } finally {
      setLoading(false);
    }
  }

  function getUrgencyColor(days: number) {
    if (days <= 0) return "bg-red-500";
    if (days <= 30) return "bg-orange-500";
    if (days <= 60) return "bg-yellow-500";
    return "bg-blue-500";
  }

  function getUrgencyLabel(days: number) {
    if (days <= 0) return "Expiré";
    if (days <= 30) return "Urgent";
    if (days <= 60) return "Attention";
    return "À venir";
  }

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold neon-text flex items-center gap-2">
            <CalendarIcon className="w-8 h-8" />
            Calendrier des Expirations
          </h1>
          <p className="text-muted-foreground mt-1">
            Suivi des habilitations arrivant à expiration dans les 90 prochains jours
          </p>
        </div>

        {loading ? (
          <div className="text-center py-12">Chargement...</div>
        ) : (
          <div className="grid gap-4">
            {events.length === 0 ? (
              <Card className="electric-card">
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">Aucune expiration dans les 90 prochains jours</p>
                </CardContent>
              </Card>
            ) : (
              events.map((event) => (
                <Card key={`${event.id}-${event.type}`} className="electric-card hover:scale-[1.02] transition-transform">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {event.employee}
                          <Badge variant="outline" className="ml-2">
                            {event.matricule}
                          </Badge>
                        </CardTitle>
                        <CardDescription className="mt-1">
                          Habilitation {event.type} - {event.codes.join(", ")}
                        </CardDescription>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge className={getUrgencyColor(event.daysUntilExpiration)}>
                          {getUrgencyLabel(event.daysUntilExpiration)}
                        </Badge>
                        {event.daysUntilExpiration <= 30 && (
                          <AlertTriangle className="w-5 h-5 text-orange-500 animate-pulse" />
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Date d'expiration</p>
                        <p className="font-medium">
                          {new Date(event.dateExpiration).toLocaleDateString("fr-FR")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Jours restants</p>
                        <p className="text-2xl font-bold neon-text">
                          {event.daysUntilExpiration > 0 ? event.daysUntilExpiration : 0}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
