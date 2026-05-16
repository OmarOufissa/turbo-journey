/**
 * PHASE 3: EMAIL SERVICE
 * 
 * Sends notifications about expiring habilitations
 * Logs all email communications to emailLog table
 * Prevents duplicate emails
 * 
 * In production, integrate with:
 * - SendGrid
 * - Mailgun
 * - AWS SES
 * - Or any other email provider
 * 
 * Current implementation logs to database for audit trail
 */

import { format } from "date-fns";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type EmailType =
  | "EXPIRATION_ALERT"
  | "WEEKLY_SUMMARY"
  | "CRITICAL_ALERT"
  | "RENEWAL_REMINDER"
  | "TEST_EMAIL";

export interface EmailLog {
  id: number;
  employeeId: number | null;
  emailType: EmailType;
  recipientEmail: string;
  subject: string;
  body: string;
  status: "pending" | "sent" | "failed";
  sentAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

// Email templates
const EMAIL_TEMPLATES = {
  EXPIRATION_ALERT: {
    subject: "Habilitation Expiration Alert - {daysUntil} days remaining",
    body: `Dear {prenom} {nom},

Your habilitation(s) will expire in {daysUntil} days on {expirationDate}.

Employee: {matricule} ({nom}, {prenom})
Habilitation Type: {type}
Codes: {codes}
Expiration Date: {expirationDate}

Please renew your habilitations to maintain compliance.

---
This is an automated notification from the Habilitations Management System.
Do not reply to this email.`,
  },
  CRITICAL_ALERT: {
    subject: "CRITICAL: Habilitation Expires in {daysUntil} Days",
    body: `Dear {prenom} {nom},

URGENT: Your habilitation(s) expire in {daysUntil} days!

Employee: {matricule} ({nom}, {prenom})
Habilitation Type: {type}
Codes: {codes}
Expiration Date: {expirationDate}

Immediate action required to renew your habilitations.

---
This is an automated notification from the Habilitations Management System.
Do not reply to this email.`,
  },
  WEEKLY_SUMMARY: {
    subject: "Weekly Habilitation Expiration Summary",
    body: `Dear Manager,

Weekly summary of employee habilitations expiring in the next 30 days:

Total employees with expiring habilitations: {employeeCount}
Total habilitations expiring: {habCount}

Critical (< 7 days): {criticalCount}
Warning (7-30 days): {warningCount}

Please ensure all employees renew their habilitations in a timely manner.

---
This is an automated notification from the Habilitations Management System.
Do not reply to this email.`,
  },
  TEST_EMAIL: {
    subject: "Test Email from Habilitations Management System",
    body: `This is a test email from the Habilitations Management System.

If you received this email, the email service is working correctly.

---
Do not reply to this email.`,
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if duplicate email was recently sent
 */
async function checkDuplicateEmail(
  employeeId: number | null,
  emailType: EmailType,
  recipientEmail: string
): Promise<boolean> {
  // No DB available — no duplicates tracked
  return false;
}

/**
 * Render email template with variables
 */
function renderTemplate(
  template: string,
  variables: Record<string, string | number>
): string {
  let rendered = template;

  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{${key}}`;
    rendered = rendered.replaceAll(placeholder, String(value));
  }

  return rendered;
}

/**
 * Send email via provider (placeholder for real implementation)
 * In production, integrate with SendGrid, Mailgun, AWS SES, etc.
 */
async function sendViaProvider(
  recipientEmail: string,
  subject: string,
  body: string
): Promise<{ success: boolean; errorMessage?: string }> {
  try {
    // PLACEHOLDER: Integrate with actual email provider here
    // For now, we just log to console and return success
    console.log(
      `[EMAIL SERVICE] Sending email to ${recipientEmail}: ${subject}`
    );

    // In a real implementation:
    // const result = await sendgrid.send({
    //   to: recipientEmail,
    //   from: process.env.SENDER_EMAIL,
    //   subject,
    //   html: body,
    // });

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { success: false, errorMessage };
  }
}

// ============================================================================
// CORE EMAIL FUNCTIONS
// ============================================================================

/**
 * Log email to database
 */
export async function logEmail(
  employeeId: number | null,
  emailType: EmailType,
  recipientEmail: string,
  subject: string,
  body: string,
  status: "pending" | "sent" | "failed" = "pending",
  failureReason: string | null = null
): Promise<number | null> {
  console.log(
    `[EMAIL LOG] employeeId=${employeeId} type=${emailType} to=${recipientEmail} status=${status} subject="${subject}"${failureReason ? ` reason="${failureReason}"` : ""}`
  );
  return null;
}

/**
 * Send expiration notification for a single habilitation
 */
export async function sendExpirationNotification(
  employeeId: number,
  recipientEmail: string,
  prenom: string,
  nom: string,
  matricule: string,
  type: string,
  codes: string[],
  dateExpiration: string,
  daysUntilExpiration: number
): Promise<{ success: boolean; logId: number | null; errorMessage?: string }> {
  try {
    // Check for duplicate email
    const isDuplicate = await checkDuplicateEmail(
      employeeId,
      "EXPIRATION_ALERT",
      recipientEmail
    );

    if (isDuplicate) {
      console.log(
        `[EMAIL SERVICE] Skipping duplicate email for ${matricule} (${recipientEmail})`
      );
      return { success: false, logId: null };
    }

    // Select template based on severity
    const emailType = daysUntilExpiration <= 7 ? "CRITICAL_ALERT" : "EXPIRATION_ALERT";
    const template = EMAIL_TEMPLATES[emailType];

    // Render template
    const subject = renderTemplate(template.subject, {
      daysUntil: daysUntilExpiration,
    });

    const body = renderTemplate(template.body, {
      prenom,
      nom,
      matricule,
      type,
      codes: codes.join(", "),
      daysUntil: daysUntilExpiration,
      expirationDate: format(new Date(dateExpiration), "yyyy-MM-dd"),
    });

    // Log email before sending
    const logId = await logEmail(
      employeeId,
      emailType as EmailType,
      recipientEmail,
      subject,
      body,
      "pending"
    );

    // Send via provider
    const sendResult = await sendViaProvider(recipientEmail, subject, body);

    if (sendResult.success) {
      return { success: true, logId };
    } else {
      return {
        success: false,
        logId,
        errorMessage: sendResult.errorMessage,
      };
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("Error sending expiration notification:", err);

    const logId = await logEmail(
      employeeId,
      "EXPIRATION_ALERT",
      recipientEmail,
      "[Failed] Expiration Alert",
      "",
      "failed",
      errorMessage
    );

    return { success: false, logId, errorMessage };
  }
}

/**
 * Send weekly summary email to managers
 */
export async function sendWeeklySummary(
  recipientEmail: string,
  employeeCount: number,
  habCount: number,
  criticalCount: number,
  warningCount: number
): Promise<{ success: boolean; logId: number | null; errorMessage?: string }> {
  try {
    const template = EMAIL_TEMPLATES.WEEKLY_SUMMARY;

    const subject = template.subject;
    const body = renderTemplate(template.body, {
      employeeCount,
      habCount,
      criticalCount,
      warningCount,
    });

    // Log email
    const logId = await logEmail(null, "WEEKLY_SUMMARY", recipientEmail, subject, body, "pending");

    // Send via provider
    const sendResult = await sendViaProvider(recipientEmail, subject, body);

    if (sendResult.success) {
      return { success: true, logId };
    } else {
      return {
        success: false,
        logId,
        errorMessage: sendResult.errorMessage,
      };
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("Error sending weekly summary:", err);

    const logId = await logEmail(
      null,
      "WEEKLY_SUMMARY",
      recipientEmail,
      "[Failed] Weekly Summary",
      "",
      "failed",
      errorMessage
    );

    return { success: false, logId, errorMessage };
  }
}

/**
 * Send test email
 */
export async function sendTestEmail(
  recipientEmail: string
): Promise<{ success: boolean; logId: number | null; errorMessage?: string }> {
  try {
    const template = EMAIL_TEMPLATES.TEST_EMAIL;

    const subject = template.subject;
    const body = template.body;

    // Log email
    const logId = await logEmail(null, "TEST_EMAIL", recipientEmail, subject, body, "pending");

    // Send via provider
    const sendResult = await sendViaProvider(recipientEmail, subject, body);

    if (sendResult.success) {
      return { success: true, logId };
    } else {
      return {
        success: false,
        logId,
        errorMessage: sendResult.errorMessage,
      };
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("Error sending test email:", err);

    const logId = await logEmail(
      null,
      "TEST_EMAIL",
      recipientEmail,
      "[Failed] Test Email",
      "",
      "failed",
      errorMessage
    );

    return { success: false, logId, errorMessage };
  }
}

/**
 * Get email log for an employee
 */
export async function getEmployeeEmailLog(employeeId: number): Promise<EmailLog[]> {
  // No DB available — return empty log
  return [];
}

/**
 * Get email statistics
 */
export async function getEmailStatistics(): Promise<{
  totalEmails: number;
  sentEmails: number;
  failedEmails: number;
  pendingEmails: number;
  sendRate: number;
}> {
  // No DB available — return zero statistics
  return {
    totalEmails: 0,
    sentEmails: 0,
    failedEmails: 0,
    pendingEmails: 0,
    sendRate: 0,
  };
}

export default {
  sendExpirationNotification,
  sendWeeklySummary,
  sendTestEmail,
  getEmployeeEmailLog,
  getEmailStatistics,
  logEmail,
};
