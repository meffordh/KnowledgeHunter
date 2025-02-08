import { useState } from 'react';
import { Button } from './button';
import { Share } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';

interface ShareButtonProps {
  content: string;
  url: string;
  reportId: number;
}

declare global {
  interface Window {
    Clerk?: {
      user?: {
        externalAccounts?: Array<{ 
          provider: string;
          approved_scopes?: string;
        }>;
      };
      getToken: (options?: { template?: string }) => Promise<string>;
    };
  }
}

export function ShareButton({ content, url, reportId }: ShareButtonProps) {
  const [isSharing, setIsSharing] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const handleShare = async () => {
    if (!reportId) {
      toast({
        title: 'Error',
        description: 'Cannot share: Invalid report ID',
        variant: 'destructive',
      });
      return;
    }

    // Log all external accounts for debugging
    const externalAccounts = window.Clerk?.user?.externalAccounts || [];
    console.log('All external accounts:', externalAccounts.map(acc => ({
      provider: acc.provider,
      scopes: acc.approved_scopes
    })));

    // Check if user has LinkedIn connection
    const linkedInAccount = externalAccounts.find(
      account => account.provider === 'oauth_linkedin_oidc'
    );

    console.log('Found LinkedIn account:', linkedInAccount);

    // Parse scopes string and check for required scope
    const scopes = linkedInAccount?.approved_scopes?.split(' ') || [];
    const hasRequiredScopes = scopes.includes('w_member_social');

    console.log('LinkedIn connection status:', {
      accountFound: !!linkedInAccount,
      provider: linkedInAccount?.provider,
      scopes: scopes.join(', '),
      hasRequiredScopes,
      allScopes: linkedInAccount?.approved_scopes
    });

    if (!linkedInAccount || !hasRequiredScopes) {
      toast({
        title: 'LinkedIn Account Required',
        description: 'Please connect your LinkedIn account with sharing permissions in your account settings. Make sure to grant the "Share on LinkedIn" permission.',
        variant: 'destructive',
      });
      return;
    }

    setIsSharing(true);
    try {
      // Get the session token from Clerk
      const token = await window.Clerk?.getToken({
        template: 'oauth_linkedin_oidc'
      });

      if (!token) {
        throw new Error('Failed to get authentication token');
      }

      const response = await fetch('/api/social/linkedin/share', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ content, url, reportId }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      const data = await response.json();
      toast({
        title: 'Success',
        description: 'Successfully shared to LinkedIn',
      });

      return data;
    } catch (error) {
      console.error('Share error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to share on LinkedIn',
        variant: 'destructive',
      });
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <Button
      onClick={handleShare}
      disabled={isSharing}
      variant="outline"
      size="sm"
      className="w-full sm:w-auto"
    >
      <Share className="mr-2 h-4 w-4" />
      {isSharing ? 'Sharing...' : 'Share on LinkedIn'}
    </Button>
  );
}