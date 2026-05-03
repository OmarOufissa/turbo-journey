import { cn } from "@/lib/utils";

/**
 * Get CSS classes for expiration date color coding
 * Returns Tailwind classes based on days until expiration
 */
export function getExpirationColorClasses(
  dateExpiration: string | undefined
): string {
  if (!dateExpiration) {
    return ""; // No color coding if no date
  }

  const today = new Date();
  const expirationDate = new Date(dateExpiration);
  const daysUntilExpiration = Math.floor(
    (expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (expirationDate < today) {
    // Expired
    return "text-red-900 bg-red-100 font-semibold";
  }

  if (daysUntilExpiration < 90) {
    // Critical (< 3 months)
    return "text-red-700 bg-red-50";
  }

  if (daysUntilExpiration < 180) {
    // Warning (< 6 months)
    return "text-orange-700 bg-orange-50";
  }

  if (daysUntilExpiration < 270) {
    // Caution (< 9 months)
    return "text-yellow-700 bg-yellow-50";
  }

  // Normal (> 12 months)
  return "";
}

/**
 * Get alert level text for expiration date
 */
export function getAlertLevel(dateExpiration: string | undefined): string {
  if (!dateExpiration) {
    return "UNKNOWN";
  }

  const today = new Date();
  const expirationDate = new Date(dateExpiration);
  const daysUntilExpiration = Math.floor(
    (expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (expirationDate < today) {
    return "EXPIRED";
  }

  if (daysUntilExpiration < 90) {
    return "CRITICAL";
  }

  if (daysUntilExpiration < 180) {
    return "WARNING";
  }

  if (daysUntilExpiration < 270) {
    return "CAUTION";
  }

  return "OK";
}

/**
 * Get alert color badge classes
 */
export function getAlertColorBadge(alertLevel: string): string {
  switch (alertLevel) {
    case "EXPIRED":
      return "bg-red-100 text-red-900";
    case "CRITICAL":
      return "bg-red-50 text-red-700";
    case "WARNING":
      return "bg-orange-50 text-orange-700";
    case "CAUTION":
      return "bg-yellow-50 text-yellow-700";
    default:
      return "bg-gray-50 text-gray-700";
  }
}

/**
 * ExpirationColorBadge Component
 * Displays a styled badge for expiration date with color coding
 */
interface ExpirationColorBadgeProps {
  dateExpiration: string | undefined;
  showText?: boolean;
  className?: string;
}

export function ExpirationColorBadge({
  dateExpiration,
  showText = false,
  className,
}: ExpirationColorBadgeProps) {
  const alertLevel = getAlertLevel(dateExpiration);
  const colorClasses = getAlertColorBadge(alertLevel);

  return (
    <span className={cn("px-2 py-1 rounded text-xs font-medium", colorClasses, className)}>
      {showText ? alertLevel : formatDate(dateExpiration)}
    </span>
  );
}

/**
 * Format date as DD/MM/YYYY
 */
export function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Get days until expiration
 */
export function getDaysUntilExpiration(dateExpiration: string | undefined): number {
  if (!dateExpiration) return 0;
  const today = new Date();
  const expirationDate = new Date(dateExpiration);
  const daysUntilExpiration = Math.floor(
    (expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  return daysUntilExpiration;
}
