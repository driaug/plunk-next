import type {Contact, Email, Project, Prisma} from '@repo/db';
import {EmailSourceType, EmailStatus} from '@repo/db';

import {DASHBOARD_URI} from '../app/constants.js';
import {prisma} from '../database/prisma.js';
import {HttpException} from '../exceptions/index.js';

import {QueueService} from './QueueService.js';
import {sendRawEmail} from './SESService.js';

interface SendEmailParams {
  projectId: string;
  contactId: string;
  subject: string;
  body: string;
  from: string;
  replyTo?: string;
  templateId?: string;
  campaignId?: string;
  workflowExecutionId?: string;
  workflowStepExecutionId?: string;
}

/**
 * Email Service
 * Handles sending emails and tracking delivery
 */
export class EmailService {
  /**
   * Send a transactional email via API
   */
  public static async sendTransactionalEmail(params: SendEmailParams): Promise<Email> {
    const email = await prisma.email.create({
      data: {
        projectId: params.projectId,
        contactId: params.contactId,
        subject: params.subject,
        body: params.body,
        from: params.from,
        replyTo: params.replyTo,
        sourceType: EmailSourceType.TRANSACTIONAL,
        templateId: params.templateId,
        status: EmailStatus.PENDING,
      },
    });

    // Queue email for sending
    await this.queueEmail(email.id);

    return email;
  }

  /**
   * Send a campaign email
   */
  public static async sendCampaignEmail(params: SendEmailParams): Promise<Email> {
    // Check if template is transactional to determine source type
    let sourceType: EmailSourceType = EmailSourceType.CAMPAIGN;

    if (params.templateId) {
      const template = await prisma.template.findUnique({
        where: {id: params.templateId},
        select: {type: true},
      });

      // If template is marked as TRANSACTIONAL, use TRANSACTIONAL sourceType
      // This ensures unsubscribe footer is not added to transactional emails
      if (template?.type === 'TRANSACTIONAL') {
        sourceType = EmailSourceType.TRANSACTIONAL;
      }
    }

    const email = await prisma.email.create({
      data: {
        projectId: params.projectId,
        contactId: params.contactId,
        subject: params.subject,
        body: params.body,
        from: params.from,
        replyTo: params.replyTo,
        sourceType,
        templateId: params.templateId,
        campaignId: params.campaignId,
        status: EmailStatus.PENDING,
      },
    });

    // Queue email for sending
    await this.queueEmail(email.id);

    return email;
  }

  /**
   * Send a workflow email
   */
  public static async sendWorkflowEmail(params: SendEmailParams): Promise<Email> {
    // Check if template is transactional to determine source type
    let sourceType: EmailSourceType = EmailSourceType.WORKFLOW;

    if (params.templateId) {
      const template = await prisma.template.findUnique({
        where: {id: params.templateId},
        select: {type: true},
      });

      // If template is marked as TRANSACTIONAL, use TRANSACTIONAL sourceType
      // This ensures unsubscribe footer is not added to transactional emails
      if (template?.type === 'TRANSACTIONAL') {
        sourceType = EmailSourceType.TRANSACTIONAL;
      }
    }

    const email = await prisma.email.create({
      data: {
        projectId: params.projectId,
        contactId: params.contactId,
        subject: params.subject,
        body: params.body,
        from: params.from,
        replyTo: params.replyTo,
        sourceType,
        templateId: params.templateId,
        workflowExecutionId: params.workflowExecutionId,
        workflowStepExecutionId: params.workflowStepExecutionId,
        status: EmailStatus.PENDING,
      },
    });

    // Queue email for sending
    await this.queueEmail(email.id);

    return email;
  }

  /**
   * Actually send the email via AWS SES
   * This is called by the email processor worker
   */
  public static async sendEmail(emailId: string): Promise<void> {
    const email = await prisma.email.findUnique({
      where: {id: emailId},
      include: {
        contact: true,
        project: true,
      },
    });

    if (!email) {
      throw new HttpException(404, 'Email not found');
    }

    if (email.status !== EmailStatus.PENDING) {
      return; // Already processed
    }

    try {
      // Update status to sending
      await prisma.email.update({
        where: {id: emailId},
        data: {status: EmailStatus.SENDING},
      });

      // Format template variables in subject and body
      const contactData = (email.contact.data as any) || {};
      const formattedEmail = this.format({
        subject: email.subject,
        body: email.body,
        data: {
          email: email.contact.email,
          ...contactData,
        },
      });

      // Compile HTML with unsubscribe footer and badge
      const compiledHtml = this.compile({
        content: formattedEmail.body,
        contact: email.contact,
        project: email.project,
        includeUnsubscribe: email.sourceType !== EmailSourceType.TRANSACTIONAL, // Don't add unsubscribe to transactional emails
      });

      // Parse from email (format: "Name <email@domain.com>" or just "email@domain.com")
      const fromMatch = /(.*?)<(.+?)>/.exec(email.from) || [null, email.from, email.from];
      const fromName = fromMatch[1]?.trim() || email.project.name;
      const fromEmail = fromMatch[2]?.trim() || email.from;

      console.log(`[EMAIL] Sending to ${email.contact.email}: ${formattedEmail.subject}`);

      // Send via AWS SES
      const result = await sendRawEmail({
        from: {
          name: fromName,
          email: fromEmail,
        },
        to: [email.contact.email],
        content: {
          subject: formattedEmail.subject,
          html: compiledHtml,
        },
        reply: email.replyTo || undefined,
        tracking: true, // Enable tracking for all emails
      });

      // Mark as sent with SES message ID
      await prisma.email.update({
        where: {id: emailId},
        data: {
          status: EmailStatus.SENT,
          sentAt: new Date(),
          messageId: result.messageId,
        },
      });

      // Track event
      await prisma.event.create({
        data: {
          projectId: email.projectId,
          contactId: email.contactId,
          emailId: email.id,
          name: 'email.sent',
          data: {
            subject: formattedEmail.subject,
            from: email.from,
            messageId: result.messageId,
          },
        },
      });

      console.log(`[EMAIL] Successfully sent email ${emailId} (SES Message ID: ${result.messageId})`);
    } catch (error) {
      console.error(`[EMAIL] Failed to send email ${emailId}:`, error);

      // Mark as failed
      await prisma.email.update({
        where: {id: emailId},
        data: {
          status: EmailStatus.FAILED,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      throw error;
    }
  }

  /**
   * Process email webhook events (opens, clicks, bounces, etc.)
   * This would be called by webhook endpoints from your email provider
   */
  public static async handleWebhookEvent(
    emailId: string,
    eventType: 'opened' | 'clicked' | 'bounced' | 'complained' | 'delivered',
    metadata?: any,
  ): Promise<void> {
    const email = await prisma.email.findUnique({
      where: {id: emailId},
    });

    if (!email) {
      throw new HttpException(404, 'Email not found');
    }

    const now = new Date();
    const updateData: Prisma.EmailUpdateInput = {};

    switch (eventType) {
      case 'delivered':
        updateData.status = EmailStatus.DELIVERED;
        updateData.deliveredAt = now;
        break;

      case 'opened':
        if (!email.openedAt) {
          updateData.openedAt = now;
        }
        updateData.opens = (email.opens || 0) + 1;
        updateData.status = EmailStatus.OPENED;
        break;

      case 'clicked':
        if (!email.clickedAt) {
          updateData.clickedAt = now;
        }
        updateData.clicks = (email.clicks || 0) + 1;
        updateData.status = EmailStatus.CLICKED;
        break;

      case 'bounced':
        updateData.status = EmailStatus.BOUNCED;
        updateData.bouncedAt = now;
        break;

      case 'complained':
        updateData.status = EmailStatus.COMPLAINED;
        updateData.complainedAt = now;
        // Unsubscribe contact
        if (email.contactId) {
          await prisma.contact.update({
            where: {id: email.contactId},
            data: {subscribed: false},
          });
        }
        break;
    }

    await prisma.email.update({
      where: {id: emailId},
      data: updateData,
    });

    // Track event
    await prisma.event.create({
      data: {
        projectId: email.projectId,
        contactId: email.contactId,
        emailId: email.id,
        name: `email.${eventType}`,
        data: metadata || undefined,
      },
    });

    console.log(`[EMAIL] Processed ${eventType} event for email ${emailId}`);
  }

  /**
   * Get email statistics for a project
   */
  public static async getStats(projectId: string, startDate?: Date, endDate?: Date) {
    const where: Prisma.EmailWhereInput = {
      projectId,
      ...(startDate || endDate
        ? {
            createdAt: {
              ...(startDate ? {gte: startDate} : {}),
              ...(endDate ? {lte: endDate} : {}),
            },
          }
        : {}),
    };

    const [total, sent, delivered, opened, clicked, bounced, failed] = await Promise.all([
      prisma.email.count({where}),
      prisma.email.count({where: {...where, status: EmailStatus.SENT}}),
      prisma.email.count({where: {...where, status: EmailStatus.DELIVERED}}),
      prisma.email.count({where: {...where, status: EmailStatus.OPENED}}),
      prisma.email.count({where: {...where, status: EmailStatus.CLICKED}}),
      prisma.email.count({where: {...where, status: EmailStatus.BOUNCED}}),
      prisma.email.count({where: {...where, status: EmailStatus.FAILED}}),
    ]);

    return {
      total,
      sent,
      delivered,
      opened,
      clicked,
      bounced,
      failed,
      openRate: sent > 0 ? (opened / sent) * 100 : 0,
      clickRate: sent > 0 ? (clicked / sent) * 100 : 0,
      bounceRate: sent > 0 ? (bounced / sent) * 100 : 0,
    };
  }

  /**
   * Format email template by replacing variables in subject and body
   * Supports {{variable}} and {{variable ?? defaultValue}} syntax
   */
  public static format({subject, body, data}: {subject: string; body: string; data: any}): {
    subject: string;
    body: string;
  } {
    const replaceVariables = (text: string) => {
      return text.replace(/\{\{(.*?)\}\}/g, (match, key) => {
        const [mainKey, defaultValue] = key.split('??').map((s: string) => s.trim());

        // Handle array values (for lists)
        if (Array.isArray(data[mainKey])) {
          return data[mainKey].map((e: string) => `<li>${e}</li>`).join('\n');
        }

        return data[mainKey] ?? defaultValue ?? '';
      });
    };

    return {
      subject: replaceVariables(subject),
      body: replaceVariables(body),
    };
  }

  /**
   * Compile HTML email with optional unsubscribe footer and badge
   * Adds unsubscribe link and Plunk badge for free tier users
   */
  public static compile({
    content,
    contact,
    project,
    includeUnsubscribe = true,
  }: {
    content: string;
    contact: Contact;
    project: Project;
    includeUnsubscribe?: boolean;
  }): string {
    let html = content;

    // Build unsubscribe footer if enabled
    const unsubscribeHtml = includeUnsubscribe
      ? `<table align="center" width="100%" style="max-width: 480px; width: 100%; margin-left: auto; margin-right: auto; font-family: Inter, ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'; border: 0; cellpadding: 0; cellspacing: 0;" role="presentation">
          <tbody>
            <tr>
              <td>
                <hr style="border: none; border-top: 1px solid #eaeaea; width: 100%; margin-top: 12px; margin-bottom: 12px;">
                <p style="font-size: 12px; line-height: 24px; margin: 16px 0; text-align: center; color: rgb(64, 64, 64);">
                  You received this email because you agreed to receive emails from ${project.name}. If you no longer wish to receive emails like this, please
                  <a href="${DASHBOARD_URI}/unsubscribe/${contact.id}">update your preferences</a>.
                </p>
              </td>
            </tr>
          </tbody>
        </table>`
      : '';

    // Add Plunk badge if project has no subscription (free tier)
    const badgeHtml =
      project.subscription === null
        ? `<table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;">
          <tbody>
            <tr>
              <td style="direction:ltr;font-size:0px;padding:20px 0;text-align:center;">
                <div class="mj-column-per-100 mj-outlook-group-fix" style="font-size:0px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:100%;">
                  <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="vertical-align:top;" width="100%">
                    <tbody>
                      <tr>
                        <td align="center" style="font-size:0px;padding:10px 25px;word-break:break-word;">
                          <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;border-spacing:0px;">
                            <tbody>
                              <tr>
                                <td style="width:180px;">
                                  <a href="https://www.useplunk.com?ref=badge" target="_blank">
                                    <img height="auto" src="https://cdn.useplunk.com/badge.png" style="border:0;display:block;outline:none;text-decoration:none;height:auto;width:100%;font-size:13px;" width="180" />
                                  </a>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </td>
            </tr>
          </tbody>
        </table>`
        : '';

    // Combine footer and badge
    const footerHtml = `${unsubscribeHtml}${badgeHtml}`;

    // Insert before closing body tag if it exists, otherwise append
    if (html.includes('</body>')) {
      html = html.replace('</body>', `${footerHtml}</body>`);
    } else {
      html = `${html}${footerHtml}`;
    }

    return html;
  }

  /**
   * Queue an email for sending
   * Adds email to the BullMQ queue for processing by workers
   */
  private static async queueEmail(emailId: string, delay?: number): Promise<void> {
    await QueueService.queueEmail(emailId, delay);
  }
}
