# Full Report: Slow or Stuck Loading on Create/Edit Case Submit

Date: 2026-09-27
Scope: Analysis only (no code changes)

## 1. Executive Summary

The slow or seemingly stuck loading behavior during Create Case or Edit Case submit is primarily caused by a long synchronous client-side submit pipeline in the modal:

1. Multiple file uploads are awaited in strict sequence.
2. Additional database insert/update retries may run for policy/column fallback scenarios.
3. Post-write cleanup and notification inserts are also awaited before submit completes.
4. No explicit timeout/cancellation boundary exists around each network step.

As a result, the UI remains in "Saving..." until all steps complete, which can appear as hanging under slow network, large files, or RLS retry paths.

## 2. Data and Log Sources Reviewed

### 2.1 Application code paths

- src/components/SalesCaseModal.tsx
- src/components/SalesCasesForm.tsx
- src/components/ManageCases.tsx
- src/lib/notifications.ts
- sales_cases_status_setup.sql

### 2.2 Local log files reviewed

- VS Code Copilot session logs at:
  - /Users/branden/Library/Application Support/Code/User/workspaceStorage/ee68f8c7d3c168e2030b5e758d0eb20f/GitHub.copilot-chat/debug-logs/e0e904e4-e2d2-4de5-997a-52ba7ed59fc1/main.jsonl
  - /Users/branden/Library/Application Support/Code/User/workspaceStorage/ee68f8c7d3c168e2030b5e758d0eb20f/GitHub.copilot-chat/debug-logs/e0e904e4-e2d2-4de5-997a-52ba7ed59fc1/models.json

Finding: These files are Copilot metadata/model catalogs, not frontend runtime/network logs for submit requests.

## 3. Detailed Submit Flow (Evidence)

In src/components/SalesCaseModal.tsx, loading starts at:

- setIsSubmitting(true) at line ~1331

Then submit executes the following awaited steps in order:

1. booking form upload
   - uploadBookingForm() definition around line ~1182
   - awaited around line ~1341
2. LO draft upload
   - uploadLoDraft() definition around line ~1197
   - awaited around line ~1355
3. signed SPA upload
   - uploadSignedSpa() definition around line ~1213
   - awaited around line ~1369
4. customer IC uploads
   - uploadCustomerIcs() definition around line ~1229
   - awaited around line ~1383
   - internal for-loop uploads each customer IC sequentially
5. booking receipt upload
   - uploadBookingReceipt() definition around line ~1255
   - awaited around line ~1397

After uploads, database write path runs:

- update (edit) or insert (create) against sales_cases
- create path includes fallback retries for legacy columns and RLS scenarios (multiple sequential attempts)

Additional awaited work before submit ends:

- edit path old file cleanup via storage remove calls:
  - around lines ~1561, ~1565, ~1569, ~1573, ~1577
- notifications:
  - notifyCaseAudience/createCaseNotifications around ~1596 and ~1708
  - underlying notifications insert in src/lib/notifications.ts around line ~83

Submit only completes after all this, at:

- setIsSubmitting(false), onSaved(), onClose() around lines ~1725-1726

## 4. Root Causes (Ranked)

### Root Cause A (Primary): Sequential network chain under a single loading state

The submit path serializes many network operations. Total latency is additive, not parallelized. Any one slow step delays all subsequent steps and keeps button state in "Saving...".

### Root Cause B (High impact): Retry branches can multiply DB round-trips

Create path contains retry/fallback branches for RLS and schema compatibility. Under partial policy mismatches, the request can perform several attempts before final success/failure.

### Root Cause C (Medium impact): Post-write cleanup and notifications are blocking

On edit, file deletion and notification inserts are awaited before submit finalizes. These extra steps increase perceived submit duration.

### Root Cause D (Operational): No explicit request timeout/cancellation UX boundary

If a network/storage call stalls, the modal remains loading until the promise resolves/rejects, which users perceive as hang.

## 5. What Was Checked in SQL/RLS

From sales_cases_status_setup.sql:

- No heavy trigger logic was identified for sales_cases insert/update in this script.
- RLS policies are present for insert/update and role-specific conditions.
- notifications table has insert policy requiring created_by = auth.uid().

Interpretation:

- The slow behavior is not explained by an obvious database trigger loop in this SQL file.
- Policy checks can still contribute to retries/failures, but they are not the main additive-latency source compared to the frontend sequential await pipeline.

## 6. Why It Sometimes Looks Like Infinite Loading

It appears infinite when one of these happens:

1. Large file(s) + slower upload throughput.
2. Intermittent network causing long unresolved upload/write.
3. Retry branches execute repeatedly before eventual outcome.
4. Blocking post-save tasks (cleanup/notifications) add delay after DB write already succeeded.

## 7. Not the Main Cause

- No evidence in current code review that get_ranking_sales_cases RPC itself is blocking the modal submit spinner.
- Post-save list refresh can still feel heavy, but the spinner issue is dominated by the modal submit chain.

## 8. Confirmation Checklist (No Code Changes)

Use browser DevTools Network and Supabase logs to confirm exact step:

1. Open Create Case modal and submit with typical files.
2. Track request waterfall:
   - storage upload requests
   - sales_cases insert/update
   - notifications insert
3. Capture duration per request and identify max contributor.
4. Compare:
   - 1 customer file vs multiple customer files
   - small files vs larger files
   - create vs edit
5. Check Supabase dashboard logs for repeated insert attempts and RLS denials.

Expected observation: longest time accumulates in serialized uploads and follow-up awaited operations.

## 9. Conclusion

The issue is primarily frontend submit orchestration latency (long sequential async chain) rather than a single SQL trigger defect. The current implementation is functionally robust with many fallbacks, but those fallbacks and blocking post-write tasks significantly increase user-perceived submit time and can look like stuck loading under real network conditions.
