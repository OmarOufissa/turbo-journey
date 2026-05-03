import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.message || "Identifiants invalides");
        toast({
          title: "Erreur de connexion",
          description: data.message || "Identifiants invalides",
          variant: "destructive",
        });
        return;
      }

      const data = await response.json();
      localStorage.setItem("token", data.token);
      if (data.refreshToken) {
        localStorage.setItem("refreshToken", data.refreshToken);
      }

      toast({
        title: "Connexion réussie",
        description: "Bienvenue dans Gestion Habilitations",
      });

      navigate("/home");
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Erreur de connexion";
      setError(errorMessage);
      toast({
        title: "Erreur",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="bg-card p-10 rounded-3xl shadow-2xl border border-border space-y-8">
          <div className="text-center space-y-3">
            <h1 className="text-4xl font-black text-foreground tracking-tight">
              Gestion
              <br />
              Habilitations
            </h1>
            <p className="text-muted-foreground text-sm font-medium">Connectez-vous à votre compte</p>
          </div>

          {error && (
            <div className="bg-destructive/10 border-2 border-destructive/20 p-4 rounded-2xl flex gap-3">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-3">
              <Label htmlFor="email" className="text-sm font-semibold text-foreground">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
                className="h-12 rounded-xl text-base"
              />
            </div>

            <div className="space-y-3">
              <Label htmlFor="password" className="text-sm font-semibold text-foreground">
                Mot de passe
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
                className="h-12 rounded-xl text-base"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-14 text-base font-bold rounded-xl shadow-lg hover:shadow-xl transition-all"
            >
              {loading ? "Connexion..." : "Se connecter"}
            </Button>
          </form>

          <div className="text-center pt-6 border-t border-border">
            <p className="text-xs text-muted-foreground font-medium">
              Demo: <span className="font-semibold text-foreground">admin@example.com</span> / <span className="font-semibold text-foreground">admin123</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
