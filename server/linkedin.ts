import { Request } from 'express';
import { db } from './db';
import { linkedinShares, users } from '@shared/schema';
import { eq } from 'drizzle-orm';

interface LinkedInSharePayload {
  author: string;
  lifecycleState: 'PUBLISHED';
  specificContent: {
    'com.linkedin.ugc.ShareContent': {
      shareCommentary: {
        text: string;
      };
      shareMediaCategory: 'ARTICLE';
      media: [{
        status: 'READY';
        originalUrl: string;
        description?: {
          text: string;
        };
        title?: {
          text: string;
        };
      }];
    };
  };
  visibility: {
    'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC';
  };
}

export async function postToLinkedIn(req: Request, content: string, url: string) {
  console.log('Starting LinkedIn share process');

  if (!req.auth?.userId) {
    console.error('LinkedIn share failed: User not authenticated');
    throw new Error('User not authenticated');
  }

  // Get LinkedIn token from external accounts
  const externalAccounts = req.auth.sessionClaims?.['external_accounts'] as Array<{
    provider: string;
    provider_user_id: string;
    approved_scopes: string;
    access_token?: string;
  }> | undefined;

  console.log('External accounts found:', !!externalAccounts);

  const linkedInAccount = externalAccounts?.find(acc => acc.provider === 'oauth_linkedin_oidc');
  const token = linkedInAccount?.access_token;

  console.log('LinkedIn account found:', !!linkedInAccount);
  console.log('Scopes:', linkedInAccount?.approved_scopes);
  console.log('LinkedIn OAuth token present:', !!token);

  if (!token) {
    console.error('LinkedIn share failed: No access token found');
    throw new Error('LinkedIn access token not found. Please connect your LinkedIn account.');
  }

  // Parse scopes string and check for required scope
  const scopes = linkedInAccount?.approved_scopes?.split(' ') || [];
  if (!scopes.includes('w_member_social')) {
    console.error('LinkedIn share failed: Missing w_member_social scope');
    console.error('Available scopes:', scopes.join(', '));
    throw new Error('Missing required LinkedIn permissions (w_member_social). Please reconnect your account with sharing permissions.');
  }

  console.log('Fetching LinkedIn profile');
  const userResponse = await fetch('https://api.linkedin.com/v2/me', {
    headers: { 
      'Authorization': `Bearer ${token}`,
      'X-Restli-Protocol-Version': '2.0.0',
      'LinkedIn-Version': '202401',
      'Content-Type': 'application/json'
    }
  });

  if (!userResponse.ok) {
    console.error('LinkedIn profile fetch failed:', await userResponse.text());
    throw new Error('Failed to fetch LinkedIn profile');
  }

  const userData = await userResponse.json();
  console.log('LinkedIn profile fetched successfully');

  const payload: LinkedInSharePayload = {
    author: `urn:li:person:${userData.id}`,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: {
          text: content
        },
        shareMediaCategory: 'ARTICLE',
        media: [{
          status: 'READY',
          originalUrl: url,
          description: {
            text: content.substring(0, 100) // Add a description
          },
          title: {
            text: "Research Insights" // Add a title
          }
        }]
      }
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
    }
  };

  console.log('Sending share request to LinkedIn');
  const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
      'LinkedIn-Version': '202401'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('LinkedIn API error:', errorText);
    throw new Error(`LinkedIn API error: ${errorText}`);
  }

  const data = await response.json();
  console.log('LinkedIn share successful');

  // Store the share in the database
  await db.insert(linkedinShares).values({
    userId: req.auth.userId,
    reportId: req.body.reportId,
    linkedinPostId: data.id,
  });

  return data;
}

export async function handleLinkedInShare(req: Request) {
  console.log('Handling LinkedIn share request', {
    userId: req.auth?.userId,
    hasContent: !!req.body.content,
    hasUrl: !!req.body.url,
    hasReportId: !!req.body.reportId
  });

  const { content, url, reportId } = req.body;

  if (!content || !url || !reportId) {
    throw new Error('Missing required fields: content, url, or reportId');
  }

  const result = await postToLinkedIn(req, content, url);

  // Update user's share count
  if (req.auth?.userId) {
    await db.update(users)
      .set({ researchCount: db.raw('research_count + 1') })
      .where(eq(users.id, req.auth.userId));
  }

  return result;
}