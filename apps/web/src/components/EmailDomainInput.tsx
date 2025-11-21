import {useEffect, useState} from 'react';
import {
  Alert,
  AlertDescription,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui';
import {AlertCircle} from 'lucide-react';
import {useDomains} from '../lib/hooks/useDomains';
import {useActiveProject} from '../lib/contexts/ActiveProjectProvider';

interface EmailDomainInputProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  required?: boolean;
  label?: string;
}

export function EmailDomainInput({value, onChange, id, placeholder, required, label}: EmailDomainInputProps) {
  const {activeProject} = useActiveProject();
  const {domains, isLoading} = useDomains(activeProject?.id);

  // Split the email into local part and domain
  const [localPart, setLocalPart] = useState('');
  const [selectedDomain, setSelectedDomain] = useState('');

  // Get verified domains only
  const verifiedDomains = domains?.filter(d => d.verified) || [];

  // Initialize from value
  useEffect(() => {
    if (value && value.includes('@')) {
      const [local, domain] = value.split('@');
      setLocalPart(local);

      // Check if the domain is in our verified list
      const matchingDomain = verifiedDomains.find(d => d.domain === domain);
      if (matchingDomain) {
        setSelectedDomain(domain);
      } else {
        // If domain not verified, keep it in the domain field
        setSelectedDomain(domain);
      }
    } else if (value) {
      // If no @ sign, treat entire value as local part
      setLocalPart(value);
    }
  }, [value]);

  // Initialize selected domain with first verified domain if none selected
  useEffect(() => {
    if (!selectedDomain && verifiedDomains.length > 0) {
      setSelectedDomain(verifiedDomains[0].domain);
    }
  }, [verifiedDomains, selectedDomain]);

  // Update parent component when local part or domain changes
  const handleUpdate = (newLocal: string, newDomain: string) => {
    if (newLocal && newDomain) {
      onChange(`${newLocal}@${newDomain}`);
    } else if (newLocal) {
      onChange(newLocal);
    } else {
      onChange('');
    }
  };

  const handleLocalPartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newLocal = e.target.value;
    setLocalPart(newLocal);
    handleUpdate(newLocal, selectedDomain);
  };

  const handleDomainChange = (newDomain: string) => {
    setSelectedDomain(newDomain);
    handleUpdate(localPart, newDomain);
  };

  if (isLoading) {
    return (
      <div>
        {label && <Label htmlFor={id}>{label}</Label>}
        <div className="flex items-center gap-2">
          <Input id={id} type="text" placeholder="Loading..." disabled className="flex-1" />
        </div>
      </div>
    );
  }

  if (verifiedDomains.length === 0) {
    return (
      <div>
        {label && <Label htmlFor={id}>{label}</Label>}
        <Alert variant="destructive" className="mt-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <p className="font-medium text-sm">No verified domains</p>
            <p className="text-xs mt-1">
              Please add and verify a domain in{' '}
              <a href="/settings?tab=domains" className="underline hover:text-red-800">
                Settings → Domains
              </a>{' '}
              before creating templates.
            </p>
          </AlertDescription>
        </Alert>
        {/* Fallback to regular email input */}
        <Input
          id={id}
          type="email"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || 'email@example.com'}
          required={required}
          className="mt-2"
        />
      </div>
    );
  }

  return (
    <div>
      {label && <Label htmlFor={id}>{label}</Label>}
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="text"
          value={localPart}
          onChange={handleLocalPartChange}
          placeholder={placeholder || 'hello'}
          required={required}
          className="flex-1"
        />
        <span className="text-neutral-500">@</span>
        <Select value={selectedDomain} onValueChange={handleDomainChange} required={required}>
          <SelectTrigger className="w-[200px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {verifiedDomains.map(domain => (
              <SelectItem key={domain.id} value={domain.domain}>
                {domain.domain}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {verifiedDomains.length === 1 && (
        <p className="text-xs text-neutral-500 mt-1">Using your verified domain: {verifiedDomains[0].domain}</p>
      )}
    </div>
  );
}
