import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  message?: string;
  className?: string;
}

const sizeClasses = {
  sm: "w-6 h-6 border-2",
  md: "w-12 h-12 border-4",
  lg: "w-16 h-16 border-4",
};

export function LoadingSpinner({ 
  size = "md", 
  message,
  className 
}: LoadingSpinnerProps) {
  return (
    <div className={cn("flex items-center justify-center", className)}>
      <div className="text-center space-y-4">
        <div
          className={cn(
            sizeClasses[size],
            "border-primary/30 border-t-primary rounded-full animate-spin mx-auto"
          )}
        />
        {message && (
          <p className="text-muted-foreground text-sm font-medium">{message}</p>
        )}
      </div>
    </div>
  );
}
