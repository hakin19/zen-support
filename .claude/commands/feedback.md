Ask Codex via the MCP tool 'ask-codex' with the following format:
ask-codex "Read repo diff for all the file modifications resulted from $ARGUMENTS and all of its subtasks in file $ARGUMENTS and let me know if you find any major issues that are important and needs to be addressed. Focus on:\n1. Security vulnerabilities\n2. Breaking changes in APIs\n3. Missing error handling\n4. Performance issues\n5. Incorrect implementations\n\nNo need to report minor style issues or non-critical improvements." model="gpt-5" sandbox="read-only"

Once you get the comments back from Codex, analyze each comment to decide if that comment is correct and needs to be addressed right now or if it can be deferred to later. If it needs to be addressed right now, add it to your todo list and move on to the next comment.

Once you finish processing all the comments, start implementing the todo items that resulted from the comments.
