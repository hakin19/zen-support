# Task List Creation Workflow

Follow this guide to convert an approved feature spec into an executable checklist without relying on subagents. Move through the stages in order to keep implementation plans clear and user-aligned.

## Pre-Flight Checklist
- Re-read `.agent-os/instructions/core/create-tasks.md` so each numbered requirement is familiar.
- Confirm the user has approved the spec located in `.agent-os/specs/<DATE>-<spec-name>/`.
- Ensure you can access the spec folder and have the spec summary handy while drafting tasks.

## Step 1: Create `tasks.md`
- Inside the active spec folder, create `tasks.md` manually (e.g., with your editor or `cat > file`).
- Add the header `# Spec Tasks`, followed by a `## Tasks` section.
- Draft 1–5 major tasks as top-level checkbox items (`- [ ] 1. ...`) grouped by feature/component in logical execution order.
- Under each major task, include up to eight subtasks using decimal notation (`- [ ] 1.1 ...`).
  - Start subtasks with a test-writing step (e.g., `Write tests for ...`).
  - End with `Verify all tests pass`. Keep intermediate subtasks focused on implementation, integration, and refactors.
- Apply TDD sequencing and respect technical dependencies between tasks.

## Step 2: Execution Readiness Check
- Summarize for the user: spec name, short description, Task 1 title, key subtasks, and any notable complexity or deliverables.
- Ask explicitly if they want to begin Task 1 implementation using language akin to: “The spec planning is complete… Would you like me to proceed with Task 1?”
- Begin execution only after receiving a clear “yes”; otherwise revise the plan or pause as requested.

## Post-Flight Verification
- Confirm `tasks.md` exists in the spec folder and follows the checklist structure above.
- Make sure the readiness summary was communicated and user approval (or requested changes) is recorded.
- Note any deviations from the workflow and resolve them with the user before transitioning to execution.
