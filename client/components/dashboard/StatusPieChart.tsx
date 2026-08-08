import { Card } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { Employee, getHabilitationStatus } from "@/types";

interface StatusPieChartProps {
  employees: Employee[];
}

const COLORS = {
  expired: "hsl(var(--destructive))",
  expiringSoon: "hsl(var(--warning))",
  valid: "hsl(var(--success))",
};

export function StatusPieChart({ employees }: StatusPieChartProps) {
  let expired = 0;
  let expiringSoon = 0;
  let valid = 0;

  employees.forEach((emp) => {
    emp.habilitations?.forEach((hab) => {
      const status = getHabilitationStatus(hab);
      if (status === "expired") {
        expired++;
      } else if (
        status === "expiringSoon1Month" ||
        status === "expiringSoon2Months" ||
        status === "expiringSoon3Months"
      ) {
        expiringSoon++;
      } else {
        valid++;
      }
    });
  });

  const data = [
    { name: "Expirées", value: expired, color: COLORS.expired },
    { name: "À renouveler", value: expiringSoon, color: COLORS.expiringSoon },
    { name: "Valides", value: valid, color: COLORS.valid },
  ];

  return (
    <Card className="p-6 rounded-3xl shadow-xl border border-border">
      <h2 className="text-2xl font-black text-foreground mb-6">
        Répartition par Statut
      </h2>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            outerRadius={100}
            fill="#8884d8"
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
            }}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  );
}
