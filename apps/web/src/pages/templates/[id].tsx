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
import type {Template} from '@repo/db';
import {DashboardLayout} from '../../components/DashboardLayout';
import {EmailDomainInput} from '../../components/EmailDomainInput';
import {network} from '../../lib/network';
import {ArrowLeft, Save} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/router';
import {useEffect, useState} from 'react';
import {toast} from 'sonner';
import useSWR from 'swr';
import {TemplateSchemas} from '@repo/shared';

export default function TemplateEditorPage() {
  const router = useRouter();
  const {id} = router.query;

  const {data: template, mutate} = useSWR<Template>(id ? `/templates/${id}` : null, {
    revalidateOnFocus: false,
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('');
  const [from, setFrom] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState<'MARKETING' | 'TRANSACTIONAL'>('MARKETING');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Load template data into form
  useEffect(() => {
    if (template) {
      setName(template.name);
      setDescription(template.description ?? '');
      setSubject(template.subject);
      setFrom(template.from);
      setReplyTo(template.replyTo ?? '');
      setBody(template.body);
      setType(template.type);
    }
  }, [template]);

  // Track changes
  useEffect(() => {
    if (!template) return;

    const changed =
      name !== template.name ||
      description !== (template.description ?? '') ||
      subject !== template.subject ||
      from !== template.from ||
      replyTo !== (template.replyTo ?? '') ||
      body !== template.body ||
      type !== template.type;

    setHasChanges(changed);
  }, [name, description, subject, from, replyTo, body, type, template]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await network.fetch<Template, typeof TemplateSchemas.update>('PATCH', `/templates/${id}`, {
        name,
        description: description || undefined,
        subject,
        body,
        from,
        replyTo: replyTo || undefined,
        type,
      });

      toast.success('Template saved successfully');
      setHasChanges(false);
      void mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save template');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!template) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <svg
              className="h-8 w-8 animate-spin mx-auto text-neutral-900"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <p className="mt-2 text-sm text-neutral-500">Loading template...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <form onSubmit={handleSave} className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/templates">
              <Button type="button" variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-neutral-900">Edit Template</h1>
              <p className="text-neutral-500 mt-1">Make changes to your email template</p>
            </div>
          </div>
          <Button type="submit" disabled={!hasChanges || isSubmitting}>
            <Save className="h-4 w-4" />
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>

        {/* Template Editor */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left Column - Template Settings */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Template Settings</CardTitle>
                <CardDescription>Configure the basic settings for your template</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="name">Template Name *</Label>
                  <Input
                    id="name"
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    placeholder="Welcome Email"
                  />
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    type="text"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Sent to new subscribers"
                  />
                </div>

                <div>
                  <Label htmlFor="type">Type *</Label>
                  <Select value={type} onValueChange={value => setType(value as any)}>
                    <SelectTrigger id="type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MARKETING">Marketing</SelectItem>
                      <SelectItem value="TRANSACTIONAL">Transactional</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-neutral-500 mt-1">
                    Marketing emails require unsubscribe links. Transactional emails are for account notifications.
                  </p>
                </div>

                <div>
                  <Label htmlFor="subject">Subject Line *</Label>
                  <Input
                    id="subject"
                    type="text"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    required
                    placeholder="Welcome to our platform!"
                  />
                  <p className="text-xs text-neutral-500 mt-1">Use {'{{variableName}}'} for dynamic content</p>
                </div>

                <div>
                  <EmailDomainInput
                    id="from"
                    label="From Email *"
                    value={from}
                    onChange={setFrom}
                    required
                    placeholder="hello"
                  />
                </div>

                <div>
                  <EmailDomainInput
                    id="replyTo"
                    label="Reply-To Email"
                    value={replyTo}
                    onChange={setReplyTo}
                    placeholder="support"
                  />
                </div>
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
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    required
                    placeholder="<h1>Welcome!</h1><p>Thanks for subscribing to our newsletter.</p>"
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm font-mono"
                    rows={20}
                  />
                  <p className="text-xs text-neutral-500 mt-2">
                    Available variables: {'{{email}}'}, {'{{firstName}}'}, {'{{lastName}}'}, and any custom contact data
                  </p>
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
                    <p className="text-xs text-neutral-500">From: {from || 'your-email@example.com'}</p>
                    {replyTo && <p className="text-xs text-neutral-500">Reply-To: {replyTo}</p>}
                    <p className="font-medium mt-2">{subject || 'Your subject line'}</p>
                  </div>
                  <div
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{
                      __html: body || '<p className="text-neutral-400">Your email content will appear here</p>',
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Usage Stats */}
        <Card>
          <CardHeader>
            <CardTitle>Template Usage</CardTitle>
            <CardDescription>Where this template is being used</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-neutral-500">
              Usage statistics will be displayed here (workflows, campaigns, total emails sent)
            </p>
          </CardContent>
        </Card>
      </form>
    </DashboardLayout>
  );
}
