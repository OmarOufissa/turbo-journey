import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface UndoButtonProps {
  action: string;
  onUndo: () => void;
  duration?: number; // milliseconds, default 5000
}

/**
 * UndoButton Component
 * Displays a toast-like button that appears for 5 seconds after an action
 * Auto-dismisses after timeout or when user navigates away
 */
export function UndoButton({ action, onUndo, duration = 5000 }: UndoButtonProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isDisappearing, setIsDisappearing] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsDisappearing(true);
      setTimeout(() => {
        setIsVisible(false);
      }, 300); // animation duration
    }, duration);

    return () => clearTimeout(timer);
  }, [duration]);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 bg-white border border-gray-200 rounded-lg shadow-lg p-4 flex items-center gap-3 transition-all duration-300 z-50",
        isDisappearing && "opacity-0 translate-x-full"
      )}
    >
      <div className="flex-1">
        <p className="text-sm font-medium">
          <RotateCcw className="inline mr-2 h-4 w-4" />
          {action}
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={onUndo}
        className="whitespace-nowrap"
      >
        Undo
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setIsDisappearing(true);
          setTimeout(() => setIsVisible(false), 300);
        }}
        className="h-auto w-auto p-1 text-gray-400 hover:text-gray-600"
      >
        ✕
      </Button>
    </div>
  );
}
