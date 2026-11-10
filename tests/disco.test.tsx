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

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.agent.spawn({ prompt: 'p', description: 'Write the tests', subagentType: 'general-purpose', background: true })

  const band = { plugin: 'agent-disco', component: 'AbovePrompt', props: { hasSurvey: false } } as const

  await $.tool.call({ tool: 'SendMessage', to: 'a1', message: 'hi' })
  let ui = await $.ui.mount({ ...band, surface: 'desktop' } as never)
  expect((await ui.find({ type: 'Text', text: /☞/ }))?.text).toContain('☞')
  expect((await ui.find({ type: 'Text', text: /on “Write the tests”/ }))?.text).toContain('SendMessage')
  await ui.unmount()

  await $.tool.call({ tool: 'Bash', command: 'ls' })
  ui = await $.ui.mount({ ...band, surface: 'desktop' } as never)
  expect((await ui.find({ type: 'Text', text: /off to the side/ }))?.text).toContain('something new')
  await ui.unmount()
})

test('where no pane is placed, /agent-disco draws the floor inline and shows agents already running', async ($, on) => {
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'no surface places panes' } }))
  on('ui.place', () => ({ value: { isPlaced: true, requestId: 'r1' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: 1_000 }))
  on('clock.every', () => ({ value: {} }))
  on('agent.list', () => ({ value: [{ id: 'old1', description: 'Phase 4 review', type: 'general-purpose', status: 'running' }] }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const out = await $.command.run({ command: 'agent-disco', args: '' } as never)
  expect(JSON.stringify(out)).toContain('drawn right here in the chat')

  const ui = await $.ui.mount({ plugin: 'agent-disco', component: 'Placed', surface: 'desktop', props: { id: 'agent-disco-floor', plugin: 'agent-disco' } } as never)
  expect((await ui.find({ type: 'Text', text: /Phase 4 review/ }))?.text).toContain('Phase 4 review')
  await ui.unmount()
})
