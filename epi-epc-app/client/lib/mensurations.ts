// Clés de mensuration standard proposées à la saisie (cahier des charges §12).
// La table agent_mensurations n'impose aucune clé fixe — toute mensuration
// hors de cette liste peut être ajoutée librement via le champ "autre".
export interface MensurationKeyDef {
  cle: string;
  label: string;
  unite?: string;
}

export const MENSURATION_KEYS: MensurationKeyDef[] = [
  { cle: "pointure_chaussures", label: "Pointure chaussures" },
  { cle: "pointure_bottes", label: "Pointure bottes" },
  { cle: "taille_pantalon", label: "Taille pantalon" },
  { cle: "taille_veste", label: "Taille veste" },
  { cle: "taille_combinaison", label: "Taille combinaison" },
  { cle: "taille_gants", label: "Taille gants" },
  { cle: "taille_casque", label: "Taille casque" },
  { cle: "tour_de_tete", label: "Tour de tête", unite: "cm" },
  { cle: "taille_harnais", label: "Taille harnais" },
  { cle: "taille_masque_respiratoire", label: "Taille masque respiratoire" },
];

export function mensurationLabel(cle: string): string {
  return MENSURATION_KEYS.find((k) => k.cle === cle)?.label ?? cle;
}
