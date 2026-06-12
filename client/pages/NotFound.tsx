import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: Tentative d'accès à une route inexistante :",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">404</h1>
        <p className="text-xl text-muted-foreground mb-4">
          Oups ! Cette page n'existe pas
        </p>
        <Link to="/" className="text-primary hover:underline">
          Retour à l'accueil
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
