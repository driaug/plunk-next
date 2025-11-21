import type {Prisma} from '@repo/db';

import {prisma} from '../database/prisma.js';
import {redis} from '../database/redis.js';

/**
 * Activity types that can be tracked
 */
export enum ActivityType {
  EVENT_TRIGGERED = 'event.triggered',
  EMAIL_SENT = 'email.sent',
  EMAIL_DELIVERED = 'email.delivered',
  EMAIL_OPENED = 'email.opened',
  EMAIL_CLICKED = 'email.clicked',
  EMAIL_BOUNCED = 'email.bounced',
  CAMPAIGN_SENT = 'campaign.sent',
  WORKFLOW_STARTED = 'workflow.started',
  WORKFLOW_COMPLETED = 'workflow.completed',
}

/**
 * Unified activity item
 */
export interface Activity {
  id: string;
  type: ActivityType;
  timestamp: Date;
  contactEmail?: string;
  contactId?: string;
  metadata: Record<string, any>;
}

/**
 * Paginated activity response
 */
export interface PaginatedActivities {
  activities: Activity[];
  nextCursor?: string;
  hasMore: boolean;
}

/**
 * Activity stats for dashboard
 */
export interface ActivityStats {
  totalEvents: number;
  totalEmailsSent: number;
  totalEmailsOpened: number;
  totalEmailsClicked: number;
  totalWorkflowsStarted: number;
  openRate: number;
  clickRate: number;
}

/**
 * Activity Service
 *
 * PERFORMANCE CONSIDERATIONS:
 * - Uses cursor-based pagination for efficient large dataset handling
 * - Limits date range to prevent expensive queries (default 30 days)
 * - Caches statistics in Redis with 5-minute TTL
 * - Uses indexed fields (createdAt) for sorting
 * - Batch processes and merges results from multiple tables
 */
export class ActivityService {
  private static readonly DEFAULT_LIMIT = 50;
  private static readonly MAX_LIMIT = 100;
  private static readonly DEFAULT_DAYS_BACK = 30;
  private static readonly STATS_CACHE_TTL = 300; // 5 minutes

  /**
   * Get unified activity feed for a project
   *
   * Performance: O(n log n) where n = limit
   * - Fetches up to `limit` items from 3 tables in parallel
   * - Merges and sorts by timestamp
   * - Returns top `limit` items
   *
   * PAGINATION APPROACH:
   * This implementation fetches `limit` items from each source (Events, Emails, Workflows),
   * then merges and returns the top `limit` results by timestamp. This ensures a proper
   * chronological timeline but has tradeoffs:
   *
   * Pros:
   * - Proper time-based ordering across all activity types
   * - Simple cursor-based pagination
   * - Efficient for typical use cases
   *
   * Cons:
   * - May fetch more items from DB than returned to client (up to 3x limit)
   * - Cursor pagination across sources can miss items in rare edge cases
   *
   * For higher scale (10M+ activities), consider:
   * - Materialized view or unified activity table
   * - Event sourcing pattern with proper indexing
   * - Separate pagination per activity type
   */
  public static async getActivities(
    projectId: string,
    limit = this.DEFAULT_LIMIT,
    cursor?: string,
    types?: ActivityType[],
    contactId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<PaginatedActivities> {
    // Cap limit to prevent abuse
    const effectiveLimit = Math.min(limit, this.MAX_LIMIT);

    // Fetch extra items from each source to ensure we have enough after merging
    // We fetch limit items from each, then take top limit after sorting
    const fetchLimit = effectiveLimit;

    // Default date range to last 30 days if not specified
    const now = new Date();
    const defaultStartDate = new Date(now.getTime() - this.DEFAULT_DAYS_BACK * 24 * 60 * 60 * 1000);
    const dateFilter: Prisma.DateTimeFilter = {
      gte: startDate || defaultStartDate,
      ...(endDate ? {lte: endDate} : {}),
    };

    // Parse cursor if provided (format: timestamp_id)
    let cursorTimestamp: Date | undefined;
    let cursorId: string | undefined;
    if (cursor) {
      const [timestamp, id] = cursor.split('_');
      cursorTimestamp = timestamp ? new Date(parseInt(timestamp)) : undefined;
      cursorId = id;
    }

    // Fetch activities from different sources in parallel
    // Each source fetches up to fetchLimit items
    const [events, emails, workflows] = await Promise.all([
      this.fetchEvents(projectId, fetchLimit, dateFilter, cursorTimestamp, cursorId, contactId, types),
      this.fetchEmailActivities(projectId, fetchLimit, dateFilter, cursorTimestamp, cursorId, contactId, types),
      this.fetchWorkflowActivities(projectId, fetchLimit, dateFilter, cursorTimestamp, cursorId, contactId, types),
    ]);

    // Merge all activities
    const allActivities = [...events, ...emails, ...workflows];

    // Sort by timestamp descending (most recent first)
    allActivities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Take only the requested limit + 1 (to check if there are more)
    const paginatedActivities = allActivities.slice(0, effectiveLimit + 1);

    // Check if there are more results
    const hasMore = paginatedActivities.length > effectiveLimit;
    const results = hasMore ? paginatedActivities.slice(0, effectiveLimit) : paginatedActivities;

    // Generate cursor from the last item
    const lastActivity = results[results.length - 1];
    const nextCursor = hasMore && lastActivity ? `${lastActivity.timestamp.getTime()}_${lastActivity.id}` : undefined;

    return {
      activities: results,
      nextCursor,
      hasMore,
    };
  }

  /**
   * Get activity statistics for a project
   *
   * Performance: Uses Redis cache with 5-minute TTL
   * Falls back to database aggregation if cache miss
   */
  public static async getStats(projectId: string, startDate?: Date, endDate?: Date): Promise<ActivityStats> {
    // Try to get from cache
    const cacheKey = `activity:stats:${projectId}:${startDate?.getTime() || 'all'}:${endDate?.getTime() || 'now'}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.warn('[ACTIVITY] Failed to get stats from cache:', error);
    }

    // Default date range to last 30 days if not specified
    const now = new Date();
    const defaultStartDate = new Date(now.getTime() - this.DEFAULT_DAYS_BACK * 24 * 60 * 60 * 1000);
    const dateFilter: Prisma.DateTimeFilter = {
      gte: startDate || defaultStartDate,
      ...(endDate ? {lte: endDate} : {}),
    };

    // Compute stats from database (in parallel for performance)
    const [totalEvents, emailStats] = await Promise.all([
      // Count total events
      prisma.event.count({
        where: {
          projectId,
          createdAt: dateFilter,
        },
      }),

      // Aggregate email stats
      prisma.email.aggregate({
        where: {
          projectId,
          createdAt: dateFilter,
        },
        _count: {
          id: true,
          openedAt: true,
          clickedAt: true,
        },
      }),
    ]);

    // Count workflow executions
    const totalWorkflowsStarted = await prisma.workflowExecution.count({
      where: {
        workflow: {
          projectId,
        },
        startedAt: dateFilter,
      },
    });

    const totalEmailsSent = emailStats._count.id;
    const totalEmailsOpened = emailStats._count.openedAt || 0;
    const totalEmailsClicked = emailStats._count.clickedAt || 0;

    const stats: ActivityStats = {
      totalEvents,
      totalEmailsSent,
      totalEmailsOpened,
      totalEmailsClicked,
      totalWorkflowsStarted,
      openRate: totalEmailsSent > 0 ? (totalEmailsOpened / totalEmailsSent) * 100 : 0,
      clickRate: totalEmailsSent > 0 ? (totalEmailsClicked / totalEmailsSent) * 100 : 0,
    };

    // Cache for 5 minutes
    try {
      await redis.setex(cacheKey, this.STATS_CACHE_TTL, JSON.stringify(stats));
    } catch (error) {
      console.warn('[ACTIVITY] Failed to cache stats:', error);
    }

    return stats;
  }

  /**
   * Invalidate activity stats cache for a project
   * Should be called when new activities are created
   */
  public static async invalidateStatsCache(projectId: string): Promise<void> {
    try {
      // Delete all cache keys for this project
      const pattern = `activity:stats:${projectId}:*`;
      const keys = await redis.keys(pattern);

      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      console.warn('[ACTIVITY] Failed to invalidate stats cache:', error);
    }
  }

  /**
   * Get recent activity count (for real-time updates)
   * Returns count of activities in the last N minutes
   */
  public static async getRecentActivityCount(projectId: string, minutes = 5): Promise<number> {
    const since = new Date(Date.now() - minutes * 60 * 1000);
    const dateFilter: Prisma.DateTimeFilter = {gte: since};

    const [eventCount, emailCount, workflowCount] = await Promise.all([
      prisma.event.count({
        where: {projectId, createdAt: dateFilter},
      }),
      prisma.email.count({
        where: {projectId, createdAt: dateFilter},
      }),
      prisma.workflowExecution.count({
        where: {
          workflow: {projectId},
          startedAt: dateFilter,
        },
      }),
    ]);

    return eventCount + emailCount + workflowCount;
  }

  /**
   * Fetch event activities
   */
  private static async fetchEvents(
    projectId: string,
    limit: number,
    dateFilter: Prisma.DateTimeFilter,
    cursorTimestamp?: Date,
    cursorId?: string,
    contactId?: string,
    types?: ActivityType[],
  ): Promise<Activity[]> {
    // Skip if filtering by types and event.triggered is not included
    if (types && !types.includes(ActivityType.EVENT_TRIGGERED)) {
      return [];
    }

    const where: Prisma.EventWhereInput = {
      projectId,
      createdAt: cursorTimestamp
        ? {
            ...dateFilter,
            lt: cursorTimestamp,
          }
        : dateFilter,
      ...(contactId ? {contactId} : {}),
    };

    const events = await prisma.event.findMany({
      where,
      orderBy: {createdAt: 'desc'},
      take: limit,
      include: {
        contact: {
          select: {
            email: true,
          },
        },
      },
    });

    return events.map(event => ({
      id: event.id,
      type: ActivityType.EVENT_TRIGGERED,
      timestamp: event.createdAt,
      contactEmail: event.contact?.email,
      contactId: event.contactId || undefined,
      metadata: {
        eventName: event.name,
        eventData: event.data,
      },
    }));
  }

  /**
   * Fetch email activities (sent, delivered, opened, clicked, bounced)
   */
  private static async fetchEmailActivities(
    projectId: string,
    limit: number,
    dateFilter: Prisma.DateTimeFilter,
    cursorTimestamp?: Date,
    cursorId?: string,
    contactId?: string,
    types?: ActivityType[],
  ): Promise<Activity[]> {
    const activities: Activity[] = [];

    // Determine which email statuses to fetch based on types filter
    const emailTypes = types
      ? types.filter(t => t.startsWith('email.'))
      : Object.values(ActivityType).filter(t => t.startsWith('email.'));

    if (emailTypes.length === 0) {
      return [];
    }

    const where: Prisma.EmailWhereInput = {
      projectId,
      ...(contactId ? {contactId} : {}),
    };

    const emails = await prisma.email.findMany({
      where: {
        ...where,
        createdAt: cursorTimestamp
          ? {
              ...dateFilter,
              lt: cursorTimestamp,
            }
          : dateFilter,
      },
      orderBy: {createdAt: 'desc'},
      take: limit,
      include: {
        contact: {
          select: {
            email: true,
          },
        },
        campaign: {
          select: {
            name: true,
          },
        },
        workflowExecution: {
          select: {
            workflow: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    // Convert each email into multiple activities based on its state
    for (const email of emails) {
      const baseMetadata = {
        subject: email.subject,
        sourceType: email.sourceType,
        campaignName: email.campaign?.name,
        workflowName: email.workflowExecution?.workflow?.name,
      };

      // Email sent
      if (email.sentAt && (!types || types.includes(ActivityType.EMAIL_SENT))) {
        activities.push({
          id: `${email.id}_sent`,
          type: ActivityType.EMAIL_SENT,
          timestamp: email.sentAt,
          contactEmail: email.contact.email,
          contactId: email.contactId,
          metadata: baseMetadata,
        });
      }

      // Email delivered
      if (email.deliveredAt && (!types || types.includes(ActivityType.EMAIL_DELIVERED))) {
        activities.push({
          id: `${email.id}_delivered`,
          type: ActivityType.EMAIL_DELIVERED,
          timestamp: email.deliveredAt,
          contactEmail: email.contact.email,
          contactId: email.contactId,
          metadata: baseMetadata,
        });
      }

      // Email opened
      if (email.openedAt && (!types || types.includes(ActivityType.EMAIL_OPENED))) {
        activities.push({
          id: `${email.id}_opened`,
          type: ActivityType.EMAIL_OPENED,
          timestamp: email.openedAt,
          contactEmail: email.contact.email,
          contactId: email.contactId,
          metadata: {
            ...baseMetadata,
            totalOpens: email.opens,
          },
        });
      }

      // Email clicked
      if (email.clickedAt && (!types || types.includes(ActivityType.EMAIL_CLICKED))) {
        activities.push({
          id: `${email.id}_clicked`,
          type: ActivityType.EMAIL_CLICKED,
          timestamp: email.clickedAt,
          contactEmail: email.contact.email,
          contactId: email.contactId,
          metadata: {
            ...baseMetadata,
            totalClicks: email.clicks,
          },
        });
      }

      // Email bounced
      if (email.bouncedAt && (!types || types.includes(ActivityType.EMAIL_BOUNCED))) {
        activities.push({
          id: `${email.id}_bounced`,
          type: ActivityType.EMAIL_BOUNCED,
          timestamp: email.bouncedAt,
          contactEmail: email.contact.email,
          contactId: email.contactId,
          metadata: {
            ...baseMetadata,
            error: email.error,
          },
        });
      }
    }

    return activities;
  }

  /**
   * Fetch workflow activities
   */
  private static async fetchWorkflowActivities(
    projectId: string,
    limit: number,
    dateFilter: Prisma.DateTimeFilter,
    cursorTimestamp?: Date,
    cursorId?: string,
    contactId?: string,
    types?: ActivityType[],
  ): Promise<Activity[]> {
    // Skip if filtering by types and workflow types are not included
    if (types && !types.some(t => t.startsWith('workflow.'))) {
      return [];
    }

    const activities: Activity[] = [];

    const where: Prisma.WorkflowExecutionWhereInput = {
      workflow: {
        projectId,
      },
      ...(contactId ? {contactId} : {}),
    };

    const executions = await prisma.workflowExecution.findMany({
      where: {
        ...where,
        startedAt: cursorTimestamp
          ? {
              ...dateFilter,
              lt: cursorTimestamp,
            }
          : dateFilter,
      },
      orderBy: {startedAt: 'desc'},
      take: limit,
      include: {
        contact: {
          select: {
            email: true,
          },
        },
        workflow: {
          select: {
            name: true,
          },
        },
      },
    });

    for (const execution of executions) {
      // Workflow started
      if (!types || types.includes(ActivityType.WORKFLOW_STARTED)) {
        activities.push({
          id: `${execution.id}_started`,
          type: ActivityType.WORKFLOW_STARTED,
          timestamp: execution.startedAt,
          contactEmail: execution.contact?.email,
          contactId: execution.contactId,
          metadata: {
            workflowName: execution.workflow.name,
            status: execution.status,
          },
        });
      }

      // Workflow completed
      if (execution.completedAt && (!types || types.includes(ActivityType.WORKFLOW_COMPLETED))) {
        activities.push({
          id: `${execution.id}_completed`,
          type: ActivityType.WORKFLOW_COMPLETED,
          timestamp: execution.completedAt,
          contactEmail: execution.contact?.email,
          contactId: execution.contactId,
          metadata: {
            workflowName: execution.workflow.name,
            status: execution.status,
            exitReason: execution.exitReason,
          },
        });
      }
    }

    return activities;
  }
}
