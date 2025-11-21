import type {Campaign, Contact, Prisma} from '@repo/db';
import {CampaignAudienceType, CampaignStatus} from '@repo/db';

import {prisma} from '../database/prisma.js';
import {HttpException} from '../exceptions/index.js';

import {EmailService} from './EmailService.js';
import {QueueService} from './QueueService.js';
import {type SegmentFilter, SegmentService} from './SegmentService.js';

const BATCH_SIZE = 500; // Number of emails to process per batch (increased for better performance)

export interface CreateCampaignData {
  name: string;
  description?: string;
  subject: string;
  body: string;
  from: string;
  replyTo?: string;
  audienceType: CampaignAudienceType;
  audienceFilter?: SegmentFilter[];
  segmentId?: string;
}

export interface UpdateCampaignData {
  name?: string;
  description?: string;
  subject?: string;
  body?: string;
  from?: string;
  replyTo?: string;
  audienceType?: CampaignAudienceType;
  audienceFilter?: SegmentFilter[];
  segmentId?: string;
}

export class CampaignService {
  /**
   * Create a new campaign
   */
  public static async create(projectId: string, data: CreateCampaignData): Promise<Campaign> {
    // Validate segment if provided
    if (data.audienceType === CampaignAudienceType.SEGMENT) {
      if (!data.segmentId) {
        throw new HttpException(400, 'Segment ID is required for SEGMENT audience type');
      }

      const segment = await prisma.segment.findFirst({
        where: {
          id: data.segmentId,
          projectId,
        },
      });

      if (!segment) {
        throw new HttpException(404, 'Segment not found');
      }
    }

    // Validate filters if provided
    if (data.audienceType === CampaignAudienceType.FILTERED && data.audienceFilter) {
      // This will throw if filters are invalid
      SegmentService.validateFilters(data.audienceFilter);
    }

    // Create campaign
    return prisma.campaign.create({
      data: {
        projectId,
        name: data.name,
        description: data.description,
        subject: data.subject,
        body: data.body,
        from: data.from,
        replyTo: data.replyTo,
        audienceType: data.audienceType,
        audienceFilter: (data.audienceFilter || null) as unknown as Prisma.InputJsonValue,
        segmentId: data.segmentId,
        status: CampaignStatus.DRAFT,
      },
    });
  }

  /**
   * Update a campaign
   */
  public static async update(projectId: string, campaignId: string, data: UpdateCampaignData): Promise<Campaign> {
    const campaign = await this.get(projectId, campaignId);

    // Can only update draft or scheduled campaigns
    if (campaign.status !== CampaignStatus.DRAFT && campaign.status !== CampaignStatus.SCHEDULED) {
      throw new HttpException(400, 'Cannot update campaign that is sending or has been sent');
    }

    const updateData: Prisma.CampaignUpdateInput = {};

    if (data.name !== undefined) {
      updateData.name = data.name;
    }
    if (data.description !== undefined) {
      updateData.description = data.description;
    }
    if (data.subject !== undefined) {
      updateData.subject = data.subject;
    }
    if (data.body !== undefined) {
      updateData.body = data.body;
    }
    if (data.from !== undefined) {
      updateData.from = data.from;
    }
    if (data.replyTo !== undefined) {
      updateData.replyTo = data.replyTo;
    }
    if (data.audienceType !== undefined) {
      updateData.audienceType = data.audienceType;
    }
    if (data.audienceFilter !== undefined) {
      if (data.audienceFilter) {
        SegmentService.validateFilters(data.audienceFilter);
      }
      updateData.audienceFilter = (data.audienceFilter || null) as unknown as Prisma.InputJsonValue;
    }
    if (data.segmentId !== undefined) {
      if (data.segmentId) {
        const segment = await prisma.segment.findFirst({
          where: {id: data.segmentId, projectId},
        });
        if (!segment) {
          throw new HttpException(404, 'Segment not found');
        }
        updateData.segment = {connect: {id: data.segmentId}};
      } else {
        updateData.segment = {disconnect: true};
      }
    }

    return prisma.campaign.update({
      where: {id: campaignId},
      data: updateData,
    });
  }

  /**
   * Get a campaign
   */
  public static async get(projectId: string, campaignId: string): Promise<Campaign> {
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        projectId,
      },
      include: {
        segment: true,
      },
    });

    if (!campaign) {
      throw new HttpException(404, 'Campaign not found');
    }

    return campaign;
  }

  /**
   * List campaigns for a project
   */
  public static async list(
    projectId: string,
    options: {
      status?: CampaignStatus;
      page?: number;
      pageSize?: number;
    } = {},
  ): Promise<{campaigns: Campaign[]; total: number; page: number; pageSize: number; totalPages: number}> {
    const {status, page = 1, pageSize = 20} = options;
    const skip = (page - 1) * pageSize;

    const where: Prisma.CampaignWhereInput = {
      projectId,
      ...(status ? {status} : {}),
    };

    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        include: {
          segment: true,
        },
        orderBy: {createdAt: 'desc'},
        skip,
        take: pageSize,
      }),
      prisma.campaign.count({where}),
    ]);

    return {
      campaigns,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Delete a campaign
   */
  public static async delete(projectId: string, campaignId: string): Promise<void> {
    const campaign = await this.get(projectId, campaignId);

    // Can only delete draft campaigns
    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new HttpException(400, 'Can only delete draft campaigns');
    }

    await prisma.campaign.delete({
      where: {id: campaignId},
    });
  }

  /**
   * Send campaign immediately or schedule for later
   */
  public static async send(projectId: string, campaignId: string, scheduledFor?: Date): Promise<Campaign> {
    const campaign = await this.get(projectId, campaignId);

    // Validate status
    if (campaign.status !== CampaignStatus.DRAFT && campaign.status !== CampaignStatus.SCHEDULED) {
      throw new HttpException(400, 'Campaign has already been sent or is currently sending');
    }

    // Get recipient count to validate there are contacts to send to
    const recipientCount = await this.getRecipientCount(projectId, campaign);

    if (recipientCount === 0) {
      throw new HttpException(400, 'Campaign has no recipients');
    }

    if (scheduledFor) {
      // Schedule for later
      if (scheduledFor.getTime() <= Date.now()) {
        throw new HttpException(400, 'Scheduled time must be in the future');
      }

      // Update campaign status
      const updatedCampaign = await prisma.campaign.update({
        where: {id: campaignId},
        data: {
          status: CampaignStatus.SCHEDULED,
          scheduledFor,
          totalRecipients: recipientCount,
        },
      });

      // Queue for scheduled sending
      await QueueService.scheduleCampaign(campaignId, scheduledFor);

      return updatedCampaign;
    } else {
      // Send immediately - start the batch processing
      await this.startSending(projectId, campaignId, recipientCount);

      return this.get(projectId, campaignId);
    }
  }

  /**
   * Start sending campaign (called immediately or when scheduled time arrives)
   * Now uses cursor-based pagination for better performance with large recipient lists
   */
  public static async startSending(projectId: string, campaignId: string, recipientCount?: number): Promise<void> {
    const campaign = await this.get(projectId, campaignId);

    // Validate status
    if (
      campaign.status !== CampaignStatus.DRAFT &&
      campaign.status !== CampaignStatus.SCHEDULED &&
      campaign.status !== CampaignStatus.SENDING
    ) {
      throw new HttpException(400, 'Campaign cannot be sent in its current status');
    }

    // Get recipient count if not provided
    if (recipientCount === undefined) {
      recipientCount = await this.getRecipientCount(projectId, campaign);
    }

    // Update campaign to SENDING status
    await prisma.campaign.update({
      where: {id: campaignId},
      data: {
        status: CampaignStatus.SENDING,
        totalRecipients: recipientCount,
        sentAt: new Date(),
      },
    });

    // Calculate number of batches
    const batchCount = Math.ceil(recipientCount / BATCH_SIZE);

    console.log(
      `[CAMPAIGN] Starting campaign ${campaignId} with ${recipientCount} recipients in ${batchCount} batches`,
    );

    // Queue first batch to start the cursor-based chain
    await QueueService.queueCampaignBatch({
      campaignId,
      batchNumber: 1,
      offset: 0,
      limit: BATCH_SIZE,
    });
  }

  /**
   * Process a single batch of campaign emails
   * Now uses cursor-based pagination for better performance
   */
  public static async processBatch(
    campaignId: string,
    batchNumber: number,
    offset: number,
    limit: number,
    cursor?: string,
  ): Promise<void> {
    console.log(
      `[CAMPAIGN] Processing batch ${batchNumber} for campaign ${campaignId} (cursor: ${cursor || 'start'}, limit: ${limit})`,
    );

    const campaign = await prisma.campaign.findUnique({
      where: {id: campaignId},
      include: {
        project: true,
      },
    });

    if (!campaign) {
      throw new HttpException(404, 'Campaign not found');
    }

    if (campaign.status !== CampaignStatus.SENDING) {
      console.warn(`[CAMPAIGN] Campaign ${campaignId} is not in SENDING status, skipping batch ${batchNumber}`);
      return;
    }

    // Get batch of recipients using cursor-based pagination
    const {contacts, nextCursor, hasMore} = await this.getRecipientsCursor(campaign.projectId, campaign, limit, cursor);

    console.log(`[CAMPAIGN] Sending to ${contacts.length} contacts in batch ${batchNumber}`);

    // Queue emails for each contact
    for (const contact of contacts) {
      try {
        // Render template with contact data
        const contactData = (contact.data as any) || {};
        const variables = {
          email: contact.email,
          ...contactData,
        };

        const renderedSubject = EmailService.format({
          subject: campaign.subject,
          body: '',
          data: variables,
        }).subject;

        const renderedBody = EmailService.format({
          subject: '',
          body: campaign.body,
          data: variables,
        }).body;

        // Create email record
        const email = await EmailService.sendCampaignEmail({
          projectId: campaign.projectId,
          contactId: contact.id,
          campaignId: campaign.id,
          templateId: undefined,
          subject: renderedSubject,
          body: renderedBody,
          from: campaign.from,
          replyTo: campaign.replyTo || undefined,
        });

        console.log(`[CAMPAIGN] Queued email ${email.id} for contact ${contact.email}`);
      } catch (error) {
        console.error(`[CAMPAIGN] Failed to queue email for contact ${contact.id}:`, error);
        // Continue with other contacts even if one fails
      }
    }

    // Update sent count
    await prisma.campaign.update({
      where: {id: campaignId},
      data: {
        sentCount: {
          increment: contacts.length,
        },
      },
    });

    // Queue next batch if there are more contacts
    if (hasMore && nextCursor) {
      await QueueService.queueCampaignBatch({
        campaignId,
        batchNumber: batchNumber + 1,
        offset: 0, // Not used with cursor pagination
        limit,
        cursor: nextCursor,
      });
    } else {
      // All batches processed, mark campaign as SENT
      await prisma.campaign.update({
        where: {id: campaignId},
        data: {
          status: CampaignStatus.SENT,
        },
      });

      const finalCampaign = await prisma.campaign.findUnique({
        where: {id: campaignId},
        select: {sentCount: true, totalRecipients: true},
      });

      console.log(`[CAMPAIGN] Campaign ${campaignId} completed - all ${finalCampaign?.sentCount} emails sent`);
    }
  }

  /**
   * Cancel a campaign
   */
  public static async cancel(projectId: string, campaignId: string): Promise<Campaign> {
    const campaign = await this.get(projectId, campaignId);

    // Can only cancel scheduled or sending campaigns
    if (campaign.status !== CampaignStatus.SCHEDULED && campaign.status !== CampaignStatus.SENDING) {
      throw new HttpException(400, 'Can only cancel scheduled or sending campaigns');
    }

    // If scheduled, remove from queue
    if (campaign.status === CampaignStatus.SCHEDULED) {
      await QueueService.cancelScheduledCampaign(campaignId);
    }

    // Update status
    return prisma.campaign.update({
      where: {id: campaignId},
      data: {
        status: CampaignStatus.CANCELLED,
      },
    });
  }

  /**
   * Get campaign statistics
   */
  public static async getStats(projectId: string, campaignId: string) {
    const campaign = await this.get(projectId, campaignId);

    // Get email stats from Email table
    const [sentEmails, deliveredEmails, openedEmails, clickedEmails, bouncedEmails] = await Promise.all([
      prisma.email.count({
        where: {campaignId, sentAt: {not: null}},
      }),
      prisma.email.count({
        where: {campaignId, deliveredAt: {not: null}},
      }),
      prisma.email.count({
        where: {campaignId, openedAt: {not: null}},
      }),
      prisma.email.count({
        where: {campaignId, clickedAt: {not: null}},
      }),
      prisma.email.count({
        where: {campaignId, bouncedAt: {not: null}},
      }),
    ]);

    // Update campaign stats
    await prisma.campaign.update({
      where: {id: campaignId},
      data: {
        deliveredCount: deliveredEmails,
        openedCount: openedEmails,
        clickedCount: clickedEmails,
        bouncedCount: bouncedEmails,
      },
    });

    return {
      totalRecipients: campaign.totalRecipients,
      sentCount: sentEmails,
      deliveredCount: deliveredEmails,
      openedCount: openedEmails,
      clickedCount: clickedEmails,
      bouncedCount: bouncedEmails,
      openRate: sentEmails > 0 ? (openedEmails / sentEmails) * 100 : 0,
      clickRate: sentEmails > 0 ? (clickedEmails / sentEmails) * 100 : 0,
      bounceRate: sentEmails > 0 ? (bouncedEmails / sentEmails) * 100 : 0,
      deliveryRate: sentEmails > 0 ? (deliveredEmails / sentEmails) * 100 : 0,
    };
  }

  /**
   * Get recipient count for a campaign
   */
  private static async getRecipientCount(projectId: string, campaign: Campaign): Promise<number> {
    const where = await this.buildRecipientWhereAsync(projectId, campaign);
    return prisma.contact.count({where});
  }

  /**
   * Get recipients for a campaign (legacy offset-based, kept for compatibility)
   */
  private static async getRecipients(
    projectId: string,
    campaign: Campaign,
    offset: number,
    limit: number,
  ): Promise<Contact[]> {
    const where = await this.buildRecipientWhereAsync(projectId, campaign);

    return prisma.contact.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: {createdAt: 'asc'}, // Consistent ordering for batching
    });
  }

  /**
   * Get recipients for a campaign using cursor-based pagination
   */
  private static async getRecipientsCursor(
    projectId: string,
    campaign: Campaign,
    limit: number,
    cursor?: string,
  ): Promise<{contacts: Contact[]; nextCursor?: string; hasMore: boolean}> {
    const where = await this.buildRecipientWhereAsync(projectId, campaign);

    // Fetch one extra to determine if there are more results
    const contacts = await prisma.contact.findMany({
      where,
      take: limit + 1,
      skip: cursor ? 1 : 0,
      cursor: cursor ? {id: cursor} : undefined,
      orderBy: {id: 'asc'}, // Use ID for consistent cursor ordering
    });

    const hasMore = contacts.length > limit;
    const results = hasMore ? contacts.slice(0, -1) : contacts;
    const nextCursor = hasMore ? results[results.length - 1]?.id : undefined;

    return {
      contacts: results,
      nextCursor,
      hasMore,
    };
  }

  /**
   * Build WHERE clause for campaign recipients (async for segment lookups)
   */
  private static async buildRecipientWhereAsync(
    projectId: string,
    campaign: Campaign,
  ): Promise<Prisma.ContactWhereInput> {
    const baseWhere: Prisma.ContactWhereInput = {
      projectId,
      subscribed: true, // Only send to subscribed contacts
    };

    switch (campaign.audienceType) {
      case CampaignAudienceType.ALL:
        return baseWhere;

      case CampaignAudienceType.SEGMENT:
        if (!campaign.segmentId) {
          throw new HttpException(400, 'Segment ID is required for SEGMENT audience type');
        }

        // Get segment and use its filters
        return this.buildSegmentWhereAsync(projectId, campaign.segmentId, baseWhere);

      case CampaignAudienceType.FILTERED:
        const filters = campaign.audienceFilter as unknown as SegmentFilter[];
        if (!filters || filters.length === 0) {
          throw new HttpException(400, 'Audience filters are required for FILTERED audience type');
        }

        return {
          ...baseWhere,
          AND: filters.map(filter => SegmentService.buildFilterCondition(filter)),
        };

      default:
        throw new HttpException(400, 'Invalid audience type');
    }
  }

  /**
   * Build WHERE clause for segment-based campaigns
   */
  private static async buildSegmentWhereAsync(
    projectId: string,
    segmentId: string,
    baseWhere: Prisma.ContactWhereInput,
  ): Promise<Prisma.ContactWhereInput> {
    // Fetch the segment to get its filters
    const segment = await prisma.segment.findUnique({
      where: {id: segmentId},
    });

    if (!segment) {
      throw new HttpException(404, 'Segment not found');
    }

    const filters = segment.filters as unknown as SegmentFilter[];

    return {
      ...baseWhere,
      AND: filters.map(filter => SegmentService.buildFilterCondition(filter)),
    };
  }
}
