# Regeneration Checklist

## 1. Backend (api/admin/[action].js)
- [ ] Ensure endpoint names match frontend calls exactly.
- [ ] Add missing endpoints:
  - add-unit
  - delete-org-unit
  - add-role
  - delete-role
  - iteration-create (if needed)
  - iteration-close (if needed)
- [ ] Remove/rename inconsistent ones (e.g., delete-unit → delete-org-unit).

## 2. Frontend HTMLs
- [ ] Verify each HTML page only calls existing backend endpoints.
- [ ] Standardize fetch URLs (consistent naming, method types).
- [ ] Add error handling + debug logs.

## 3. Consistency Checks
- [ ] Confirm all role-based pages pass role_id correctly.
- [ ] Ensure admin-mode pages work without role_id (dual mode).
- [ ] Keep context passing (login → portal → tools) stable.

## 4. Documentation
- [ ] Update Endpoint Reference Document whenever endpoints are added/renamed.
- [ ] Keep Regeneration Checklist updated after each major regeneration.

## 5. Baselines
- [ ] Before large changes, mark a Stable Baseline version.
- [ ] After successful deployment, bump to next baseline (e.g., Stable Baseline v4).

