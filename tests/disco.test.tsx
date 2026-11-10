import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'agent-disco',
  component: 'Pane',
  requestId: 'agent-disco',
  props: {
    title: 'Agent disco',
    isFocused: false,
    bodyColumns: 44,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('a spawned agent dances in the pane with a progress bar', async ($, on) => {
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('agent.spawn', () => ({ model: 'm', agentId: 'a1' }))
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', () => ({ text: '' }))
  on('clock.now', () => ({ value: 1_000 }))
  on('clock.every', () => ({ value: {} }))
  on('agent.list', () => ({ value: [] }))
  on('store.get', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.agent.spawn({ prompt: 'look around', description: 'Map the auth code', subagentType: 'Explore', background: true })
  await $.tool.call({ tool: 'Grep', pattern: 'auth', agentId: 'a1' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Map the auth code/ }))?.text).toContain('Map the auth code')
    expect((await ui.find({ type: 'Text', text: /%/ }))?.text).toMatch(/~\d+%/)
    expect((await ui.find({ type: 'Text', text: /Grep/ }))?.text).toContain('1 tools')
    await ui.unmount()
  }
})

test('the main Claude points at the agent it messages, and dances aside otherwise', async ($, on) => {
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('agent.spawn', () => ({ model: 'm', agentId: 'a1' }))
  on('tool.call', () => ({ result: {} }))
  on('clock.now', () => ({ value: 1_000 }))
  on('clock.every', () => ({ value: {} }))
  on('agent.list', () => ({ value: [] }))
  on('store.get', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.agent.spawn({ prompt: 'p', description: 'Write the tests', subagentType: 'general-purpose', background: true })

  const band = { plugin: 'agent-disco', component: 'AbovePrompt', props: { hasSurvey: false } } as const

  await $.tool.call({ tool: 'SendMessage', to: 'a1', message: 'hi' })
  let ui = await $.ui.mount({ ...band, surface: 'desktop' } as never)
  expect((await ui.find({ type: 'Text', text: /☞/ }))?.text).toContain('☞')
  expect((await ui.find({ type: 'Text', text: /Write the tests/ }))?.text).toMatch(/\d+%\]$/)
  await ui.unmount()

  await $.tool.call({ tool: 'Bash', command: 'ls' })
  ui = await $.ui.mount({ ...band, surface: 'desktop' } as never)
  expect((await ui.find({ type: 'Text', text: /new thought/ }))?.text).toBe('new thought ·')
  await ui.unmount()
})

test('where no pane is placed, /agent-disco draws the floor inline and shows agents already running', async ($, on) => {
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'no surface places panes' } }))
  on('ui.place', () => ({ value: { isPlaced: true, requestId: 'r1' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: 1_000 }))
  on('clock.every', () => ({ value: {} }))
  on('store.get', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('agent.list', () => ({ value: [{ id: 'old1', description: 'Phase 4 review', type: 'general-purpose', status: 'running' }] }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const out = await $.command.run({ command: 'agent-disco', args: '' } as never)
  expect(JSON.stringify(out)).toContain('drawn right here in the chat')

  const ui = await $.ui.mount({ plugin: 'agent-disco', component: 'Placed', surface: 'desktop', props: { id: 'agent-disco-floor', plugin: 'agent-disco' } } as never)
  expect((await ui.find({ type: 'Text', text: /Phase 4 review/ }))?.text).toContain('Phase 4 review')
  await ui.unmount()
})

test('the Agent call row in the chat carries a live card, on the app surfaces too', async ($, on) => {
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'no surface places panes' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('agent.spawn', () => ({ model: 'm', agentId: 'a9' }))
  on('clock.now', () => ({ value: 1_000 }))
  on('clock.every', () => ({ value: {} }))
  on('agent.list', () => ({ value: [] }))
  on('store.get', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>Agent(Fix round)</Text>
  })

  await $.session.start({ cwd: '/', surface: 'mobile', isInteractive: true })
  await $.agent.spawn({ tool_use_id: 'tu1', prompt: 'p', description: 'Fix round', subagentType: 'general-purpose', background: true } as never)

  for (const surface of ['desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({
      plugin: 'agent-disco', component: 'ToolUse', surface,
      props: { tool_use_id: 'tu1', tool: 'Agent', input: {}, isRunning: false, isErrored: false, isInterrupted: false },
    } as never)
    expect((await ui.find({ type: 'Text', text: /Agent\(Fix round\)/ }))?.text).toBe('Agent(Fix round)')
    expect((await ui.find({ type: 'Text', text: /%/ }))?.text).toMatch(/~\d+% · 0 tools/)
    await ui.unmount()
  }
})

test('an agent with a todo list shows the share of it done', async ($, on) => {
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('agent.spawn', () => ({ model: 'm', agentId: 'a2' }))
  on('tool.call', () => ({ result: {} }))
  on('clock.now', () => ({ value: 1_000 }))
  on('clock.every', () => ({ value: {} }))
  on('agent.list', () => ({ value: [] }))
  on('store.get', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.agent.spawn({ prompt: 'p', description: 'Four step job', subagentType: 'general-purpose', background: true })
  await $.tool.call({ tool: 'TodoWrite', agentId: 'a2', todos: [
    { content: 'a', status: 'completed', activeForm: 'a' },
    { content: 'b', status: 'completed', activeForm: 'b' },
    { content: 'c', status: 'in_progress', activeForm: 'c' },
    { content: 'd', status: 'pending', activeForm: 'd' },
  ] } as never)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /%/ }))?.text).toMatch(/~5[78]%/)
  expect((await ui.find({ type: 'Text', text: /todos/ }))?.text).toContain('2/4 todos')
  await ui.unmount()
})
