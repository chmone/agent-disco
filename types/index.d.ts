export type AgentRow = {
  id: string
  toolUseId: string
  label: string
  type: string
  background: boolean
  status: 'running' | 'done' | 'failed'
  steps: number
  tools: number
  lastTool: string
  startedAt: number
  endedAt: number
}

export type ParentFocus = {
  mode: 'idle' | 'pointing' | 'side'
  target: string
  why: string
}

declare module 'claude-code' {
  interface PluginState {
    'agent-disco': {
      agents: Shaped<AgentRow[]>
      frame: number
      focus: Shaped<ParentFocus>
    }
  }
}
