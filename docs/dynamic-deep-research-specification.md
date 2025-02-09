Update Specification: Automatic Research Parameter Customization with Dynamic Model Selection and Verbose Report Generation
Overview
Currently, the deep research workflow requires users to manually supply numeric parameters (“breadth” and “depth”) along with their research query. These fields have proven confusing. In this update, you will remove these manual inputs from the UI and instead have the system automatically determine optimal research parameters before starting research. In addition, you will now:

Generate a final research report that is more verbose and detailed.

Improve the trimming functionality so that input text is only shortened if it exceeds the token limit for the chosen model.

Dynamically select the appropriate model based on performance requirements:

Use a fast model (gpt-4o‑mini) when speed is paramount.
Use the balanced model (gpt-4o) when both speed and depth are important.
Use a deep reasoning model (o3‑mini) when the query requires extensive reasoning.
Update the prompting for report generation so that the report structure is dynamically determined based on the query and findings.
(For example, if the query implies a ranked “top‑N” list, the prompt instructs the model to output numbered sections and detailed explanations.)

Objectives & User Outcomes
Simplify Research Initiation:
Users now only need to enter their research query (and later answer any clarifying questions) without worrying about numeric parameters.

Automated Parameter Selection:
The system will analyze the query via an AI call and determine appropriate “breadth” and “depth” values before research begins. If the determination fails, default values (e.g. breadth: 4, depth: 2) will be used.

Dynamic and Verbose Report Output:
The final research report will be generated with greater verbosity and a dynamic, context‐sensitive structure (using markdown) that fits the query. For example, if the query suggests ranking, the report will include a clearly numbered ranked list with supporting details.

Optimized Model Selection and Trimming:

The system will choose between different AI models:
gpt-4o-mini when speed is the highest priority.
gpt-4o for balanced speed and depth.
o3-mini when deep reasoning is required.
The “trimPrompt” function will be updated so that it only trims the text if the encoded tokens exceed the token limit for the chosen model (e.g. allowing longer inputs for models with very large context windows).
Error Handling and Logging:
Clear logging (using the existing log function) will indicate which parameters were auto-determined, and any errors in the parameter determination or API calls will be logged and gracefully handled with fallback defaults.

Technical Requirements
Frontend
Remove Manual Parameter Inputs

File: client/src/pages/home-page.tsx
Task:

Remove the two <FormField> blocks that render numeric <Input> fields for “breadth” and “depth.”
Update the form’s default values and the research schema so that only the “query” (and, if applicable, clarifying question answers) are collected.
In the submission handler (onSubmit), remove any code that reads “breadth” and “depth” values. Instead, send only the query (and clarifications) to the backend.
Outcome:
The research form now only prompts for a research query and (if needed) answers to clarifying questions.

User Feedback for Auto-Determination

File: client/src/pages/home-page.tsx
Task:
Optionally add a UI indicator (for example, a spinner or note “determining optimal parameters…”) when the research process begins.
Outcome:
Users see a brief loading indicator as the system auto-determines research parameters.
Shared Schema Update
Modify Research Schema

File: shared/schema.ts
Task:
In the researchSchema definition, remove (or mark as optional) the breadth and depth fields so that the client submission does not include them (they can still be stored for logging/debug purposes if desired).
Outcome:
The research submission from the client only includes the query and (optionally) clarifications.
Backend
Implement Auto-Determination of Research Parameters

File: server/deep-research.ts
Task:
New Helper Function:
Implement an async helper function determineResearchParameters(query: string): Promise<{ breadth: number; depth: number }> that uses the OpenAI API to analyze the complexity of the query and return recommended numeric values. For example, use a dedicated prompt such as:

“Given this research query: [query], determine optimal research settings. Provide a JSON response with keys ‘breadth’ (a number between 2 and 10) and ‘depth’ (a number between 1 and 5).”

Error Handling:
If the API call fails or returns unexpected values, log the error (using the log function) and fall back to default values (breadth: 4, depth: 2).

Dynamic Model & Trimming Updates:

Model Selection:
Introduce a parameter (e.g. mode or priority) in the research request that determines which model to use:

For speed-critical cases, select "gpt-4o-mini-2024-07-18".
For balanced performance, select "gpt-4o-2024-08-06" (or a similar snapshot).
For deep reasoning, select "o3-mini-2025-01-31".
(If no explicit mode is provided, the system may default to the balanced model.)

Trimming Function Update:
Update the trimPrompt function so that it accepts the target model as a parameter and uses the appropriate token limit. For instance, allow longer inputs for models with a 128,000-token context window and only trim if the encoded text exceeds that limit. For smaller models (e.g. gpt-4o-mini), use a stricter limit.

Dynamic Report Generation Prompt:
In the formatReport function:

Update the prompt to instruct the model to generate a verbose, detailed report.
First, determine an optimal report structure (e.g. by calling a helper like determineReportStructure(query, learnings)) that returns section headings (such as “Introduction”, “Ranked Findings”, “Conclusion”, “Sources”).
Instruct the model to follow that structure. If the research query suggests a ranking (by detecting keywords like “top”, “best”, “ranking”), require the model to output a clearly numbered list with supporting details.
Emphasize the use of markdown formatting.
Outcome:
The helper function returns an object with numeric breadth and depth values that are merged into the research object before the research loop begins. All subsequent API calls (clarifying questions, query expansion, report generation) will use the selected model and updated trimming logic.
Integrate Auto-Determination into the Research Flow

Files: server/routes.ts and server/deep-research.ts
Task:
In the WebSocket message handler (in server/routes.ts) and/or at the start of the handleResearch() function in server/deep-research.ts, call the new determineResearchParameters(query) function.
Merge the auto-determined parameters into the research object before continuing with the research loop.
Remove any reliance on client-supplied “breadth” and “depth” values.
Outcome:
The research process uses system-determined parameters based solely on the query and optionally an externally specified mode.
Documentation & Logging

Task:
Add logging statements (using the existing log function in server/vite.ts) to print out the auto-determined parameters and the selected model for debugging purposes.
Update error handling so that if auto-determination fails, the error is logged and default values are used.
Outcome:
Easier troubleshooting and clarity on which parameters and models are used for each research session.
Testing & Validation
Unit & Integration Tests

Task:
Write unit tests for the new function determineResearchParameters(query) (for example, under server/__tests__/).
Manually test the research flow by:
Entering a query on the home page.
Verifying that no “breadth” or “depth” fields are visible.
Confirming via logs or debug output that optimal parameters (and the selected model and token limits) have been determined.
Checking that the final research report is verbose and structured according to the dynamic prompt, and that the trimming function respects model-specific token limits.
Outcome:
The research process auto-determines its parameters, chooses the appropriate AI model, and produces a detailed research report while the UI remains simplified.
User Feedback

Task:
Confirm that any toasts or notifications do not refer to missing manual parameter input.
Verify that error messages refer only to issues like connection errors or failure in auto-configuration, not missing numeric fields.
Outcome:
A smoother user experience with a clear indication that the research parameters are determined automatically, and a final report generated using AI-driven parameters that match the desired performance (speed, balanced, or deep reasoning).
Summary of Steps
Frontend
Remove Manual Inputs:
Delete the “breadth” and “depth” <FormField> inputs from client/src/pages/home-page.tsx.
Update Form Defaults:
Adjust the form’s default values and submission handler to only collect “query” (and clarifications if needed).
User Feedback:
Optionally add a UI indicator (spinner or note) showing that optimal parameters are being determined.
Shared Schema
Modify researchSchema:
Remove or mark the breadth and depth fields as optional in shared/schema.ts so they are not provided by the client.
Backend
Implement determineResearchParameters():
In server/deep-research.ts, create a helper function that uses the OpenAI API (with a dedicated prompt such as “Given this research query…”) to return an object with breadth and depth. Fall back to default values (4 and 2) on error.
Update Trimming Function:
Modify the trimPrompt function to accept a model parameter and use token limits based on the chosen model.
Dynamic Model Selection:
Based on a “mode” (or similar parameter), select the AI model:
Use gpt-4o-mini for speed.
Use gpt-4o for balanced performance.
Use o3-mini for deep reasoning.
Dynamic Prompting for Report Structure:
Update the prompt in the report-generation function (formatReport) so that the model:
First, is asked to determine an optimal structure for the report.
Then, uses that structure to generate a verbose, markdown-formatted report.
Adjusts the prompt if the query implies a ranked list.
Integrate Auto-Determination:
In server/routes.ts and within handleResearch(), call determineResearchParameters(query), merge the returned values into the research object, and remove any reliance on client-supplied numeric values.
Logging and Error Handling:
Add logging statements for debugging (including the selected model and parameters). Fall back to default values on any API errors.
Testing & Validation
Unit Test:
Write tests for determineResearchParameters().
Manual Testing:
Verify that:
No manual “breadth” or “depth” fields appear.
Backend logs show auto-determined parameters and selected model.
The final report is verbose, structured, and respects model-specific token limits.
User Toasts:
Ensure that notifications are clear and do not reference missing manual input.