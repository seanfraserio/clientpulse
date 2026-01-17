# ClientPulse Agent Launcher

This is the task router for the ClientPulse agent framework. Use this to route tasks to the appropriate specialized agent.

## How to Use

1. **Describe your task** to Claude
2. Claude will analyze the task and **load the appropriate agent**
3. The agent will execute with **specialized guidelines**

## Task Router

| Task Type | Agent | Trigger Keywords | When to Use |
|-----------|-------|------------------|-------------|
| Design/Architecture | `architect` | design, structure, plan, architecture, system, API | Planning new features, making technical decisions |
| Implementation | `engineer` | build, implement, create, code, fix, debug, refactor | Writing or modifying code |
| Review/QA | `reviewer` | review, check, audit, test, verify, validate | Reviewing PRs, code quality checks |
| Content | `content` | blog, post, article, docs, documentation, guide | Writing docs, blog posts, guides |

## Routing Logic

```
1. Parse incoming task for keywords and context
2. Identify primary task type
3. If ambiguous, ask for clarification
4. Load agent context from agents/core/[agent].md
5. Execute task with agent guidelines
6. If task requires multiple agents, execute in sequence:
   - architect → engineer → reviewer (for new features)
   - engineer → reviewer (for bug fixes)
   - content (standalone for documentation)
```

## Quick Commands

### Start a Design Session
```
Load architect agent and help me design [feature]
```

### Start an Implementation Session
```
Load engineer agent and implement [feature/fix]
```

### Start a Review Session
```
Load reviewer agent and review [PR/code]
```

### Start a Content Session
```
Load content agent and write [article/docs]
```

## Multi-Agent Workflows

### New Feature Workflow
```
1. architect: Design the feature
   ↓
2. engineer: Implement the design
   ↓
3. reviewer: Review the implementation
   ↓
4. content: Document the feature
```

### Bug Fix Workflow
```
1. engineer: Debug and fix the issue
   ↓
2. reviewer: Review the fix
```

### Documentation Workflow
```
1. content: Write the documentation
   ↓
2. reviewer: Review for accuracy
```

## Context Handoff

When switching between agents, include:

### From Architect to Engineer
- Component specifications
- API contracts
- Data models
- Sequence diagrams
- Technical risks

### From Engineer to Reviewer
- Summary of changes
- Areas needing attention
- Test coverage
- Specification deviations

### From Any Agent to Content
- Feature description
- Target audience
- Key concepts to explain
- Code examples to include

## Example Sessions

### Example 1: New Feature
```
User: I need to add user authentication to the app

Claude: This is a design task. Loading architect agent...
[Architect agent creates authentication design]

Claude: Design complete. Ready to implement?
User: Yes

Claude: Loading engineer agent...
[Engineer agent implements authentication]

Claude: Implementation complete. Ready for review?
User: Yes

Claude: Loading reviewer agent...
[Reviewer agent reviews the code]
```

### Example 2: Bug Fix
```
User: The login form crashes when email is empty

Claude: This is a debugging task. Loading engineer agent...
[Engineer agent investigates and fixes]

Claude: Fix implemented. Loading reviewer agent for verification...
[Reviewer agent checks the fix]
```

### Example 3: Documentation
```
User: Write a blog post about our new caching feature

Claude: This is a content task. Loading content agent...
[Content agent writes the blog post]
```
