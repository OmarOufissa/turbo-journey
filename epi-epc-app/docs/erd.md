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

    EQUIPEMENT_HIERARCHIE ||--o{ EQUIPEMENT_HIERARCHIE : "sous-categorie (Categorie>Famille>Sous-famille)"
    EQUIPEMENT_HIERARCHIE ||--o{ ARTICLES_REFERENCE : classe
    ARTICLES_REFERENCE ||--o{ ARTICLES : "rattache (obligatoire)"
    MARCHES ||--o{ ARTICLES : approvisionne

    KIT_TEMPLATES ||--o{ KIT_TEMPLATE_LIGNES : compose
    ARTICLES_REFERENCE ||--o{ KIT_TEMPLATE_LIGNES : reference

    ARTICLES ||--o{ AFFECTATIONS : "affecte (EPI/EPC)"
    AGENTS ||--o{ AFFECTATIONS : beneficie
    EQUIPES ||--o{ AFFECTATIONS : beneficie
    KIT_TEMPLATES ||--o{ AFFECTATIONS : genere

    ARTICLES ||--o{ STOCK_MOUVEMENTS : "ledger stock"
    ARTICLES ||--o{ CONTROLES_PERIODIQUES : necessite
    AFFECTATIONS ||--o{ CONTROLES_PERIODIQUES : cible
    ARTICLES ||--o{ REFORMES : reforme
    AFFECTATIONS ||--o{ REFORMES : cloture

    ARTICLES ||--o{ DOCUMENTS : "pieces jointes"
    ARTICLES_REFERENCE ||--o{ DOCUMENTS : "pieces jointes"
    AGENTS ||--o{ DOCUMENTS : "pieces jointes"
    AGENTS ||--o{ AGENT_MENSURATIONS : mesure

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
    AGENT_MENSURATIONS {
        int id PK
        int agent_id FK
        text cle UK "compose avec agent_id"
        text valeur
    }
    EQUIPEMENT_HIERARCHIE {
        int id PK
        int parent_id FK "auto-reference, null = racine (Categorie)"
        int niveau "1=Categorie 2=Famille 3=Sous-famille..."
        text nom
        text code_abrege "abreviation courte, unique par fratrie"
        bool soumis_controle_reglementaire "effectif (cascade)"
        bool soumis_controle_reglementaire_explicite "positionne sur ce noeud"
    }
    ARTICLES_REFERENCE {
        int id PK
        text code UK "compose: abrege ancetres + sequence"
        int hierarchie_parent_id FK
        text designation
        json caracteristiques_techniques
        text fiche_technique_pdf_url
        text photo_url
        json normes
        json certifications
        int duree_vie_recommandee_mois
        int quantite_reference "prefill UI, pas lu par le moteur besoin"
        text type_dotation
        bool actif
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
        int article_reference_id FK "obligatoire (validation applicative)"
        int marche_id FK
        text marque
        text modele
        text date_acquisition
        text numero_serie "lot/achat en stock, distinct de affectations.numero_serie"
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
        int article_reference_id FK
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
        text date_cloture_statut "auto-datee au retour/perte/reforme"
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
  lignes d'`affectations` correspondantes. Le moteur de calcul du besoin
  (`besoinService.ts`) compare ce gabarit (besoin) aux `affectations` actives
  (doté), groupées par `articles_reference` — jamais recalculé ad hoc par écran.
- **`equipement_hierarchie` / `articles_reference`** : la hiérarchie
  Catégorie > Famille > Sous-famille est un arbre auto-référencé qui ne
  contient plus que des nœuds structurels (non-feuilles) ; chaque feuille
  d'origine a été promue en ligne `articles_reference`, la véritable entité
  de catalogue (fiche technique, normes, caractéristiques). Tout `articles`
  physique doit être rattaché à un `articles_reference`.
- **`agent_mensurations`** : table enfant `(agent_id, cle, valeur)` plutôt
  qu'un blob JSON ou des colonnes fixes, pour permettre l'ajout d'une
  nouvelle mensuration sans migration de schéma.
- **Aucune suppression physique des données historiques** : agents archivés
  (`statut='archive'`), articles/articles de référence désactivés
  (`actif=false`), jamais de `DELETE` sur `historique`/`stock_mouvements`.
  Les entités purement structurelles sans données historiques propres
  (division/service/équipe/nœud de hiérarchie/article de référence) peuvent
  être supprimées, mais seulement si aucune entité dépendante n'y est
  rattachée (409 sinon).
