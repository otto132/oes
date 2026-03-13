import type { Agent, AgentTrigger } from './types';

const registry = new Map<string, Agent>();

export function registerAgent(agent: Agent): void {
  if (registry.has(agent.name)) {
    throw new Error(`Agent "${agent.name}" is already registered`);
  }
  registry.set(agent.name, agent);
}

export function getAgent(name: string): Agent | undefined {
  return registry.get(name);
}

export function getAllAgents(): Agent[] {
  return Array.from(registry.values());
}

export function getAgentsByTrigger(
  triggerType: AgentTrigger['type'],
  match?: string
): Agent[] {
  return getAllAgents().filter((agent) =>
    agent.triggers.some((t) => {
      if (t.type !== triggerType) return false;
      if (triggerType === 'cron') return true;
      if (triggerType === 'event' && t.type === 'event') {
        return match ? t.event === match : true;
      }
      if (triggerType === 'chain' && t.type === 'chain') {
        return match ? t.afterApproval === match : true;
      }
      return false;
    })
  );
}

export function clearRegistry(): void {
  registry.clear();
}
