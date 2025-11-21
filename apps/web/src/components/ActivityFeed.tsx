import {Button} from '@repo/ui';
import {network} from '../lib/network';
import {ActivityItem} from './ActivityItem';
import {Loader2} from 'lucide-react';
import {useCallback, useEffect, useMemo, useState} from 'react';

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

export interface Activity {
  id: string;
  type: ActivityType;
  timestamp: string;
  contactEmail?: string;
  contactId?: string;
  metadata: Record<string, any>;
}

interface PaginatedActivities {
  activities: Activity[];
  nextCursor?: string;
  hasMore: boolean;
}

interface ActivityFeedProps {
  typeFilter?: string;
  dateRangeDays?: number;
  contactId?: string;
}

export function ActivityFeed({typeFilter, dateRangeDays = 30, contactId}: ActivityFeedProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Memoize start date to prevent recreation on every render
  const startDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - dateRangeDays);
    return date.toISOString();
  }, [dateRangeDays]);

  // Fetch activities
  const fetchActivities = useCallback(
    async (cursor?: string) => {
      try {
        if (cursor) {
          setIsLoadingMore(true);
        } else {
          setIsLoading(true);
          setActivities([]);
          setNextCursor(undefined);
          setHasMore(true);
        }
        setError(null);

        const params = new URLSearchParams({
          limit: '20', // Conservative limit to avoid overloading
          startDate: startDate,
        });

        if (cursor) {
          params.set('cursor', cursor);
        }
        if (typeFilter) {
          params.set('types', typeFilter);
        }
        if (contactId) {
          params.set('contactId', contactId);
        }

        const result = await network.fetch<PaginatedActivities>('GET', `/activity?${params.toString()}`);

        if (cursor) {
          // Append to existing activities
          setActivities(prev => [...prev, ...result.activities]);
        } else {
          // Replace activities
          setActivities(result.activities);
        }

        setNextCursor(result.nextCursor);
        setHasMore(result.hasMore);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load activities');
        console.error('Error fetching activities:', err);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [typeFilter, startDate, contactId],
  );

  // Initial fetch - only run once when filters change
  useEffect(() => {
    void fetchActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, startDate, contactId]);

  // Auto-refresh every 30 seconds for real-time updates
  useEffect(() => {
    // Don't set up auto-refresh if still loading initial data
    if (isLoading) {
      return;
    }

    const interval = setInterval(() => {
      // Only refresh if we're on the first page and not already loading
      if (!isLoading && !isLoadingMore && activities.length > 0) {
        void fetchActivities();
      }
    }, 30000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isLoadingMore, activities.length]);

  const loadMore = () => {
    if (nextCursor && hasMore && !isLoadingMore) {
      void fetchActivities(nextCursor);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 text-sm">{error}</p>
        <Button onClick={() => fetchActivities()} variant="outline" className="mt-4">
          Try Again
        </Button>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-neutral-500 text-sm">
          No activity found for the selected filters. Activities will appear here as they happen.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Activity Timeline */}
      <div className="space-y-4">
        {activities.map((activity, index) => (
          <div key={`${activity.id}-${index}`}>
            <ActivityItem activity={activity} />
            {index < activities.length - 1 && <div className="border-t border-neutral-100 my-4" />}
          </div>
        ))}
      </div>

      {/* Load More Button */}
      {hasMore && (
        <div className="flex justify-center pt-4">
          <Button onClick={loadMore} variant="outline" disabled={isLoadingMore}>
            {isLoadingMore ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Loading...
              </>
            ) : (
              'Load More'
            )}
          </Button>
        </div>
      )}

      {/* End of results indicator */}
      {!hasMore && activities.length > 0 && (
        <div className="text-center pt-4">
          <p className="text-sm text-neutral-400">You've reached the end of the activity feed</p>
        </div>
      )}
    </div>
  );
}
