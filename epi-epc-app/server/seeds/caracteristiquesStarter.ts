/**
 * Jeu de départ d'exemples de caractéristiques techniques, par désignation d'article de
 * référence — données GÉNÉRIQUES à titre d'exemple (connaissances générales du domaine, non
 * issues d'une fiche constructeur vérifiée). À corriger/compléter réellement via l'interface
 * une fois les fiches techniques réelles disponibles. Couvre volontairement un sous-ensemble
 * représentatif (quelques références), pas l'intégralité du catalogue — sert à prouver le
 * mécanisme des caractéristiques dynamiques, pas à faire autorité sur les spécifications.
 */
export interface CaracteristiqueStarter {
  cle: string;
  valeur: string;
  unite?: string;
}

export const CARACTERISTIQUES_STARTER: Record<string, CaracteristiqueStarter[]> = {
  "Casque électricien": [
    { cle: "Norme", valeur: "EN 397 / EN 50365" },
    { cle: "Classe d'isolement électrique", valeur: "0 (jusqu'à 1000V AC)" },
    { cle: "Matériau de la coque", valeur: "ABS" },
  ],
  "Extincteur à poudre": [
    { cle: "Capacité", valeur: "6", unite: "kg" },
    { cle: "Classe de feu", valeur: "ABC" },
    { cle: "Pression de service", valeur: "15", unite: "bar" },
  ],
  "Pont roulant bipoutre": [
    { cle: "Capacité de levage", valeur: "10", unite: "t" },
    { cle: "Portée", valeur: "18", unite: "m" },
    { cle: "Périodicité de réépreuve", valeur: "12", unite: "mois" },
  ],
  Harnais: [
    { cle: "Norme", valeur: "EN 361" },
    { cle: "Points d'accrochage", valeur: "2 (dorsal + sternal)" },
    { cle: "Charge maximale d'utilisation", valeur: "150", unite: "kg" },
  ],
  "Gants isolants BT": [
    { cle: "Norme", valeur: "EN 60903" },
    { cle: "Classe", valeur: "00 (jusqu'à 500V AC)" },
    { cle: "Longueur", valeur: "360", unite: "mm" },
  ],
  "Perche à douille": [
    { cle: "Tension d'isolement", valeur: "20", unite: "kV" },
    { cle: "Longueur dépliée", valeur: "3", unite: "m" },
    { cle: "Matériau", valeur: "Fibre de verre époxy" },
  ],
  "Réservoirs d'air comprimé": [
    { cle: "Pression maximale de service (PS)", valeur: "11", unite: "bar" },
    { cle: "Volume", valeur: "500", unite: "L" },
    { cle: "Périodicité de réépreuve", valeur: "10", unite: "ans" },
  ],
};
