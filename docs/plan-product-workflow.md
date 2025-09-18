# Product Planning Workflow

Use this guide to produce the Agent OS product documents manually—mission, mission-lite, tech stack, and roadmap—without delegating to subagents. Complete each stage sequentially so downstream specs and tasks stay consistent.

## Pre-Flight Checklist
- Review `.agent-os/instructions/core/plan-product.md` to internalize every numbered requirement.
- Confirm the requester has supplied (or is ready to supply) the product idea, at least three key features, at least one target user/use case, tech stack preferences, and whether the app folder is already initialized.
- Open helpful references (`@.agent-os/standards/tech-stack.md`, `@.claude/CLAUDE.md`, Cursor user rules) in case defaults or guidance are needed.

## Step 1: Gather User Input (Manual)
- Interview the requester directly to capture the five required data points. Validate that the feature list has ≥3 entries and target users include at least one persona/use case.
- If any item is missing, send the numbered prompt:
  1. Main idea for the product
  2. List of key features (minimum 3)
  3. Target users and use cases (minimum 1)
  4. Tech stack preferences
  5. Has the new application been initialized yet and we're inside the project folder? (yes/no)
- Record answers verbatim in your working notes.

## Step 2: Create Documentation Structure
- Ensure `.agent-os/product/` exists; create it if necessary without overwriting existing files.
- Inside the folder ensure these files are present (create empty placeholders if new): `mission.md`, `mission-lite.md`, `tech-stack.md`, and `roadmap.md`.

## Step 3: Draft `mission.md`
- Populate `.agent-os/product/mission.md` with the required sections:
  - **Pitch:** a 1–2 sentence elevator pitch formatted as `[PRODUCT_NAME] is a ...`.
  - **Users:** include primary customer segments and at least one persona detailing role, context, pain points, and goals.
  - **The Problem:** describe customer pains, impact, and current gaps.
  - **Differentiators:** highlight what makes this product unique.
  - **Key Features:** enumerate the foundational capabilities drawn from the Step 1 feature list.
- Tailor language to the collected input and keep formatting consistent with the template.

## Step 4: Draft `tech-stack.md`
- Capture the tech stack in structured sections (frontend, backend, infrastructure, tooling). Ensure the following items are addressed: programming languages, frontend framework, UI library, state management, backend framework, database, ORM, auth provider, testing tools, CI/CD, logging/monitoring, analytics, hosting choices, fonts, icon set, deployment solution, and repository URL.
- For any unknown entry, consult `@.agent-os/standards/tech-stack.md`, `@.claude/CLAUDE.md`, or Cursor rules; if still unresolved, list the missing items back to the requester using the provided template and request decisions (allowing "n/a" when appropriate).

## Step 5: Draft `mission-lite.md`
- Summarize the mission in `.agent-os/product/mission-lite.md`.
- First line: reuse the Pitch from Step 3 verbatim.
- Follow with 1–3 sentences covering the primary value proposition, core users, and the key differentiator (omit secondary details).

## Step 6: Draft `roadmap.md`
- Structure the roadmap with 1–3 phases following the template:
  - `## Phase N: Name`
  - Goal and measurable success criteria.
  - A feature checklist (3–7 items) with short descriptions and effort tags (`XS`, `S`, `M`, `L`, `XL`).
  - Dependencies section noting external or internal prerequisites.
- Align phases with guidance: Phase 1 (MVP core), Phase 2 (differentiators), Phase 3 (scale/polish), adding Phases 4–5 only if warranted.

## Post-Flight Verification
- Confirm all four files exist with complete content and correct formatting.
- Verify every required data point from Step 1 is represented or explicitly marked as `n/a` per user direction.
- Document any deviations or unresolved questions and surface them to the requester before concluding planning.
