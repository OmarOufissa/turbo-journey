import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
      <p className="text-6xl font-bold text-primary">404</p>
      <p className="mt-2 text-lg font-medium">Page introuvable</p>
      <p className="mt-1 text-sm text-muted-foreground">Cette page n'existe pas ou a été déplacée.</p>
      <Button asChild className="mt-6">
        <Link to="/">Retour au tableau de bord</Link>
      </Button>
    </div>
  );
}
