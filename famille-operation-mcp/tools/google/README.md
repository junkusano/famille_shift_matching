# Google Sheets extension point

Phase 2 should first compare each workflow with the existing ChatGPT Google Drive/Sheets connector. Direct connector access is preferred for ordinary interactive edits. This MCP should only add operations that need Famille-specific validation, fixed spreadsheet allowlists, audit records, or two-step approval.

Planned operations are bounded range reads, exact row search, row append, and optimistic-concurrency row updates. Delete and bulk replacement tools are intentionally excluded.
