# agent-disco

A Claude Code mod that puts every background agent on a dance floor.

- **Sidebar pane ("Agent disco")**: one row per agent with its label, type, elapsed time, tool count,
  current tool, an estimated progress bar, and a little Claude dancing while it works (it rests with a
  check mark when done, or shows `(×_×)` if it failed). Open it with `/agent-disco`; clear finished rows
  with `/agent-disco-clear`.
- **Main-chat Claude, above the prompt**: while agents are out, a band shows chips for each one. When the
  main chat is working on an agent (launching it, messaging it, reading its output or its completion
  notice), its Claude points at that agent's chip. When it is thinking about something unrelated, it
  slides off to the side and dances.

Progress is an estimate: agents never report how far along they are, so the bar grows with the agent's
model steps and tool calls, slows as it climbs, caps at 95%, and fills only when the agent finishes.

## Install

In a Claude Code session:

```
/plugin install agent-disco --marketplace chmone/agent-disco
```

Answer `y` to add the marketplace, then pick a scope. In the desktop app (where `/plugin` does not run):
click **+** next to the prompt box → **Plugins** → **Add marketplace** with `chmone/agent-disco` → **Add plugin**.

## Develop

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```
