# Security policy

## Supported versions

This project is pre-alpha and does not have versioned releases. Security fixes land on `main`.

## What this software holds

A running instance stores:

- Encrypted Buildertrend session cookies (equivalent to a logged-in admin until they expire)
- A shared internal API token between the web app and `bt-service`
- A webhook secret that can enqueue bills
- Application user passwords (bcrypt)
- Optionally, invoice PDFs in object storage

Treat a deployed instance as production.

## Reporting a vulnerability

**Do not open a public GitHub issue for security reports.**

Email **brad@caldongroup.com** with:

- A description of the issue and its impact
- Steps to reproduce, or a proof of concept against a local/dev instance
- Any suggested fix, if you have one

Please do **not** attach live session cookies, production tokens, or customer invoice PDFs.

We will acknowledge receipt as soon as we can and keep you updated on a fix. We do not currently run a bug bounty.

## Hard rules for operators

See [docs/security.md](docs/security.md) for the threat model and rotation playbooks. In short:

- Never expose `bt-service` publicly
- Never commit `.env`, `bt_cookies.txt`, `session.json`, or `*.har`
- Never log cookie values, `INTERNAL_API_TOKEN`, or `EXTRACTOR_WEBHOOK_SECRET`
