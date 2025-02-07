
import { useState } from 'react';
import { Button } from './button';
import { Share } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ShareButtonProps {
  content: string;
  url: string;
  reportId: string;
}

export function ShareButton({ content, url }: ShareButtonProps) {
  const [isSharing, setIsSharing] = useState(false);
  const { toast } = useToast();

  const handleShare = async () => {
    setIsSharing(true);
    try {
      const response = await fetch('/api/social/linkedin/share', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content, url, reportId }),
      });

      if (!response.ok) {
        throw new Error('Failed to share on LinkedIn');
      }

      toast({
        title: 'Success',
        description: 'Successfully shared to LinkedIn',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to share',
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
    >
      <Share className="mr-2 h-4 w-4" />
      {isSharing ? 'Sharing...' : 'Share on LinkedIn'}
    </Button>
  );
}
