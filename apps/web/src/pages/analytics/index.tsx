import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui';
import {DashboardLayout} from '../../components/DashboardLayout';
import {useAnalytics} from '../../lib/hooks/useAnalytics';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Eye,
  Mail,
  MousePointerClick,
  Send,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {useMemo, useState} from 'react';
import {Area, AreaChart, CartesianGrid, Line, LineChart, XAxis, YAxis} from 'recharts';

// Chart configurations
const volumeChartConfig = {
  emails: {
    label: 'Emails Sent',
    color: 'hsl(var(--chart-1))',
  },
  opens: {
    label: 'Opens',
    color: 'hsl(var(--chart-2))',
  },
  clicks: {
    label: 'Clicks',
    color: 'hsl(var(--chart-3))',
  },
} satisfies ChartConfig;

const engagementChartConfig = {
  openRate: {
    label: 'Open Rate',
    color: 'hsl(var(--chart-2))',
  },
} satisfies ChartConfig;

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState<string>('30');
  const days = parseInt(dateRange);

  const {stats, timeSeries, isLoading, error} = useAnalytics({days});

  // Calculate trends and additional metrics
  const deliveryRate = useMemo(() => {
    if (!stats?.totalEmailsSent) return 0;
    // Assuming delivered emails = sent - bounced (we'll need to add bounce tracking)
    return ((stats.totalEmailsSent - 0) / stats.totalEmailsSent) * 100;
  }, [stats]);

  const engagementRate = useMemo(() => {
    if (!stats?.totalEmailsSent) return 0;
    const engaged = stats.totalEmailsOpened + stats.totalEmailsClicked;
    return (engaged / stats.totalEmailsSent) * 100;
  }, [stats]);

  // Process time series data for charts
  const chartData = useMemo(() => {
    if (timeSeries && timeSeries.length > 0) {
      return timeSeries.map(point => ({
        date: new Date(point.date).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}),
        emails: point.emails,
        opens: point.opens,
        clicks: point.clicks,
        openRate: point.emails > 0 ? Number(((point.opens / point.emails) * 100).toFixed(1)) : 0,
      }));
    }

    // Return empty array if no data
    return [];
  }, [timeSeries]);

  // Check if we have any real data
  const hasData = useMemo(() => {
    return chartData.some(point => point.emails > 0 || point.opens > 0 || point.clicks > 0);
  }, [chartData]);

  // Calculate cumulative totals
  const cumulativeTotals = useMemo(() => {
    return chartData.reduce(
      (acc, day) => ({
        emails: acc.emails + (day.emails || 0),
        opens: acc.opens + (day.opens || 0),
        clicks: acc.clicks + (day.clicks || 0),
      }),
      {emails: 0, opens: 0, clicks: 0},
    );
  }, [chartData]);

  const statsCards = [
    {
      name: 'Total Emails',
      value: stats?.totalEmailsSent?.toLocaleString() || cumulativeTotals.emails.toLocaleString(),
      icon: Send,
      description: `Last ${days} days`,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
      trend: stats?.totalEmailsSent ? (stats.totalEmailsSent > 0 ? 'positive' : 'neutral') : 'neutral',
    },
    {
      name: 'Open Rate',
      value: stats?.openRate ? `${stats.openRate.toFixed(1)}%` : '0%',
      icon: Eye,
      description: `${stats?.totalEmailsOpened?.toLocaleString() || cumulativeTotals.opens.toLocaleString()} opens`,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
      trend: stats?.openRate && stats.openRate > 20 ? 'positive' : 'neutral',
    },
    {
      name: 'Click Rate',
      value: stats?.clickRate ? `${stats.clickRate.toFixed(1)}%` : '0%',
      icon: MousePointerClick,
      description: `${stats?.totalEmailsClicked?.toLocaleString() || cumulativeTotals.clicks.toLocaleString()} clicks`,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
      trend: stats?.clickRate && stats.clickRate > 3 ? 'positive' : 'neutral',
    },
    {
      name: 'Engagement',
      value: `${engagementRate.toFixed(1)}%`,
      icon: TrendingUp,
      description: 'Opens + Clicks',
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
      trend: engagementRate > 20 ? 'positive' : 'neutral',
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">Analytics</h1>
            <p className="text-neutral-500 mt-2">
              Comprehensive insights into your email performance, engagement metrics, and delivery statistics.
            </p>
          </div>
          <div className="flex gap-3">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 text-red-700">
                <AlertCircle className="h-5 w-5" />
                <span>Failed to load analytics data. Please try again.</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statsCards.map(stat => {
            const Icon = stat.icon;
            const TrendIcon = stat.trend === 'positive' ? TrendingUp : TrendingDown;
            return (
              <Card key={stat.name}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardDescription>{stat.name}</CardDescription>
                    <div className={`h-10 w-10 rounded-lg ${stat.bgColor} flex items-center justify-center`}>
                      <Icon className={`h-5 w-5 ${stat.color}`} />
                    </div>
                  </div>
                  <CardTitle className="text-2xl">{isLoading ? '-' : stat.value}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-neutral-500">{stat.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Email Volume Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Email Volume Trends</CardTitle>
            <CardDescription>Daily email sends, opens, and clicks over the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            {!hasData ? (
              <div className="flex h-[400px] w-full items-center justify-center">
                <div className="text-center">
                  <Mail className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <h3 className="mt-4 text-sm font-semibold text-neutral-900">No email data yet</h3>
                  <p className="mt-2 text-sm text-muted-foreground">Send your first email to see analytics here</p>
                </div>
              </div>
            ) : (
              <ChartContainer config={volumeChartConfig} className="h-[400px] w-full">
                <AreaChart data={chartData} margin={{top: 10, right: 10, left: 10, bottom: 0}}>
                  <defs>
                    <linearGradient id="fillEmails" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-emails)" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="var(--color-emails)" stopOpacity={0.1} />
                    </linearGradient>
                    <linearGradient id="fillOpens" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-opens)" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="var(--color-opens)" stopOpacity={0.1} />
                    </linearGradient>
                    <linearGradient id="fillClicks" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-clicks)" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="var(--color-clicks)" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                  <ChartTooltip content={<ChartTooltipContent className="w-[150px]" />} />
                  <Area
                    dataKey="emails"
                    type="monotone"
                    fill="url(#fillEmails)"
                    stroke="var(--color-emails)"
                    stackId="a"
                  />
                  <Area
                    dataKey="opens"
                    type="monotone"
                    fill="url(#fillOpens)"
                    stroke="var(--color-opens)"
                    stackId="a"
                  />
                  <Area
                    dataKey="clicks"
                    type="monotone"
                    fill="url(#fillClicks)"
                    stroke="var(--color-clicks)"
                    stackId="a"
                  />
                  <ChartLegend content={ChartLegendContent as any} />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Engagement Rate Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Engagement Rate Trends</CardTitle>
            <CardDescription>Open rate percentage over time</CardDescription>
          </CardHeader>
          <CardContent>
            {!hasData ? (
              <div className="flex h-[300px] w-full items-center justify-center">
                <div className="text-center">
                  <Eye className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <h3 className="mt-4 text-sm font-semibold text-neutral-900">No engagement data</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Engagement metrics will appear once emails are opened
                  </p>
                </div>
              </div>
            ) : (
              <ChartContainer config={engagementChartConfig} className="h-[300px] w-full">
                <LineChart data={chartData} margin={{top: 10, right: 10, left: 10, bottom: 0}}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} />
                  <YAxis
                    domain={[0, 100]}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={value => `${value}%`}
                  />
                  <ChartTooltip content={<ChartTooltipContent className="w-[150px]" hideLabel />} cursor={false} />
                  <Line
                    dataKey="openRate"
                    type="monotone"
                    stroke="var(--color-openRate)"
                    strokeWidth={2}
                    dot={{
                      fill: 'var(--color-openRate)',
                      r: 4,
                    }}
                    activeDot={{
                      r: 6,
                    }}
                  />
                </LineChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Key Insights */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Performance Insights</CardTitle>
              <CardDescription>Key metrics and recommendations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-900">Open Rate</p>
                  <p className="text-sm text-neutral-500">
                    {stats?.openRate && stats.openRate > 20
                      ? 'Your open rate is above industry average!'
                      : 'Consider improving subject lines to increase open rates.'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <BarChart3 className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-900">Click Rate</p>
                  <p className="text-sm text-neutral-500">
                    {stats?.clickRate && stats.clickRate > 3
                      ? 'Great click-through performance!'
                      : 'Add more compelling calls-to-action to boost clicks.'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                  <Zap className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-900">Engagement</p>
                  <p className="text-sm text-neutral-500">
                    {stats?.totalWorkflowsStarted
                      ? `${stats.totalWorkflowsStarted.toLocaleString()} workflows started`
                      : 'Set up workflows to automate your email campaigns.'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Event Activity</CardTitle>
              <CardDescription>Custom events and triggers</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-neutral-900">{stats?.totalEvents?.toLocaleString() || '0'}</p>
                  <p className="text-sm text-neutral-500">Total Events</p>
                </div>
                <div className="h-12 w-12 rounded-lg bg-orange-100 flex items-center justify-center">
                  <Zap className="h-6 w-6 text-orange-600" />
                </div>
              </div>
              <div className="pt-4 border-t">
                <p className="text-sm text-neutral-500">
                  Events triggered by your contacts over the last {days} days. These can trigger workflows and
                  automations.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
