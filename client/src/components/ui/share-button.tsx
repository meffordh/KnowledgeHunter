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
          access_token?: string;
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

    try {
      // Get all external accounts and log them
      const externalAccounts = window.Clerk?.user?.externalAccounts || [];
      console.log('External accounts:', externalAccounts);

      // Specifically find LinkedIn account
      const linkedInAccount = externalAccounts.find(
        acc => acc.provider === 'oauth_linkedin_oidc'
      );

      console.log('LinkedIn account found:', linkedInAccount);

      // If no LinkedIn account is found, show connect message
      if (!linkedInAccount) {
        toast({
          title: 'LinkedIn Connection Required',
          description: 'Please connect your LinkedIn account in your account settings.',
          variant: 'destructive',
        });
        return;
      }

      // Check scopes
      const scopes = linkedInAccount.approved_scopes?.split(' ') || [];
      console.log('Available scopes:', scopes);

      if (!scopes.includes('w_member_social')) {
        toast({
          title: 'Additional Permissions Required',
          description: 'Please reconnect your LinkedIn account and ensure you grant the "Share on LinkedIn" permission.',
          variant: 'destructive',
        });
        return;
      }

      setIsSharing(true);

      // Get the LinkedIn-specific token
      const token = await window.Clerk?.getToken({
        template: 'oauth_linkedin_oidc'
      });

      if (!token) {
        throw new Error('Could not get LinkedIn authentication token. Please try reconnecting your account.');
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
        throw new Error(errorText || 'Failed to share on LinkedIn');
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
        title: 'Sharing Failed',
        description: error instanceof Error ? error.message : 'Failed to share on LinkedIn. Please try reconnecting your account.',
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