import {randomBytes} from 'node:crypto';

import {Controller, Get, Middleware, Patch, Post} from '@overnightjs/core';
import {ProjectSchemas} from '@repo/shared';
import type {Request, Response} from 'express';

import {DASHBOARD_URI, STRIPE_ENABLED, STRIPE_PRICE_EMAIL_USAGE, STRIPE_PRICE_ONBOARDING} from '../app/constants.js';
import {stripe} from '../app/stripe.js';
import {prisma} from '../database/prisma.js';
import {NotAuthenticated, NotFound} from '../exceptions/index.js';
import type {AuthResponse} from '../middleware/auth.js';
import {isAuthenticated} from '../middleware/auth.js';
import {UserService} from '../services/UserService.js';

@Controller('users')
export class Users {
  @Get('@me')
  @Middleware([isAuthenticated])
  public async me(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;

    if (!auth.userId) {
      throw new NotAuthenticated();
    }

    const me = await UserService.id(auth.userId);

    if (!me) {
      throw new NotAuthenticated();
    }

    return res.status(200).json({id: me.id, email: me.email});
  }

  @Get('@me/projects')
  @Middleware([isAuthenticated])
  public async meProjects(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;

    if (!auth.userId) {
      throw new NotAuthenticated();
    }

    const projects = await UserService.projects(auth.userId);

    return res.status(200).json(projects);
  }

  @Post('@me/projects')
  @Middleware([isAuthenticated])
  public async createProject(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;

    if (!auth.userId) {
      throw new NotAuthenticated();
    }

    const {name} = ProjectSchemas.create.parse(req.body);

    // Generate unique API keys
    const publicKey = `pk_${randomBytes(32).toString('hex')}`;
    const secretKey = `sk_${randomBytes(32).toString('hex')}`;

    // Create the project
    const project = await prisma.project.create({
      data: {
        name,
        public: publicKey,
        secret: secretKey,
        members: {
          create: {
            userId: auth.userId,
            role: 'ADMIN',
          },
        },
      },
    });

    return res.status(201).json(project);
  }

  @Patch('@me/projects/:id')
  @Middleware([isAuthenticated])
  public async updateProject(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;
    const {id} = req.params;
    const data = ProjectSchemas.update.parse(req.body);

    // Verify user has access to this project
    const membership = await prisma.membership.findFirst({
      where: {
        userId: auth.userId,
        projectId: id,
        role: {
          in: ['ADMIN', 'OWNER'],
        },
      },
    });

    if (!membership) {
      throw new NotFound('Project not found or you do not have permission to update it');
    }

    // Update the project
    const project = await prisma.project.update({
      where: {id},
      data,
    });

    return res.status(200).json(project);
  }

  @Post('@me/projects/:id/regenerate-keys')
  @Middleware([isAuthenticated])
  public async regenerateProjectKeys(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;
    const {id} = req.params;

    // Verify user has admin/owner access to this project
    const membership = await prisma.membership.findFirst({
      where: {
        userId: auth.userId,
        projectId: id,
        role: {
          in: ['ADMIN', 'OWNER'],
        },
      },
    });

    if (!membership) {
      throw new NotFound('Project not found or you do not have permission to regenerate keys');
    }

    // Generate new unique API keys
    const publicKey = `pk_${randomBytes(32).toString('hex')}`;
    const secretKey = `sk_${randomBytes(32).toString('hex')}`;

    // Update the project with new keys
    const project = await prisma.project.update({
      where: {id},
      data: {
        public: publicKey,
        secret: secretKey,
      },
    });

    return res.status(200).json(project);
  }

  @Post('@me/projects/:id/checkout')
  @Middleware([isAuthenticated])
  public async createCheckoutSession(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;
    const {id} = req.params;

    // Check if billing is enabled
    if (!STRIPE_ENABLED || !stripe) {
      return res.status(404).json({error: 'Billing is not enabled'});
    }

    // Verify user has access to this project
    const membership = await prisma.membership.findFirst({
      where: {
        userId: auth.userId,
        projectId: id,
        role: {
          in: ['ADMIN', 'OWNER'],
        },
      },
    });

    if (!membership) {
      throw new NotFound('Project not found or you do not have permission to manage billing');
    }

    // Get the project
    const project = await prisma.project.findUnique({
      where: {id},
    });

    if (!project) {
      throw new NotFound('Project not found');
    }

    // If project already has a subscription, return error
    if (project.subscription) {
      return res.status(400).json({error: 'Project already has a subscription'});
    }

    // Build line items for subscription
    const lineItems = [];

    // Add one-time onboarding fee if configured
    if (STRIPE_PRICE_ONBOARDING) {
      lineItems.push({price: STRIPE_PRICE_ONBOARDING, quantity: 1});
    }

    // Add metered pricing for pay-per-email (required)
    if (!STRIPE_PRICE_EMAIL_USAGE) {
      return res.status(500).json({error: 'Usage-based pricing not configured. Set STRIPE_PRICE_EMAIL_USAGE.'});
    }
    lineItems.push({price: STRIPE_PRICE_EMAIL_USAGE}); // No quantity for metered items

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: project.customer ?? undefined, // Use existing customer if available
      client_reference_id: project.id, // Store project ID for webhook
      line_items: lineItems,
      success_url: `${DASHBOARD_URI}/settings?tab=billing&success=true`,
      cancel_url: `${DASHBOARD_URI}/settings?tab=billing&canceled=true`,
    });

    return res.status(200).json({url: session.url});
  }

  @Post('@me/projects/:id/billing-portal')
  @Middleware([isAuthenticated])
  public async createBillingPortalSession(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;
    const {id} = req.params;

    // Check if billing is enabled
    if (!STRIPE_ENABLED || !stripe) {
      return res.status(404).json({error: 'Billing is not enabled'});
    }

    // Verify user has access to this project
    const membership = await prisma.membership.findFirst({
      where: {
        userId: auth.userId,
        projectId: id,
        role: {
          in: ['ADMIN', 'OWNER'],
        },
      },
    });

    if (!membership) {
      throw new NotFound('Project not found or you do not have permission to manage billing');
    }

    // Get the project
    const project = await prisma.project.findUnique({
      where: {id},
    });

    if (!project) {
      throw new NotFound('Project not found');
    }

    // Project must have a customer ID to access billing portal
    if (!project.customer) {
      return res.status(400).json({error: 'No customer found for this project'});
    }

    // Create billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: project.customer,
      return_url: `${DASHBOARD_URI}/settings?tab=billing`,
    });

    return res.status(200).json({url: session.url});
  }
}
