# Cas d'utilisation

Mermaid n'a pas de notation UML "cas d'utilisation" native ; le diagramme
ci-dessous utilise des nœuds arrondis pour les cas d'utilisation et des
sous-graphes pour les acteurs, ce qui reste lisible et proche de la
convention UML.

Application à usage individuel (un seul compte, pas de distinction de rôles) :
tous les cas d'utilisation sont accessibles au même utilisateur une fois
connecté.

```mermaid
flowchart LR
    Utilisateur(["👤 Utilisateur"])

    subgraph Catalogue["Catalogue & marchés"]
        UC1((Gérer les articles))
        UC2((Gérer les marchés))
        UC3((Consulter le catalogue))
    end

    subgraph Organisation["Organisation & bénéficiaires"]
        UC4((Gérer l'organigramme))
        UC5((Gérer les bénéficiaires))
    end

    subgraph Dotation["Dotation"]
        UC6((Affecter un article))
        UC7((Appliquer un gabarit standard))
        UC8((Enregistrer un retour))
        UC9((Réformer un équipement))
    end

    subgraph Suivi["Suivi & conformité"]
        UC10((Planifier / réaliser un contrôle))
        UC11((Suivre une réparation))
        UC12((Traiter les alertes))
        UC13((Consulter l'historique))
    end

    subgraph Pilotage["Pilotage"]
        UC14((Consulter le tableau de bord))
        UC15((Générer un rapport))
        UC16((Rechercher globalement))
    end

    Utilisateur --> UC1 & UC2 & UC3 & UC4 & UC5 & UC6 & UC7 & UC8 & UC9 & UC10 & UC11 & UC12 & UC13 & UC14 & UC15 & UC16
```

## Description des cas d'utilisation clés

| Cas d'utilisation | Déclencheur | Résultat |
|---|---|---|
| Appliquer un gabarit standard | Nouvel agent affecté à une équipe, ou renouvellement de dotation | Génère automatiquement les lignes d'affectation EPI (par agent) ou EPC (par équipe) correspondant au type d'équipe/poste, décrémente le stock, journalise l'historique |
| Affecter un article | Besoin ponctuel (hors gabarit) | Crée une affectation, vérifie le stock disponible, décrémente, journalise |
| Enregistrer un retour | Fin de mission, changement de taille, restitution | Met à jour le statut de l'affectation, remet en stock si l'état le permet |
| Réformer un équipement | Fin de vie, contrôle non conforme, casse | Clôture l'affectation, crée une entrée de réforme, journalise (l'article ne revient jamais en stock) |
| Traiter les alertes | Génération automatique (stock, contrôle en retard, fin de vie, livraison) | Marque comme lue/traitée, oriente vers l'action corrective |
