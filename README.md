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

Progress is an estimate: agents never report how far along they are. When an agent keeps a todo list
(TodoWrite, or TaskCreate/TaskUpdate), the bar is the share of items it has finished. Otherwise it compares
the agent's elapsed time and tool calls with how long agents of the same type actually took before (learned
across sessions; a 10-minute guess until three runs are on record). A typical-length run reads about 70%,
twice that about 91%; the bar caps at 97% and fills only when the agent finishes.

Finished agents leave the floor 2 minutes after they finish (failed ones after 5); `/agent-disco-clear`
clears them at once.

## Where it shows up

The side pane and the band above the prompt draw in the terminal CLI (and Claude Code Desktop when
attached locally). Clients that don't draw mod panes, such as the Claude app viewing a cloud session,
get the fallbacks instead: a live card with a dancer and progress bar under each Agent call's row in the
chat and `/agent-disco` drawing the floor
inline in the chat.

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
