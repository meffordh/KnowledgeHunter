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

// Extend Window interface to include Clerk
declare global {
  interface Window {
    Clerk?: {
      user?: {
        externalAccounts?: Array<{ 
          provider: string;
          approved_scopes?: string;
        }>;
      };
      getToken: () => Promise<string>;
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

    // Check if user has LinkedIn connection with proper scopes
    const linkedInAccount = window.Clerk?.user?.externalAccounts?.find(
      account => account.provider === 'oauth_linkedin_oidc'
    );

    const hasRequiredScopes = linkedInAccount?.approved_scopes?.includes('w_member_social');

    if (!linkedInAccount || !hasRequiredScopes) {
      toast({
        title: 'LinkedIn Account Required',
        description: 'Please connect your LinkedIn account with sharing permissions in your account settings',
        variant: 'destructive',
      });
      return;
    }

    setIsSharing(true);
    try {
      // Get the session token from Clerk
      const token = await window.Clerk?.getToken();

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
        const error = await response.text();
        throw new Error(error || 'Failed to share on LinkedIn');
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