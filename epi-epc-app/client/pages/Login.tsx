import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HardHat, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ApiError } from "@/lib/api";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Échec de la connexion");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-700 via-primary-600 to-primary p-4">
      <Card className="w-full max-w-sm shadow-xl">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <HardHat className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">GEPI — Gestion EPI/EPC</h1>
          <p className="text-sm text-muted-foreground">ONEE · Direction Transport Casablanca</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Identifiant</Label>
              <Input id="username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Mot de passe</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Se connecter
            </Button>
          </form>
          <p className="mt-5 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            Démo : <span className="font-mono">admin</span> / <span className="font-mono">Admin@2026</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
