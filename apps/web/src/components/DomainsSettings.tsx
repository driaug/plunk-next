import {useEffect, useState} from 'react';
import {useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {DomainSchemas} from '@repo/shared';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from '@repo/ui';
import {AnimatePresence, motion} from 'framer-motion';
import {Check, CheckCircle2, Copy, Loader2, RefreshCw, Trash2, XCircle} from 'lucide-react';
import {useAddDomain, useCheckDomainVerification, useDomains, useRemoveDomain} from '../lib/hooks/useDomains';

interface DomainsSettingsProps {
  projectId: string;
}

export function DomainsSettings({projectId}: DomainsSettingsProps) {
  const {domains, mutate: mutateDomains, isLoading} = useDomains(projectId);
  const {addDomain} = useAddDomain();
  const {checkVerification} = useCheckDomainVerification();
  const {removeDomain} = useRemoveDomain();

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<{[key: string]: any}>({});
  const [checkingVerification, setCheckingVerification] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [lastVerificationCheck, setLastVerificationCheck] = useState<{[key: string]: number}>({});
  const [cooldownSeconds, setCooldownSeconds] = useState<{[key: string]: number}>({});

  const form = useForm<{domain: string}>({
    resolver: zodResolver(DomainSchemas.create.omit({projectId: true})),
    defaultValues: {
      domain: '',
    },
  });

  // Handle cooldown timer
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const newCooldowns: {[key: string]: number} = {};
      let hasActiveCooldowns = false;

      Object.keys(lastVerificationCheck).forEach(domainId => {
        const lastCheck = lastVerificationCheck[domainId];
        if (lastCheck === undefined) return;

        const elapsedSeconds = Math.floor((now - lastCheck) / 1000);
        const remainingSeconds = 10 - elapsedSeconds;

        if (remainingSeconds > 0) {
          newCooldowns[domainId] = remainingSeconds;
          hasActiveCooldowns = true;
        }
      });

      setCooldownSeconds(newCooldowns);

      // Clear interval if no active cooldowns
      if (!hasActiveCooldowns && Object.keys(newCooldowns).length === 0) {
        clearInterval(interval);
      }
    }, 100); // Update every 100ms for smooth countdown

    return () => clearInterval(interval);
  }, [lastVerificationCheck]);

  const showMessage = (type: 'success' | 'error', message: string) => {
    if (type === 'success') {
      setSuccessMessage(message);
      setErrorMessage(null);
      setTimeout(() => setSuccessMessage(null), 5000);
    } else {
      setErrorMessage(message);
      setSuccessMessage(null);
    }
  };

  const onSubmit = async (values: {domain: string}) => {
    try {
      setErrorMessage(null);
      const newDomain = await addDomain(projectId, values.domain);

      // Store DKIM tokens for display
      if (newDomain.dkimTokens) {
        setVerificationStatus(prev => ({
          ...prev,
          [newDomain.id]: {
            tokens: newDomain.dkimTokens,
            status: 'Pending',
            verified: false,
          },
        }));
        setSelectedDomain(newDomain.id);
      }

      await mutateDomains();
      form.reset();
      showMessage('success', `Domain ${values.domain} added successfully. Please configure DNS records.`);
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Failed to add domain');
    }
  };

  const handleCheckVerification = async (domainId: string) => {
    // Check if cooldown is active
    const now = Date.now();
    const lastCheck = lastVerificationCheck[domainId];
    if (lastCheck) {
      const elapsedSeconds = Math.floor((now - lastCheck) / 1000);
      if (elapsedSeconds < 10) {
        return; // Still in cooldown, do nothing
      }
    }

    try {
      setCheckingVerification(domainId);
      setLastVerificationCheck(prev => ({
        ...prev,
        [domainId]: now,
      }));

      const status = await checkVerification(domainId);

      setVerificationStatus(prev => ({
        ...prev,
        [domainId]: status,
      }));

      await mutateDomains();

      if (status.verified) {
        showMessage('success', `Domain ${status.domain} is verified!`);
      } else {
        showMessage('error', `Domain ${status.domain} is not yet verified. Please check your DNS records.`);
      }
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Failed to check verification');
    } finally {
      setCheckingVerification(null);
    }
  };

  const handleRemoveDomain = async (domainId: string, domain: string) => {
    if (!confirm(`Are you sure you want to remove ${domain}?`)) {
      return;
    }

    try {
      await removeDomain(domainId);
      await mutateDomains();
      if (selectedDomain === domainId) {
        setSelectedDomain(null);
      }
      showMessage('success', `Domain ${domain} removed successfully`);
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Failed to remove domain');
    }
  };

  const handleCopyToken = async (token: string, index: number) => {
    await navigator.clipboard.writeText(token);
    setCopiedToken(`${token}-${index}`);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const getDomainStatus = (domain: any) => {
    const status = verificationStatus[domain.id];
    return (
      status || {verified: domain.verified, tokens: domain.dkimTokens, status: domain.verified ? 'Success' : 'Pending'}
    );
  };

  return (
    <div className="space-y-6">
      {/* Add Domain Form */}
      <Card>
        <CardHeader>
          <CardTitle>Add Domain</CardTitle>
          <CardDescription>Add a custom domain to send emails from</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="domain"
                render={({field}) => (
                  <FormItem>
                    <FormLabel>Domain</FormLabel>
                    <FormControl>
                      <Input placeholder="example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                    <p className="text-xs text-neutral-500 mt-1">
                      Enter your domain without any subdomain or protocol (e.g., example.com)
                    </p>
                  </FormItem>
                )}
              />

              {/* Success/Error Messages */}
              <AnimatePresence mode="wait">
                {successMessage && (
                  <motion.div
                    initial={{opacity: 0, y: -10}}
                    animate={{opacity: 1, y: 0}}
                    exit={{opacity: 0}}
                    className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800"
                  >
                    {successMessage}
                  </motion.div>
                )}
                {errorMessage && (
                  <motion.div
                    initial={{opacity: 0, y: -10}}
                    animate={{opacity: 1, y: 0}}
                    exit={{opacity: 0}}
                    className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800"
                  >
                    {errorMessage}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex justify-end">
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? 'Adding...' : 'Add Domain'}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Domains List */}
      <Card>
        <CardHeader>
          <CardTitle>Your Domains</CardTitle>
          <CardDescription>Manage your verified domains</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
            </div>
          ) : !domains || domains.length === 0 ? (
            <div className="text-center py-8 text-neutral-500">
              <p>No domains added yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {domains.map(domain => {
                const status = getDomainStatus(domain);
                return (
                  <div key={domain.id} className="border border-neutral-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <h3 className="font-medium text-neutral-900">{domain.domain}</h3>
                        {status.verified ? (
                          <Badge variant="success" className="flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Verified
                          </Badge>
                        ) : (
                          <Badge variant="warning" className="flex items-center gap-1">
                            <XCircle className="h-3 w-3" />
                            Pending
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCheckVerification(domain.id)}
                          disabled={checkingVerification === domain.id || cooldownSeconds[domain.id] > 0}
                          className="min-w-[80px]"
                        >
                          {checkingVerification === domain.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : cooldownSeconds[domain.id] > 0 ? (
                            <span className="text-xs">{cooldownSeconds[domain.id]}s</span>
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveDomain(domain.id, domain.domain)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {!status.verified && status.tokens && status.tokens.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-neutral-200">
                        <Alert>
                          <AlertDescription>
                            <div className="space-y-4">
                              <div>
                                <p className="font-medium text-sm mb-1">DNS Configuration Required</p>
                                <p className="text-xs text-neutral-600">
                                  Add the following DNS records to verify your domain. DNS changes can take up to 48
                                  hours to propagate.
                                </p>
                              </div>

                              {/* DNS Records Table */}
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs border-collapse">
                                  <thead>
                                    <tr className="border-b border-neutral-200">
                                      <th className="text-left py-2 px-3 font-medium text-neutral-700 bg-neutral-50">
                                        Type
                                      </th>
                                      <th className="text-left py-2 px-3 font-medium text-neutral-700 bg-neutral-50">
                                        Name
                                      </th>
                                      <th className="text-left py-2 px-3 font-medium text-neutral-700 bg-neutral-50">
                                        Value
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-neutral-200">
                                    {/* DKIM Records */}
                                    {status.tokens.map((token: string, index: number) => (
                                      <tr key={index} className="hover:bg-neutral-50/50">
                                        <td className="py-3 px-3">
                                          <code className="text-xs font-medium text-neutral-900">CNAME</code>
                                        </td>
                                        <td className="py-3 px-3">
                                          <div className="flex items-center gap-2">
                                            <code className="text-xs font-mono text-neutral-700 break-all flex-1">
                                              {token}._domainkey.{domain.domain}
                                            </code>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() =>
                                                handleCopyToken(`${token}._domainkey.${domain.domain}`, index + 2000)
                                              }
                                              className="shrink-0 h-6 w-6 p-0"
                                            >
                                              {copiedToken ===
                                              `${token}._domainkey.${domain.domain}-${index + 2000}` ? (
                                                <Check className="h-3 w-3 text-green-600" />
                                              ) : (
                                                <Copy className="h-3 w-3" />
                                              )}
                                            </Button>
                                          </div>
                                        </td>
                                        <td className="py-3 px-3">
                                          <div className="flex items-center gap-2">
                                            <code className="text-xs font-mono text-neutral-700 break-all flex-1">
                                              {token}.dkim.amazonses.com
                                            </code>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => handleCopyToken(`${token}.dkim.amazonses.com`, index)}
                                              className="shrink-0 h-6 w-6 p-0"
                                            >
                                              {copiedToken === `${token}.dkim.amazonses.com-${index}` ? (
                                                <Check className="h-3 w-3 text-green-600" />
                                              ) : (
                                                <Copy className="h-3 w-3" />
                                              )}
                                            </Button>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}

                                    {/* MX Record */}
                                    <tr className="hover:bg-neutral-50/50">
                                      <td className="py-3 px-3">
                                        <code className="text-xs font-medium text-neutral-900">MX</code>
                                      </td>
                                      <td className="py-3 px-3">
                                        <div className="flex items-center gap-2">
                                          <code className="text-xs font-mono text-neutral-700 break-all flex-1">
                                            plunk.{domain.domain}
                                          </code>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleCopyToken(`plunk.${domain.domain}`, 3000)}
                                            className="shrink-0 h-6 w-6 p-0"
                                          >
                                            {copiedToken === `plunk.${domain.domain}-3000` ? (
                                              <Check className="h-3 w-3 text-green-600" />
                                            ) : (
                                              <Copy className="h-3 w-3" />
                                            )}
                                          </Button>
                                        </div>
                                      </td>
                                      <td className="py-3 px-3">
                                        <div className="flex items-center gap-2">
                                          <code className="text-xs font-mono text-neutral-700 break-all flex-1">
                                            10 feedback-smtp.eu-north-1.amazonses.com
                                          </code>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() =>
                                              handleCopyToken('10 feedback-smtp.eu-north-1.amazonses.com', 1000)
                                            }
                                            className="shrink-0 h-6 w-6 p-0"
                                          >
                                            {copiedToken === '10 feedback-smtp.eu-north-1.amazonses.com-1000' ? (
                                              <Check className="h-3 w-3 text-green-600" />
                                            ) : (
                                              <Copy className="h-3 w-3" />
                                            )}
                                          </Button>
                                        </div>
                                      </td>
                                    </tr>

                                    {/* TXT Record (SPF) */}
                                    <tr className="hover:bg-neutral-50/50">
                                      <td className="py-3 px-3">
                                        <code className="text-xs font-medium text-neutral-900">TXT</code>
                                      </td>
                                      <td className="py-3 px-3">
                                        <div className="flex items-center gap-2">
                                          <code className="text-xs font-mono text-neutral-700 break-all flex-1">
                                            plunk.{domain.domain}
                                          </code>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleCopyToken(`plunk.${domain.domain}`, 3001)}
                                            className="shrink-0 h-6 w-6 p-0"
                                          >
                                            {copiedToken === `plunk.${domain.domain}-3001` ? (
                                              <Check className="h-3 w-3 text-green-600" />
                                            ) : (
                                              <Copy className="h-3 w-3" />
                                            )}
                                          </Button>
                                        </div>
                                      </td>
                                      <td className="py-3 px-3">
                                        <div className="flex items-center gap-2">
                                          <code className="text-xs font-mono text-neutral-700 break-all flex-1">
                                            "v=spf1 include:amazonses.com ~all"
                                          </code>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleCopyToken('"v=spf1 include:amazonses.com ~all"', 1001)}
                                            className="shrink-0 h-6 w-6 p-0"
                                          >
                                            {copiedToken === '"v=spf1 include:amazonses.com ~all"-1001' ? (
                                              <Check className="h-3 w-3 text-green-600" />
                                            ) : (
                                              <Copy className="h-3 w-3" />
                                            )}
                                          </Button>
                                        </div>
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>

                              <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                                <div className="text-blue-600 mt-0.5">
                                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                                    <path
                                      fillRule="evenodd"
                                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                </div>
                                <p className="text-xs text-blue-900">
                                  Click the copy icon to copy record values. After adding all records to your DNS
                                  provider, use the refresh button above to verify your domain.
                                </p>
                              </div>
                            </div>
                          </AlertDescription>
                        </Alert>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
