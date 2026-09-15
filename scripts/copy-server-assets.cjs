// Copy runtime server assets into dist/ for the packaged app.
const fs = require("fs");
const p = require("path");

function copy(src, dst) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(p.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  return true;
}

// Seed data (PDF template, Excel sources, bundled DB)
fs.mkdirSync("dist/server/seeds/data", { recursive: true });
copy("server/seeds/data/titre_HAE_vierge.pdf", "dist/server/seeds/data/titre_HAE_vierge.pdf");
copy("server/seeds/data/employees.xlsx", "dist/server/seeds/data/employees.xlsx");
copy("server/seeds/data/employees_tst.xlsx", "dist/server/seeds/data/employees_tst.xlsx");
copy("server/seeds/data/habilitations.seed.db", "dist/server/seeds/data/habilitations.seed.db");

// Seed PDFs
fs.mkdirSync("dist/server/seeds/pdfs", { recursive: true });
if (fs.existsSync("server/seeds/pdfs")) {
  for (const f of fs.readdirSync("server/seeds/pdfs")) {
    if (f.endsWith(".pdf")) copy(p.join("server/seeds/pdfs", f), p.join("dist/server/seeds/pdfs", f));
  }
}

// Word templates for the "Demande d'habilitation" module
if (fs.existsSync("server/templates")) {
  for (const f of fs.readdirSync("server/templates")) {
    if (f.endsWith(".docx")) copy(p.join("server/templates", f), p.join("dist/server/templates", f));
  }
}

console.log("Server assets copied to dist/");
