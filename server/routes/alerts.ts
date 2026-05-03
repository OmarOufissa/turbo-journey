/**
 * ALERTS API ROUTES
 * 
 * Endpoints for fetching alert data used by dashboard and notifications
 */

import { RequestHandler } from "express";
import {
  findExpiringHabilitations,
  generateExpirationReport,
  getEmployeeAlertStatus,
  getAlertStatistics,
  getEmployeesWithCriticalAlerts,
} from "../services/alertService";

// ============================================================================
// ALERT STATISTICS
// ============================================================================

/**
 * GET /api/alerts/statistics
 * Get summary of all alerts across the system
 */
export const getAlertStatistics_Handler: RequestHandler = async (_req, res) => {
  try {
    const stats = await getAlertStatistics();
    res.json(stats);
  } catch (err) {
    console.error("Error fetching alert statistics:", err);
    res.status(500).json({ message: "Error fetching alert statistics" });
  }
};

// ============================================================================
// EXPIRING HABILITATIONS
// ============================================================================

/**
 * GET /api/alerts/expiring
 * Get list of habilitations expiring within X days (default: 30)
 */
export const getExpiringHabilitations_Handler: RequestHandler = async (req, res) => {
  try {
    const { days = "30" } = req.query;
    const daysUntilExpiration = parseInt(days as string) || 30;

    if (daysUntilExpiration < 1 || daysUntilExpiration > 365) {
      return res.status(400).json({
        message: "Days parameter must be between 1 and 365",
      });
    }

    const habilitations = await findExpiringHabilitations(daysUntilExpiration);

    res.json({
      daysUntilExpiration,
      count: habilitations.length,
      habilitations,
    });
  } catch (err) {
    console.error("Error fetching expiring habilitations:", err);
    res.status(500).json({ message: "Error fetching expiring habilitations" });
  }
};

// ============================================================================
// EXPIRATION REPORT
// ============================================================================

/**
 * GET /api/alerts/report
 * Generate comprehensive expiration report for next 365 days
 */
export const getExpirationReport_Handler: RequestHandler = async (_req, res) => {
  try {
    const report = await generateExpirationReport();
    res.json(report);
  } catch (err) {
    console.error("Error generating expiration report:", err);
    res.status(500).json({ message: "Error generating expiration report" });
  }
};

// ============================================================================
// EMPLOYEE ALERT STATUS
// ============================================================================

/**
 * GET /api/alerts/employee/:empId
 * Get alert status for a specific employee
 */
export const getEmployeeAlertStatus_Handler: RequestHandler = async (req, res) => {
  try {
    const { empId } = req.params;
    const { days = "30" } = req.query;

    const employeeId = parseInt(empId);
    const daysUntilExpiration = parseInt(days as string) || 30;

    if (isNaN(employeeId)) {
      return res.status(400).json({ message: "Invalid employee ID" });
    }

    const status = await getEmployeeAlertStatus(employeeId, daysUntilExpiration);

    if (!status) {
      return res.status(404).json({ message: "Employee not found" });
    }

    res.json(status);
  } catch (err) {
    console.error("Error fetching employee alert status:", err);
    res.status(500).json({ message: "Error fetching employee alert status" });
  }
};

// ============================================================================
// CRITICAL ALERTS
// ============================================================================

/**
 * GET /api/alerts/critical
 * Get list of employees with critical alerts (expiring < 7 days)
 */
export const getCriticalAlerts_Handler: RequestHandler = async (_req, res) => {
  try {
    const employees = await getEmployeesWithCriticalAlerts();

    res.json({
      count: employees.length,
      employees,
    });
  } catch (err) {
    console.error("Error fetching critical alerts:", err);
    res.status(500).json({ message: "Error fetching critical alerts" });
  }
};

export default {
  getAlertStatistics_Handler,
  getExpiringHabilitations_Handler,
  getExpirationReport_Handler,
  getEmployeeAlertStatus_Handler,
  getCriticalAlerts_Handler,
};
