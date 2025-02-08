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

  const token = req.auth.sessionClaims?.['linkedin_oauth_access_token'];
  console.log('LinkedIn OAuth token present:', !!token);

  if (!token) {
    console.error('LinkedIn share failed: No access token found');
    throw new Error('LinkedIn access token not found. Please connect your LinkedIn account.');
  }

  console.log('Fetching LinkedIn profile');
  const userResponse = await fetch('https://api.linkedin.com/v2/me', {
    headers: { 'Authorization': `Bearer ${token}` }
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
          originalUrl: url
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

  // Update user's research count
  if (req.auth?.userId) {
    await db.update(users)
      .set({ researchCount: db.raw('research_count + 1') })
      .where(eq(users.id, req.auth.userId));
  }

  return result;
}