/**
 * Notification bell icon + dropdown panel.
 * Shows unread count badge, severity-colored entries, dismiss controls.
 */

import { useState } from "react";
import { Bell, X, CheckCheck, AlertTriangle, Info, AlertCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AppNotification, NotificationSeverity, useNotifications } from "@/hooks/useNotifications";
import { formatDateFrench } from "@/lib/dateUtils";

function SeverityIcon({ severity }: { severity: NotificationSeverity }) {
  if (severity === "critical") return <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />;
  if (severity === "warning") return <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />;
  return <Info className="w-4 h-4 text-blue-500 shrink-0" />;
}

function severityBorder(severity: NotificationSeverity) {
  if (severity === "critical") return "border-l-red-500";
  if (severity === "warning") return "border-l-orange-500";
  return "border-l-blue-500";
}

function NotificationItem({
  notification,
  onDismiss,
  onRemove,
}: {
  notification: AppNotification;
  onDismiss: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div
      className={`flex gap-3 px-4 py-3 border-l-2 ${severityBorder(notification.severity)} ${
        notification.dismissed ? "opacity-50" : ""
      } border-b border-border/50 last:border-0`}
    >
      <SeverityIcon severity={notification.severity} />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm text-foreground truncate">{notification.title}</div>
        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notification.message}</div>
        <div className="text-[10px] text-muted-foreground mt-1">
          {new Date(notification.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
        </div>
        {notification.link && (
          <a
            href={notification.link}
            className="text-xs text-primary flex items-center gap-1 mt-1 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Voir <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        {!notification.dismissed && (
          <button
            onClick={() => onDismiss(notification.id)}
            className="text-muted-foreground hover:text-foreground"
            title="Marquer comme lu"
          >
            <CheckCheck className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={() => onRemove(notification.id)}
          className="text-muted-foreground hover:text-destructive"
          title="Supprimer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export function NotificationPanel() {
  const { notifications, active, unreadCount, criticalCount, dismiss, dismissAll, remove, clearAll } =
    useNotifications();
  const [showAll, setShowAll] = useState(false);

  const displayed = showAll ? notifications.slice().reverse() : active.slice().reverse();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-lg hover:bg-muted transition-colors">
          <Bell className={`w-5 h-5 ${criticalCount > 0 ? "text-red-500" : "text-muted-foreground"}`} />
          {unreadCount > 0 && (
            <span
              className={`absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] text-[10px] font-bold rounded-full flex items-center justify-center text-white
                ${criticalCount > 0 ? "bg-red-500" : "bg-orange-500"}`}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0 rounded-xl shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-sm">
            Notifications
            {unreadCount > 0 && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                ({unreadCount} non lue{unreadCount > 1 ? "s" : ""})
              </span>
            )}
          </h3>
          <div className="flex gap-1">
            {unreadCount > 0 && (
              <button
                onClick={dismissAll}
                className="text-xs text-muted-foreground hover:text-foreground"
                title="Tout marquer comme lu"
              >
                <CheckCheck className="w-4 h-4" />
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="text-xs text-muted-foreground hover:text-destructive ml-1"
                title="Tout supprimer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {displayed.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Aucune notification
            </div>
          ) : (
            displayed.map((n) => (
              <NotificationItem key={n.id} notification={n} onDismiss={dismiss} onRemove={remove} />
            ))
          )}
        </div>

        {notifications.length > 0 && (
          <div className="px-4 py-2 border-t border-border">
            <button
              onClick={() => setShowAll((v) => !v)}
              className="text-xs text-primary hover:underline"
            >
              {showAll ? "Afficher uniquement les non lues" : `Afficher tout (${notifications.length})`}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
