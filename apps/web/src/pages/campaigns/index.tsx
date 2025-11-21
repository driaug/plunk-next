import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui';
import type {Campaign} from '@repo/db';
import {CampaignStatus} from '@repo/db';
import {DashboardLayout} from '../../components/DashboardLayout';
import {network} from '../../lib/network';
import {Calendar, Mail, Plus, Users} from 'lucide-react';
import Link from 'next/link';
import {useState} from 'react';
import {toast} from 'sonner';
import useSWR from 'swr';

interface PaginatedCampaigns {
  campaigns: Campaign[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export default function CampaignsPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const {data, mutate, isLoading} = useSWR<PaginatedCampaigns>(
    `/campaigns?page=${page}&pageSize=20${statusFilter !== 'ALL' ? `&status=${statusFilter}` : ''}`,
    {revalidateOnFocus: false},
  );

  const getStatusBadge = (status: CampaignStatus) => {
    const variants: Record<CampaignStatus, {variant: any; label: string}> = {
      DRAFT: {variant: 'secondary', label: 'Draft'},
      SCHEDULED: {variant: 'default', label: 'Scheduled'},
      SENDING: {variant: 'default', label: 'Sending'},
      SENT: {variant: 'default', label: 'Sent'},
      CANCELLED: {variant: 'destructive', label: 'Cancelled'},
    };

    const config = variants[status];
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const handleCancel = async (campaignId: string) => {
    if (!confirm('Are you sure you want to cancel this campaign?')) {
      return;
    }

    try {
      await network.fetch('POST', `/campaigns/${campaignId}/cancel`);
      toast.success('Campaign cancelled successfully');
      void mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to cancel campaign');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">Campaigns</h1>
            <p className="text-neutral-500 mt-2">
              Send one-time email broadcasts to your contacts. {data?.total ? `${data.total} total campaigns` : ''}
            </p>
          </div>
          <Link href="/campaigns/create">
            <Button>
              <Plus className="h-4 w-4" />
              Create Campaign
            </Button>
          </Link>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <div className="flex-1">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Statuses</SelectItem>
                    <SelectItem value="DRAFT">Draft</SelectItem>
                    <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                    <SelectItem value="SENDING">Sending</SelectItem>
                    <SelectItem value="SENT">Sent</SelectItem>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Campaigns List */}
        <div className="space-y-4">
          {isLoading && (
            <Card>
              <CardContent className="py-8 text-center text-neutral-500">Loading campaigns...</CardContent>
            </Card>
          )}

          {!isLoading && data?.campaigns.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <Mail className="h-12 w-12 mx-auto text-neutral-300 mb-4" />
                <h3 className="text-lg font-semibold text-neutral-900 mb-2">No campaigns yet</h3>
                <p className="text-neutral-500 mb-4">Create your first campaign to send emails to your contacts.</p>
                <Link href="/campaigns/create">
                  <Button>
                    <Plus className="h-4 w-4" />
                    Create Campaign
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {data?.campaigns.map(campaign => (
            <Card key={campaign.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <CardTitle className="text-xl">
                        <Link href={`/campaigns/${campaign.id}`} className="hover:text-primary transition-colors">
                          {campaign.name}
                        </Link>
                      </CardTitle>
                      {getStatusBadge(campaign.status)}
                    </div>
                    {campaign.description && <CardDescription>{campaign.description}</CardDescription>}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="flex items-center gap-2 text-sm text-neutral-600">
                    <Users className="h-4 w-4" />
                    <span>
                      {campaign.sentCount} / {campaign.totalRecipients} sent
                    </span>
                  </div>
                  {campaign.openedCount > 0 && (
                    <div className="flex items-center gap-2 text-sm text-neutral-600">
                      <Mail className="h-4 w-4" />
                      <span>{((campaign.openedCount / campaign.sentCount) * 100).toFixed(1)}% opened</span>
                    </div>
                  )}
                  {campaign.scheduledFor && (
                    <div className="flex items-center gap-2 text-sm text-neutral-600">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {new Date(campaign.scheduledFor).toLocaleDateString()} at{' '}
                        {new Date(campaign.scheduledFor).toLocaleTimeString()}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Link href={`/campaigns/${campaign.id}`}>
                    <Button variant="outline" size="sm">
                      {campaign.status === 'DRAFT' ? 'Edit Campaign' : 'View Details'}
                    </Button>
                  </Link>

                  {(campaign.status === 'SCHEDULED' || campaign.status === 'SENDING') && (
                    <Button variant="destructive" size="sm" onClick={() => handleCancel(campaign.id)}>
                      Cancel
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              Previous
            </Button>
            <span className="flex items-center px-4 text-sm text-neutral-600">
              Page {page} of {data.totalPages}
            </span>
            <Button
              variant="outline"
              onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
              disabled={page === data.totalPages}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
