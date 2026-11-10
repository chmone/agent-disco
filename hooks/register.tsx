import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentRow, ParentFocus } from '../types'

// Agent Disco: every background agent gets a row in a side pane with a
// progress bar and a little Claude dancing while it works. Above the prompt,
// the main chat's Claude points at the agent it is busy with, or slides to
// the side and dances when it is thinking about something new.

const PANE = 'agent-disco'
const TITLE = 'Agent disco'
const INLINE = 'agent-disco-floor'
// How long a finished agent stays on the floor before it leaves.
const DONE_LINGER_MS = 2 * 60_000
const FAILED_LINGER_MS = 5 * 60_000

const agents = atom({ plugin: 'agent-disco', key: 'agents' } as const, [], {
  shape: 'agents-3',
})
const frame = atom({ plugin: 'agent-disco', key: 'frame' } as const, 0)
const IDLE: ParentFocus = { mode: 'idle', target: '', why: '' }
const focus = atom({ plugin: 'agent-disco', key: 'focus' } as const, IDLE, {
  shape: 'focus-1',
})

// --- the dancers -----------------------------------------------------------

const DANCE = [
  '\\(•ᴗ•)/',
  ' (•ᴗ•)>',
  '<(•ᴗ•) ',
  '┏(•ᴗ•)┛',
  '┗(•ᴗ•)┓',
  ' (•ᴗ•)♪',
]
const NOTES = ['♪ ', '♫ ', ' ♪', ' ♫']
const RESTING = ' (•ᴗ•)✓'
const FAILED = ' (×_×) '
const POINT = ['(•ᴗ•)☞', '(•ᴗ•)☞ ']
const THINK = ['(•ᴗ•)?', '(•ᴗ•)…']

// Each agent dances on its own beat so the floor does not move in lockstep.
const dancer = (row: AgentRow, f: number, i: number): string => {
  if (row.status === 'done') return RESTING
  if (row.status === 'failed') return FAILED
  return DANCE[(f + i * 2) % DANCE.length] ?? DANCE[0]!
}

// --- progress --------------------------------------------------------------

// An agent never says how far along it is, so the bar is an estimate:
// - if it keeps a todo list (TodoWrite / TaskCreate+TaskUpdate), the share of
//   items it has finished;
// - otherwise its elapsed time and tool calls against how long agents of
//   its type have actually taken before (learned, kept across sessions),
//   so a long tail after a quick run-through does not sit at 95%.
// It never shows 100% until the agent really ends.
type Run = { type: string; ms: number; tools: number }
const DEFAULT_MS = 10 * 60_000
const DEFAULT_TOOLS = 40
let history: Run[] = []

const median = (xs: number[]): number => {
  const v = xs.slice().sort((a, b) => a - b)
  return v[Math.floor(v.length / 2)] ?? 0
}

const expected = (type: string): { ms: number; tools: number } => {
  const same = history.filter(r => r.type === type)
  const pool = same.length >= 3 ? same : history
  if (pool.length < 3) return { ms: DEFAULT_MS, tools: DEFAULT_TOOLS }
  return { ms: Math.max(60_000, median(pool.map(r => r.ms))), tools: Math.max(5, median(pool.map(r => r.tools))) }
}

const progress = (row: AgentRow, now: number): number => {
  if (row.status !== 'running') return 1
  if (row.todoTotal > 0) {
    return Math.min(0.97, Math.max(0.03, (row.todoDone + 0.3) / row.todoTotal))
  }
  const exp = expected(row.type)
  const r = 0.65 * ((now - row.startedAt) / exp.ms) + 0.35 * (row.tools / exp.tools)
  // r = 1 (a typical run's length) reads 70%; twice that, 91%.
  return Math.min(0.97, 1 - Math.exp(-1.2 * r))
}

const bar = (p: number, width: number): string => {
  const cells = Math.max(4, width)
  const full = Math.round(p * cells)
  return '█'.repeat(full) + '░'.repeat(cells - full)
}

const elapsed = (row: AgentRow, now: number): string => {
  const end = row.status === 'running' ? now : row.endedAt
  const s = Math.max(0, Math.round((end - row.startedAt) / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
}

const short = (text: string, n: number): string =>
  text.length <= n ? text : `${text.slice(0, Math.max(1, n - 1))}…`

// --- tool arguments that name an agent --------------------------------------

const ARG_KEYS = ['to', 'task_id', 'taskId', 'agent_id', 'agentId', 'id', 'name', 'shell_id']

const mentioned = (list: readonly AgentRow[], args: Record<string, unknown>): AgentRow | undefined => {
  for (const key of ARG_KEYS) {
    const v = args[key]
    if (typeof v !== 'string' || v === '') continue
    const hit = list.find(a => a.id === v || a.label === v || v.includes(a.id))
    if (hit) return hit
  }
  return undefined
}

const mentionedIn = (list: readonly AgentRow[], text: string): AgentRow | undefined =>
  text === '' ? undefined : list.find(a => a.id !== '' && text.includes(a.id))

function patch($: EngineInterface, id: string, fn: (a: AgentRow) => AgentRow) {
  return update($, agents, list => list.map(a => (a.id === id ? fn(a) : a)))
}

// What the pane (and its inline stand-in) draws: one row per agent.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function floorTree($: EngineInterface, Box: any, Text: any, cols: number) {
    const list = await read($, agents)
    const f = await read($, frame)
    const fx = await read($, focus)
    const now = await $.clock.now()
    const barWidth = Math.max(6, Math.min(24, cols - 20))
    const running = list.filter(a => a.status === 'running').length

    if (list.length === 0) {
      return (
        <Box flexDirection="column" paddingX={1}>
          <Text color="claude" mono>{' (•ᴗ•)zZ'}</Text>
          <Text dimColor>No agents on the floor yet.</Text>
          <Text dimColor>They show up here as soon as one starts.</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Text dimColor>
          {running > 0 ? `${running} dancing · ${list.length - running} resting` : `${list.length} resting`}
        </Text>
        {list
          .slice()
          .reverse()
          .map((a, i) => {
            const p = progress(a, now)
            const watched = fx.mode === 'pointing' && fx.target === a.id
            const tone = a.status === 'failed' ? 'error' : a.status === 'done' ? 'success' : 'claude'
            return (
              <Box key={a.id} flexDirection="column">
                <Box flexDirection="row" gap={1}>
                  <Text color={tone} mono>
                    {a.status === 'running' ? NOTES[(f + i) % NOTES.length] : '  '}
                    {dancer(a, f, i)}
                  </Text>
                  <Text weight="semibold">{short(a.label, Math.max(10, cols - 14))}</Text>
                  {watched && <Text color="suggestion">◀ main</Text>}
                </Box>
                <Box flexDirection="row" gap={1}>
                  <Text color={tone} mono>{bar(p, barWidth)}</Text>
                  <Text dimColor mono>
                    {a.status === 'running' ? `~${Math.round(p * 100)}%` : a.status === 'done' ? 'done' : 'failed'}
                  </Text>
                </Box>
                <Text dimColor>
                  {a.type}
                  {a.background ? ' · bg' : ''} · {elapsed(a, now)} · {a.tools} tools
                  {a.todoTotal > 0 ? ` · ${a.todoDone}/${a.todoTotal} todos` : ''}
                  {a.status === 'running' ? ` · ${a.lastTool}` : ''}
                </Text>
              </Box>
            )
          })}
      </Box>
    )
}

// Agents already running when the mod loaded (or reloaded) never raised a
// spawn it heard, so take them from the engine's roster.
async function seed($: EngineInterface) {
  const roster = await $.agent.list()
  const now = await $.clock.now()
  await update($, agents, list => {
    const known = new Set(list.map(a => a.id))
    const fresh: AgentRow[] = roster
      .filter(r => !known.has(r.id) && (r.status === 'running' || r.status === 'pending' || r.status === 'waiting'))
      .map(r => ({
        id: r.id,
        toolUseId: '',
        label: r.description || r.name || r.type,
        type: r.type,
        background: true,
        status: 'running',
        steps: 0,
        todoTotal: 0,
        todoDone: 0,
        tools: 0,
        lastTool: 'already running',
        startedAt: now,
        endedAt: 0,
      }))
    return [...list, ...fresh].slice(-40)
  })
}

// Opens the pane; where the surface does not draw it, places the inline
// row instead and says why.
async function show($: EngineInterface): Promise<string> {
  await seed($)
  const opened = await $.ui.open({ id: PANE, title: TITLE })
  if (opened.isPlaced) return 'Agent disco is open in the side pane.'
  const placed = await $.ui.place({ id: INLINE })
  const why = opened.reason
  return placed.isPlaced
    ? `This app did not place the side pane (${why}), so the floor is drawn right here in the chat.`
    : `Could not draw Agent disco: ${why}.`
}

export const register: Register = on => {
  let tick: { cancel: () => void } | undefined
  let beats = 0
  // TaskCreate/TaskUpdate lists, per agent: task id -> done.
  const tasks = new Map<string, Map<string, boolean>>()
  // Spawns whose agentId has not come back yet, by Agent tool call.
  const pending = new Map<string, { label: string; type: string; background: boolean }>()


  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'agent-disco',
      description: 'Open the Agent disco pane (background agents with progress)',
    })
    await $.command.register({
      name: 'agent-disco-clear',
      description: 'Clear finished agents from the Agent disco pane',
    })
    void $.ui.open({ id: PANE, title: TITLE })
    void seed($)
    // An earlier version wrote a status line; clear whatever it left.
    $.ui.status(undefined)
    const kept = await $.store.get('history')
    history = Array.isArray(kept) ? (kept as Run[]).filter(r => r && typeof r.ms === 'number').slice(-60) : []

    tick?.cancel()
    tick = $.clock.every(260, () => {
      beats += 1
      void (async () => {
        const list = await read($, agents)
        const f = await read($, focus)
        const running = list.some(a => a.status === 'running')
        // Only advance the beat (and so redraw) when someone is dancing.
        if (running || f.mode !== 'idle') await update($, frame, n => (n + 1) % 1200)
        // Finished agents leave the floor after a while.
        if (beats % 4 === 0 && list.some(a => a.status !== 'running')) {
          const now = await $.clock.now()
          const gone = (a: AgentRow) =>
            (a.status === 'done' && now - a.endedAt > DONE_LINGER_MS) ||
            (a.status === 'failed' && now - a.endedAt > FAILED_LINGER_MS)
          if (list.some(gone)) await update($, agents, rows => rows.filter(a => !gone(a)))
        }
        // Every ~2.6s reconcile with the engine's own roster, so an agent that
        // was killed or failed without a final turn still stops dancing.
        if (running && beats % 10 === 0) {
          const roster = await $.agent.list()
          const now = await $.clock.now()
          await update($, agents, rows =>
            rows.map((row): AgentRow => {
              if (row.status !== 'running') return row
              const info = roster.find(r => r.id === row.id)
              if (!info) return row
              if (info.status === 'completed') return { ...row, status: 'done', endedAt: now }
              if (info.status === 'failed' || info.status === 'killed')
                return { ...row, status: 'failed', endedAt: now }
              return row
            }),
          )
        }
      })()
    })

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    tick?.cancel()
    tick = undefined
    return next(e)
  })

  on('command.run', { command: 'agent-disco' }, async $ => ({ text: await show($) }))

  on('command.run', { command: 'agent-disco-clear' }, async $ => {
    await update($, agents, list => list.filter(a => a.status === 'running'))
    return { text: 'Cleared finished agents.' }
  })

  // --- agents start ----------------------------------------------------------

  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    // Remember the call's description so the spawn below can label its row.
    if (e.tool_use_id) {
      const args = e as unknown as Record<string, unknown>
      pending.set(e.tool_use_id, {
        label: String(args.description ?? 'agent'),
        type: String(args.subagent_type ?? 'general-purpose'),
        background: args.run_in_background !== false,
      })
    }
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const out = await next(e)
    if (out.deny !== undefined || !out.agentId) return out
    const id = out.agentId
    const now = await $.clock.now()
    const row: AgentRow = {
      id,
      toolUseId: e.tool_use_id,
      label: e.description || pending.get(e.tool_use_id)?.label || e.subagentType,
      type: e.subagentType,
      background: e.background,
      status: 'running',
      steps: 0,
      todoTotal: 0,
      todoDone: 0,
      tools: 0,
      lastTool: 'warming up',
      startedAt: now,
      endedAt: 0,
    }
    pending.delete(e.tool_use_id)
    await update($, agents, list => [...list.filter(a => a.id !== id), row].slice(-40))
    // The main chat just launched it: point at the newcomer.
    if (e.parentAgentId === undefined) {
      await update($, focus, (): ParentFocus => ({ mode: 'pointing', target: id, why: 'launching' }))
    }
    return out
  })

  // --- agents work -------------------------------------------------------------

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) {
      const id = e.agentId
      await patch($, id, a => ({ ...a, steps: a.steps + 1 }))
    } else {
      // The main chat is thinking. If it is not already looking at an agent
      // and there are agents out working, it slides aside to dance on it.
      const list = await read($, agents)
      const f = await read($, focus)
      if (f.mode !== 'pointing' && list.some(a => a.status === 'running')) {
        await update($, focus, (): ParentFocus => ({ mode: 'side', target: '', why: 'thinking' }))
      }
    }
    return yield* next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) {
      const id = e.agentId
      const args = e as unknown as Record<string, unknown>
      let todo: { total: number; done: number } | undefined
      if (e.tool === 'TodoWrite' && Array.isArray(args.todos)) {
        const items = args.todos as { status?: string }[]
        todo = { total: items.length, done: items.filter(t => t?.status === 'completed').length }
      } else if (e.tool === 'TaskCreate' || e.tool === 'TaskUpdate') {
        const mine = tasks.get(id) ?? new Map<string, boolean>()
        tasks.set(id, mine)
        const key = String(args.taskId ?? args.task_id ?? args.id ?? `new-${mine.size}`)
        if (e.tool === 'TaskCreate') mine.set(key, false)
        else if (args.status === 'completed') mine.set(key, true)
        else if (args.status === 'deleted') mine.delete(key)
        todo = { total: mine.size, done: [...mine.values()].filter(Boolean).length }
      }
      await patch($, id, a => ({
        ...a,
        tools: a.tools + 1,
        lastTool: e.tool,
        ...(todo ? { todoTotal: todo.total, todoDone: todo.done } : {}),
      }))
      return next(e)
    }

    // Main loop: does this call concern one of the agents?
    const list = await read($, agents)
    if (list.length > 0 && e.tool !== 'Agent') {
      const hit = mentioned(list, e as unknown as Record<string, unknown>)
      if (hit) {
        await update($, focus, (): ParentFocus => ({ mode: 'pointing', target: hit.id, why: e.tool }))
      } else if (list.some(a => a.status === 'running')) {
        await update($, focus, (): ParentFocus => ({ mode: 'side', target: '', why: e.tool }))
      }
    }
    return next(e)
  })

  // --- agents finish, the main turn starts and ends ---------------------------

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      // A main turn woken by an agent's result (its notification names the
      // agent) is about that agent.
      const hit = mentionedIn(await read($, agents), e.text)
      await update($, focus, (): ParentFocus =>
        hit ? { mode: 'pointing', target: hit.id, why: 'reading its result' } : IDLE,
      )
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) {
      const id = e.agentId
      const now = await $.clock.now()
      const ok = e.reason === 'answer'
      await patch($, id, (a): AgentRow => ({ ...a, status: ok ? 'done' : 'failed', endedAt: now, lastTool: ok ? (a.lastTool === 'already running' ? a.lastTool : 'finished') : e.reason }))
      tasks.delete(id)
      // Learn how long agents of this type really take, for the next bars.
      const row = (await read($, agents)).find(a => a.id === id)
      if (ok && row && row.lastTool !== 'already running' && row.startedAt > 0) {
        history = [...history, { type: row.type, ms: now - row.startedAt, tools: row.tools }].slice(-60)
        await $.store.set('history', history)
      }
    } else {
      await update($, focus, () => IDLE)
    }
    return next(e)
  })

  // --- the sidebar pane ------------------------------------------------------

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return floorTree($, Box, Text, e.viewport?.columns ?? 40)
  })

  // The same floor, drawn as a live row in the conversation, for surfaces
  // that do not place panes (or a window too narrow for one).
  on('ui.render', { component: 'Placed' }, async ($, e, next) => {
    if (e.props.plugin !== 'agent-disco' || e.props.id !== INLINE) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return floorTree($, Box, Text, e.viewport?.columns ?? 60)
  })

  // --- a live card under each Agent call's row in the chat ------------------

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.props.tool !== 'Agent') return next(e)
    const list = await read($, agents)
    const a = list.find(one => one.toolUseId !== '' && one.toolUseId === e.props.tool_use_id)
    if (!a) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const f = await read($, frame)
    const p = progress(a, await $.clock.now())
    const tone = a.status === 'failed' ? 'error' : a.status === 'done' ? 'success' : 'claude'
    const row = await next(e)
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={tone} paddingX={1}>
        {row}
        <Box flexDirection="row" gap={1}>
          <Text color={tone} mono>{dancer(a, f, 0)}</Text>
          <Text color={tone} mono>{bar(p, 16)}</Text>
          <Text dimColor mono>
            {a.status === 'running' ? `~${Math.round(p * 100)}% · ${a.tools} tools · ${a.lastTool}` : a.status}
          </Text>
        </Box>
      </Box>
    )
  })

  // --- the main chat's Claude, above the prompt ------------------------------

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const list = await read($, agents)
    const fx = await read($, focus)
    const running = list.filter(a => a.status === 'running')
    if (running.length === 0 && fx.mode !== 'pointing') return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const f = await read($, frame)
    const now = await $.clock.now()
    const target = fx.mode === 'pointing' ? list.find(a => a.id === fx.target) : undefined
    // Chips: one per agent on the floor; the one main is looking at is lit.
    const floor = list.filter(a => a.status === 'running' || a.id === fx.target).slice(-5)

    // One line: the main chat's Claude, then the floor.
    const me = target
      ? `${POINT[f % POINT.length]}${'─'.repeat(1 + (f % 3))}▶`
      : fx.mode === 'side'
        ? `${NOTES[f % NOTES.length]}${DANCE[f % DANCE.length]}`
        : (THINK[Math.floor(f / 3) % THINK.length] ?? THINK[0]!)

    return (
      <Box flexDirection="row" gap={1} flexWrap="wrap">
        <Text color="claude" mono>{me}</Text>
        {fx.mode === 'side' && !target && <Text dimColor>new thought ·</Text>}
        {floor.map((a, i) => {
          const lit = target?.id === a.id
          return (
            <Text key={a.id} color={lit ? 'suggestion' : a.status === 'running' ? 'claude' : 'success'} weight={lit ? 'bold' : 'regular'} mono>
              [{dancer(a, f, i).trim()} {short(a.label, 16)} {Math.round(progress(a, now) * 100)}%]
            </Text>
          )
        })}
      </Box>
    )
  })
}
