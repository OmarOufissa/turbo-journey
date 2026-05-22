import { Card } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Employee } from "@/types/employee";

interface ExpirationTrendChartProps {
  employees: Employee[];
}

export function ExpirationTrendChart({ employees }: ExpirationTrendChartProps) {
  const months = [];
  const today = new Date();

  for (let i = 0; i < 12; i++) {
    const monthDate = new Date(today);
    monthDate.setMonth(today.getMonth() + i);
    const monthEnd = new Date(monthDate);
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    const monthName = monthDate.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });

    let expiring = 0;
    employees.forEach((emp) => {
      const ver = emp.currentVersion;
      if (!ver) return;
      const expDate = new Date(ver.dateExpiration);
      if (expDate >= monthDate && expDate < monthEnd) expiring++;
    });

    months.push({ month: monthName, Expirations: expiring });
  }

  return (
    <Card className="p-6 rounded-3xl shadow-xl border border-border">
      <h2 className="text-2xl font-black text-foreground mb-6">
        Expirations à venir (12 mois)
      </h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={months}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="month" className="text-xs" />
          <YAxis className="text-xs" />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="Expirations"
            stroke="hsl(var(--chart-1))"
            strokeWidth={2}
            dot={{ fill: "hsl(var(--chart-1))" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
