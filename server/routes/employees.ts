import { RequestHandler } from "express";
import { dbRun, dbGet, dbAll } from "../db";
import { addYears, addMonths, format } from "date-fns";
import { authMiddleware } from "./auth";

export { authMiddleware };

interface CreateEmployeeRequest {
  matricule: string;
  prenom: string;
  nom: string;
  division_id: number;
  service_id: number;
  equipe_id: number;
  habilitations?: Array<{
    type: "HT" | "ST";
    codes: string[];
    numero: string;
    dateValidation: string;
  }>;
}

interface Employee {
  id: number;
  matricule: string;
  prenom: string;
  nom: string;
  division_id: number;
  service_id: number;
  equipe_id: number;
  created_at: string;
  updated_at: string;
}

interface EmployeeResponse extends Employee {
  division: string;
  service: string;
  equipe: string;
}

interface Habilitation {
  id: number;
  employee_id: number;
  type: "HT" | "ST";
  codes: string;
  numero: string | null;
  date_validation: string;
  date_expiration: string;
  pdf_path: string | null;
  created_at: string;
  updated_at: string;
}

function calculateExpiration(dateValidation: string, type: "HT" | "ST"): string {
  const date = new Date(dateValidation);
  const expirationDate =
    type === "HT" ? addYears(date, 3) : addMonths(date, 12);
  return format(expirationDate, "yyyy-MM-dd");
}

export const getEmployees: RequestHandler = (_req, res) => {
  try {
    const employees = dbAll(
      `SELECT e.*, d.name as division, s.name as service, eq.name as equipe
       FROM employees e
       LEFT JOIN divisions d ON e.division_id = d.id
       LEFT JOIN services s ON e.service_id = s.id
       LEFT JOIN equipes eq ON e.equipe_id = eq.id
       ORDER BY e.matricule`
    ) as EmployeeResponse[];

    const result = employees.map((employee) => {
      const habilitations = dbAll(
        `SELECT * FROM habilitations WHERE employee_id = ? ORDER BY type`,
        [employee.id]
      ) as Habilitation[];

      return {
        ...employee,
        habilitations: habilitations.map((h) => ({
          ...h,
          codes: JSON.parse(h.codes),
        })),
      };
    });

    res.json(result);
  } catch (err) {
    console.error("Error fetching employees:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

export const getEmployee: RequestHandler = (req, res) => {
  try {
    const { id } = req.params;

    const employee = dbGet(
      `SELECT e.*, d.name as division, s.name as service, eq.name as equipe
       FROM employees e
       LEFT JOIN divisions d ON e.division_id = d.id
       LEFT JOIN services s ON e.service_id = s.id
       LEFT JOIN equipes eq ON e.equipe_id = eq.id
       WHERE e.id = ?`,
      [id]
    ) as EmployeeResponse | undefined;

    if (!employee) {
      return res.status(404).json({ message: "Employé non trouvé" });
    }

    const habilitations = dbAll(
      `SELECT * FROM habilitations WHERE employee_id = ? ORDER BY type`,
      [id]
    ) as Habilitation[];

    res.json({
      ...employee,
      habilitations: habilitations.map((h) => ({
        ...h,
        codes: JSON.parse(h.codes),
      })),
    });
  } catch (err) {
    console.error("Error fetching employee:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

export const createEmployee: RequestHandler = (req, res) => {
  try {
    const {
      matricule,
      prenom,
      nom,
      division_id,
      service_id,
      equipe_id,
      habilitations,
    } = req.body as CreateEmployeeRequest;

    if (!matricule || !prenom || !nom || !division_id || !service_id || !equipe_id) {
      return res.status(400).json({ message: "Champs requis manquants" });
    }

    if (!/^\d{5}$/.test(matricule)) {
      return res.status(400).json({
        message: "Le matricule doit être composé de 5 chiffres",
      });
    }

    // Check if matricule already exists
    const existing = dbGet(
      `SELECT id FROM employees WHERE matricule = ?`,
      [matricule]
    );
    if (existing) {
      return res
        .status(409)
        .json({ message: "Ce matricule existe déjà" });
    }

    const result = dbRun(
      `INSERT INTO employees (matricule, prenom, nom, division_id, service_id, equipe_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [matricule, prenom, nom, division_id, service_id, equipe_id]
    );

    const employeeId = (result as any).lastInsertRowid;

    if (habilitations && Array.isArray(habilitations)) {
      for (const hab of habilitations) {
        const expirationDate = calculateExpiration(
          hab.dateValidation,
          hab.type
        );
        dbRun(
          `INSERT INTO habilitations (employee_id, type, codes, numero, date_validation, date_expiration)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            employeeId,
            hab.type,
            JSON.stringify(hab.codes),
            hab.numero || null,
            hab.dateValidation,
            expirationDate,
          ]
        );
      }
    }

    const employee = dbGet(
      `SELECT e.*, d.name as division, s.name as service, eq.name as equipe
       FROM employees e
       LEFT JOIN divisions d ON e.division_id = d.id
       LEFT JOIN services s ON e.service_id = s.id
       LEFT JOIN equipes eq ON e.equipe_id = eq.id
       WHERE e.id = ?`,
      [employeeId]
    );

    res.status(201).json(employee);
  } catch (err) {
    console.error("Error creating employee:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

export const updateEmployee: RequestHandler = (req, res) => {
  try {
    const { id } = req.params;
    const {
      matricule,
      prenom,
      nom,
      division_id,
      service_id,
      equipe_id,
    } = req.body;

    if (!matricule || !prenom || !nom || !division_id || !service_id || !equipe_id) {
      return res.status(400).json({ message: "Champs requis manquants" });
    }

    if (!/^\d{5}$/.test(matricule)) {
      return res.status(400).json({
        message: "Le matricule doit être composé de 5 chiffres",
      });
    }

    // Check if another employee has this matricule
    const existing = dbGet(
      `SELECT id FROM employees WHERE matricule = ? AND id != ?`,
      [matricule, id]
    );
    if (existing) {
      return res
        .status(409)
        .json({ message: "Ce matricule existe déjà" });
    }

    dbRun(
      `UPDATE employees
       SET matricule = ?, prenom = ?, nom = ?, division_id = ?, service_id = ?, equipe_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [matricule, prenom, nom, division_id, service_id, equipe_id, id]
    );

    const employee = dbGet(
      `SELECT e.*, d.name as division, s.name as service, eq.name as equipe
       FROM employees e
       LEFT JOIN divisions d ON e.division_id = d.id
       LEFT JOIN services s ON e.service_id = s.id
       LEFT JOIN equipes eq ON e.equipe_id = eq.id
       WHERE e.id = ?`,
      [id]
    );

    res.json(employee);
  } catch (err) {
    console.error("Error updating employee:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

export const deleteEmployee: RequestHandler = (req, res) => {
  try {
    const { id } = req.params;

    const employee = dbGet(
      `SELECT id FROM employees WHERE id = ?`,
      [id]
    );
    if (!employee) {
      return res.status(404).json({ message: "Employé non trouvé" });
    }

    dbRun(`DELETE FROM employees WHERE id = ?`, [id]);

    res.json({ message: "Employé supprimé" });
  } catch (err) {
    console.error("Error deleting employee:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

// Organizational structure endpoints
export const getDivisions: RequestHandler = (_req, res) => {
  try {
    const divisions = dbAll(
      `SELECT id, name FROM divisions ORDER BY name`
    );
    res.json(divisions);
  } catch (err) {
    console.error("Error fetching divisions:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

export const getServicesByDivision: RequestHandler = (req, res) => {
  try {
    const { divisionId } = req.params;
    const services = dbAll(
      `SELECT id, name FROM services WHERE division_id = ? ORDER BY name`,
      [divisionId]
    );
    res.json(services);
  } catch (err) {
    console.error("Error fetching services:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

export const getEquipesByService: RequestHandler = (req, res) => {
  try {
    const { serviceId } = req.params;
    const equipes = dbAll(
      `SELECT id, name FROM equipes WHERE service_id = ? ORDER BY name`,
      [serviceId]
    );
    res.json(equipes);
  } catch (err) {
    console.error("Error fetching equipes:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

// Habilitation management
export const updateHabilitation: RequestHandler = (req, res) => {
  try {
    const { habId } = req.params;
    const { codes, numero, date_validation, date_expiration } = req.body;

    if (!codes || !Array.isArray(codes)) {
      return res.status(400).json({ message: "Codes d'habilitation requis" });
    }

    const hab = dbGet(
      `SELECT type FROM habilitations WHERE id = ?`,
      [habId]
    ) as Habilitation | undefined;

    if (!hab) {
      return res.status(404).json({ message: "Habilitation non trouvée" });
    }

    const expirationDate = date_expiration || calculateExpiration(date_validation, hab.type);

    dbRun(
      `UPDATE habilitations
       SET codes = ?, numero = ?, date_validation = ?, date_expiration = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [JSON.stringify(codes), numero || null, date_validation, expirationDate, habId]
    );

    const updated = dbGet(
      `SELECT * FROM habilitations WHERE id = ?`,
      [habId]
    ) as Habilitation;

    res.json({
      ...updated,
      codes: JSON.parse(updated.codes),
    });
  } catch (err) {
    console.error("Error updating habilitation:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

export const deleteHabilitation: RequestHandler = (req, res) => {
  try {
    const { habId } = req.params;

    const hab = dbGet(
      `SELECT id FROM habilitations WHERE id = ?`,
      [habId]
    );

    if (!hab) {
      return res.status(404).json({ message: "Habilitation non trouvée" });
    }

    dbRun(`DELETE FROM habilitations WHERE id = ?`, [habId]);

    res.json({ message: "Habilitation supprimée" });
  } catch (err) {
    console.error("Error deleting habilitation:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

export const createHabilitation: RequestHandler = (req, res) => {
  try {
    const { employee_id, type, codes, numero, date_validation } = req.body;

    if (!employee_id || !type || !codes || !date_validation) {
      return res.status(400).json({ message: "Données manquantes" });
    }

    if (!["HT", "ST"].includes(type)) {
      return res.status(400).json({ message: "Type d'habilitation invalide" });
    }

    // Check if employee exists
    const employee = dbGet(
      `SELECT id FROM employees WHERE id = ?`,
      [employee_id]
    );
    if (!employee) {
      return res.status(404).json({ message: "Employé non trouvé" });
    }

    const expirationDate = calculateExpiration(date_validation, type);

    const result = dbRun(
      `INSERT INTO habilitations (employee_id, type, codes, numero, date_validation, date_expiration, pdf_path)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        employee_id,
        type,
        JSON.stringify(Array.isArray(codes) ? codes : JSON.parse(codes)),
        numero || null,
        date_validation,
        expirationDate,
        null,
      ]
    );

    const habId = (result as any).lastInsertRowid;
    const hab = dbGet(
      `SELECT * FROM habilitations WHERE id = ?`,
      [habId]
    ) as Habilitation;

    res.status(201).json({
      ...hab,
      codes: JSON.parse(hab.codes),
    });
  } catch (err) {
    console.error("Error creating habilitation:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

export const batchDeleteHabilitations: RequestHandler = (req, res) => {
  try {
    const { habilitationIds } = req.body;

    if (!Array.isArray(habilitationIds) || habilitationIds.length === 0) {
      return res.status(400).json({ message: "Liste d'habilitations requise" });
    }

    const placeholders = habilitationIds.map(() => "?").join(",");
    const deleteQuery = `DELETE FROM habilitations WHERE id IN (${placeholders})`;

    dbRun(deleteQuery, habilitationIds);

    res.json({
      message: "Habilitations supprimées avec succès",
      deleted: habilitationIds.length,
    });
  } catch (err) {
    console.error("Error batch deleting habilitations:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

export const batchUpdateHabilitations: RequestHandler = (req, res) => {
  try {
    const { habilitationIds, codes, date_validation } = req.body;

    if (!Array.isArray(habilitationIds) || habilitationIds.length === 0) {
      return res.status(400).json({ message: "Liste d'habilitations requise" });
    }

    if (!codes || !Array.isArray(codes) || !date_validation) {
      return res.status(400).json({
        message: "Codes et date de validation requis",
      });
    }

    const updated = [];

    for (const habId of habilitationIds) {
      const hab = dbGet(
        `SELECT type FROM habilitations WHERE id = ?`,
        [habId]
      ) as Habilitation | undefined;

      if (hab) {
        const expirationDate = calculateExpiration(date_validation, hab.type);

        dbRun(
          `UPDATE habilitations
           SET codes = ?, date_validation = ?, date_expiration = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [JSON.stringify(codes), date_validation, expirationDate, habId]
        );

        const updatedHab = dbGet(
          `SELECT * FROM habilitations WHERE id = ?`,
          [habId]
        ) as Habilitation;

        updated.push({
          ...updatedHab,
          codes: JSON.parse(updatedHab.codes),
        });
      }
    }

    res.json({
      message: "Habilitations mises à jour avec succès",
      updated: updated.length,
      habilitations: updated,
    });
  } catch (err) {
    console.error("Error batch updating habilitations:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};
