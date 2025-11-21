import {prisma} from '../database/prisma.js';
import {wrapRedis} from '../database/redis.js';
import {Keys} from './keys.js';
import {getDomainVerificationAttributes, verifyDomain} from './SESService.js';

export class DomainService {
  /**
   * Get a domain by ID
   */
  public static async id(id: string) {
    return wrapRedis(Keys.Domain.id(id), async () => {
      return prisma.domain.findUnique({where: {id}});
    });
  }

  /**
   * Get all domains for a project
   */
  public static async getProjectDomains(projectId: string) {
    return wrapRedis(Keys.Domain.project(projectId), async () => {
      return prisma.domain.findMany({
        where: {projectId},
        orderBy: {createdAt: 'desc'},
      });
    });
  }

  /**
   * Add a new domain to a project and start verification
   */
  public static async addDomain(projectId: string, domain: string) {
    // Check if domain is already used by another project
    const existingDomain = await prisma.domain.findFirst({
      where: {domain},
    });

    if (existingDomain) {
      throw new Error('This domain is already registered to another project');
    }

    // Start verification process with AWS SES
    const dkimTokens = await verifyDomain(domain);

    // Create domain record
    const newDomain = await prisma.domain.create({
      data: {
        projectId,
        domain,
        verified: false,
        dkimTokens,
      },
    });

    return newDomain;
  }

  /**
   * Check verification status for a domain
   */
  public static async checkVerification(domainId: string) {
    const domain = await prisma.domain.findUnique({where: {id: domainId}});

    if (!domain) {
      throw new Error('Domain not found');
    }

    const attributes = await getDomainVerificationAttributes(domain.domain);

    // Update domain if verification status changed
    if (attributes.status === 'Success' && !domain.verified) {
      await prisma.domain.update({
        where: {id: domainId},
        data: {verified: true},
      });
    } else if (attributes.status !== 'Success' && domain.verified) {
      await prisma.domain.update({
        where: {id: domainId},
        data: {verified: false},
      });
    }

    return {
      domain: domain.domain,
      tokens: attributes.tokens,
      status: attributes.status,
      verified: attributes.status === 'Success',
    };
  }

  /**
   * Remove a domain from a project
   */
  public static async removeDomain(domainId: string) {
    const domain = await prisma.domain.findUnique({where: {id: domainId}});

    if (!domain) {
      throw new Error('Domain not found');
    }

    await prisma.domain.delete({where: {id: domainId}});

    return true;
  }

  /**
   * Get verified domains for a project
   */
  public static async getVerifiedDomains(projectId: string) {
    return prisma.domain.findMany({
      where: {
        projectId,
        verified: true,
      },
    });
  }
}
