import {Controller, Delete, Get, Middleware, Post} from '@overnightjs/core';
import {DomainSchemas, UtilitySchemas} from '@repo/shared';
import type {Request, Response} from 'express';

import {redis} from '../database/redis.js';
import {NotFound} from '../exceptions/index.js';
import type {AuthResponse} from '../middleware/auth.js';
import {isAuthenticated} from '../middleware/auth.js';
import {DomainService} from '../services/DomainService.js';
import {Keys} from '../services/keys.js';
import {prisma} from '../database/prisma.js';

@Controller('domains')
export class Domains {
  /**
   * Get all domains for a project
   */
  @Get('project/:projectId')
  @Middleware([isAuthenticated])
  public async getProjectDomains(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;
    const {projectId} = DomainSchemas.projectId.parse(req.params);

    // Verify user has access to this project
    const membership = await prisma.membership.findFirst({
      where: {
        userId: auth.userId,
        projectId,
      },
    });

    if (!membership) {
      throw new NotFound('Project not found or you do not have access');
    }

    const domains = await DomainService.getProjectDomains(projectId);

    return res.status(200).json(domains);
  }

  /**
   * Add a new domain to a project
   */
  @Post('')
  @Middleware([isAuthenticated])
  public async addDomain(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;
    const {projectId, domain} = DomainSchemas.create.parse(req.body);

    // Verify user has admin access to this project
    const membership = await prisma.membership.findFirst({
      where: {
        userId: auth.userId,
        projectId,
        role: {
          in: ['ADMIN', 'OWNER'],
        },
      },
    });

    if (!membership) {
      throw new NotFound('Project not found or you do not have permission');
    }

    try {
      const newDomain = await DomainService.addDomain(projectId, domain);

      // Invalidate cache
      await redis.del(Keys.Domain.project(projectId));

      return res.status(201).json(newDomain);
    } catch (error) {
      if (error instanceof Error) {
        return res.status(400).json({error: error.message});
      }
      throw error;
    }
  }

  /**
   * Check verification status for a domain
   */
  @Get(':id/verify')
  @Middleware([isAuthenticated])
  public async checkVerification(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;
    const {id} = UtilitySchemas.id.parse(req.params);

    const domain = await DomainService.id(id);

    if (!domain) {
      throw new NotFound('Domain not found');
    }

    // Verify user has access to the project this domain belongs to
    const membership = await prisma.membership.findFirst({
      where: {
        userId: auth.userId,
        projectId: domain.projectId,
      },
    });

    if (!membership) {
      throw new NotFound('Domain not found or you do not have access');
    }

    const verificationStatus = await DomainService.checkVerification(id);

    // Invalidate cache if status changed
    await redis.del(Keys.Domain.id(id));
    await redis.del(Keys.Domain.project(domain.projectId));

    return res.status(200).json(verificationStatus);
  }

  /**
   * Remove a domain from a project
   */
  @Delete(':id')
  @Middleware([isAuthenticated])
  public async removeDomain(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;
    const {id} = UtilitySchemas.id.parse(req.params);

    const domain = await DomainService.id(id);

    if (!domain) {
      throw new NotFound('Domain not found');
    }

    // Verify user has admin access to the project this domain belongs to
    const membership = await prisma.membership.findFirst({
      where: {
        userId: auth.userId,
        projectId: domain.projectId,
        role: {
          in: ['ADMIN', 'OWNER'],
        },
      },
    });

    if (!membership) {
      throw new NotFound('Domain not found or you do not have permission');
    }

    await DomainService.removeDomain(id);

    // Invalidate cache
    await redis.del(Keys.Domain.id(id));
    await redis.del(Keys.Domain.project(domain.projectId));

    return res.status(200).json({success: true});
  }
}
