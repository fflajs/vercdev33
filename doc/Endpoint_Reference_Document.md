# Endpoint Reference Document

## Endpoints in [action].js
1. **active-iteration** (GET)
2. **people** (POST)
3. **get-user-roles** (GET)
4. **get-role-context** (GET)
5. **org-data** (GET)
6. **table-viewer** (GET)

## Endpoints Used in Frontend (HTML)
- **admin.html** → active-iteration
- **register.html** → people
- **login-user.html** → get-user-roles
- **portal.html** → get-role-context
- **cognitive-tool.html** → get-role-context
- **analyze.html** → get-role-context
- **org-chart.html** → get-role-context, org-data, add-unit, delete-org-unit, add-role, delete-role
- **table-viewer.html** → get-role-context, table-viewer
- **iteration-manager.html** → active-iteration (and implicit iteration creation/closing, missing in [action].js)
- **login.html** → none directly (redirects)

## Mismatches Found
- `delete-org-unit` used in **org-chart.html**, but backend had `delete-unit` (naming mismatch).
- `add-unit`, `add-role`, `delete-role` referenced in frontend, but missing in backend.
- Iteration management (create/close) referenced in **iteration-manager.html**, but missing in backend.

