export interface SkillTemplate {
  id: string;
  name: string;
  category: "document-creation" | "workflow-automation" | "mcp-enhancement";
  pattern: "sequential" | "multi-mcp" | "iterative" | "context-aware" | "domain-specific" | "general";
  description: string;
  icon: string;
  frontmatter: {
    name: string;
    description: string;
    license?: string;
    compatibility?: string;
    allowedTools?: string;
    metadata?: Record<string, string>;
  };
  body: string;
}

export const skillCategories = [
  {
    id: "document-creation",
    name: "Document & Asset Creation",
    description: "Creating consistent, high-quality output: documents, presentations, apps, designs, code",
    icon: "FileText",
    examples: "Frontend design, DOCX/PPTX generation, report templates",
  },
  {
    id: "workflow-automation",
    name: "Workflow Automation",
    description: "Multi-step processes that benefit from consistent methodology",
    icon: "Workflow",
    examples: "Sprint planning, onboarding flows, review processes",
  },
  {
    id: "mcp-enhancement",
    name: "MCP Enhancement",
    description: "Workflow guidance to enhance MCP server tool access",
    icon: "Plug",
    examples: "Sentry code review, Linear project setup, Notion workflows",
  },
] as const;

export const skillPatterns = [
  {
    id: "sequential",
    name: "Sequential Workflow",
    description: "Multi-step processes in a specific order with dependencies between steps",
    useWhen: "Users need multi-step processes in a specific order",
  },
  {
    id: "multi-mcp",
    name: "Multi-MCP Coordination",
    description: "Workflows spanning multiple services (Figma → Drive → Linear → Slack)",
    useWhen: "Workflows span multiple services",
  },
  {
    id: "iterative",
    name: "Iterative Refinement",
    description: "Output quality improves with validation and iteration loops",
    useWhen: "Output quality improves with iteration",
  },
  {
    id: "context-aware",
    name: "Context-aware Tool Selection",
    description: "Same outcome, different tools depending on context (decision trees)",
    useWhen: "Same outcome, different tools depending on context",
  },
  {
    id: "domain-specific",
    name: "Domain-specific Intelligence",
    description: "Adds specialized knowledge beyond tool access (compliance, domain rules)",
    useWhen: "Skill adds specialized knowledge beyond tool access",
  },
  {
    id: "general",
    name: "Blank / Custom",
    description: "Start from the recommended structure without a specific pattern",
    useWhen: "None of the above patterns fit your use case",
  },
] as const;

export const templates: SkillTemplate[] = [
  // Document & Asset Creation
  {
    id: "document-creation-general",
    name: "Document Creator",
    category: "document-creation",
    pattern: "general",
    description: "Template for creating consistent documents, reports, or assets",
    icon: "FileText",
    frontmatter: {
      name: "my-document-skill",
      description: "Creates [type of document] following [standard/style guide]. Use when user asks to create, generate, or draft [document type], or mentions [trigger phrases].",
      metadata: {
        author: "Your Name",
        version: "1.0.0",
        category: "document-creation",
      },
    },
    body: `# My Document Skill

# Instructions

## When to use
Use this skill when the user needs to create [document type]. This includes:
- [Specific scenario 1]
- [Specific scenario 2]
- [Specific scenario 3]

## Step 1: Gather Requirements
Before creating the document, collect:
- [Required input 1]
- [Required input 2]
- [Required input 3]

If any required information is missing, ask the user before proceeding.

## Step 2: Create Document
Follow this structure:

### Document Structure
1. **[Section 1]** - [What goes here]
2. **[Section 2]** - [What goes here]
3. **[Section 3]** - [What goes here]

### Style Guide
- [Style rule 1]
- [Style rule 2]
- [Style rule 3]

## Step 3: Quality Check
Before presenting the final document, verify:
- [ ] All required sections are present
- [ ] Formatting is consistent
- [ ] No placeholder text remains
- [ ] Tone matches the intended audience

## Examples

### Example 1: [Common scenario]
User says: "[example request]"

Actions:
1. [Step 1]
2. [Step 2]

Result: [Expected output description]

## Troubleshooting

### Missing information
If the user doesn't provide enough context:
- Ask clarifying questions about [topic]
- Suggest reasonable defaults for [field]`,
  },

  // Workflow Automation - Sequential
  {
    id: "workflow-sequential",
    name: "Sequential Workflow",
    category: "workflow-automation",
    pattern: "sequential",
    description: "Multi-step process with explicit ordering and dependencies",
    icon: "ListOrdered",
    frontmatter: {
      name: "my-workflow-skill",
      description: "Automates [workflow name] by executing steps in order: [step summary]. Use when user says [trigger phrases] or needs to [outcome].",
      metadata: {
        author: "Your Name",
        version: "1.0.0",
        category: "workflow-automation",
      },
    },
    body: `# My Workflow Skill

# Instructions

## When to use
Use this skill when the user needs to [workflow outcome]. Common triggers:
- "[trigger phrase 1]"
- "[trigger phrase 2]"
- "[trigger phrase 3]"

## Workflow Steps

### Step 1: [First Action]
**Purpose:** [Why this step is needed]

Actions:
1. [Specific action]
2. [Specific action]

**Expected output:** [What success looks like]
**If this fails:** [Error handling instructions]

### Step 2: [Second Action]
**Depends on:** Step 1 completion
**Purpose:** [Why this step is needed]

Actions:
1. [Specific action using output from Step 1]
2. [Specific action]

**Expected output:** [What success looks like]
**If this fails:** [Rollback Step 1 if needed]

### Step 3: [Third Action]
**Depends on:** Step 2 completion
**Purpose:** [Why this step is needed]

Actions:
1. [Specific action]
2. [Specific action]

**Expected output:** [Final workflow result]

## Validation
After completing all steps, verify:
- [ ] [Validation check 1]
- [ ] [Validation check 2]
- [ ] [Validation check 3]

## Examples

### Example 1: [Happy path]
User says: "[example request]"

Step 1 → [result]
Step 2 → [result]
Step 3 → [final result]

### Example 2: [Edge case]
User says: "[edge case request]"

[How the workflow handles this differently]

## Troubleshooting

### Step [X] fails
**Cause:** [Common reason]
**Solution:** [How to fix and retry]

### Partial completion
If the workflow fails mid-way:
1. [How to identify which steps completed]
2. [How to rollback if needed]
3. [How to resume from the failed step]`,
  },

  // MCP Enhancement
  {
    id: "mcp-enhancement-general",
    name: "MCP Workflow Enhancement",
    category: "mcp-enhancement",
    pattern: "sequential",
    description: "Teaches Claude best practices for using an MCP server effectively",
    icon: "Plug",
    frontmatter: {
      name: "my-service-workflows",
      description: "Optimized workflows for [Service Name] via MCP. Handles [workflow 1], [workflow 2], and [workflow 3]. Use when user mentions [service name], [trigger phrases], or asks to [common tasks].",
      compatibility: "Requires [service-name] MCP server connected",
      metadata: {
        author: "Your Name",
        version: "1.0.0",
        "mcp-server": "service-name",
        category: "mcp-enhancement",
      },
    },
    body: `# My Service Workflows

# Instructions

## Prerequisites
- [Service Name] MCP server must be connected
- User must have appropriate permissions in [Service Name]

## When to use
This skill activates when the user needs to:
- [Use case 1]
- [Use case 2]
- [Use case 3]

## Workflow 1: [Primary Workflow]

### Step 1: [Gather Context]
Call MCP tool: \`[tool_name]\`
Parameters: [what to pass]

### Step 2: [Process/Transform]
Using data from Step 1:
1. [Analysis or transformation]
2. [Decision logic]

### Step 3: [Take Action]
Call MCP tool: \`[tool_name]\`
Parameters: [what to pass, referencing Step 1 output]

### Step 4: [Confirm & Report]
Present results to user:
- [What was accomplished]
- [Any follow-up actions needed]

## Workflow 2: [Secondary Workflow]
[Similar structure]

## Best Practices
- Always [important practice] before calling [tool]
- When [situation], prefer [approach A] over [approach B]
- Rate limiting: [any throttling guidance]

## Examples

### Example 1: [Common task]
User says: "[example request]"

MCP calls:
1. \`[tool_name]\` → [result]
2. \`[tool_name]\` → [result]

Result: [What user sees]

## Troubleshooting

### MCP Connection Failed
If you see connection errors:
1. Verify MCP server is running
2. Check API key/authentication
3. Try: Settings > Extensions > [Service] > Reconnect

### [Common Error]
**Cause:** [Why it happens]
**Solution:** [How to fix]`,
  },

  // Iterative Refinement
  {
    id: "workflow-iterative",
    name: "Iterative Refinement",
    category: "workflow-automation",
    pattern: "iterative",
    description: "Output quality improves through validation and refinement loops",
    icon: "RefreshCw",
    frontmatter: {
      name: "my-iterative-skill",
      description: "Creates high-quality [output type] through iterative refinement. Use when user needs [outcome] or asks to [trigger phrases]. Validates and improves output until quality threshold is met.",
      metadata: {
        author: "Your Name",
        version: "1.0.0",
        category: "workflow-automation",
      },
    },
    body: `# My Iterative Skill

# Instructions

## When to use
Use when the user needs high-quality [output] that benefits from review and refinement.

## Phase 1: Initial Draft
1. Gather requirements from user
2. Fetch any needed data
3. Generate first draft
4. Save draft for review

## Phase 2: Quality Check
Evaluate the draft against these criteria:
- [ ] [Quality criterion 1]
- [ ] [Quality criterion 2]
- [ ] [Quality criterion 3]
- [ ] [Quality criterion 4]

Score each criterion: Pass / Needs Improvement / Fail

## Phase 3: Refinement Loop
For each criterion that scored "Needs Improvement" or "Fail":
1. Identify the specific issue
2. Apply the fix
3. Re-evaluate that criterion

Repeat until all criteria pass or maximum 3 iterations reached.

## Phase 4: Finalization
1. Apply final formatting
2. Generate summary of changes made
3. Present final version to user
4. Ask if any manual adjustments are needed

## Quality Criteria Details

### [Criterion 1]: [Name]
**What to check:** [Specific check]
**How to fix:** [Specific fix approach]

### [Criterion 2]: [Name]
**What to check:** [Specific check]
**How to fix:** [Specific fix approach]

## Examples

### Example: Full refinement cycle
Initial draft → 2 issues found → Fixed in iteration 1 → 1 issue remaining → Fixed in iteration 2 → All pass → Finalized

## Troubleshooting

### Refinement loop doesn't converge
If after 3 iterations issues persist:
- Present current best version to user
- Explain remaining issues
- Ask for guidance on acceptable trade-offs`,
  },

  // Domain-specific Intelligence
  {
    id: "domain-intelligence",
    name: "Domain Expert",
    category: "workflow-automation",
    pattern: "domain-specific",
    description: "Embeds specialized domain knowledge, rules, and compliance requirements",
    icon: "Brain",
    frontmatter: {
      name: "my-domain-skill",
      description: "Applies [domain] expertise to [task type]. Ensures compliance with [rules/standards]. Use when user works with [domain area] or asks about [trigger phrases].",
      metadata: {
        author: "Your Name",
        version: "1.0.0",
        category: "domain-specific",
      },
    },
    body: `# My Domain Skill

# Instructions

## When to use
Activate when the user is working in the [domain] area. Specific triggers:
- [Domain-specific task 1]
- [Domain-specific task 2]
- [Domain-specific terminology that signals relevance]

## Domain Rules

### Rule 1: [Rule Name]
**Requirement:** [What must be true]
**Applies when:** [When this rule is relevant]
**How to verify:** [Specific check]
**If violated:** [What to do]

### Rule 2: [Rule Name]
**Requirement:** [What must be true]
**Applies when:** [When this rule is relevant]
**How to verify:** [Specific check]
**If violated:** [What to do]

## Decision Framework

### Before Any Action
1. Check applicable rules
2. Verify user has required permissions/authority
3. Document the compliance decision

### Processing
IF all rules pass:
- Proceed with requested action
- Apply domain best practices
- Document decisions made

ELSE:
- Flag the compliance issue
- Explain which rule would be violated
- Suggest compliant alternatives

### After Action
- Log all checks performed
- Record decisions and rationale
- Generate audit trail if needed

## Domain Knowledge

### Key Concepts
- **[Term 1]:** [Definition and relevance]
- **[Term 2]:** [Definition and relevance]
- **[Term 3]:** [Definition and relevance]

### Common Pitfalls
1. [Mistake people commonly make]
2. [Another common mistake]
3. [Edge case that's often missed]

## Examples

### Example 1: [Standard case]
User asks: "[example]"
Rules checked: [Rule 1] ✅, [Rule 2] ✅
Action: [What was done]
Result: [Outcome]

### Example 2: [Compliance issue]
User asks: "[example that triggers a rule]"
Rules checked: [Rule 1] ✅, [Rule 2] ❌
Action: Flagged issue, suggested alternative
Result: [Compliant outcome]

## Troubleshooting

### Ambiguous rule application
When rules conflict or are unclear:
1. Default to the more restrictive interpretation
2. Explain the ambiguity to the user
3. Ask for guidance on the specific case`,
  },

  // Multi-MCP Coordination
  {
    id: "multi-mcp-coordination",
    name: "Multi-Service Coordinator",
    category: "mcp-enhancement",
    pattern: "multi-mcp",
    description: "Coordinates workflows across multiple MCP services",
    icon: "Network",
    frontmatter: {
      name: "my-multi-service-skill",
      description: "Coordinates [workflow] across [Service A], [Service B], and [Service C]. Use when user needs to [cross-service outcome] or says [trigger phrases].",
      compatibility: "Requires MCP servers: [service-a], [service-b], [service-c]",
      metadata: {
        author: "Your Name",
        version: "1.0.0",
        category: "mcp-enhancement",
      },
    },
    body: `# Multi-Service Coordinator

# Instructions

## Prerequisites
These MCP servers must be connected:
- [Service A] - for [purpose]
- [Service B] - for [purpose]
- [Service C] - for [purpose]

## When to use
Use when the user needs a workflow that spans multiple services:
- "[trigger phrase 1]"
- "[trigger phrase 2]"

## Coordination Workflow

### Phase 1: [Source Service] (Service A MCP)
1. Call \`[tool_name]\` to fetch [data]
2. Call \`[tool_name]\` to get [additional context]
3. Validate data completeness

**Data to pass forward:** [List of data needed by next phases]

### Phase 2: [Processing Service] (Service B MCP)
1. Transform data from Phase 1
2. Call \`[tool_name]\` to [action]
3. Collect [outputs]

**Validate before proceeding:**
- [Check 1]
- [Check 2]

### Phase 3: [Destination Service] (Service C MCP)
1. Call \`[tool_name]\` with Phase 2 results
2. Call \`[tool_name]\` to [finalize]
3. Verify completion

### Phase 4: Notification
1. Summarize what was done across all services
2. Provide links/references to created items
3. Note any follow-up actions needed

## Error Handling

### Service A unavailable
- Skip to manual input option
- Ask user to provide the data directly

### Phase 2 fails after Phase 1 succeeded
- Do NOT retry Phase 1
- Attempt Phase 2 retry with same data
- If still failing, save progress and report

### Partial completion
Report exactly which phases completed and which failed.
Provide manual steps to complete remaining phases.

## Examples

### Example: [Full workflow]
Phase 1 (Service A): Fetched [data] →
Phase 2 (Service B): Created [items] →
Phase 3 (Service C): Published [result]

User sees: [Final summary with links]`,
  },

  // Context-aware
  {
    id: "context-aware-routing",
    name: "Context-aware Router",
    category: "workflow-automation",
    pattern: "context-aware",
    description: "Routes to different approaches based on context analysis",
    icon: "GitBranch",
    frontmatter: {
      name: "my-router-skill",
      description: "Intelligently handles [task type] by selecting the best approach based on context. Use when user needs [outcome] - automatically chooses between [approach A], [approach B], or [approach C].",
      metadata: {
        author: "Your Name",
        version: "1.0.0",
        category: "workflow-automation",
      },
    },
    body: `# Context-aware Router

# Instructions

## When to use
Use when the user needs [outcome] and the best approach depends on the specific context.

## Decision Tree

### Step 1: Analyze Context
Evaluate these factors:
- **Factor A:** [What to check] → determines [path choice]
- **Factor B:** [What to check] → determines [path choice]
- **Factor C:** [What to check] → determines [path choice]

### Step 2: Select Approach

#### IF [Condition A]:
Use **Approach A** ([when this is best])
1. [Step 1]
2. [Step 2]
3. [Step 3]

#### ELSE IF [Condition B]:
Use **Approach B** ([when this is best])
1. [Step 1]
2. [Step 2]
3. [Step 3]

#### ELSE:
Use **Approach C** (default fallback)
1. [Step 1]
2. [Step 2]
3. [Step 3]

### Step 3: Execute Selected Approach
Follow the steps for the chosen approach above.

### Step 4: Explain Choice
Tell the user which approach was selected and why.
This transparency builds trust and helps users learn.

## Examples

### Example 1: Approach A selected
Context: [description]
Decision: Approach A because [reason]
Result: [outcome]

### Example 2: Approach B selected
Context: [description]
Decision: Approach B because [reason]
Result: [outcome]

## Troubleshooting

### Wrong approach selected
If the user indicates the wrong approach was chosen:
1. Ask what was unexpected
2. Switch to the correct approach
3. Note the edge case for future reference`,
  },
];

export function getTemplatesByCategory(category: string): SkillTemplate[] {
  return templates.filter((t) => t.category === category);
}

export function getTemplateById(id: string): SkillTemplate | undefined {
  return templates.find((t) => t.id === id);
}
