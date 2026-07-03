// Isole les tests dans une base SQLite en mémoire, distincte de la base de
// développement (./data/gepi.db) — jamais de dépendance entre tests et
// données réelles chargées localement.
process.env.DATABASE_FILE = ":memory:";
