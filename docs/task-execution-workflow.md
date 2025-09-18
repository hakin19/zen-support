# Task Execution Workflow

This workflow translates the Agent OS task process into a single-agent approach for this repository. Follow each stage sequentially, from pre-flight through post-flight, to keep work predictable and auditable.

## Pre-Flight Checklist
- Read `.agent-os/instructions/core/execute-task.md` and confirm you understand the numbered steps before starting.
- Gather context (parent task, sub-tasks, dependencies) and ensure you have required access to code, docs, and tooling.
- Clarify ambiguities with the requester before proceeding.

## Step 1: Task Understanding
- Review the parent task and all sub-tasks in `tasks.md`.
- Note deliverables, dependencies, and explicit test requirements.
- Record outstanding questions early to avoid rework.

## Step 2: Technical Specification Review
- Open `technical-spec.md` and locate sections tied to the current feature.
- Capture implementation constraints, integration points, and performance expectations relevant to the task.

## Step 3: Best Practices Review (Manual)
- Manually read `@.agent-os/standards/best-practices.md`.
- Extract only the sections that match the feature type, technology stack, testing needs, and organization patterns for this task.
- Keep a short checklist of applicable patterns to reference while coding.

## Step 4: Code Style Review (Manual)
- Consult `@.agent-os/standards/code-style.md` for the languages and file types you will touch.
- Note formatting, naming, component structure, and testing style rules; align your changes with these guidelines from the outset.

## Step 5: Task and Sub-task Execution
- Follow a TDD loop: write or update failing tests first, implement functionality, then refactor with tests green.
- Progress through sub-tasks in order, marking each complete only after its tests pass.
- Update related documentation or configuration as required by the instructions gathered earlier.

## Step 6: Task-Specific Test Verification (Manual)
- Run only the new or modified tests tied to this feature (e.g., targeted Vitest commands or filtered test files).
- Fix failures immediately and rerun the same targeted set until they pass consistently.

## Step 7: Task Status Updates
- Edit `tasks.md` to mark each completed task with `[x]`.
- If blocked after three attempts, document the issue with the ⚠️ marker and describe the blocker.

## Post-Flight Verification
- Confirm every numbered step above was performed and documented.
- Re-read change notes to ensure instructions were followed without relying on subagents.
- Surface any deviations or skipped actions to the requester before closing out the task.
