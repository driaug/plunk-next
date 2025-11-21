import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@repo/ui';
import {Activity, AlertCircle, Mail, Send, TrendingUp, Users, Zap} from 'lucide-react';
import Link from 'next/link';
import {DashboardLayout} from '../components/DashboardLayout';
import {ApiKeyDisplay} from '../components/ApiKeyDisplay';
import {useActiveProject} from '../lib/contexts/ActiveProjectProvider';
import {useDashboardStats} from '../lib/hooks/useDashboardStats';

export default function Index() {
  const {activeProject} = useActiveProject();
  const {totalContacts, totalEmailsSent, totalCampaigns, openRate, isLoading} = useDashboardStats();

  const stats = [
    {
      name: 'Total Contacts',
      value: isLoading ? '-' : totalContacts.toLocaleString(),
      icon: Users,
    },
    {
      name: 'Emails Sent',
      value: isLoading ? '-' : totalEmailsSent.toLocaleString(),
      icon: Mail,
    },
    {
      name: 'Campaigns',
      value: isLoading ? '-' : totalCampaigns.toLocaleString(),
      icon: Send,
    },
    {
      name: 'Open Rate',
      value: isLoading ? '-' : `${openRate.toFixed(1)}%`,
      icon: TrendingUp,
    },
  ];

  const recentActivity = [
    {
      icon: Activity,
      title: 'Get Started',
      description: 'Create your first email template',
      time: 'Start now',
    },
    {
      icon: Zap,
      title: 'Add Contacts',
      description: 'Import your subscriber list',
      time: 'Quick setup',
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Subscription Warning Banner */}
        {activeProject && !activeProject.subscription && (
          <Alert variant="warning">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Upgrade to remove Plunk branding</AlertTitle>
            <AlertDescription className="flex items-center justify-between">
              <span>Your emails currently include Plunk branding. Upgrade to a subscription to remove it.</span>
              <Link href="/settings?tab=billing">
                <Button size="sm">Upgrade Now</Button>
              </Link>
            </AlertDescription>
          </Alert>
        )}

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Dashboard</h1>
          <p className="text-neutral-500 mt-2">
            Welcome back to {activeProject?.name || 'Plunk'}. Here's what's happening with your emails.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map(stat => {
            const Icon = stat.icon;
            return (
              <Card key={stat.name}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardDescription>{stat.name}</CardDescription>
                    <Icon className="h-4 w-4 text-neutral-500" />
                  </div>
                  <CardTitle className="text-2xl">{stat.value}</CardTitle>
                </CardHeader>
              </Card>
            );
          })}
        </div>

        {/* Quick Actions & Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Start</CardTitle>
              <CardDescription>Get started with Plunk in minutes</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivity.map((activity, index) => {
                  const Icon = activity.icon;
                  return (
                    <div key={index} className="flex items-start gap-4">
                      <div className="h-10 w-10 rounded-lg bg-neutral-100 flex items-center justify-center flex-shrink-0">
                        <Icon className="h-5 w-5 text-neutral-700" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-neutral-900">{activity.title}</p>
                        <p className="text-sm text-neutral-500">{activity.description}</p>
                      </div>
                      <span className="text-xs text-neutral-500 flex-shrink-0">{activity.time}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* API Keys */}
          <Card>
            <CardHeader>
              <CardTitle>API Keys</CardTitle>
              <CardDescription>Use these keys to integrate with Plunk</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activeProject ? (
                  <>
                    <ApiKeyDisplay
                      label="Public Key"
                      value={activeProject.public}
                      description="Use this key for client-side integrations"
                    />
                    <ApiKeyDisplay
                      label="Secret Key"
                      value={activeProject.secret}
                      description="Keep this key secure and never expose it publicly"
                      isSecret
                    />
                  </>
                ) : (
                  <p className="text-sm text-neutral-500">No project selected</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
