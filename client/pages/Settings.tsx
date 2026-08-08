import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings as SettingsIcon, Bell, Database, User, Mail, Github, Download } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const { toast } = useToast();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [autoBackup, setAutoBackup] = useState(true);
  const [githubToken, setGithubToken] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [exportingToGithub, setExportingToGithub] = useState(false);

  function handleSaveSettings() {
    toast({
      title: "Paramètres sauvegardés",
      description: "Vos préférences ont été mises à jour avec succès",
    });
  }

  function handleExportData() {
    toast({
      title: "Export en cours",
      description: "Les données seront téléchargées dans quelques instants",
    });
  }

  async function handleExportToGithub() {
    if (!githubToken || !githubRepo) {
      toast({
        title: "Erreur",
        description: "Veuillez configurer le token et le repo GitHub",
        variant: "destructive",
      });
      return;
    }

    setExportingToGithub(true);
    try {
      const response = await fetch("/api/employees", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (!response.ok) throw new Error("Failed to fetch employees");

      const employees = await response.json();

      // Create GitHub Gist or commit to repo
      const gistContent = JSON.stringify(employees, null, 2);

      // For now, we'll just copy to clipboard as a demo
      // In a real implementation, this would use the GitHub API
      navigator.clipboard.writeText(gistContent);

      toast({
        title: "Données exportées",
        description: "Les données ont été copiées dans le presse-papiers. Vous pouvez les coller dans un Gist GitHub.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur serveur";
      toast({
        title: "Erreur",
        description: message,
        variant: "destructive",
      });
    } finally {
      setExportingToGithub(false);
    }
  }

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in max-w-4xl">
        <div>
          <h1 className="text-3xl font-bold neon-text flex items-center gap-2">
            <SettingsIcon className="w-8 h-8" />
            Paramètres
          </h1>
          <p className="text-muted-foreground mt-1">
            Gérez vos préférences et configuration
          </p>
        </div>

        {/* Profile Settings */}
        <Card className="electric-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Profil Utilisateur
            </CardTitle>
            <CardDescription>Informations personnelles</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                defaultValue="admin@example.com"
                className="neon-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Nom complet</Label>
              <Input
                id="name"
                type="text"
                defaultValue="Administrateur"
                className="neon-border"
              />
            </div>
            <Button onClick={handleSaveSettings} className="electric-button">
              Sauvegarder
            </Button>
          </CardContent>
        </Card>

        {/* Notification Settings */}
        <Card className="electric-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Notifications
            </CardTitle>
            <CardDescription>Configuration des alertes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="notifications">Activer les notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Recevoir des alertes pour les expirations
                </p>
              </div>
              <Switch
                id="notifications"
                checked={notificationsEnabled}
                onCheckedChange={setNotificationsEnabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="email-notif">Notifications par email</Label>
                <p className="text-sm text-muted-foreground">
                  Recevoir des alertes par email
                </p>
              </div>
              <Switch
                id="email-notif"
                checked={emailNotifications}
                onCheckedChange={setEmailNotifications}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notif-email">Email de notification</Label>
              <Input
                id="notif-email"
                type="email"
                placeholder="notifications@example.com"
                className="neon-border"
              />
            </div>
          </CardContent>
        </Card>

        {/* Data Management */}
        <Card className="electric-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              Gestion des Données
            </CardTitle>
            <CardDescription>Sauvegarde et export</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="auto-backup">Sauvegarde automatique</Label>
                <p className="text-sm text-muted-foreground">
                  Sauvegarder automatiquement les données
                </p>
              </div>
              <Switch
                id="auto-backup"
                checked={autoBackup}
                onCheckedChange={setAutoBackup}
              />
            </div>

            <div className="flex gap-3">
              <Button onClick={handleExportData} variant="outline" className="neon-border">
                Exporter les données (Excel)
              </Button>
              <Button onClick={handleExportData} variant="outline" className="neon-border">
                Exporter les données (PDF)
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* GitHub Integration */}
        <Card className="electric-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Github className="w-5 h-5" />
              Intégration GitHub
            </CardTitle>
            <CardDescription>Exporter les données vers GitHub</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="github-token">Token GitHub (optionnel)</Label>
              <Input
                id="github-token"
                type="password"
                placeholder="Entrez votre token GitHub"
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                className="neon-border"
              />
              <p className="text-xs text-muted-foreground">
                Créez un token dans les paramètres de développement de GitHub
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="github-repo">Repo GitHub (optionnel)</Label>
              <Input
                id="github-repo"
                type="text"
                placeholder="username/repo"
                value={githubRepo}
                onChange={(e) => setGithubRepo(e.target.value)}
                className="neon-border"
              />
            </div>
            <Button
              onClick={handleExportToGithub}
              disabled={exportingToGithub}
              variant="outline"
              className="neon-border gap-2"
            >
              {exportingToGithub ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Exportation...
                </span>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Exporter vers GitHub
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              Les données seront copiées dans le presse-papiers pour être partagées sur GitHub.
            </p>
          </CardContent>
        </Card>

        {/* Email Templates */}
        <Card className="electric-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Modèles d'Email
            </CardTitle>
            <CardDescription>Personnaliser les notifications automatiques</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="template-subject">Objet de l'email</Label>
              <Input
                id="template-subject"
                defaultValue="Alerte: Habilitation arrivant à expiration"
                className="neon-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-body">Corps du message</Label>
              <textarea
                id="template-body"
                rows={6}
                className="w-full px-4 py-2 rounded-lg neon-border bg-background"
                defaultValue="Bonjour,&#10;&#10;Votre habilitation {TYPE} arrive à expiration le {DATE}.&#10;Merci de procéder au renouvellement."
              />
            </div>
            <Button onClick={handleSaveSettings} className="electric-button">
              Sauvegarder le modèle
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
