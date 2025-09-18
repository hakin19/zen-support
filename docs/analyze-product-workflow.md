# Product Analysis & Agent OS Installation Workflow

This guide adapts the Agent OS analyze-product procedure for solo execution. Follow each stage to assess an existing codebase, gather product context, generate product docs, and align them with reality—no subagents required.

## Pre-Flight Checklist
- Study `.agent-os/instructions/core/analyze-product.md` so the numbered steps and deliverables are clear.
- Confirm you have read access to the full codebase and permission to create or update files under `.agent-os/product/`.
- Collect any prior specs, architecture notes, or onboarding docs that may speed up analysis.

## Step 1: Analyze the Existing Codebase
- Map the project structure: list top-level directories, module boundaries, build tooling, and configuration files.
- Inventory the technology stack by inspecting manifests (`package.json`, `requirements.txt`, Dockerfiles, infra scripts) and noting frameworks, databases, hosting, and integrations.
- Document implementation progress: completed features, in-flight work, authentication state, APIs, database schema, and migrations.
- Capture coding patterns: naming conventions, linting/formatting style, testing frameworks, and folder organization.
- Keep detailed notes; these observations seed later documentation and conversations.

## Step 2: Gather Product Context (Manual)
- Share your findings with the requester and ask context questions covering product vision, target users, hidden or upcoming features, roadmap, and team standards.
- Use the prompt structure:
  1. Product vision: problem solved and primary users
  2. Current state: features not obvious from code
  3. Roadmap: next planned work or refactors
  4. Team preferences: coding standards, workflows, or tooling expectations
- Integrate their answers with the analysis from Step 1; resolve ambiguities immediately.

## Step 3: Run the Product Planning Workflow
- Summarize the collected information (main idea, implemented features, planned features, target users, tech stack).
- Execute the manual steps in `docs/plan-product-workflow.md`, supplying the summary as source data.
- Ensure the generated `mission.md`, `mission-lite.md`, `tech-stack.md`, and `roadmap.md` reflect both the codebase evidence and user-provided roadmap.

## Step 4: Customize Generated Documentation
- Update `roadmap.md` to add **Phase 0: Already Completed** with checked items for shipped features, note in-progress work under **Phase 1**, and adjust later phases for future plans.
- Verify `tech-stack.md` aligns with actual dependencies, infrastructure, hosting, and version details discovered in Step 1; fill gaps or correct mismatches.
- Confirm mission documents accurately represent users, problems, differentiators, and key features using real product language.

## Step 5: Final Verification and Summary
- Check that `.agent-os/product/` contains complete, up-to-date docs and that each file mirrors the real implementation.
- Prepare a summary for the requester including: detected product type, tech stack highlights, completed feature count, code style observations, and current development phase.
- Outline next steps (review docs, adjust as needed, run `create-spec` for the next feature) and provide any helpful links or commands.
- Document any unresolved issues or assumptions so the team can address them promptly.

## Post-Flight Verification
- Ensure every step above was performed manually and any deviations are communicated.
- Save your analysis notes alongside the docs or in the project tracker for future reference.
- Confirm the requester acknowledges completion before moving on to new tasks.
