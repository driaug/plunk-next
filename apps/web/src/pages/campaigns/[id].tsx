import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui';
import type {Campaign, Segment} from '@repo/db';
import {CampaignAudienceType, CampaignStatus} from '@repo/db';
import {DashboardLayout} from '../../components/DashboardLayout';
import {EmailDomainInput} from '../../components/EmailDomainInput';
import {network} from '../../lib/network';
import {ArrowLeft, Calendar, Mail, MousePointer, Save, Send, TrendingUp, Users, XCircle} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/router';
import {useEffect, useState} from 'react';
import {toast} from 'sonner';
import useSWR from 'swr';

interface CampaignStats {
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  bouncedCount: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  deliveryRate: number;
}

export default function CampaignDetailsPage() {
  const router = useRouter();
  const {id} = router.query;

  const {
    data: campaign,
    mutate,
    isLoading,
  } = useSWR<{data: Campaign}>(id ? `/campaigns/${id}` : null, {revalidateOnFocus: false});

  const {data: stats} = useSWR<{data: CampaignStats}>(
    id && campaign?.data.status !== CampaignStatus.DRAFT ? `/campaigns/${id}/stats` : null,
    {
      revalidateOnFocus: false,
      refreshInterval: campaign?.data.status === CampaignStatus.SENDING ? 5000 : 0, // Refresh every 5s if sending
    },
  );

  // Fetch segments for audience selection
  const {data: segments} = useSWR<Segment[]>('/segments', {
    revalidateOnFocus: false,
  });

  const [editedCampaign, setEditedCampaign] = useState<Partial<Campaign>>({});
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [scheduledDateTime, setScheduledDateTime] = useState('');

  // Automatically initialize edit fields when campaign is loaded and is a draft
  const isEditMode = campaign?.data.status === CampaignStatus.DRAFT;

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this campaign?')) {
      return;
    }

    try {
      await network.fetch('POST', `/campaigns/${id}/cancel`);
      toast.success('Campaign cancelled successfully');
      void mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to cancel campaign');
    }
  };

  const handleSend = async () => {
    if (!confirm('Are you sure you want to send this campaign now? This action cannot be undone.')) {
      return;
    }

    try {
      await network.fetch('POST', `/campaigns/${id}/send`, {});
      toast.success('Campaign is being sent!');
      void mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send campaign');
    }
  };

  const handleSchedule = async () => {
    if (!scheduledDateTime) {
      toast.error('Please select a date and time');
      return;
    }

    const scheduledDate = new Date(scheduledDateTime);
    const now = new Date();

    if (scheduledDate.getTime() <= now.getTime()) {
      toast.error('Scheduled time must be in the future');
      return;
    }

    try {
      await network.fetch('POST', `/campaigns/${id}/send`, {
        scheduledFor: scheduledDate.toISOString(),
      });
      toast.success(`Campaign scheduled for ${scheduledDate.toLocaleString()}`);
      setIsScheduleDialogOpen(false);
      setScheduledDateTime('');
      void mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to schedule campaign');
    }
  };

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSubmitting(true);

    try {
      await network.fetch('PUT', `/campaigns/${id}`, editedCampaign);
      toast.success('Campaign updated successfully');
      setHasChanges(false);
      void mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update campaign');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Initialize edit fields when campaign loads and is a draft
  useEffect(() => {
    if (campaign?.data && isEditMode && Object.keys(editedCampaign).length === 0) {
      setEditedCampaign({
        name: campaign.data.name,
        description: campaign.data.description || '',
        subject: campaign.data.subject,
        body: campaign.data.body,
        from: campaign.data.from,
        replyTo: campaign.data.replyTo || '',
        audienceType: campaign.data.audienceType,
        segmentId: campaign.data.segmentId || undefined,
      });
    }
  }, [campaign, isEditMode, editedCampaign]);

  // Track changes
  useEffect(() => {
    if (!campaign?.data || Object.keys(editedCampaign).length === 0) return;

    const changed =
      editedCampaign.name !== campaign.data.name ||
      (editedCampaign.description || '') !== (campaign.data.description || '') ||
      editedCampaign.subject !== campaign.data.subject ||
      editedCampaign.body !== campaign.data.body ||
      editedCampaign.from !== campaign.data.from ||
      (editedCampaign.replyTo || '') !== (campaign.data.replyTo || '') ||
      editedCampaign.audienceType !== campaign.data.audienceType ||
      (editedCampaign.segmentId || null) !== (campaign.data.segmentId || null);

    setHasChanges(changed);
  }, [editedCampaign, campaign]);

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

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="h-8 w-8 animate-spin mx-auto border-4 border-neutral-200 border-t-neutral-900 rounded-full" />
            <p className="mt-2 text-sm text-neutral-500">Loading campaign...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!campaign) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-neutral-500">Campaign not found</p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const c = campaign.data;
  const s = stats?.data;

  // Render edit form for drafts
  if (isEditMode) {
    return (
      <DashboardLayout>
        <form onSubmit={handleSave} className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/campaigns">
                <Button type="button" variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-3xl font-bold text-neutral-900">Edit Campaign</h1>
                <p className="text-neutral-500 mt-1">Make changes to your campaign before sending</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={!hasChanges || isSubmitting}>
                <Save className="h-4 w-4" />
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button type="button" onClick={handleSend}>
                <Send className="h-4 w-4" />
                Send Now
              </Button>
              <Button type="button" variant="outline" onClick={() => setIsScheduleDialogOpen(true)}>
                <Calendar className="h-4 w-4" />
                Send Later
              </Button>
            </div>
          </div>

          {/* Campaign Editor */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Left Column - Campaign Settings */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Campaign Settings</CardTitle>
                  <CardDescription>Basic information about your campaign</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="name">Campaign Name *</Label>
                    <Input
                      id="name"
                      type="text"
                      value={editedCampaign.name || ''}
                      onChange={e => setEditedCampaign({...editedCampaign, name: e.target.value})}
                      required
                      placeholder="Spring Sale Campaign"
                    />
                  </div>

                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Input
                      id="description"
                      type="text"
                      value={editedCampaign.description || ''}
                      onChange={e => setEditedCampaign({...editedCampaign, description: e.target.value})}
                      placeholder="Optional description for internal use"
                    />
                  </div>

                  <div>
                    <Label htmlFor="subject">Subject Line *</Label>
                    <Input
                      id="subject"
                      type="text"
                      value={editedCampaign.subject || ''}
                      onChange={e => setEditedCampaign({...editedCampaign, subject: e.target.value})}
                      required
                      placeholder="Introducing our Spring Sale!"
                    />
                  </div>

                  <div>
                    <EmailDomainInput
                      id="from"
                      label="From Email *"
                      value={editedCampaign.from || ''}
                      onChange={value => setEditedCampaign({...editedCampaign, from: value})}
                      required
                      placeholder="hello"
                    />
                  </div>

                  <div>
                    <EmailDomainInput
                      id="replyTo"
                      label="Reply-To Email"
                      value={editedCampaign.replyTo || ''}
                      onChange={value => setEditedCampaign({...editedCampaign, replyTo: value})}
                      placeholder="support"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Audience</CardTitle>
                  <CardDescription>Who will receive this campaign</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="audienceType">Audience Type *</Label>
                    <Select
                      value={editedCampaign.audienceType ?? c.audienceType}
                      onValueChange={(value: CampaignAudienceType) => {
                        setEditedCampaign({
                          ...editedCampaign,
                          audienceType: value,
                          // Clear segmentId if changing away from SEGMENT
                          segmentId: value === CampaignAudienceType.SEGMENT ? editedCampaign.segmentId : undefined,
                        });
                      }}
                    >
                      <SelectTrigger id="audienceType">
                        <SelectValue placeholder="Select audience type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={CampaignAudienceType.ALL}>All Subscribed Contacts</SelectItem>
                        <SelectItem value={CampaignAudienceType.SEGMENT}>Segment</SelectItem>
                        <SelectItem value={CampaignAudienceType.FILTERED}>Filtered</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {(editedCampaign.audienceType ?? c.audienceType) === CampaignAudienceType.SEGMENT && (
                    <div>
                      <Label htmlFor="segment">Select Segment *</Label>
                      <Select
                        value={editedCampaign.segmentId ?? c.segmentId ?? undefined}
                        onValueChange={(value: string) => {
                          setEditedCampaign({
                            ...editedCampaign,
                            segmentId: value,
                          });
                        }}
                        disabled={!segments || segments.length === 0}
                      >
                        <SelectTrigger id="segment">
                          <SelectValue
                            placeholder={segments && segments.length > 0 ? 'Choose a segment' : 'No segments available'}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {segments &&
                            segments.length > 0 &&
                            segments.map(segment => (
                              <SelectItem key={segment.id} value={segment.id}>
                                {segment.name} ({segment.memberCount.toLocaleString()} contacts)
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      {segments && segments.length === 0 && (
                        <p className="text-xs text-neutral-500 mt-1">Create a segment first to use this option</p>
                      )}
                    </div>
                  )}

                  {editedCampaign.audienceType === CampaignAudienceType.FILTERED && (
                    <p className="text-sm text-neutral-500">
                      Filtered audiences are configured with advanced filter conditions
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Email Body */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Email Body</CardTitle>
                  <CardDescription>Write your email content using HTML</CardDescription>
                </CardHeader>
                <CardContent>
                  <div>
                    <Label htmlFor="body">HTML Content *</Label>
                    <textarea
                      id="body"
                      value={editedCampaign.body || ''}
                      onChange={e => setEditedCampaign({...editedCampaign, body: e.target.value})}
                      required
                      placeholder="<h1>Welcome!</h1><p>Your email content here...</p>"
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm font-mono resize-none"
                      rows={20}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Preview */}
              <Card>
                <CardHeader>
                  <CardTitle>Preview</CardTitle>
                  <CardDescription>How your email will look</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="border border-neutral-200 rounded-lg p-4 bg-white">
                    <div className="border-b border-neutral-200 pb-3 mb-3">
                      <p className="text-xs text-neutral-500">
                        From: {editedCampaign.from || 'your-email@example.com'}
                      </p>
                      {editedCampaign.replyTo && (
                        <p className="text-xs text-neutral-500">Reply-To: {editedCampaign.replyTo}</p>
                      )}
                      <p className="font-medium mt-2">{editedCampaign.subject || 'Your subject line'}</p>
                    </div>
                    <div
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{
                        __html:
                          editedCampaign.body || '<p class="text-neutral-400">Your email content will appear here</p>',
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Schedule Dialog */}
          <Dialog open={isScheduleDialogOpen} onOpenChange={setIsScheduleDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Schedule Campaign</DialogTitle>
                <DialogDescription>Choose when you want this campaign to be sent</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label htmlFor="scheduledDateTime">Send Date and Time</Label>
                  <Input
                    id="scheduledDateTime"
                    type="datetime-local"
                    value={scheduledDateTime}
                    onChange={e => setScheduledDateTime(e.target.value)}
                    min={new Date().toISOString().slice(0, 16)}
                    className="mt-2"
                  />
                  <p className="text-xs text-neutral-500 mt-2">Campaign will be sent at the specified date and time</p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsScheduleDialogOpen(false);
                    setScheduledDateTime('');
                  }}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={handleSchedule}>
                  Schedule Campaign
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </form>
      </DashboardLayout>
    );
  }

  // Render stats view for sent/scheduled campaigns
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/campaigns">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-neutral-900">{c.name}</h1>
                {getStatusBadge(c.status)}
              </div>
              {c.description && <p className="text-neutral-500">{c.description}</p>}
            </div>
          </div>

          {/* Actions */}
          {(c.status === CampaignStatus.SCHEDULED || c.status === CampaignStatus.SENDING) && (
            <Button variant="destructive" onClick={handleCancel}>
              <XCircle className="h-4 w-4" />
              Cancel
            </Button>
          )}
        </div>

        {/* Stats Cards */}
        {s && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Recipients</CardTitle>
                <Users className="h-4 w-4 text-neutral-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{s.totalRecipients.toLocaleString()}</div>
                <p className="text-xs text-neutral-500">
                  {s.sentCount.toLocaleString()} sent ({((s.sentCount / s.totalRecipients) * 100).toFixed(1)}%)
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Delivery Rate</CardTitle>
                <Mail className="h-4 w-4 text-neutral-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{s.deliveryRate.toFixed(1)}%</div>
                <p className="text-xs text-neutral-500">{s.deliveredCount.toLocaleString()} delivered</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Open Rate</CardTitle>
                <TrendingUp className="h-4 w-4 text-neutral-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{s.openRate.toFixed(1)}%</div>
                <p className="text-xs text-neutral-500">{s.openedCount.toLocaleString()} opened</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Click Rate</CardTitle>
                <MousePointer className="h-4 w-4 text-neutral-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{s.clickRate.toFixed(1)}%</div>
                <p className="text-xs text-neutral-500">{s.clickedCount.toLocaleString()} clicked</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Campaign Details in Grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Email Content */}
          <Card>
            <CardHeader>
              <CardTitle>Email Content</CardTitle>
              <CardDescription>Subject and message details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-neutral-500">Subject</p>
                  <p className="text-base mt-1">{c.subject}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-500">From</p>
                  <p className="text-base mt-1">{c.from}</p>
                </div>
                {c.replyTo && (
                  <div>
                    <p className="text-sm font-medium text-neutral-500">Reply-To</p>
                    <p className="text-base mt-1">{c.replyTo}</p>
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-neutral-500 mb-2">Email Body</p>
                <div className="border border-neutral-200 rounded-lg p-4 bg-neutral-50 max-h-64 overflow-y-auto">
                  <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{__html: c.body}} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Campaign Details */}
          <Card>
            <CardHeader>
              <CardTitle>Campaign Details</CardTitle>
              <CardDescription>Configuration and metadata</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm font-medium text-neutral-500">Audience</p>
                <p className="text-base mt-1">
                  {c.audienceType === CampaignAudienceType.ALL && 'All Subscribed Contacts'}
                  {c.audienceType === CampaignAudienceType.SEGMENT && (
                    <>
                      {segments?.find(s => s.id === c.segmentId)?.name || 'Selected Segment'}
                      {segments?.find(s => s.id === c.segmentId)?.memberCount && (
                        <span className="text-sm text-neutral-500">
                          {' '}
                          ({segments.find(s => s.id === c.segmentId)!.memberCount.toLocaleString()} contacts)
                        </span>
                      )}
                    </>
                  )}
                  {c.audienceType === CampaignAudienceType.FILTERED && 'Filtered Contacts'}
                </p>
              </div>

              {c.scheduledFor && (
                <div>
                  <p className="text-sm font-medium text-neutral-500">Scheduled For</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Calendar className="h-4 w-4 text-neutral-400" />
                    <p className="text-base">
                      {new Date(c.scheduledFor).toLocaleDateString()} at {new Date(c.scheduledFor).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              )}

              {c.sentAt && (
                <div>
                  <p className="text-sm font-medium text-neutral-500">Sent At</p>
                  <p className="text-base mt-1">
                    {new Date(c.sentAt).toLocaleDateString()} at {new Date(c.sentAt).toLocaleTimeString()}
                  </p>
                </div>
              )}

              <div>
                <p className="text-sm font-medium text-neutral-500">Created</p>
                <p className="text-base mt-1">{new Date(c.createdAt).toLocaleDateString()}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sending Progress */}
        {c.status === CampaignStatus.SENDING && s && (
          <Card>
            <CardHeader>
              <CardTitle>Sending Progress</CardTitle>
              <CardDescription>Real-time delivery status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Progress</span>
                    <span className="font-medium">
                      {s.sentCount} / {s.totalRecipients}
                    </span>
                  </div>
                  <div className="w-full bg-neutral-200 rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-500"
                      style={{width: `${(s.sentCount / s.totalRecipients) * 100}%`}}
                    />
                  </div>
                </div>
                <p className="text-sm text-neutral-500">This page updates automatically every 5 seconds</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
