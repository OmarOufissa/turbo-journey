import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

const LAST_ACTION_KEY = "lastAction";

export interface LastAction {
  auditLogId: number;
  description: string;
  timestamp: number;
}

export function setLastAction(action: LastAction) {
  localStorage.setItem(LAST_ACTION_KEY, JSON.stringify(action));
  window.dispatchEvent(new Event("lastActionChanged"));
}

export function clearLastAction() {
  localStorage.removeItem(LAST_ACTION_KEY);
  window.dispatchEvent(new Event("lastActionChanged"));
}

export function getLastAction(): LastAction | null {
  try {
    const raw = localStorage.getItem(LAST_ACTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastAction;
    // Expired after 5 seconds
    if (Date.now() - parsed.timestamp > 5000) {
      clearLastAction();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function UndoToast() {
  const [action, setAction] = useState<LastAction | null>(() => getLastAction());
  const [visible, setVisible] = useState(!!action);
  const [secondsLeft, setSecondsLeft] = useState(5);
  const token = localStorage.getItem("token");

  useEffect(() => {
    const update = () => {
      const a = getLastAction();
      setAction(a);
      setVisible(!!a);
    };
    window.addEventListener("lastActionChanged", update);
    return () => window.removeEventListener("lastActionChanged", update);
  }, []);

  useEffect(() => {
    if (!action) return;
    const remaining = 5000 - (Date.now() - action.timestamp);
    if (remaining <= 0) { clearLastAction(); return; }
    const t = setTimeout(() => clearLastAction(), remaining);
    return () => clearTimeout(t);
  }, [action]);

  useEffect(() => {
    if (!action) return;
    const tick = setInterval(() => {
      const remaining = Math.ceil((5000 - (Date.now() - action.timestamp)) / 1000);
      setSecondsLeft(Math.max(0, remaining));
    }, 100);
    return () => clearInterval(tick);
  }, [action]);

  const handleUndo = async () => {
    if (!action) return;
    try {
      const res = await fetch(`/api/audit-logs/${action.auditLogId}/revert`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        clearLastAction();
        window.dispatchEvent(new Event("undoPerformed"));
      }
    } catch {
      /* silent */
    }
  };

  if (!visible || !action) return null;

  return (
    <div className={cn("fixed bottom-4 right-4 bg-background border rounded-lg shadow-lg p-4 flex items-center gap-3 z-50 animate-in slide-in-from-bottom-4")}>
      <RotateCcw className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <p className="text-sm">{action.description}</p>
      <span className="text-xs font-mono text-muted-foreground w-4">{secondsLeft}s</span>
      <Button size="sm" variant="outline" onClick={handleUndo}>Annuler</Button>
      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={clearLastAction}>✕</Button>
    </div>
  );
}
