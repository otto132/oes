import { registerAgent } from './registry';
import { pipelineHygieneAgent } from './pipeline-hygiene';
import { inboxClassifierAgent } from './inbox-classifier';
import { leadQualifierAgent } from './lead-qualifier';
import { signalHunterAgent } from './signal-hunter';
import { accountEnricherAgent } from './account-enricher';
import { outreachDrafterAgent } from './outreach-drafter';
import { meetingAnalystAgent } from './meeting-analyst';
import { weeklyDigestAgent } from './weekly-digest';

// Register all agents on import
const agents = [
  pipelineHygieneAgent,
  inboxClassifierAgent,
  leadQualifierAgent,
  signalHunterAgent,
  accountEnricherAgent,
  outreachDrafterAgent,
  meetingAnalystAgent,
  weeklyDigestAgent,
];

for (const agent of agents) {
  registerAgent(agent);
}

export { agents };
export { getAgent, getAllAgents, getAgentsByTrigger } from './registry';
export { runAgent, runDueAgents } from './runner';
export { emitEvent } from './events';
export { handleApproval } from './chain';
export { analyzeWinLoss } from './win-loss';
