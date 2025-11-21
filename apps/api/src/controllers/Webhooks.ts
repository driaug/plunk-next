import {Controller, Post} from '@overnightjs/core';
import type {Request, Response} from 'express';
import signale from 'signale';
import type Stripe from 'stripe';

import {prisma} from '../database/prisma.js';
import {EmailStatus, Prisma} from '@repo/db';
import {stripe} from '../app/stripe.js';
import {STRIPE_ENABLED, STRIPE_WEBHOOK_SECRET} from '../app/constants.js';

/**
 * Map SES event types to our internal email statuses
 */
const eventStatusMap = {
  Bounce: EmailStatus.BOUNCED,
  Delivery: EmailStatus.DELIVERED,
  Open: EmailStatus.OPENED,
  Complaint: EmailStatus.COMPLAINED,
  Click: EmailStatus.CLICKED,
} as const;

/**
 * Webhooks Controller
 * Handles incoming webhooks from external services (AWS SNS/SES)
 */
@Controller('webhooks')
export class Webhooks {
  /**
   * Receive SNS webhook notifications from AWS SES
   * Handles email events: delivery, open, click, bounce, complaint
   */
  @Post('sns')
  public async receiveSNSWebhook(req: Request, res: Response) {
    try {
      // Parse the SNS message body
      const body = JSON.parse(req.body.Message);
      const eventType = body.eventType as 'Bounce' | 'Delivery' | 'Open' | 'Complaint' | 'Click';
      const messageId = body.mail?.messageId;

      if (!messageId) {
        signale.warn('[WEBHOOK] No messageId found in SNS notification');
        return res.status(400).json({success: false, error: 'No messageId found'});
      }

      // Look up email by SES messageId
      const email = await prisma.email.findUnique({
        where: {messageId},
        include: {
          contact: true,
          project: true,
        },
      });

      if (!email) {
        signale.warn(`[WEBHOOK] Email not found for messageId: ${messageId}`);
        return res.status(404).json({success: false, error: 'Email not found'});
      }

      const now = new Date();
      const updateData: Prisma.EmailUpdateInput = {};
      let eventName = `email.${eventType.toLowerCase()}`;
      let eventData: any = {};

      // Process event based on type
      switch (eventType) {
        case 'Delivery':
          signale.success(`[WEBHOOK] Delivery confirmed for ${email.contact.email} from ${email.project.name}`);
          updateData.status = EmailStatus.DELIVERED;
          updateData.deliveredAt = now;
          break;

        case 'Open':
          signale.success(`[WEBHOOK] Open received for ${email.contact.email} from ${email.project.name}`);
          // Only set openedAt on first open
          if (!email.openedAt) {
            updateData.openedAt = now;
          }
          updateData.opens = (email.opens || 0) + 1;
          updateData.status = EmailStatus.OPENED;
          break;

        case 'Click':
          signale.success(`[WEBHOOK] Click received for ${email.contact.email} from ${email.project.name}`);
          const clickedLink = body.click?.link;
          // Only set clickedAt on first click
          if (!email.clickedAt) {
            updateData.clickedAt = now;
          }
          updateData.clicks = (email.clicks || 0) + 1;
          updateData.status = EmailStatus.CLICKED;
          eventData = {link: clickedLink};
          break;

        case 'Bounce':
          signale.warn(`[WEBHOOK] Bounce received for ${email.contact.email} from ${email.project.name}`);
          updateData.status = EmailStatus.BOUNCED;
          updateData.bouncedAt = now;
          // Unsubscribe contact on bounce
          await prisma.contact.update({
            where: {id: email.contactId},
            data: {subscribed: false},
          });
          eventData = body.bounce ? {bounceType: body.bounce.bounceType} : {};
          break;

        case 'Complaint':
          signale.warn(`[WEBHOOK] Complaint received for ${email.contact.email} from ${email.project.name}`);
          updateData.status = EmailStatus.COMPLAINED;
          updateData.complainedAt = now;
          // Unsubscribe contact on complaint
          await prisma.contact.update({
            where: {id: email.contactId},
            data: {subscribed: false},
          });
          break;

        default:
          signale.warn(`[WEBHOOK] Unknown event type: ${eventType}`);
          return res.status(200).json({success: true});
      }

      // Update email with new status and timestamps
      await prisma.email.update({
        where: {id: email.id},
        data: updateData,
      });

      // Track event
      await prisma.event.create({
        data: {
          projectId: email.projectId,
          contactId: email.contactId,
          emailId: email.id,
          name: eventName,
          data: eventData as Prisma.InputJsonValue,
        },
      });

      signale.success(`[WEBHOOK] Processed ${eventType} event for email ${email.id}`);
      return res.status(200).json({success: true});
    } catch (error) {
      signale.error('[WEBHOOK] Error processing SNS webhook:', error);
      // Always return 200 to prevent SNS from retrying
      return res.status(200).json({success: true});
    }
  }

  /**
   * Receive Stripe webhook notifications
   * Handles subscription and payment events: checkout.session.completed, invoice.paid, etc.
   */
  @Post('incoming/stripe')
  public async receiveStripeWebhook(req: Request, res: Response) {
    // Return 404 if billing is disabled
    if (!STRIPE_ENABLED || !stripe) {
      signale.warn('[WEBHOOK] Stripe webhook received but billing is disabled');
      return res.status(404).json({success: false, error: 'Billing is disabled'});
    }

    try {
      const sig = req.headers['stripe-signature'];

      if (!sig) {
        signale.warn('[WEBHOOK] Missing Stripe signature header');
        return res.status(400).json({success: false, error: 'Missing signature'});
      }

      // Verify webhook signature using raw body
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
      } catch (err) {
        signale.error('[WEBHOOK] Stripe signature verification failed:', err);
        return res.status(400).json({success: false, error: 'Invalid signature'});
      }

      signale.info(`[WEBHOOK] Received Stripe event: ${event.type}`);

      // Handle different event types
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const customerId = session.customer as string;
          const subscriptionId = session.subscription as string;
          const projectId = session.client_reference_id; // Assuming project ID is passed as reference

          if (!projectId) {
            signale.warn('[WEBHOOK] No client_reference_id in checkout session');
            break;
          }

          // Update project with customer and subscription IDs
          await prisma.project.update({
            where: {id: projectId},
            data: {
              customer: customerId,
              subscription: subscriptionId,
            },
          });

          signale.success(`[WEBHOOK] Checkout completed for project ${projectId}`);
          break;
        }

        case 'invoice.paid': {
          const invoice = event.data.object as Stripe.Invoice;
          const customerId = invoice.customer as string;

          // Find project by customer ID
          const project = await prisma.project.findUnique({
            where: {customer: customerId},
          });

          if (!project) {
            signale.warn(`[WEBHOOK] No project found for customer ${customerId}`);
            break;
          }

          signale.success(`[WEBHOOK] Invoice paid for project ${project.name} (${project.id})`);
          // Additional logic can be added here (e.g., extend trial, update billing status)
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          const customerId = invoice.customer as string;

          // Find project by customer ID
          const project = await prisma.project.findUnique({
            where: {customer: customerId},
          });

          if (!project) {
            signale.warn(`[WEBHOOK] No project found for customer ${customerId}`);
            break;
          }

          signale.warn(`[WEBHOOK] Payment failed for project ${project.name} (${project.id})`);
          // Additional logic can be added here (e.g., disable project, send notification)
          break;
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;
          const subscriptionId = subscription.id;

          // Find project by subscription ID
          const project = await prisma.project.findUnique({
            where: {subscription: subscriptionId},
          });

          if (!project) {
            signale.warn(`[WEBHOOK] No project found for subscription ${subscriptionId}`);
            break;
          }

          // Clear subscription from project
          await prisma.project.update({
            where: {id: project.id},
            data: {
              subscription: null,
            },
          });

          signale.warn(`[WEBHOOK] Subscription deleted for project ${project.name} (${project.id})`);
          // Additional logic can be added here (e.g., downgrade to free plan)
          break;
        }

        case 'customer.subscription.updated': {
          const subscription = event.data.object as Stripe.Subscription;
          const subscriptionId = subscription.id;

          // Find project by subscription ID
          const project = await prisma.project.findUnique({
            where: {subscription: subscriptionId},
          });

          if (!project) {
            signale.warn(`[WEBHOOK] No project found for subscription ${subscriptionId}`);
            break;
          }

          signale.info(`[WEBHOOK] Subscription updated for project ${project.name} (${project.id})`);
          signale.info(`[WEBHOOK] Status: ${subscription.status}, Cancel at period end: ${subscription.cancel_at_period_end}`);
          // Additional logic can be added here (e.g., update subscription status, handle plan changes)
          break;
        }

        // Unhandled events
        default:
          signale.info(`[WEBHOOK] Unhandled Stripe event type: ${event.type}`);
          break;
      }

      return res.status(200).json({success: true, received: true});
    } catch (error) {
      signale.error('[WEBHOOK] Error processing Stripe webhook:', error);
      return res.status(400).json({success: false, error: 'Webhook processing failed'});
    }
  }
}
