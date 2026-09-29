# Case Search & Month Filter Inconsistency Report

Date: 2026-09-29
Prepared by: GitHub Copilot (investigation only, no code changes)

## User-Reported Symptom
- Some users can find a case (or see it under month filters), while other users cannot.
- Example: filtering by `Feb` shows no case for one user, but another user can see it.

## Scope Reviewed
- `Manage Cases` page filter + search flow
- `Sales Cases` member page visibility/filter flow
- Page-level access rules from app shell

## Key Findings

### 1) Search is applied after other filters (very likely cause of "exact search but no result")
In `Manage Cases`, the dataset is reduced in this order before search text is checked:
1. Month/Year
2. Project
3. Agent
4. Status
5. Commission type
6. Then search keyword

So if any earlier filter excludes the case, typing the exact case text will still return nothing.

Evidence:
- `summaryCases` is pre-filtered by month/project/agent.
- `filteredCases` (search result) runs on `summaryCases`, not all cases.

## 2) Different users are intentionally looking at different data scopes
The app routes different roles to different case pages:
- Admin/super admin -> `Manage Cases` (all cases, subject to DB policy)
- Member roles -> `Sales Cases` (only cases related to them)

In `Sales Cases`, a row is only visible if viewer is creator/involved/has payout/computed commission relation.
So two users can legitimately see different case sets.

## 3) Month filtering uses JS `Date` parsing on `booking_date`/`created_at` (timezone-sensitive risk)
`Manage Cases` month logic parses dates with `new Date(...)` and then uses local `getMonth()`/`getFullYear()`.
If some clients have different OS timezone settings, date-only strings can shift month boundaries.
This can produce "Feb case not visible" for one user but visible for another.

## 4) Agent filter depends on `involved_user_ids`
`Manage Cases` "Filter by Agent" checks:
- `created_by === selectedAgentId` OR
- selected agent in `involved_user_ids`

If old rows have inconsistent `involved_user_ids`, one user/filter path may miss cases while another path still shows them.

## 5) Potential DB policy/RLS differences remain possible
`Manage Cases` fetches `sales_cases` directly (`from('sales_cases').select('*')`).
If role/session policy differs between users, visible rows can differ even on same UI filters.

## Impact Assessment
- High confusion risk for operations teams: users trust search text but hidden filters can suppress results.
- Medium data-confidence risk: timezone-sensitive month logic can create user-to-user mismatch.
- Medium access-clarity risk: member page and admin page use different inclusion logic by design.

## Reproduction Checklist
Use two affected users (A/B) on same target case:
1. Open same page type for both users (`Manage Cases` vs `Sales Cases`).
2. Set all filters to broad values:
   - Month: `All time`
   - Project: `All`
   - Agent: `All`
   - Status: `All`
   - Comm type/Row type: `All`
3. Search by:
   - exact unit number
   - exact project name
   - creator name
4. Compare visible rows.
5. Repeat after verifying both OS/browser timezones are identical.
6. For missing case, verify DB row fields:
   - `booking_date`
   - `created_at`
   - `created_by`
   - `involved_profile_id`
   - `involved_user_ids`

## Likely Root Cause Ranking
1. Filter stacking hides search results (most likely, confirmed in code flow).
2. Data-scope differences by user role/relationship (likely, by design).
3. Timezone/date parsing edge case for month filter (plausible and common).
4. Inconsistent `involved_user_ids` data on older rows (possible).
5. RLS/policy differences across users (possible, needs SQL policy audit).

## Solution Plan (Implementation)

### A) Make search behavior explicit and user-safe
Problem addressed:
- Users think search checks all cases, but it only checks already-filtered cases.

Fix:
1. Add a visible helper message near search input:
   - "Search applies to current filters."
2. Add a quick action button:
   - "Reset filters" (set Month=All, Project=All, Agent=All, Status=All, Comm Type=All).
3. Add "result context" text:
   - "Showing X results from Y filtered cases".

Expected outcome:
- Fewer false bug reports where exact search appears broken but is blocked by active filters.

### B) Fix month filter to be timezone-safe
Problem addressed:
- `new Date(...)` + local month extraction can shift month for some users.

Fix:
1. Normalize date parsing for `booking_date` and `created_at` using string-based extraction (YYYY-MM) instead of local timezone month math.
2. Use a shared utility function in both `ManageCases` and `SalesCasesForm`:
   - Input: `booking_date` fallback `created_at`
   - Output: stable `YYYY-MM` string or `null`
3. Compare selected month against this normalized `YYYY-MM` value.

Expected outcome:
- Same case appears in same month for all users regardless of timezone.

### C) Enforce consistent involvement source-of-truth
Problem addressed:
- Agent filter may miss rows when `involved_user_ids` is stale/inconsistent.

Fix:
1. Backfill and standardize `involved_user_ids` from canonical fields (`created_by`, `involved_profile_id`).
2. Add write-path safeguard so case updates always keep `involved_user_ids` synchronized.
3. Add one-off SQL validation to identify broken rows.

Suggested SQL audit checks:
```sql
-- Rows where involved_profile_id exists but is missing from involved_user_ids
select id, created_by, involved_profile_id, involved_user_ids
from sales_cases
where involved_profile_id is not null
  and not (involved_profile_id = any(coalesce(involved_user_ids, '{}')));

-- Rows where creator is missing from involved_user_ids (if creator is expected to be present)
select id, created_by, involved_user_ids
from sales_cases
where created_by is not null
  and not (created_by = any(coalesce(involved_user_ids, '{}')));
```

Expected outcome:
- Agent filter produces consistent results across users and across old/new rows.

### D) Validate RLS policy consistency
Problem addressed:
- Different users may have different row visibility from DB policy.

Fix:
1. Review Supabase policies on:
   - `sales_cases`
   - `sales_case_payouts`
2. Confirm intended matrix:
   - Admin/super admin: all rows
   - Member: own/involved/related payout rows only
3. Add a simple policy test script using two real test users and one known case ID.

Expected outcome:
- Visibility differences are intentional and documented, not accidental.

### E) Add diagnostics for support
Problem addressed:
- Hard to debug quickly when user says "case missing".

Fix:
1. Add optional debug panel (admin only) showing active filter state and matched row counts by stage:
   - raw cases -> month -> project -> agent -> status -> comm type -> search
2. Log case ID and stage where exclusion occurs.

Expected outcome:
- Support team can explain and resolve issues faster.

## Recommended Rollout Order
1. B (timezone-safe month matching)
2. A (search + reset UX)
3. C (data consistency backfill)
4. D (RLS verification)
5. E (diagnostics)

## Acceptance Criteria
1. Same case appears under same month/year for users in different timezones.
2. Exact search finds case after "Reset filters" when case is otherwise visible to role.
3. Agent filter returns consistent results for cases with involved salesperson.
4. Admin and member visibility match documented access rules.
5. At least 5 historical failing case IDs pass regression check.

## Recommended Next Actions (no code applied yet)
1. Capture one failing case ID and run side-by-side checks with all filters = broad.
2. Confirm affected users are on same page type and same role scope.
3. Verify both users' timezone settings.
4. Audit DB row fields for failing case (`booking_date`, `involved_user_ids`, `involved_profile_id`).
5. Audit Supabase policies for `sales_cases` and `sales_case_payouts` to confirm intended row visibility.

---
No application code was modified in this investigation.
