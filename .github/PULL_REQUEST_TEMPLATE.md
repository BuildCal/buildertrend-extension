## Summary

- 

## Test plan

- [ ] `pnpm typecheck` and `pnpm lint` (web)
- [ ] `ruff check app` and `pytest` (`apps/bt-service`)
- [ ] Manual check of the flow this PR touches (login, session refresh, review queue, sync, …)

## Notes

- No secrets, cookies, HAR files, or `.env` values are included
- Docs updated if env vars, endpoints, or the session flow changed
