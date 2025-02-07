
import { Request } from 'express';

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
  const token = req.auth?.sessionClaims?.['linkedin_oauth_access_token'];
  if (!token) {
    throw new Error('LinkedIn token not found');
  }

  const userResponse = await fetch('https://api.linkedin.com/v2/me', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
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
    throw new Error(`LinkedIn API error: ${await response.text()}`);
  }

  return await response.json();
}
