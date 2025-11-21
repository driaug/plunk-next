/**
 * Background Job: Email Processor
 * Processes individual emails from the queue (for all sources: transactional, campaign, workflow)
 */

import type {Prisma} from '@repo/db';
import {EmailSourceType, EmailStatus} from '@repo/db';
import {type Job, Worker} from 'bullmq';

import {prisma} from '../database/prisma.js';
import {EmailService} from '../services/EmailService.js';
import {MeterService} from '../services/MeterService.js';
import {emailQueue, type SendEmailJobData} from '../services/QueueService.js';
import {sendRawEmail} from '../services/SESService.js';

export function createEmailWorker() {
  const worker = new Worker<SendEmailJobData>(
    emailQueue.name,
    async (job: Job<SendEmailJobData>) => {
      const {emailId} = job.data;

      console.log(`[EMAIL-PROCESSOR] Processing email ${emailId}`);

      const email = await prisma.email.findUnique({
        where: {id: emailId},
        include: {
          contact: true,
          project: true,
        },
      });

      if (!email) {
        throw new Error(`Email ${emailId} not found`);
      }

      if (email.status !== EmailStatus.PENDING) {
        console.log(`[EMAIL-PROCESSOR] Email ${emailId} is not pending (status: ${email.status}), skipping`);
        return;
      }

      try {
        // Update status to sending
        await prisma.email.update({
          where: {id: emailId},
          data: {status: EmailStatus.SENDING},
        });

        // Format template variables in subject and body
        const contactData = (email.contact.data as any) || {};
        const formattedEmail = EmailService.format({
          subject: email.subject,
          body: email.body,
          data: {
            email: email.contact.email,
            ...contactData,
          },
        });

        // Compile HTML with unsubscribe footer and badge
        const compiledHtml = EmailService.compile({
          content: formattedEmail.body,
          contact: email.contact,
          project: email.project,
          includeUnsubscribe: email.sourceType !== EmailSourceType.TRANSACTIONAL, // Don't add unsubscribe to transactional emails
        });

        // Parse from email (format: "Name <email@domain.com>" or just "email@domain.com")
        const fromMatch = /(.*?)<(.+?)>/.exec(email.from) || [null, email.from, email.from];
        const fromName = fromMatch[1]?.trim() || email.project.name;
        const fromEmail = fromMatch[2]?.trim() || email.from;

        console.log(`[EMAIL-PROCESSOR] Sending to ${email.contact.email}: ${formattedEmail.subject}`);

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

        // Record usage for billing (pay-per-email)
        // Uses email ID as idempotency key to prevent double-charging on retries
        if (email.project.customer) {
          await MeterService.recordEmailSent(email.project.customer, 1, `email_${emailId}`);
        }

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
            } as Prisma.InputJsonValue,
          },
        });

        console.log(`[EMAIL-PROCESSOR] Successfully sent email ${emailId} (SES Message ID: ${result.messageId})`);
      } catch (error) {
        console.error(`[EMAIL-PROCESSOR] Failed to send email ${emailId}:`, error);

        // Mark as failed
        await prisma.email.update({
          where: {id: emailId},
          data: {
            status: EmailStatus.FAILED,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        });

        throw error; // Re-throw to trigger retry
      }
    },
    {
      connection: emailQueue.opts.connection,
      concurrency: 10, // Process up to 10 emails concurrently
      limiter: {
        max: 14, // Max 14 emails per second (AWS SES limit is typically 14/sec)
        duration: 1000,
      },
    },
  );

  worker.on('completed', job => {
    console.log(`[EMAIL-PROCESSOR] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[EMAIL-PROCESSOR] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', err => {
    console.error('[EMAIL-PROCESSOR] Worker error:', err);
  });

  return worker;
}
