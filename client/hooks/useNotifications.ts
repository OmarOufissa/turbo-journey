/**
 * In-app notification system — persistent alerts with severity levels, dismiss, auto-expiry.
 * Stored in localStorage so alerts survive page reloads.
 */

import { useState, useCallback, useEffect } from "react";

export type NotificationSeverity = "info" | "warning" | "critical";

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  createdAt: string;
  expiresAt?: string;
  dismissed: boolean;
  link?: string;
}

const STORAGE_KEY = "app_notifications";
const MAX_NOTIFICATIONS = 100;

function load(): AppNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const all = JSON.parse(raw) as AppNotification[];
    // Filter out expired ones
    const now = new Date();
    return all.filter((n) => !n.expiresAt || new Date(n.expiresAt) > now);
  } catch {
    return [];
  }
}

function save(notifications: AppNotification[]): void {
  try {
    // Keep last MAX_NOTIFICATIONS
    const trimmed = notifications.slice(-MAX_NOTIFICATIONS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch { /* ignore */ }
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>(load);

  useEffect(() => {
    save(notifications);
  }, [notifications]);

  const addNotification = useCallback((
    title: string,
    message: string,
    severity: NotificationSeverity = "info",
    options?: { expiresInMs?: number; link?: string }
  ) => {
    const n: AppNotification = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title,
      message,
      severity,
      createdAt: new Date().toISOString(),
      expiresAt: options?.expiresInMs
        ? new Date(Date.now() + options.expiresInMs).toISOString()
        : undefined,
      dismissed: false,
      link: options?.link,
    };
    setNotifications((prev) => [...prev, n]);
    return n.id;
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, dismissed: true } : n))
    );
  }, []);

  const dismissAll = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, dismissed: true })));
  }, []);

  const remove = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const active = notifications.filter((n) => !n.dismissed);
  const unreadCount = active.length;
  const criticalCount = active.filter((n) => n.severity === "critical").length;

  return {
    notifications,
    active,
    unreadCount,
    criticalCount,
    addNotification,
    dismiss,
    dismissAll,
    remove,
    clearAll,
  };
}
