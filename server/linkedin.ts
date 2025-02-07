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
  if (!req.auth?.userId) {
    throw new Error('User not authenticated');
  }

  const token = req.auth.sessionClaims?.['linkedin_oauth_access_token'];
  if (!token) {
    throw new Error('LinkedIn access token not found. Please connect your LinkedIn account.');
  }

  const userResponse = await fetch('https://api.linkedin.com/v2/me', {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!userResponse.ok) {
    throw new Error('Failed to fetch LinkedIn profile');
  }

  const userData = await userResponse.json();

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
    throw new Error(`LinkedIn API error: ${errorText}`);
  }

  const data = await response.json();

  // Store the share in the database
  await db.insert(linkedinShares).values({
    userId: req.auth.userId,
    reportId: req.body.reportId,
    linkedinPostId: data.id,
  });

  return data;
}

export async function handleLinkedInShare(req: Request) {
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