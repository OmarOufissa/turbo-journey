/**
 * Référentiel unique de classification des équipements — Catégorie générale >
 * Famille > (Sous-famille) > Type d'équipement, profondeur variable et
 * extensible sans changement de code (voir server/db/schema.ts,
 * equipement_hierarchie). Toute évolution de la structure (nouvelle famille,
 * nouveau type…) se fait ici, pas dans le code applicatif.
 *
 * reglementaire: true marque un nœud — et par conséquent tous ses descendants,
 * dénormalisé au moment de l'insertion (voir seedData.ts) — comme soumis à un
 * contrôle et une réépreuve périodiques règlementaires.
 */
export interface HierarchieNodeDef {
  nom: string;
  reglementaire?: boolean;
  enfants?: HierarchieNodeDef[];
}

export const HIERARCHIE_TREE: HierarchieNodeDef[] = [
  // ==========================================================================
  // EPI
  // ==========================================================================
  {
    nom: "EPI",
    enfants: [
      {
        nom: "Protection de la tête",
        enfants: [
          { nom: "Casque industriel" },
          { nom: "Casque électricien" },
          { nom: "Casque forestier" },
          { nom: "Casque pour soudure" },
          { nom: "Casque pour lignard" },
        ],
      },
      {
        nom: "Protection oculaire et du visage",
        enfants: [
          { nom: "Lunettes de protection" },
          { nom: "Lunettes anti-UV" },
          { nom: "Masque de soudure" },
          { nom: "Écran facial" },
        ],
      },
      {
        nom: "Protection respiratoire",
        enfants: [
          { nom: "Demi-masque anti-poussière" },
          { nom: "Masque buco-nasal" },
          { nom: "Masque respiratoire panoramique" },
        ],
      },
      {
        nom: "Protection auditive",
        enfants: [{ nom: "Coquille anti-bruit" }, { nom: "Bouchon d'oreille" }],
      },
      {
        nom: "Protection des mains",
        enfants: [
          { nom: "Gants de travail" },
          { nom: "Gants de manutention" },
          { nom: "Gants anti-acide" },
          { nom: "Gants de soudeur" },
        ],
      },
      {
        nom: "Protection des pieds",
        enfants: [
          { nom: "Chaussures de sécurité" },
          { nom: "Bottes de sécurité" },
          { nom: "Guêtres" },
        ],
      },
      {
        nom: "Protection du corps",
        enfants: [
          { nom: "Ensemble anti-acide" },
          { nom: "Tablier anti-acide" },
          { nom: "Vêtement d'élagueur" },
        ],
      },
      {
        nom: "Protection contre les chutes",
        enfants: [
          { nom: "Harnais" },
          { nom: "Longe" },
          { nom: "Amortisseur de chute" },
          { nom: "Mousqueton" },
        ],
      },
      {
        nom: "Protection électrique",
        enfants: [
          { nom: "Gants isolants BT" },
          { nom: "Surgants isolants" },
          { nom: "Essayeur de gants isolants" },
          { nom: "Coffret de rangement/transport pour gants isolants" },
        ],
      },
      { nom: "Autres équipements", enfants: [{ nom: "Autre équipement EPI" }] },
    ],
  },

  // ==========================================================================
  // EPC
  // ==========================================================================
  {
    nom: "EPC",
    enfants: [
      { nom: "Perches isolantes", reglementaire: true, enfants: [{ nom: "Perche à douille" }, { nom: "Perche à crochet" }, { nom: "Perche à embout universel" }, { nom: "Perche de sauvetage" }] },
      { nom: "VAT", enfants: [{ nom: "Détecteur unipolaire de tension" }, { nom: "Contrôleur de tension BT" }] },
      { nom: "DMT", enfants: [{ nom: "Câble de mise à la terre" }, { nom: "Pince de mise à la terre" }, { nom: "Étau de terre" }, { nom: "DMT/CC complet" }, { nom: "Tresse DMT" }] },
      { nom: "Tapis isolants", enfants: [{ nom: "Tapis isolant" }] },
      { nom: "Tabourets isolants", enfants: [{ nom: "Tabouret isolant" }] },
      { nom: "Plateformes isolantes", enfants: [{ nom: "Plateforme isolante" }] },
      { nom: "Consignation", enfants: [{ nom: "Cadenas de consignation" }, { nom: "Jetons de sécurité" }, { nom: "Armoire/coffret de consignation" }, { nom: "Porte-cadenas" }] },
      { nom: "Signalisation", enfants: [{ nom: "Pancarte" }, { nom: "Plaque" }, { nom: "Panneau" }, { nom: "Affiche" }] },
      { nom: "Balisage", enfants: [{ nom: "Banderole" }, { nom: "Ruban de délimitation" }, { nom: "Piquet" }, { nom: "Cône" }, { nom: "Cylindre" }, { nom: "Bâche" }] },
      { nom: "Equipements de soudure", enfants: [{ nom: "Ensemble cuir soudeur" }, { nom: "Gants cuir soudeur" }, { nom: "Casque soudure" }, { nom: "Masque de soudure" }, { nom: "Lunettes meulage-soudage" }, { nom: "Tablier de soudure" }] },
      {
        nom: "Outillage isolant",
        enfants: [
          { nom: "Clés à molette" },
          { nom: "Clés à pipe isolées" },
          { nom: "Clés plates isolées" },
          { nom: "Clés polygonales contre-coudées isolées" },
          { nom: "Couteau" },
          { nom: "Monture de scie" },
          { nom: "Pinces" },
          { nom: "Tournevis" },
          { nom: "Rangement" },
          { nom: "Autre outillage isolant" },
        ],
      },
      { nom: "Autres EPC", enfants: [{ nom: "Équipement antichute collectif" }, { nom: "Outillage et accessoires partagés" }] },
    ],
  },

  // ==========================================================================
  // LCI (Lutte Contre l'Incendie)
  // ==========================================================================
  {
    nom: "LCI",
    enfants: [
      { nom: "Extincteurs", reglementaire: true, enfants: [{ nom: "Extincteur à poudre" }, { nom: "Extincteur à CO2" }, { nom: "Extincteur à eau" }] },
      { nom: "RIA", reglementaire: true, enfants: [{ nom: "Robinet d'incendie armé" }] },
      { nom: "Bouches incendie", reglementaire: true, enfants: [{ nom: "Bouche incendie" }] },
      { nom: "Poteaux incendie", reglementaire: true, enfants: [{ nom: "Poteau incendie" }] },
      { nom: "Vêtements de feu", enfants: [{ nom: "Vêtement d'approche feu" }] },
      { nom: "Protection incendie", enfants: [{ nom: "Seau d'incendie" }, { nom: "Bac à sable" }, { nom: "Pelle pour bac à sable" }] },
    ],
  },

  // ==========================================================================
  // Appareils de levage — arborescence complète fournie, toute la branche est
  // soumise au contrôle règlementaire (y compris les accessoires de levage).
  // ==========================================================================
  {
    nom: "Appareils de levage",
    reglementaire: true,
    enfants: [
      {
        nom: "Appareils de levage de charges",
        enfants: [
          {
            nom: "Grues",
            enfants: [
              { nom: "Grue à tour" }, { nom: "Grue mobile" }, { nom: "Grue automotrice" }, { nom: "Grue sur camion" },
              { nom: "Grue auxiliaire de chargement" }, { nom: "Grue sur chenilles" }, { nom: "Grue d'atelier" }, { nom: "Mini-grue" },
            ],
          },
          {
            nom: "Ponts et structures de levage",
            enfants: [
              { nom: "Pont roulant monopoutre" }, { nom: "Pont roulant bipoutre" }, { nom: "Pont roulant suspendu" },
              { nom: "Portique" }, { nom: "Semi-portique" }, { nom: "Potence murale" }, { nom: "Potence sur fût" }, { nom: "Potence articulée" },
            ],
          },
          {
            nom: "Appareils suspendus",
            enfants: [{ nom: "Palan électrique" }, { nom: "Palan manuel" }, { nom: "Treuil électrique" }, { nom: "Treuil manuel" }, { nom: "Moufle" }],
          },
          {
            nom: "Chariots de levage",
            enfants: [{ nom: "Chariot élévateur frontal" }, { nom: "Chariot télescopique" }, { nom: "Reach Stacker" }, { nom: "Gerbeur" }, { nom: "Transpalette électrique" }],
          },
          {
            nom: "Engins de chantier utilisés en levage",
            enfants: [{ nom: "Pelle équipée pour levage" }, { nom: "Chargeuse équipée pour levage" }],
          },
        ],
      },
      {
        nom: "Appareils d'élévation des personnes",
        enfants: [
          {
            nom: "PEMP",
            enfants: [{ nom: "Nacelle à ciseaux" }, { nom: "Nacelle articulée" }, { nom: "Nacelle télescopique" }, { nom: "Nacelle sur camion" }, { nom: "Nacelle automotrice" }],
          },
          {
            nom: "Plates-formes fixes",
            enfants: [{ nom: "Plateforme élévatrice verticale" }, { nom: "Plateforme de travail suspendue" }, { nom: "Plateforme de maintenance" }, { nom: "Ascenseur" }],
          },
        ],
      },
      {
        nom: "Appareils de manutention verticale",
        enfants: [
          { nom: "Monte-matériaux", enfants: [{ nom: "Monte-matériaux de chantier" }, { nom: "Monte-charge industriel" }] },
          { nom: "Hayons", enfants: [{ nom: "Hayon élévateur" }, { nom: "Hayon rabattable" }, { nom: "Hayon rétractable" }] },
        ],
      },
      {
        nom: "Accessoires de levage",
        enfants: [
          { nom: "Élingues", enfants: [{ nom: "Chaîne" }, { nom: "Câble" }, { nom: "Textile" }, { nom: "Ronde" }] },
          { nom: "Organes d'accrochage", enfants: [{ nom: "Crochet" }, { nom: "Anneau" }, { nom: "Maille" }, { nom: "Manille" }] },
          { nom: "Organes de liaison", enfants: [{ nom: "Émerillon" }, { nom: "Maillon rapide" }, { nom: "Connecteur" }] },
          { nom: "Organes de préhension", enfants: [{ nom: "Palonnier" }, { nom: "Pince de levage" }, { nom: "Grappin" }] },
        ],
      },
    ],
  },

  // ==========================================================================
  // Appareils sous pression — extensible (chaudières/vapeur/autoclaves à venir)
  // ==========================================================================
  {
    nom: "Appareils sous pression",
    reglementaire: true,
    enfants: [
      {
        nom: "Appareils à pression de gaz",
        enfants: [
          { nom: "Réservoirs d'air comprimé" }, { nom: "Réservoirs d'azote" }, { nom: "Réservoirs d'oxygène" },
          { nom: "Réservoirs d'hydrogène" }, { nom: "Réservoirs de CO₂" }, { nom: "Réservoirs GPL" },
          { nom: "Réservoirs d'acétylène" }, { nom: "Séparateurs sous pression" }, { nom: "Ballons sous pression" },
          { nom: "Réservoirs de gaz liquéfiés" }, { nom: "Autres réservoirs sous pression" },
        ],
      },
    ],
  },

  // ==========================================================================
  // Vêtements de travail
  // ==========================================================================
  {
    nom: "Vêtements de travail",
    enfants: [
      { nom: "Tenues de travail", enfants: [{ nom: "Ensemble Jean" }, { nom: "Tenue (blouse+pantalon)" }, { nom: "Combinaison de travail" }] },
      { nom: "Vêtements haute visibilité", enfants: [{ nom: "Gilet haute visibilité" }, { nom: "Veste haute visibilité" }, { nom: "Ensemble haute visibilité" }] },
      { nom: "Vêtements de protection contre les intempéries", enfants: [{ nom: "K-way" }, { nom: "Parka" }] },
      { nom: "Hauts", enfants: [{ nom: "Blouse blanche" }, { nom: "T-shirt coton" }, { nom: "Polo manches courtes" }, { nom: "Polo manches longues" }] },
      { nom: "Coiffes", enfants: [{ nom: "Casquette" }] },
      { nom: "Autres vêtements", enfants: [{ nom: "Combinaison jetable" }] },
    ],
  },
];
