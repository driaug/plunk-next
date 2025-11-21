import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui';
import type {Segment} from '@repo/db';
import {CampaignAudienceType} from '@repo/db';
import {DashboardLayout} from '../../components/DashboardLayout';
import {EmailDomainInput} from '../../components/EmailDomainInput';
import {network} from '../../lib/network';
import {ArrowLeft, Save} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/router';
import {useState} from 'react';
import {toast} from 'sonner';
import useSWR from 'swr';

export default function CreateCampaignPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [from, setFrom] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [audienceType, setAudienceType] = useState<CampaignAudienceType>(CampaignAudienceType.ALL);
  const [segmentId, setSegmentId] = useState('');
  const [saving, setSaving] = useState(false);

  const {data: segments} = useSWR<Segment[]>('/segments', {revalidateOnFocus: false});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('Campaign name is required');
      return;
    }

    if (!subject.trim()) {
      toast.error('Email subject is required');
      return;
    }

    if (!body.trim()) {
      toast.error('Email body is required');
      return;
    }

    if (!from.trim()) {
      toast.error('From address is required');
      return;
    }

    if (audienceType === CampaignAudienceType.SEGMENT && !segmentId) {
      toast.error('Please select a segment');
      return;
    }

    setSaving(true);

    try {
      const response = await network.fetch<{data: {id: string}}>('POST', '/campaigns', {
        name,
        description: description || undefined,
        subject,
        body,
        from,
        replyTo: replyTo || undefined,
        audienceType,
        segmentId: audienceType === CampaignAudienceType.SEGMENT ? segmentId : undefined,
        audienceFilter: audienceType === CampaignAudienceType.FILTERED ? [] : undefined,
      } as any);

      toast.success('Campaign created successfully');
      void router.push(`/campaigns/${response.data.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create campaign');
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/campaigns">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-neutral-900">Create Campaign</h1>
            <p className="text-neutral-500 mt-1">Create a new email campaign to send to your contacts</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle>Campaign Details</CardTitle>
              <CardDescription>Configure your campaign settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name">
                  Campaign Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  placeholder="e.g., Spring Sale Announcement"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <textarea
                  id="description"
                  placeholder="Optional description for internal use"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm resize-none"
                />
              </div>

              {/* Email Content */}
              <div className="space-y-4">
                <EmailDomainInput
                  id="from"
                  label="From Email *"
                  value={from}
                  onChange={setFrom}
                  required
                  placeholder="hello"
                />

                <EmailDomainInput
                  id="replyTo"
                  label="Reply-To Email"
                  value={replyTo}
                  onChange={setReplyTo}
                  placeholder="support"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">
                  Email Subject <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="subject"
                  placeholder="e.g., Introducing our Spring Sale!"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="body">
                  Email Body <span className="text-red-500">*</span>
                </Label>
                <textarea
                  id="body"
                  placeholder="Write your email content here... You can use {{variable}} placeholders."
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={10}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm resize-none font-mono"
                  required
                />
                <p className="text-xs text-neutral-500">
                  Tip: Use placeholders like {'{'}
                  {'{'}email{'}'}
                  {'}'} or {'{'}
                  {'{'}firstName{'}'}
                  {'}'} to personalize emails
                </p>
              </div>

              {/* Audience Type */}
              <div className="space-y-2">
                <Label htmlFor="audienceType">
                  Audience <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={audienceType}
                  onValueChange={value => setAudienceType(value as CampaignAudienceType)}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select audience type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CampaignAudienceType.ALL}>All Subscribed Contacts</SelectItem>
                    <SelectItem value={CampaignAudienceType.SEGMENT}>Segment</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Segment Selection */}
              {audienceType === CampaignAudienceType.SEGMENT && (
                <div className="space-y-2">
                  <Label htmlFor="segment">
                    Select Segment <span className="text-red-500">*</span>
                  </Label>
                  <Select value={segmentId} onValueChange={setSegmentId} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a segment" />
                    </SelectTrigger>
                    <SelectContent>
                      {segments?.map(segment => (
                        <SelectItem key={segment.id} value={segment.id}>
                          {segment.name} ({segment.memberCount} contacts)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {segments?.length === 0 && (
                    <p className="text-sm text-neutral-500">
                      No segments found.{' '}
                      <Link href="/segments/new" className="text-primary hover:underline">
                        Create one first
                      </Link>
                    </p>
                  )}
                </div>
              )}

              {/* Info Box */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900">
                  <strong>Note:</strong> After creating the campaign, you'll be able to review the recipients and
                  schedule or send it immediately.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6">
            <Link href="/campaigns">
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Link>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>Saving...</>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Create Campaign
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
