# Diagrammes de séquence — flux métier clés

## 1. Application d'un gabarit de dotation standard à un agent

```mermaid
sequenceDiagram
    actor U as Utilisateur
    participant C as Client React
    participant A as API /affectations/kit/appliquer
    participant DB as PostgreSQL

    U->>C: Ouvre la fiche agent → "Appliquer un gabarit"
    C->>A: POST { kitTemplateId, agentId, dateAffectation }
    A->>DB: SELECT lignes du gabarit (kit_template_lignes ⋈ articles)
    DB-->>A: liste des articles + stock disponible
    loop pour chaque ligne du gabarit
        alt stock disponible suffisant
            A->>DB: INSERT affectations (statut=actif)
            A->>DB: INSERT stock_mouvements (sortie_affectation)
            A->>DB: UPDATE articles.stock_disponible -= quantite
        else stock insuffisant
            A-->>A: ligne ignorée, signalée dans la réponse
        end
    end
    A->>DB: INSERT historique (type=dotation_kit)
    A-->>C: { created, ignoredForStock: [...] }
    C-->>U: Toast de confirmation + liste des articles non couverts
```

## 2. Affectation manuelle et contrôle de stock

```mermaid
sequenceDiagram
    actor U as Utilisateur
    participant C as Client React
    participant A as API /affectations
    participant DB as PostgreSQL

    U->>C: Formulaire "Nouvelle affectation"
    C->>A: POST { articleId, beneficiaireType, agentId|equipeId, quantite }
    A->>DB: SELECT articles WHERE id
    alt stock_disponible < quantite demandée
        A-->>C: 409 Conflict — stock insuffisant
        C-->>U: Message d'erreur, aucune donnée modifiée
    else stock suffisant
        A->>DB: INSERT affectations
        A->>DB: INSERT stock_mouvements (sortie_affectation)
        A->>DB: UPDATE articles.stock_disponible -= quantite (transaction)
        A->>DB: INSERT historique (type=dotation)
        A-->>C: 201 Created
        C-->>U: Toast de confirmation, tableau rafraîchi
    end
```

## 3. Retour d'équipement

```mermaid
sequenceDiagram
    actor U as Utilisateur
    participant C as Client React
    participant A as API /affectations/:id/retour
    participant DB as PostgreSQL

    U->>C: Sélectionne "Retour" sur une affectation active
    C->>A: POST { dateRetour, etatRetour }
    A->>DB: UPDATE affectations SET statut='retourne'
    alt état = bon ou usage_normal
        A->>DB: INSERT stock_mouvements (entree_retour, +quantite)
        A->>DB: UPDATE articles.stock_disponible += quantite
    else état = endommagé ou hors service
        Note over A,DB: Pas de remise en stock — l'unité sort définitivement
    end
    A->>DB: INSERT historique (type=retour)
    A-->>C: 200 OK
    C-->>U: Statut mis à jour dans la liste
```

Ces trois flux illustrent le principe directeur de l'application : **toute
variation de stock passe par le ledger `stock_mouvements`, et tout événement
métier est journalisé dans `historique`** — rien n'est jamais écrasé ou perdu,
conformément à l'exigence de traçabilité complète du cahier des charges.
