# **Updated PRD for Enhanced Deep Research Engine**

## **Overview & Goals**

**Objective:**  
Upgrade the current deep research engine to leverage the latest OpenAI multi‑modal, function‑calling, and Structured Outputs features while keeping all existing API endpoints and core behaviors intact.

**Key Improvements:**

* **Multi‑Modal Integration:**  
  Enable dynamic analysis of both textual and image content. When image URLs or Base64 data are detected, the system will invoke a dedicated image analysis function using GPT‑4o’s vision capabilities (via GPT‑4o‑mini for cost‑efficient multi‑modal processing).  
* **Function Calling & Structured Outputs:**  
  Integrate robust function calling by defining external functions (e.g. `analyze_image`) with JSON Schema–defined parameters. Implement a loop that checks for function calls, executes the corresponding local function, and appends the result to the conversation. Use GPT‑4o and GPT‑4o‑mini responses with `response_format` set to enforce strict JSON schemas for tasks like parameter extraction and final report formatting.  
* **Prompt Chaining & Model Coordination:**  
  Split the research process into modular stages (data retrieval, media extraction/analysis, deep reasoning, report generation) and pass trimmed, context‑rich information between them. Incorporate media insights naturally within the final report prompt.  
* **Dynamic Agent Handoffs (Optional):**  
  Optionally allow agent transfers by returning an Agent object from dedicated transfer functions. This “multi‑agent” architecture will be implemented in a modular fashion so that it can be enabled only after the basic improvements are stable.  
* **Backward Compatibility & Progress Reporting:**  
  All new logic should be encapsulated so that existing API endpoints and behaviors remain unchanged. Extend WebSocket progress messages to include events (e.g. “media analyzed”, “structured output received”) without breaking existing clients.

---

## **Functional Requirements**

1. **Model Configuration:**  
   Update the model snapshot IDs in the configuration constants as follows:  
   * **BALANCED:** Use GPT‑4o for multi‑modal tasks: `"gpt-4o-2024-08-06"`  
   * **MEDIA:** Use GPT‑4o‑mini for cost‑efficient image processing: `"gpt-4o-mini-2024-07-18"`  
   * **DEEP:** Use o3‑mini for deep reasoning and final report generation: `"o3-mini-2025-01-31"`  
2. **Function Calling & Structured Outputs:**  
   * **Define External Functions:**  
     For new tasks (e.g. analyzing images), define functions such as `analyze_image` with a clear JSON Schema (e.g., parameter: `image_url` of type string).  
   * **Implement the Function Loop:**  
     When a model response includes a `function_call`, execute the corresponding local function and append its result back into the conversation. This loop must be encapsulated so that existing flows (e.g. text-only research) remain unaffected.  
   * **Enforce Structured Outputs:**  
     Continue to use the `response_format` field with a JSON Schema for tasks like parameter determination, clarifying questions, and report formatting. Validate responses using your preferred schema library (e.g., Zod or Pydantic).  
3. **Multi‑Modal Content Integration:**  
   * **Extend Media Detection:**  
     Update the existing `detectMediaContent` function to first check for image inputs. If image URLs or Base64 strings are detected, call the new `analyze_image` function using GPT‑4o‑mini’s vision capabilities.  
   * **Merge Media and Textual Data:**  
     Combine the results from textual research and media analysis (e.g., media summaries) before passing them to the final report generation module.  
4. **Prompt Chaining & Model Handoff:**  
   * **Module Separation:**  
     Divide the process into distinct modules: (a) data retrieval & media extraction, (b) in‑depth reasoning using o3‑mini, and (c) final report generation.  
   * **Clear Handoffs:**  
     Pass a trimmed, consolidated set of findings (including media insights) between modules using explicit prompts.  
   * **(Optional) Dynamic Agent Handoffs:**  
     Define transfer functions (e.g., `transfer_to_analysis`) that return an Agent object so the system can dynamically switch contexts without impacting legacy flows.  
5. **Backward Compatibility:**  
   * **Non‑Breaking Updates:**  
     All new functions and modules should be encapsulated in a way that existing endpoints and features in deep‑research.ts remain fully functional.  
   * **Progress Reporting:**  
     Extend existing WebSocket messages to include events for new tasks (e.g., “media analyzed”) without modifying the current message schema expected by existing clients.

---

## **Non‑Functional Requirements**

* **Performance & Token Efficiency:**  
  Trim prompts as necessary and only pass essential context between modules. Ensure that the added multi‑modal and function calling logic does not significantly increase token usage.  
* **Modularity & Maintainability:**  
  Write clearly commented, modular code. Each new feature (e.g., image analysis, dynamic agent handoffs) must be isolated so that future changes can be made without affecting legacy functionality.  
* **Robust Error Handling:**  
  Validate all function call outputs using try/catch blocks and schema validation. Log intermediate outputs for debugging without disrupting the main processing flow.

---

## **Step‑by‑Step Implementation Instructions**

1. **Update Model Configurations:**

Replace existing model IDs with the following constants:  
typescript  
Copy  
`const MODEL_CONFIG = {`  
  `BALANCED: "gpt-4o-2024-08-06",`  
  `DEEP: "o3-mini-2025-01-31",`  
  `MEDIA: "gpt-4o-mini-2024-07-18",`  
`} as const;`

*   
  * This change ensures that multi‑modal tasks use GPT‑4o, media processing uses GPT‑4o‑mini, and deep reasoning remains with o3‑mini.  
2. **Integrate Function Calling with Structured Outputs:**

**Define New Functions:**  
Create new functions (e.g., `analyze_image`) with JSON Schema definitions for their parameters. For example:  
typescript  
Copy  
`const analyze_image = {`  
  `name: "analyze_image",`  
  `description: "Analyzes an image from a URL or Base64 data and returns key features and a summary.",`  
  `parameters: {`  
    `type: "object",`  
    `properties: {`  
      `image_url: {`  
        `type: "string",`  
        `description: "Direct URL or Base64 string of the image"`  
      `},`  
    `},`  
    `required: ["image_url"],`  
    `additionalProperties: false,`  
  `},`  
`};`

*   
  * **Implement the Function Loop:**  
    Modify your API call logic so that when a model response contains a `function_call`, your code parses the arguments, calls the appropriate local function (using, for example, `analyzeImageLocally(args.image_url)`), and appends the result back to the conversation.  
  * **Use Structured Outputs:**  
    For tasks requiring strict JSON output, include a `response_format` field with the JSON Schema and set `"strict": true`.  
3. **Extend Multi‑Modal Integration:**  
   * Update `detectMediaContent` to first check for image inputs and then, if found, trigger a call to `analyze_image`.  
     *(Keep the existing regex detection as a fallback to ensure backward compatibility.)*  
   * Merge media analysis outputs with textual findings to enrich the final context used in report generation.  
4. **Refine Prompt Chaining:**  
   * Ensure that before handing off context to the o3‑mini model for final report generation, you consolidate and trim both textual learnings and media summaries (e.g., using your `trimPrompt` function).  
   * Update prompts for final report formatting to explicitly instruct the model on how to integrate media insights into the Markdown report.  
5. **(Optional) Implement Dynamic Agent Handoffs:**  
   * Define lightweight “Agent” objects and transfer functions (e.g., `transfer_to_analysis`) that return an Agent object.  
   * In your function execution loop, detect if a tool call result is an Agent and, if so, update the conversation context accordingly.  
6. **Test Thoroughly & Handle Errors:**  
   * Validate new modules independently.  
   * Use try/catch blocks to handle API call failures, schema validation errors, and incomplete function call outputs.  
   * Add logging to capture and debug intermediate responses without affecting production flows.

---

## **Summary for the Developer**

* **Model IDs:** Update to `"gpt-4o-2024-08-06"`, `"gpt-4o-mini-2024-07-18"`, and `"o3-mini-2025-01-31"`.  
* **Function Calling:** Define new functions (e.g., `analyze_image`) with JSON Schema and implement a loop to handle function calls and integrate outputs.  
* **Multi‑Modal Integration:** Extend media detection to call image analysis when an image input is detected, then merge media results with textual research.  
* **Prompt Chaining:** Split processing into modules and pass trimmed, consolidated context between them.  
* **Dynamic Agent Handoffs (Optional):** Allow the system to switch between agent modes using transfer functions that return Agent objects.  
* **Backward Compatibility:** Encapsulate all new features so that existing endpoints and functionality remain unchanged.  
* **Error Handling & Logging:** Use robust error handling and logging throughout the new modules.

By following these refined instructions, you will enhance the deep research engine to fully leverage the latest OpenAI models and features without breaking existing functionality.

