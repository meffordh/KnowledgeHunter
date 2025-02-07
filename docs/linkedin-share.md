# Product Requirements Document: LinkedIn Social Sharing Module

## Overview
This module enables authenticated users of ResearchHunter to share their deep research reports as LinkedIn articles directly from the application. By leveraging the captured `w_member_social` scope (along with `r_liteprofile` and email) via Clerk’s social connection, the module will post the report on the user’s personal LinkedIn profile. The feature will then capture the unique LinkedIn post URN and store it in the database, allowing the system to award sharing credits to users. This integration enhances user engagement, expands report reach, and incentivizes social sharing.

## Core Features

### Social Sharing Integration
- **Clerk Integration:**  
  Utilize the existing Clerk configuration that captures the `w_member_social` scope. This scope permits posting on behalf of an authenticated user.
- **LinkedIn API Usage:**  
  - Retrieve the user's unique LinkedIn URN via the `/v2/me` endpoint.
  - Construct a post payload for the `/ugcPosts` endpoint that includes:
    - The author field in the format `urn:li:person:{userID}`.
    - Lifecycle state set to `"PUBLISHED"`.
    - Visibility set to `"PUBLIC"`.
    - A `specificContent` object of type `com.linkedin.ugc.ShareContent` containing the report text and the URL (as an article).
- **Database Tracking:**  
  - Update the research report record (or a dedicated social shares table) with the returned LinkedIn post URN.
  - Increment the user’s sharing credits.

### User Feedback & Error Handling
- Display confirmation messages or error alerts on the research report view after a share attempt.
- Log API errors and handle token or API failures gracefully.

## Technical Requirements

### Frontend
- **Framework & Language:** React with TypeScript.
- **Styling:** Tailwind CSS and Shadcn UI components.
- **New UI Component:**  
  - Add a “Share on LinkedIn” button in the research report view (e.g., in `home-page.tsx` or a dedicated component like `ReportActions.tsx`).
  - On click, initiate an API call (using fetch or Axios) to the new backend endpoint.
- **Data Management:**  
  - Use React Query to handle asynchronous API calls.
  - Provide user feedback (loading states, success/error notifications).

### Backend
- **Server Framework:** Express.js with TypeScript.
- **New API Endpoint:**  
  - Create a POST endpoint at `/api/social/linkedin/share` secured with Clerk’s `requireAuth()` middleware.
  - The endpoint should accept the research report ID or content and a short description.
  - Retrieve the user’s LinkedIn access token (ensuring it includes the `w_member_social` scope).
  - Call a dedicated module function (e.g., `postToLinkedIn`) to:
    - Fetch the user’s LinkedIn URN from `/v2/me`.
    - Construct and send the payload to the LinkedIn `/ugcPosts` endpoint with appropriate headers:
      - `Authorization: Bearer <access_token>`
      - `LinkedIn-Version: 202401` (or another current version)
      - `X-Restli-Protocol-Version: 2.0.0`
      - `Content-Type: application/json`
  - Return the created LinkedIn post URN in the response.
- **Database Updates:**  
  - Modify the schema (in `shared/schema.ts`) to add a field (e.g., `linkedinPostId`) to the `researchReports` table or create a new table for social share records.
  - Update storage functions in `server/storage.ts` to support saving the post URN and incrementing user credits.
- **Testing & Logging:**  
  - Implement unit tests for the new LinkedIn integration module and API endpoint.
  - Log errors and monitor API call outcomes for debugging.

### References & Useful URLs
- [Share on LinkedIn (Microsoft Docs)](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin)
- [Test your LinkedIn Connection (Clerk Docs)](https://clerk.com/docs/authentication/social-connections/linkedin-oidc#test-your-connection)
- [Sign In with LinkedIn v2 (Microsoft Docs)](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2)

## Success Criteria
- The “Share on LinkedIn” button is visible on the research report page and initiates the sharing process.
- A successful LinkedIn post returns a post URN, which is stored in the database.
- The user's sharing credits are incremented upon successful sharing.
- All code follows a modular design: the LinkedIn integration is encapsulated in a small, single-responsibility module.
- Proper error handling and unit tests are in place.

## Future Enhancements
- Extend support for rich media posts (images, videos) and additional content types.
- Add support for posting to LinkedIn company pages (requires additional scopes such as `w_organization_social`).
- Integrate detailed analytics to track post performance using LinkedIn’s analytics endpoints.
- Enhance the UI with scheduling options and post previews.

## Timeline & Milestones
- **Design & Planning:** 1 day
- **Development:** 2–3 days (client-side button, backend API and module, database updates)
- **Testing & Debugging:** 1–2 days
- **Deployment & Verification:** 1 day
