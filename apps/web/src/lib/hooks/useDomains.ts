import useSWR from 'swr';
import {network} from '../network';

export interface Domain {
  id: string;
  domain: string;
  verified: boolean;
  dkimTokens: string[] | null;
  projectId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DomainVerificationStatus {
  domain: string;
  tokens: string[];
  status: string;
  verified: boolean;
}

/**
 * Hook to fetch domains for a project
 */
export function useDomains(projectId: string | undefined) {
  const {data, error, mutate, isLoading} = useSWR<Domain[]>(
    projectId ? `/domains/project/${projectId}` : null,
    async url => {
      return network.fetch('GET', url);
    },
  );

  return {
    domains: data,
    error,
    isLoading,
    mutate,
  };
}

/**
 * Hook to add a domain
 */
export function useAddDomain() {
  const addDomain = async (projectId: string, domain: string) => {
    return network.fetch<Domain, {projectId: string; domain: string}>('POST', '/domains', {
      projectId,
      domain,
    });
  };

  return {addDomain};
}

/**
 * Hook to check domain verification status
 */
export function useCheckDomainVerification() {
  const checkVerification = async (domainId: string) => {
    return network.fetch<DomainVerificationStatus>('GET', `/domains/${domainId}/verify`);
  };

  return {checkVerification};
}

/**
 * Hook to remove a domain
 */
export function useRemoveDomain() {
  const removeDomain = async (domainId: string) => {
    return network.fetch<{success: boolean}>('DELETE', `/domains/${domainId}`);
  };

  return {removeDomain};
}
