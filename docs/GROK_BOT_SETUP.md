# Use the Buildertrend Gateway with Grok Bot

This page is for people who are **not** technical. You do not need to clone
the repo, open a terminal, or paste cookies.

**Unofficial.** This project is not affiliated with, endorsed by, or supported
by Buildertrend. Use it only with a Buildertrend account you are allowed to
use.

## What you need

- [Grok Bot](https://grok.com) on a computer
- A Buildertrend login you are allowed to use
- A few minutes

You do **not** need to know Git, Node, or pnpm. The agent does that on
**Grok Bot’s computer**.

## What you will get

After setup you can ask Grok Bot things like “list my jobs” or “get variation
X”. Grok Bot talks to Buildertrend through this gateway only.

- Reads work against your signed-in Buildertrend account
- Writes stay **drafts** (Not sent)
- Send, pay, and notify stay **off** unless you later choose otherwise
- There is **no** catalog connector named Buildertrend. Setup adds a **local**
  connector on Grok Bot’s computer

## Steps

### 1. Open Grok Bot

Use Grok Bot on the computer that will keep the gateway running.

Settings (only if you need them later): click the **account button** at the
**bottom-left** of the sidebar, or press **Cmd+,**. Tabs are **General**,
**Computer**, **Usage & Billing**, and **Updates**.

To see what this chat’s agent is doing: click the **agent name** in the chat
header, or press **Cmd+Shift+I**.

### 2. Paste this prompt

Copy the block below. If you found this repo under the old name, that is
fine — [https://github.com/BuildCal/buildertrend-extension](https://github.com/BuildCal/buildertrend-extension)
redirects to the same place.

```
Set up the Buildertrend Gateway from this GitHub repo. I'm not technical. Follow AGENTS.md and docs/GROK_BOT_SETUP.md. Walk me through it. Don't enable send.

https://github.com/BuildCal/buildertrend-gateway
```

Send it. The agent should say, in one short message, that it will install
the gateway on **its** computer, connect it as a connector, then ask you to
sign into Buildertrend once.

### 3. Agree to add the connector

Grok Bot will ask (a question you tap) whether it may add the **Buildertrend
Gateway** connector. That connector is a **local** program on Grok Bot’s
computer. It also runs for **your other agents** on this computer, not only
this chat.

Tap **Yes**.

The new tools show up on the **next** message, not the same one. If the
agent asks you to send “ok” or continue, do that.

### 4. Sign into Buildertrend on the screen it shows

When it is time to log in, Grok Bot will hand you a **sign-in box** for
`buildertrend.net`. Sign in **on that screen**.

- Use a login you are allowed to use
- Complete password and 2FA **in that box**, not in the chat
- **Do not** paste your password, cookies, or 2FA codes into the chat
- Prefer a **dedicated** Buildertrend login window. The agent should already
  have opened a gateway-only Chrome profile — not the Chrome profile you
  click around in all day

If the session drops later, the agent should show you that box again. It
must not loop logins or ask you to re-type a password in chat.

### 5. Try a simple question

When the agent says you are done, ask something small:

- “List my jobs”
- “Get variation …” (use a real id or title you already know)

You work in **Grok Bot** (or ViaBuild). Buildertrend stays the office copy
after a draft is pushed. Send and pay stay locked. Some writes are not
wired yet; the agent will say `not_captured` instead of guessing.

## What you should not do

- Paste cookies, tokens, or HAR files into chat or into GitHub
- Paste your Buildertrend password into chat
- Run terminal commands yourself
- Turn on send / pay / notify
- Merge pull requests (Brad merges)
- Drive your everyday Buildertrend Chrome tab at the same time as the agent

## If something feels wrong

- **It asked for a password in the chat.** Stop. Ask it to show the sign-in
  box again (`request_box_help` / “Sign in to buildertrend.net”).
- **It wants to enable send.** Say no. Setup must keep send off.
- **It opened your daily Chrome profile.** Say no. The gateway needs its own
  profile.
- **You only wanted to look around.** You can close the chat. The connector
  stays on this computer until you remove it; it does not post bills or
  emails by itself.

## For the agent

If you are a Grok Bot or any coding agent reading this because the human
pasted the GitHub URL, stop and follow **[AGENTS.md](../AGENTS.md)** from
the top. Do not tell the human to clone or to run `pnpm`.
