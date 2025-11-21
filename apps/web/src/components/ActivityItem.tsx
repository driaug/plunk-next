import {Badge} from '@repo/ui';
import type {Activity} from './ActivityFeed';
import {AlertCircle, CheckCheck, CheckCircle, Eye, MousePointerClick, Send, Workflow, XCircle, Zap} from 'lucide-react';
import Link from 'next/link';

/**
 * Simple relative time formatter
 */
function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return 'just now';
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes} ${diffInMinutes === 1 ? 'minute' : 'minutes'} ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) {
    return `${diffInDays} ${diffInDays === 1 ? 'day' : 'days'} ago`;
  }

  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return `${diffInMonths} ${diffInMonths === 1 ? 'month' : 'months'} ago`;
  }

  const diffInYears = Math.floor(diffInMonths / 12);
  return `${diffInYears} ${diffInYears === 1 ? 'year' : 'years'} ago`;
}

interface ActivityItemProps {
  activity: Activity;
}

interface ActivityConfig {
  icon: React.ComponentType<{className?: string}>;
  color: string;
  bgColor: string;
  title: string;
  description?: string;
  badge?: {
    label: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
  };
}

function getActivityConfig(activity: Activity): ActivityConfig {
  const {type, metadata} = activity;

  switch (type) {
    case 'event.triggered':
      return {
        icon: Zap,
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
        title: metadata.eventName || 'Event triggered',
        description: metadata.eventData ? JSON.stringify(metadata.eventData).substring(0, 100) : undefined,
        badge: {
          label: 'Event',
          variant: 'default',
        },
      };

    case 'email.sent':
      return {
        icon: Send,
        color: 'text-green-600',
        bgColor: 'bg-green-100',
        title: metadata.subject || 'Email sent',
        description: metadata.campaignName
          ? `Campaign: ${metadata.campaignName}`
          : metadata.workflowName
            ? `Workflow: ${metadata.workflowName}`
            : metadata.sourceType,
        badge: {
          label: 'Sent',
          variant: 'default',
        },
      };

    case 'email.delivered':
      return {
        icon: CheckCircle,
        color: 'text-green-600',
        bgColor: 'bg-green-100',
        title: metadata.subject || 'Email delivered',
        description: metadata.campaignName
          ? `Campaign: ${metadata.campaignName}`
          : metadata.workflowName
            ? `Workflow: ${metadata.workflowName}`
            : undefined,
        badge: {
          label: 'Delivered',
          variant: 'default',
        },
      };

    case 'email.opened':
      return {
        icon: Eye,
        color: 'text-purple-600',
        bgColor: 'bg-purple-100',
        title: metadata.subject || 'Email opened',
        description:
          metadata.totalOpens > 1
            ? `Opened ${metadata.totalOpens} times`
            : metadata.campaignName
              ? `Campaign: ${metadata.campaignName}`
              : metadata.workflowName
                ? `Workflow: ${metadata.workflowName}`
                : undefined,
        badge: {
          label: 'Opened',
          variant: 'secondary',
        },
      };

    case 'email.clicked':
      return {
        icon: MousePointerClick,
        color: 'text-orange-600',
        bgColor: 'bg-orange-100',
        title: metadata.subject || 'Email clicked',
        description:
          metadata.totalClicks > 1
            ? `Clicked ${metadata.totalClicks} times`
            : metadata.campaignName
              ? `Campaign: ${metadata.campaignName}`
              : metadata.workflowName
                ? `Workflow: ${metadata.workflowName}`
                : undefined,
        badge: {
          label: 'Clicked',
          variant: 'default',
        },
      };

    case 'email.bounced':
      return {
        icon: XCircle,
        color: 'text-red-600',
        bgColor: 'bg-red-100',
        title: metadata.subject || 'Email bounced',
        description: metadata.error || 'Email failed to deliver',
        badge: {
          label: 'Bounced',
          variant: 'destructive',
        },
      };

    case 'workflow.started':
      return {
        icon: Workflow,
        color: 'text-indigo-600',
        bgColor: 'bg-indigo-100',
        title: metadata.workflowName || 'Workflow started',
        description: `Status: ${metadata.status}`,
        badge: {
          label: 'Workflow',
          variant: 'default',
        },
      };

    case 'workflow.completed':
      return {
        icon: CheckCheck,
        color: 'text-green-600',
        bgColor: 'bg-green-100',
        title: metadata.workflowName || 'Workflow completed',
        description: metadata.exitReason ? `Exit: ${metadata.exitReason}` : `Status: ${metadata.status}`,
        badge: {
          label: 'Completed',
          variant: 'default',
        },
      };

    default:
      return {
        icon: AlertCircle,
        color: 'text-neutral-600',
        bgColor: 'bg-neutral-100',
        title: 'Unknown activity',
        badge: {
          label: 'Unknown',
          variant: 'outline',
        },
      };
  }
}

export function ActivityItem({activity}: ActivityItemProps) {
  const config = getActivityConfig(activity);
  const Icon = config.icon;
  const timestamp = new Date(activity.timestamp);
  const relativeTime = getRelativeTime(timestamp);

  return (
    <div className="flex items-start gap-4">
      {/* Icon */}
      <div className={`h-10 w-10 rounded-lg ${config.bgColor} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`h-5 w-5 ${config.color}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-medium text-neutral-900 truncate">{config.title}</p>
              {config.badge && <Badge variant={config.badge.variant}>{config.badge.label}</Badge>}
            </div>
            {config.description && <p className="text-sm text-neutral-500 line-clamp-2">{config.description}</p>}
            {activity.contactEmail && (
              <div className="flex items-center gap-2 mt-2">
                {activity.contactId ? (
                  <Link
                    href={`/contacts/${activity.contactId}`}
                    className="text-xs text-neutral-600 hover:text-neutral-900 hover:underline"
                  >
                    {activity.contactEmail}
                  </Link>
                ) : (
                  <span className="text-xs text-neutral-600">{activity.contactEmail}</span>
                )}
              </div>
            )}
          </div>
          <span className="text-xs text-neutral-400 flex-shrink-0 whitespace-nowrap" title={timestamp.toLocaleString()}>
            {relativeTime}
          </span>
        </div>
      </div>
    </div>
  );
}
