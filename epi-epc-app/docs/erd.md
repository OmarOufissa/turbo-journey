# Modèle de données (ERD)

Schéma entité-association complet. La source de vérité est le fichier
`server/db/schema.ts` (Drizzle ORM) — ce diagramme en est la représentation
visuelle, tenue à jour manuellement.

```mermaid
erDiagram
    DIVISIONS ||--o{ SERVICES : contient
    SERVICES ||--o{ EQUIPES : contient
    DIVISIONS ||--o{ AGENTS : rattache
    SERVICES ||--o{ AGENTS : rattache
    EQUIPES ||--o{ AGENTS : rattache

    FAMILLES ||--o{ SOUS_FAMILLES : contient
    FAMILLES ||--o{ ARTICLES : classe
    SOUS_FAMILLES ||--o{ ARTICLES : classe
    MARCHES ||--o{ ARTICLES : approvisionne

    KIT_TEMPLATES ||--o{ KIT_TEMPLATE_LIGNES : compose
    ARTICLES ||--o{ KIT_TEMPLATE_LIGNES : reference

    ARTICLES ||--o{ AFFECTATIONS : "affecte (EPI/EPC)"
    AGENTS ||--o{ AFFECTATIONS : beneficie
    EQUIPES ||--o{ AFFECTATIONS : beneficie
    KIT_TEMPLATES ||--o{ AFFECTATIONS : genere

    ARTICLES ||--o{ STOCK_MOUVEMENTS : "ledger stock"
    ARTICLES ||--o{ CONTROLES_PERIODIQUES : necessite
    AFFECTATIONS ||--o{ CONTROLES_PERIODIQUES : cible
    ARTICLES ||--o{ REPARATIONS : envoye
    ARTICLES ||--o{ REFORMES : reforme
    AFFECTATIONS ||--o{ REFORMES : cloture

    ARTICLES ||--o{ DOCUMENTS : "pieces jointes"
    AGENTS ||--o{ DOCUMENTS : "pieces jointes"

    USERS ||--o{ HISTORIQUE : "journalise (auteur)"
    AGENTS ||--o| USERS : "compte lie (option)"

    DIVISIONS {
        int id PK
        text code
        text nom
    }
    SERVICES {
        int id PK
        text nom
        int division_id FK
    }
    EQUIPES {
        int id PK
        text nom
        int service_id FK
        text team_type "clé de gabarit standard"
    }
    AGENTS {
        int id PK
        text matricule UK
        text nom
        text fonction
        int division_id FK
        int service_id FK
        int equipe_id FK
        text statut "actif|inactif|archive"
    }
    FAMILLES {
        int id PK
        text nom "EPI, EPC, Chaussure, Consignation..."
    }
    SOUS_FAMILLES {
        int id PK
        int famille_id FK
        text nom
    }
    MARCHES {
        int id PK
        text numero
        int annee
        text fournisseur
        numeric montant
        text statut
    }
    ARTICLES {
        int id PK
        text code_article UK
        text designation
        int famille_id FK
        int sous_famille_id FK
        int marche_id FK
        bool a_taille
        bool a_pointure
        int stock_disponible
        int stock_reserve
        int stock_commande
        int stock_min
        int stock_max
        numeric prix_unitaire
    }
    KIT_TEMPLATES {
        int id PK
        text code UK
        text label
        text applies_to_type "team_type|poste|service"
        text categorie "EPI|EPC"
    }
    KIT_TEMPLATE_LIGNES {
        int id PK
        int kit_template_id FK
        int article_id FK
        int quantite
    }
    AFFECTATIONS {
        int id PK
        int article_id FK
        text beneficiaire_type "agent|equipe"
        int agent_id FK
        int equipe_id FK
        int quantite
        text taille
        text pointure
        text date_affectation
        text statut "actif|retourne|perdu|reforme"
        int kit_template_id FK
    }
    STOCK_MOUVEMENTS {
        int id PK
        int article_id FK
        text type
        int quantite "signe +/-"
        text date_mouvement
    }
    CONTROLES_PERIODIQUES {
        int id PK
        int article_id FK
        int affectation_id FK
        text type "inspection|essai_dielectrique|etalonnage|..."
        text date_planifiee
        text prochaine_echeance
        text statut
    }
    REPARATIONS {
        int id PK
        int article_id FK
        text prestataire
        numeric cout
        text statut
    }
    REFORMES {
        int id PK
        int article_id FK
        int affectation_id FK
        text motif
    }
    DOCUMENTS {
        int id PK
        text entite_type
        int entite_id
        text type_document
        text url
    }
    ALERTES {
        int id PK
        text type
        text niveau "info|warning|critical"
        bool lue
        bool traitee
    }
    HISTORIQUE {
        int id PK
        text type_evenement
        text entite_type
        int entite_id
        text details "JSON"
        text date_evenement
    }
    USERS {
        int id PK
        text username UK
        text password_hash
        int agent_id FK
    }
```

## Principes de conception

- **`historique` est append-only** : aucune route API ne fait d'UPDATE/DELETE
  dessus. C'est le journal d'audit exigé par le cahier des charges
  (§10 — « aucune donnée ne doit être supprimée »).
- **`stock_mouvements` est un ledger** : chaque entrée/sortie de stock est une
  ligne immuable ; `articles.stock_disponible` est un compteur dérivé
  maintenu en transaction à chaque mouvement (lecture rapide côté dashboard,
  traçabilité complète côté ledger).
- **`kit_templates` / `kit_template_lignes`** encodent le panier de dotation
  standard par type d'équipe (Équipe Lignes, TST Postes…) ou par poste
  (Directeur, Chef de Division…), extrait des fichiers `Dotation_EPI_EPC_DTC`.
  Appliquer un gabarit à un agent ou une équipe génère automatiquement les
  lignes d'`affectations` correspondantes.
- **Aucune suppression physique** : agents archivés (`statut='archive'`),
  articles désactivés (`actif=false`), jamais de `DELETE` sur les entités
  métier.
