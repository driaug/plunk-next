import {Controller, Middleware, Post} from '@overnightjs/core';
import type {Request, Response} from 'express';

import type {AuthResponse} from '../middleware/auth.js';
import {requirePublicKey, requireSecretKey} from '../middleware/auth.js';
import {ContactService} from '../services/ContactService.js';
import {EmailService} from '../services/EmailService.js';
import {EventService} from '../services/EventService.js';

/**
 * Public API Actions Controller
 * Handles track event and transactional email endpoints
 */
@Controller('v1')
export class Actions {
  /**
   * POST /v1/track
   * Track an event for a contact (creates/updates contact and tracks event)
   *
   * Request body:
   * - event: string (required) - Event name
   * - email: string (required) - Contact email
   * - subscribed: boolean (optional, default: true) - Contact subscription status
   * - data: object (optional) - Contact metadata
   *
   * Response:
   * - success: boolean
   * - contact: string - Contact ID
   * - event: string - Event ID
   * - timestamp: string - ISO timestamp
   */
  @Post('track')
  @Middleware([requirePublicKey])
  public async track(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;
    const {event, email, subscribed, data} = req.body;

    // Validate required fields
    if (!event || typeof event !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Event name is required and must be a string',
      });
    }

    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Email is required and must be a string',
      });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
      });
    }

    try {
      // Create or update contact with metadata
      const contact = await ContactService.upsert(
        auth.projectId,
        email,
        data,
        subscribed !== undefined ? subscribed : true,
      );

      // Track the event
      const eventRecord = await EventService.trackEvent(auth.projectId, event, contact.id, undefined, data);

      return res.status(200).json({
        success: true,
        contact: contact.id,
        event: eventRecord.id,
        timestamp: eventRecord.createdAt.toISOString(),
      });
    } catch (error) {
      console.error('[TRACK] Error tracking event:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  /**
   * POST /v1/send
   * Send transactional email(s)
   *
   * Request body:
   * - to: string | string[] (required) - Recipient email(s)
   * - subject: string (required) - Email subject
   * - body: string (required) - Email HTML body
   * - subscribed: boolean (optional, default: false) - Contact subscription status
   * - name: string (optional) - Sender name
   * - from: string (optional) - Sender email (must be from verified domain)
   * - reply: string (optional) - Reply-to email
   * - headers: object (optional) - Additional email headers
   * - data: object (optional) - Contact metadata and template variables
   *
   * Response:
   * - success: boolean
   * - emails: array of {contact: {id, email}, email: string}
   * - timestamp: string - ISO timestamp
   */
  @Post('send')
  @Middleware([requireSecretKey])
  public async send(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;
    const {to, subject, body, subscribed, name, from, reply, headers, data} = req.body;

    // Validate required fields
    if (!to) {
      return res.status(400).json({
        success: false,
        error: 'Recipient email(s) required',
      });
    }

    if (!subject || typeof subject !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Subject is required and must be a string',
      });
    }

    if (!body || typeof body !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Body is required and must be a string',
      });
    }

    // Normalize recipients to array
    const recipients = Array.isArray(to) ? to : [to];

    if (recipients.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one recipient is required',
      });
    }

    // Validate email formats
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const recipient of recipients) {
      if (typeof recipient !== 'string' || !emailRegex.test(recipient)) {
        return res.status(400).json({
          success: false,
          error: `Invalid email format: ${recipient}`,
        });
      }
    }

    try {
      // TODO: Verify 'from' domain is verified if provided
      const senderEmail = from || 'noreply@useplunk.com'; // Default sender
      const replyToEmail = reply;

      const timestamp = new Date();
      const emailResults = [];

      // Process each recipient
      for (const recipientEmail of recipients) {
        // Create or update contact with metadata
        const contact = await ContactService.upsert(
          auth.projectId,
          recipientEmail,
          data,
          subscribed !== undefined ? subscribed : false,
        );

        // Get merged data including non-persistent fields for template rendering
        const mergedData = ContactService.getMergedData(contact, data);

        // Render template with contact data
        // Simple template variable replacement: {{fieldname}}
        let renderedSubject = subject;
        let renderedBody = body;

        for (const [key, value] of Object.entries(mergedData)) {
          const placeholder = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
          const fallbackPlaceholder = new RegExp(`\\{\\{\\s*${key}\\s*\\?\\?\\s*([^}]+)\\}\\}`, 'g');

          // Replace with value
          const stringValue = value !== null && value !== undefined ? String(value) : '';
          renderedSubject = renderedSubject.replace(placeholder, stringValue);
          renderedBody = renderedBody.replace(placeholder, stringValue);

          // Handle fallback syntax: {{field ?? default}}
          renderedSubject = renderedSubject.replace(fallbackPlaceholder, stringValue || '$1');
          renderedBody = renderedBody.replace(fallbackPlaceholder, stringValue || '$1');
        }

        // Replace any remaining placeholders with empty string or fallback value
        renderedSubject = renderedSubject.replace(/\{\{\s*(\w+)\s*\}\}/g, '');
        renderedBody = renderedBody.replace(/\{\{\s*(\w+)\s*\}\}/g, '');

        // Handle fallback placeholders that weren't matched
        renderedSubject = renderedSubject.replace(/\{\{\s*\w+\s*\?\?\s*([^}]+)\}\}/g, '$1');
        renderedBody = renderedBody.replace(/\{\{\s*\w+\s*\?\?\s*([^}]+)\}\}/g, '$1');

        // Send email
        const email = await EmailService.sendTransactionalEmail({
          projectId: auth.projectId,
          contactId: contact.id,
          subject: renderedSubject,
          body: renderedBody,
          from: senderEmail,
          replyTo: replyToEmail,
        });

        emailResults.push({
          contact: {
            id: contact.id,
            email: contact.email,
          },
          email: email.id,
        });
      }

      return res.status(200).json({
        success: true,
        emails: emailResults,
        timestamp: timestamp.toISOString(),
      });
    } catch (error) {
      console.error('[SEND] Error sending email:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }
}
