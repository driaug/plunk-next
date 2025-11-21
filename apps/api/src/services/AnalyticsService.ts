import {prisma} from '../database/prisma.js';
import {redis} from '../database/redis.js';

/**
 * Time series data point for analytics
 */
export interface TimeSeriesDataPoint {
  date: string;
  emails: number;
  opens: number;
  clicks: number;
  bounces: number;
  delivered: number;
}

/**
 * Analytics Service
 *
 * PERFORMANCE CONSIDERATIONS:
 * - Aggregates data by day to reduce row count
 * - Uses Redis caching with 15-minute TTL
 * - Limits date ranges to prevent expensive queries
 * - Uses indexed fields (createdAt, projectId) for efficient filtering
 * - For 1M+ emails, consider background jobs for pre-aggregation
 */
export class AnalyticsService {
  private static readonly DEFAULT_DAYS_BACK = 30;
  private static readonly MAX_DAYS_BACK = 90;
  private static readonly TIMESERIES_CACHE_TTL = 900; // 15 minutes

  /**
   * Get time series data for email analytics
   *
   * Performance: O(n) where n = number of emails in date range
   * - Groups emails by day using SQL aggregation
   * - Cached in Redis for 15 minutes
   * - Limited to 90 days max to prevent performance issues
   *
   * For higher scale (1M+ emails/day), consider:
   * - Pre-aggregated daily stats table updated by background job
   * - Materialized view with daily refresh
   * - Time-series database (TimescaleDB, InfluxDB)
   */
  public static async getTimeSeriesData(
    projectId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<TimeSeriesDataPoint[]> {
    // Calculate date range with limits
    const now = new Date();
    const effectiveEndDate = endDate || now;
    const defaultStartDate = new Date(now.getTime() - this.DEFAULT_DAYS_BACK * 24 * 60 * 60 * 1000);
    const effectiveStartDate = startDate || defaultStartDate;

    // Enforce max date range
    const maxStartDate = new Date(now.getTime() - this.MAX_DAYS_BACK * 24 * 60 * 60 * 1000);
    const limitedStartDate = effectiveStartDate < maxStartDate ? maxStartDate : effectiveStartDate;

    // Check cache first
    const cacheKey = `analytics:timeseries:${projectId}:${limitedStartDate.toISOString()}:${effectiveEndDate.toISOString()}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Raw SQL query for efficient daily aggregation
    // Using raw SQL because Prisma's groupBy is less efficient for date truncation
    const result = await prisma.$queryRaw<
      {
        date: Date;
        total_emails: bigint;
        total_opens: bigint;
        total_clicks: bigint;
        total_bounces: bigint;
        total_delivered: bigint;
      }[]
    >`
			SELECT
				DATE_TRUNC('day', "createdAt") as date,
				COUNT(*) as total_emails,
				COUNT(CASE WHEN "openedAt" IS NOT NULL THEN 1 END) as total_opens,
				COUNT(CASE WHEN "clickedAt" IS NOT NULL THEN 1 END) as total_clicks,
				COUNT(CASE WHEN "bouncedAt" IS NOT NULL THEN 1 END) as total_bounces,
				COUNT(CASE WHEN "deliveredAt" IS NOT NULL THEN 1 END) as total_delivered
			FROM "emails"
			WHERE "projectId" = ${projectId}
				AND "createdAt" >= ${limitedStartDate}
				AND "createdAt" <= ${effectiveEndDate}
			GROUP BY DATE_TRUNC('day', "createdAt")
			ORDER BY date ASC
		`;

    // Convert to TimeSeriesDataPoint format
    const timeSeries: TimeSeriesDataPoint[] = result.map(row => ({
      date: row.date.toISOString(),
      emails: Number(row.total_emails),
      opens: Number(row.total_opens),
      clicks: Number(row.total_clicks),
      bounces: Number(row.total_bounces),
      delivered: Number(row.total_delivered),
    }));

    // Fill in missing dates with zero values
    const filledTimeSeries = this.fillMissingDates(timeSeries, limitedStartDate, effectiveEndDate);

    // Cache for 15 minutes
    await redis.setex(cacheKey, this.TIMESERIES_CACHE_TTL, JSON.stringify(filledTimeSeries));

    return filledTimeSeries;
  }

  /**
   * Get campaign performance metrics
   * Returns top performing campaigns by open rate
   */
  public static async getTopCampaigns(
    projectId: string,
    limit = 10,
    startDate?: Date,
    endDate?: Date,
  ): Promise<
    {
      id: string;
      subject: string;
      sentCount: number;
      openedCount: number;
      clickedCount: number;
      openRate: number;
      clickRate: number;
    }[]
  > {
    const now = new Date();
    const defaultStartDate = new Date(now.getTime() - this.DEFAULT_DAYS_BACK * 24 * 60 * 60 * 1000);

    const campaigns = await prisma.campaign.findMany({
      where: {
        projectId,
        sentAt: {
          gte: startDate || defaultStartDate,
          ...(endDate ? {lte: endDate} : {}),
        },
        status: 'SENT',
      },
      select: {
        id: true,
        subject: true,
        sentCount: true,
        openedCount: true,
        clickedCount: true,
      },
      orderBy: {
        openedCount: 'desc',
      },
      take: limit,
    });

    return campaigns.map(campaign => ({
      id: campaign.id,
      subject: campaign.subject || 'No subject',
      sentCount: campaign.sentCount || 0,
      openedCount: campaign.openedCount || 0,
      clickedCount: campaign.clickedCount || 0,
      openRate: campaign.sentCount ? ((campaign.openedCount || 0) / campaign.sentCount) * 100 : 0,
      clickRate: campaign.sentCount ? ((campaign.clickedCount || 0) / campaign.sentCount) * 100 : 0,
    }));
  }

  /**
   * Fill in missing dates in time series with zero values
   * Ensures consistent daily data points even when no emails were sent
   */
  private static fillMissingDates(data: TimeSeriesDataPoint[], startDate: Date, endDate: Date): TimeSeriesDataPoint[] {
    const result: TimeSeriesDataPoint[] = [];
    const dataMap = new Map(data.map(point => [new Date(point.date).toDateString(), point]));

    // Iterate through each day in range
    const currentDate = new Date(startDate);
    currentDate.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    while (currentDate <= end) {
      const dateKey = currentDate.toDateString();
      const existingData = dataMap.get(dateKey);

      if (existingData) {
        result.push(existingData);
      } else {
        // Fill with zeros for days with no data
        result.push({
          date: new Date(currentDate).toISOString(),
          emails: 0,
          opens: 0,
          clicks: 0,
          bounces: 0,
          delivered: 0,
        });
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return result;
  }
}
