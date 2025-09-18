# Spec Creation Workflow

Use this guide to translate the Agent OS spec-creation process into a manual workflow you can execute directly, without delegating to subagents. Follow each stage from pre-flight to post-flight to keep specifications consistent with product strategy.

## Pre-Flight Checklist
- Review `.agent-os/instructions/core/create-spec.md` so every numbered step is familiar before you begin.
- Confirm whether the request is "what's next?" or a specific spec idea from the user; clarify ambiguities immediately.
- Make sure you can access roadmap, mission, tech stack, and existing spec folders.

## Step 1: Spec Initiation (Manual)
- If the user asks "what's next?", open `@.agent-os/product/roadmap.md`, locate the first unchecked item, and propose it back to the user for confirmation.
- If the user provides a feature idea, accept it in their own words and proceed.

## Step 2: Context Gathering (Conditional)
- Check whether `mission-lite.md` and `tech-stack.md` are already in your working notes; if not, read them now from `@.agent-os/product/` to align the spec with product goals and platform constraints.

## Step 3: Requirements Clarification
- List open questions about scope, functionality, UI/UX, integrations, and validation.
- Ask the user numbered questions until each area is unambiguous; capture answers alongside your notes.

## Step 4: Date Determination
- Run `date +%F` or the equivalent command to capture today’s date in `YYYY-MM-DD` format and store it for folder naming.

## Step 5: Spec Folder Setup
- Create `.agent-os/specs/<DATE>-<kebab-case-name>/` using the stored date and a concise (≤5 words) spec name.
- Add a `sub-specs/` subfolder for follow-on documents.

## Step 6: Draft `spec.md`
- Populate `.agent-os/specs/<DATE>-<name>/spec.md` using the required sections: Overview, User Stories, Spec Scope, Out of Scope, Expected Deliverable.
- Keep the Overview to one or two sentences; write 1–3 detailed user stories; list 1–5 scoped features; call out exclusions and measurable deliverables.

## Step 7: Draft `spec-lite.md`
- In the same folder, create `spec-lite.md` as a 1–3 sentence summary of the feature’s goal and outcome for quick reference.

## Step 8: Prepare `technical-spec.md`
- Inside `sub-specs/`, create `technical-spec.md` with Technical Requirements and, if needed, External Dependencies including justifications and version notes.

## Step 9: Optional Database Schema
- When database changes are required, add `sub-specs/database-schema.md` documenting table/column updates, migrations, and rationale.

## Step 10: Optional API Specification
- If the feature affects APIs, create `sub-specs/api-spec.md` describing endpoints, parameters, responses, and error handling for each route.

## Step 11: Request Review
- Share the spec file paths with the requester and ask for approval or revisions. Hold until feedback arrives.

## Post-Flight Verification
- Confirm each step above was followed manually and all required files exist.
- Note any deviations (e.g., skipped optional specs) and communicate them to the requester before closing the spec task.
