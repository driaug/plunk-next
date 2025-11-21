import useSWR from 'swr';
import {network} from '../network';

export interface ActivityStats {
  totalEvents: number;
  totalEmailsSent: number;
  totalEmailsOpened: number;
  totalEmailsClicked: number;
  totalWorkflowsStarted: number;
  openRate: number;
  clickRate: number;
}

export interface ContactsResponse {
  contacts: unknown[];
  total: number;
  cursor?: string;
  hasMore: boolean;
}

export interface CampaignsResponse {
  campaigns: unknown[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface DashboardStats {
  totalContacts: number;
  totalEmailsSent: number;
  totalCampaigns: number;
  openRate: number;
  isLoading: boolean;
  error: Error | undefined;
}

/**
 * Hook to fetch dashboard statistics
 * Fetches activity stats, contact count, and campaign count in parallel
 */
export function useDashboardStats(): DashboardStats {
  // Fetch activity stats (last 30 days by default)
  const {data: activityStats, error: activityError} = useSWR<ActivityStats>('/activity/stats', async (url: string) => {
    return network.fetch<ActivityStats>('GET', url);
  });

  // Fetch contacts (only need the total count)
  const {data: contactsData, error: contactsError} = useSWR<ContactsResponse>('/contacts?limit=1', async (url: string) => {
    return network.fetch<ContactsResponse>('GET', url);
  });

  // Fetch campaigns (only need the total count)
  const {data: campaignsData, error: campaignsError} = useSWR<CampaignsResponse>('/campaigns?pageSize=1', async (url: string) => {
    return network.fetch<CampaignsResponse>('GET', url);
  });

  const isLoading = !activityStats && !contactsData && !campaignsData;
  const error = activityError || contactsError || campaignsError;

  return {
    totalContacts: contactsData?.total ?? 0,
    totalEmailsSent: activityStats?.totalEmailsSent ?? 0,
    totalCampaigns: campaignsData?.total ?? 0,
    openRate: activityStats?.openRate ?? 0,
    isLoading,
    error,
  };
}
