// prisma/seed.ts
// Run: npx prisma db seed
// Loads all Eco-Insight demo data into the database.

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// ── Relative date helpers (seed data stays fresh regardless of run date) ──
const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 864e5);
const daysFromNow = (n: number) => new Date(now.getTime() + n * 864e5);
const hoursAgo = (n: number) => new Date(now.getTime() - n * 36e5);

async function main() {
  console.log('🌱 Seeding Eco-Insight Revenue OS...');

  // ── Clean slate ────────────────────────────────
  await prisma.taskComment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.goal.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.queueItem.deleteMany();
  await prisma.inboxEmail.deleteMany();
  await prisma.meeting.deleteMany();
  await prisma.opportunity.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.signal.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
  await prisma.agentConfig.deleteMany();
  await prisma.tenant.deleteMany();

  // ── Tenant ──────────────────────────────────────
  const tenant = await prisma.tenant.create({
    data: {
      id: 'tenant-default',
      name: 'Eco-Insight',
      slug: 'eco-insight',
      plan: 'free',
    },
  });
  console.log('  ✓ 1 tenant');

  // ── Users ──────────────────────────────────────
  const u1 = await prisma.user.create({ data: { id: 'u1', name: 'Juuso Kari', initials: 'JK', email: 'juuso@eco-insight.com', role: 'ADMIN', color: 'green', tenantId: 'tenant-default' } });
  const u2 = await prisma.user.create({ data: { id: 'u2', name: 'Laura Puranen', initials: 'LP', email: 'laura@eco-insight.com', role: 'ADMIN', color: 'default', tenantId: 'tenant-default' } });
  const u3 = await prisma.user.create({ data: { id: 'u3', name: 'Nick Schoch', initials: 'NS', email: 'nick@eco-insight.com', role: 'MEMBER', color: 'blue', tenantId: 'tenant-default' } });
  console.log('  ✓ 3 users');

  // ── Signals ────────────────────────────────────
  await prisma.signal.createMany({ data: [
    { id: 's1', type: 'ppa_announcement', title: 'Ørsted signs 15-year corporate PPA with BASF for 186 MW offshore wind', summary: 'BASF will receive GoOs as part of the agreement. Both parties likely need certificate management tooling.', reasoning: 'Direct GoO involvement in PPA structure. BASF is an industrial buyer with likely manual cert processes.', source: 'Reuters Energy', sourceUrl: 'https://reuters.com/energy/orsted-basf-ppa', relevance: 92, confidence: 0.85, status: 'new_signal', detectedAt: daysAgo(1), companies: ['BASF SE', 'Ørsted'] },
    { id: 's2', type: 'renewable_target', title: 'Iberdrola raises 2030 renewable target to 100 GW globally', summary: 'Expanded target implies massive certificate volume increase across EECS and I-REC schemes.', reasoning: 'Scale of target creates significant certificate management burden across multiple schemes.', source: 'Bloomberg Green', sourceUrl: 'https://bloomberg.com/iberdrola-target', relevance: 85, confidence: 0.85, status: 'new_signal', detectedAt: daysAgo(2), companies: ['Iberdrola'] },
    { id: 's3', type: 'job_posting', title: 'Uniper hiring "GoO Trading Analyst" — Düsseldorf', summary: 'New GoO-specific hire suggests scaling certificate trading operations.', reasoning: 'GoO-specific role suggests growing operations. New hires often trigger tool evaluation.', source: 'LinkedIn Jobs', sourceUrl: 'https://linkedin.com/jobs/uniper-goo', relevance: 78, confidence: 0.65, status: 'new_signal', detectedAt: daysAgo(2), companies: ['Uniper SE'] },
    { id: 's4', type: 'market_entry', title: 'TotalEnergies launches GoO desk for Scandinavian market', summary: 'New market entry into Nordics GoO trading. Will need registry connectivity and trading tools from day one.', reasoning: 'Greenfield GoO desk in our core market. High urgency, no incumbent tooling.', source: 'Montel News', sourceUrl: 'https://montelnews.com/total-goo', relevance: 88, confidence: 0.85, status: 'new_signal', detectedAt: daysAgo(3), companies: ['TotalEnergies'] },
    { id: 's5', type: 'conference', title: 'Nordic Energy Certificates Summit — Oslo, May 12-13', summary: 'Key conference for GoO/ELcert market. Speaking opportunity detected.', reasoning: 'Networking and lead generation opportunity.', source: 'Event Detection', relevance: 72, confidence: 0.65, status: 'reviewed', detectedAt: daysAgo(4), companies: [] },
    { id: 's6', type: 'registry_pain', title: 'AIB registry downtime causes GoO settlement delays across 12 markets', summary: 'Multi-market settlement failure highlights fragility of manual registry workflows.', reasoning: 'Acute pain event affecting many target accounts. Creates urgency for automation.', source: 'AIB Alert', sourceUrl: 'https://aib-net.org/alerts', relevance: 90, confidence: 0.85, status: 'new_signal', detectedAt: daysAgo(5), companies: [] },
  ]});
  console.log('  ✓ 6 signals');

  // ── Accounts ───────────────────────────────────
  const accounts = [
    { id: 'a1', name: 'Vattenfall Nordic AB', type: 'Utility' as const, country: 'Sweden', countryCode: 'SE', region: 'Nordics', status: 'Active' as const, schemes: ['GoO', 'ELcert'], scoreFit: 92, scoreIntent: 70, scoreUrgency: 82, scoreAccess: 75, scoreCommercial: 88, ownerId: 'u1', pipelineValue: 380000, lastActivityAt: daysAgo(23), pain: 'Manual GoO reconciliation consuming 3+ FTE. Grexel + Excel workflows cannot scale.', whyNow: 'Budget cycle Q2. Champion Lars actively evaluating. Procurement needs 3 vendor quotes.', moduleFit: ['GoO Issuance', 'GoO Trading', 'Reporting'], competitors: 'Grexel (incumbent), CMO (shortlisted), Bloomberg TOMS (considered)', aiConfidence: 0.85 },
    { id: 'a2', name: 'Fortum Power and Heat', type: 'Utility' as const, country: 'Finland', countryCode: 'FI', region: 'Nordics', status: 'Active' as const, schemes: ['GoO', 'I-REC'], scoreFit: 85, scoreIntent: 55, scoreUrgency: 75, scoreAccess: 60, scoreCommercial: 70, ownerId: 'u2', pipelineValue: 145000, lastActivityAt: daysAgo(5), pain: 'Manual I-REC and GoO issuance via Fingrid. 2-person team spending 3 days/month on reconciliation.', whyNow: 'CFO budget cycle in Q2. Anna driving but needs executive sponsor.', moduleFit: ['I-REC Registry', 'GoO Issuance'], aiConfidence: 0.65 },
    { id: 'a3', name: 'E.ON Energy Markets', type: 'Retailer' as const, country: 'Germany', countryCode: 'DE', region: 'DACH', status: 'Active' as const, schemes: ['GoO', 'REGO'], scoreFit: 88, scoreIntent: 82, scoreUrgency: 88, scoreAccess: 70, scoreCommercial: 92, ownerId: 'u1', pipelineValue: 460000, lastActivityAt: daysAgo(6), pain: 'SAP + Excel cert management for B2C green tariffs. Evaluating 3 vendors.', whyNow: 'Active vendor evaluation. Kai is champion but IT team needs API validation.', moduleFit: ['GoO Procurement', 'Reporting', 'ERP Integration'], aiConfidence: 0.85 },
    { id: 'a4', name: 'Statkraft Markets', type: 'Trader' as const, country: 'Norway', countryCode: 'NO', region: 'Nordics', status: 'Active' as const, schemes: ['GoO', 'ELcert'], scoreFit: 90, scoreIntent: 60, scoreUrgency: 70, scoreAccess: 55, scoreCommercial: 85, ownerId: 'u1', pipelineValue: 290000, lastActivityAt: daysAgo(7), pain: 'Bloomberg TOMS + proprietary cert tracking (5 years old). 4 FTE on manual GoO work.', whyNow: 'Referral via Axpo. Pilot concept resonated with Torben.', moduleFit: ['GoO Trading', 'GoO Issuance', 'API Integration'], aiConfidence: 0.65 },
    { id: 'a5', name: 'Axpo Nordic AS', type: 'Trader' as const, country: 'Norway', countryCode: 'NO', region: 'Nordics', status: 'Partner' as const, schemes: ['GoO', 'ELcert', 'REGO'], scoreFit: 95, scoreIntent: 40, scoreUrgency: 55, scoreAccess: 92, scoreCommercial: 80, ownerId: 'u1', pipelineValue: 95000, lastActivityAt: daysAgo(4), pain: 'Live customer. Expanding to ELcert module.', whyNow: 'QBR March 28. Expansion pricing negotiation active.', moduleFit: ['ELcert Module', 'API Integration'], aiConfidence: 0.85 },
    { id: 'a6', name: 'RWE Renewables Europe', type: 'Utility' as const, country: 'Germany', countryCode: 'DE', region: 'DACH', status: 'Prospect' as const, schemes: ['GoO'], scoreFit: 82, scoreIntent: 40, scoreUrgency: 45, scoreAccess: 30, scoreCommercial: 90, ownerId: 'u2', pipelineValue: 320000, lastActivityAt: daysAgo(9), pain: '50 GW renewable capacity. Unknown current tooling.', whyNow: 'Discovery call March 20. Maria connected via LinkedIn.', moduleFit: ['GoO Issuance', 'Reporting'], aiConfidence: 0.35 },
  ];
  for (const a of accounts) {
    await prisma.account.create({ data: a });
  }
  console.log('  ✓ 6 accounts');

  // ── Contacts ───────────────────────────────────
  await prisma.contact.createMany({ data: [
    { id: 'c1', name: 'Lars Eriksson', title: 'Head of GoO Desk', role: 'Champion', warmth: 'Warm', email: 'lars.eriksson@vattenfall.com', phone: '+46 8 739 5000', accountId: 'a1' },
    { id: 'c2', name: 'Helena Strand', title: 'VP Energy Markets', role: 'EconomicBuyer', warmth: 'Cold', email: 'helena.strand@vattenfall.com', accountId: 'a1' },
    { id: 'c3', name: 'Anna Bergström', title: 'Certificate Operations Manager', role: 'Champion', warmth: 'Warm', email: 'anna.bergstrom@fortum.com', accountId: 'a2' },
    { id: 'c4', name: 'Annika Virtanen', title: 'CFO — Energy Products', role: 'EconomicBuyer', warmth: 'Cold', email: 'annika.virtanen@fortum.com', accountId: 'a2' },
    { id: 'c5', name: 'Kai Mueller', title: 'Head of Energy Markets', role: 'Champion', warmth: 'Warm', email: 'kai.mueller@eon.com', accountId: 'a3' },
    { id: 'c6', name: 'Thomas Weber', title: 'IT Director', role: 'TechnicalBuyer', warmth: 'Cold', email: 'thomas.weber@eon.com', accountId: 'a3' },
    { id: 'c7', name: 'Torben Rasmussen', title: 'VP Renewable Trading', role: 'EconomicBuyer', warmth: 'Cold', email: 'torben.rasmussen@statkraft.com', accountId: 'a4' },
    { id: 'c8', name: 'Erik Sandvik', title: 'Head of Certificate Trading', role: 'Champion', warmth: 'Strong', email: 'erik.sandvik@axpo.com', accountId: 'a5' },
    { id: 'c9', name: 'Maria Hoffmann', title: 'Head of Certificates', role: 'Champion', warmth: 'Cold', email: 'maria.hoffmann@rwe.com', accountId: 'a6' },
  ]});
  console.log('  ✓ 9 contacts');

  // ── Leads ──────────────────────────────────────
  await prisma.lead.createMany({ data: [
    { id: 'l1', company: 'BASF SE', domain: 'basf.com', source: 'Signal', signalId: 's1', type: 'Industrial', country: 'Germany', region: 'DACH', stage: 'New', pain: 'Likely manual GoO tracking for PPA volumes.', moduleFit: ['GoO Procurement', 'Reporting'], scoreFit: 72, scoreIntent: 65, scoreUrgency: 75, scoreAccess: 30, scoreCommercial: 80, confidence: 0.65, ownerId: 'u1' },
    { id: 'l2', company: 'Uniper SE', domain: 'uniper.com', source: 'Signal', signalId: 's3', type: 'Utility', country: 'Germany', region: 'DACH', stage: 'Researching', pain: 'Expanding GoO trading desk. Likely outgrowing manual tools.', moduleFit: ['GoO Trading', 'GoO Issuance'], scoreFit: 80, scoreIntent: 60, scoreUrgency: 70, scoreAccess: 35, scoreCommercial: 75, confidence: 0.65, ownerId: 'u1' },
    { id: 'l3', company: 'TotalEnergies Trading', domain: 'totalenergies.com', source: 'Signal', signalId: 's4', type: 'Trader', country: 'France', region: 'Western Europe', stage: 'Qualified', pain: 'New GoO desk for Nordics — greenfield. Needs full stack.', moduleFit: ['GoO Trading', 'GoO Issuance', 'Reporting', 'API Integration'], scoreFit: 90, scoreIntent: 85, scoreUrgency: 88, scoreAccess: 45, scoreCommercial: 85, confidence: 0.85, ownerId: 'u2' },
    { id: 'l4', company: 'Enel Green Power', domain: 'enelgreenpower.com', source: 'Conference', type: 'Utility', country: 'Italy', region: 'Southern Europe', stage: 'New', pain: '60 GW renewable capacity globally. Scale problem.', moduleFit: ['GoO Issuance', 'Reporting'], scoreFit: 65, scoreIntent: 35, scoreUrgency: 55, scoreAccess: 25, scoreCommercial: 90, confidence: 0.35, ownerId: 'u3' },
  ]});
  console.log('  ✓ 4 leads');

  // ── Opportunities ──────────────────────────────
  await prisma.opportunity.createMany({ data: [
    { id: 'o1', name: 'Vattenfall GoO Platform', stage: 'Proposal', amount: 380000, probability: 65, closeDate: daysFromNow(108), healthEngagement: 40, healthStakeholders: 75, healthCompetitive: 60, healthTimeline: 50, nextAction: 'Follow up on revised GoO volume proposal', nextActionDate: daysFromNow(1), accountId: 'a1', ownerId: 'u1' },
    { id: 'o2', name: 'E.ON Germany GoO Procurement', stage: 'SolutionFit', amount: 460000, probability: 50, closeDate: daysFromNow(78), healthEngagement: 65, healthStakeholders: 55, healthCompetitive: 40, healthTimeline: 60, nextAction: 'Follow up with Kai on API feasibility', nextActionDate: daysFromNow(0), accountId: 'a3', ownerId: 'u1' },
    { id: 'o3', name: 'Statkraft GoO Trading Pilot', stage: 'Qualified', amount: 290000, probability: 35, closeDate: daysFromNow(139), healthEngagement: 30, healthStakeholders: 35, healthCompetitive: 70, healthTimeline: 80, nextAction: 'Prepare pilot scope via Erik Sandvik referral', nextActionDate: daysFromNow(4), accountId: 'a4', ownerId: 'u1' },
    { id: 'o4', name: 'Fortum I-REC Pilot', stage: 'Discovery', amount: 145000, probability: 20, closeDate: daysFromNow(200), healthEngagement: 55, healthStakeholders: 40, healthCompetitive: 80, healthTimeline: 70, nextAction: 'Send platform overview ahead of call', nextActionDate: daysAgo(2), accountId: 'a2', ownerId: 'u2' },
    { id: 'o5', name: 'E.ON UK REGO Module', stage: 'Proposal', amount: 185000, probability: 65, closeDate: daysFromNow(47), healthEngagement: 80, healthStakeholders: 70, healthCompetitive: 65, healthTimeline: 75, nextAction: 'Proposal review call with Sarah Hughes', nextActionDate: daysFromNow(11), accountId: 'a3', ownerId: 'u2' },
    { id: 'o6', name: 'Axpo ELcert Expansion', stage: 'Negotiation', amount: 95000, probability: 80, closeDate: daysFromNow(17), healthEngagement: 90, healthStakeholders: 85, healthCompetitive: 95, healthTimeline: 60, nextAction: 'Send revised pricing — 8.5% discount', nextActionDate: daysFromNow(6), accountId: 'a5', ownerId: 'u1' },
    { id: 'o7', name: 'RWE GoO Issuance', stage: 'Contacted', amount: 320000, probability: 10, closeDate: daysFromNow(292), healthEngagement: 20, healthStakeholders: 25, healthCompetitive: 80, healthTimeline: 90, nextAction: 'Discovery call March 20', nextActionDate: daysFromNow(6), accountId: 'a6', ownerId: 'u2' },
  ]});
  console.log('  ✓ 7 opportunities');

  // ── Goals ──────────────────────────────────────
  await prisma.goal.createMany({ data: [
    { id: 'g1', title: 'Close Vattenfall GoO Platform', accountId: 'a1', ownerId: 'u1' },
    { id: 'g2', title: 'Launch Statkraft Pilot', accountId: 'a4', ownerId: 'u1' },
    { id: 'g3', title: 'Expand Axpo ELcert', accountId: 'a5', ownerId: 'u1' },
  ]});
  console.log('  ✓ 3 goals');

  // ── Tasks ──────────────────────────────────────
  // Tasks need individual creates for many-to-many assignees
  const taskData = [
    { id: 't1', title: 'Follow up Vattenfall — GoO proposal response', status: 'Open' as const, priority: 'High' as const, due: daysAgo(4), source: 'Pipeline Hygiene Agent', accountId: 'a1', ownerId: 'u1', goalId: 'g1', assigneeIds: ['u1'] },
    { id: 't2', title: 'Prepare Statkraft pilot scope document', status: 'InProgress' as const, priority: 'High' as const, due: daysFromNow(4), source: 'Meeting Notes', accountId: 'a4', ownerId: 'u1', goalId: 'g2', reviewerId: 'u2', assigneeIds: ['u1', 'u3'] },
    { id: 't3', title: 'Send Fortum platform overview', status: 'Open' as const, priority: 'High' as const, due: daysAgo(2), source: 'Manual', accountId: 'a2', ownerId: 'u2', assigneeIds: ['u2'] },
    { id: 't4', title: 'Follow up Kai Mueller — API feasibility', status: 'Open' as const, priority: 'High' as const, due: daysAgo(6), source: 'AI Suggested', accountId: 'a3', ownerId: 'u1', assigneeIds: ['u1'] },
    { id: 't5', title: 'Send Axpo revised pricing — ELcert', status: 'Open' as const, priority: 'Medium' as const, due: daysFromNow(6), source: 'Manual', accountId: 'a5', ownerId: 'u1', goalId: 'g3', assigneeIds: ['u1'] },
    { id: 't6', title: 'Review 3 new signals', status: 'Open' as const, priority: 'Medium' as const, due: daysAgo(3), source: 'Signal Hunter Agent', ownerId: 'u1', assigneeIds: ['u1', 'u2'] },
  ];
  for (const t of taskData) {
    const { assigneeIds, ...rest } = t;
    await prisma.task.create({
      data: { ...rest, assignees: { connect: assigneeIds.map(id => ({ id })) } },
    });
  }
  console.log('  ✓ 6 tasks');

  // ── Task Comments ──────────────────────────────
  await prisma.taskComment.createMany({ data: [
    { text: 'Lars was responsive last week — try calling directly', taskId: 't1', authorId: 'u2', createdAt: daysAgo(5) },
    { text: '@Juuso — Kai mentioned SSO concern in last call. Address in follow-up.', mentions: ['u1'], taskId: 't4', authorId: 'u3', createdAt: daysAgo(6) },
  ]});
  console.log('  ✓ 2 task comments');

  // ── Activities ─────────────────────────────────
  await prisma.activity.createMany({ data: [
    { type: 'Email', summary: 'ELcert module pricing — revised offer sent', detail: "Sent 8.5% multi-module discount proposal. Awaiting Erik's sign-off.", source: 'Outlook Sync', accountId: 'a5', authorId: 'u1', createdAt: daysAgo(4) },
    { type: 'Meeting', summary: 'Discovery call — Fortum I-REC registry needs', detail: 'Anna confirmed interest. Key concern: CFO approval needed.', source: 'Calendar Sync', accountId: 'a2', authorId: 'u2', createdAt: daysAgo(5) },
    { type: 'Email', summary: 'API integration feasibility — follow-up sent', detail: 'Sent SAP connector documentation. Awaiting IT team review.', source: 'Outlook Sync', accountId: 'a3', authorId: 'u1', createdAt: daysAgo(6) },
    { type: 'Meeting', summary: 'Intro call via Erik Sandvik referral', detail: 'Good intro. Torben aware of Eco-Insight via Axpo. Pilot concept resonated.', source: 'Calendar Sync', accountId: 'a4', authorId: 'u1', createdAt: daysAgo(7) },
    { type: 'Email', summary: 'Commercial proposal sent — E.ON Germany', detail: 'Full proposal submitted. €460K ARR, 3-year term.', source: 'Outlook Sync', accountId: 'a3', authorId: 'u1', createdAt: daysAgo(14) },
    { type: 'Note', summary: 'Revised GoO volume proposal sent', detail: 'Updated commercial terms with volume thresholds. No response yet.', source: 'Manual', accountId: 'a1', authorId: 'u1', createdAt: daysAgo(23) },
  ]});
  console.log('  ✓ 6 activities');

  // ── Queue Items ────────────────────────────────
  await prisma.queueItem.createMany({ data: [
    { id: 'q1', type: 'outreach_draft', title: 'Cold outreach to BASF SE — GoO Procurement', accName: 'BASF SE', agent: 'Outreach Drafter', confidence: 0.82, confidenceBreakdown: { relevance: 0.92, personalization: 0.74, timing: 0.81 }, reasoning: 'BASF appeared in PPA signal with Ørsted. Industrial buyer profile matches ICP.', sources: [{ name: 'Reuters Energy', url: 'https://reuters.com/energy/orsted-basf-ppa' }, { name: 'LinkedIn', url: 'https://linkedin.com/in/basf-energy' }], payload: { to: 'Michael Braun <m.braun@basf.com>', subject: 'Eco-Insight — GoO certificate management for BASF', body: 'Hi Michael,\n\nI noticed BASF recently signed a 186 MW offshore wind PPA with Ørsted...' }, priority: 'Normal', createdAt: daysAgo(1) },
    { id: 'q2', type: 'lead_qualification', title: 'Qualify Uniper SE as GoO Trading lead', accName: 'Uniper SE', agent: 'Lead Qualifier', confidence: 0.71, confidenceBreakdown: { icp_fit: 0.80, intent: 0.65, entity_match: 0.68 }, reasoning: 'Uniper hiring GoO Trading Analyst. Signal confidence is medium.', sources: [{ name: 'LinkedIn Jobs', url: 'https://linkedin.com/jobs/uniper-goo' }], payload: { company: 'Uniper SE', type: 'Utility', country: 'Germany', stage: 'Researching', scores: { f: 80, i: 60, u: 70, a: 35, c: 75 }, pain: 'Expanding GoO trading desk' }, priority: 'Normal', createdAt: daysAgo(2) },
    { id: 'q3', type: 'enrichment', title: 'Update Vattenfall brief — procurement timeline intel', accName: 'Vattenfall Nordic AB', accId: 'a1', agent: 'Account Enricher', confidence: 0.76, confidenceBreakdown: { source_quality: 0.85, relevance: 0.72, freshness: 0.70 }, reasoning: 'LinkedIn post from Lars Eriksson mentions "evaluating 3 vendors for GoO platform".', sources: [{ name: 'LinkedIn Post', url: 'https://linkedin.com/posts/lars-eriksson' }], payload: { field: 'whyNow', before: 'Budget cycle Q2. Champion Lars actively evaluating.', after: 'Budget cycle Q2. Lars confirmed evaluating 3 vendors (LinkedIn post Mar 8). Procurement process active.' }, priority: 'High', createdAt: daysAgo(2) },
    { id: 'q4', type: 'task_creation', title: 'Schedule follow-up with Torben (Statkraft) via Erik', accName: 'Statkraft Markets', accId: 'a4', agent: 'Pipeline Hygiene', confidence: 0.68, confidenceBreakdown: { engagement_decay: 0.90, relationship_path: 0.55, priority: 0.60 }, reasoning: 'No response from Torben in 4 days since intro call.', sources: [{ name: 'Activity Log', url: null }, { name: 'Contact Graph', url: null }], payload: { task: 'Ask Erik Sandvik to nudge Torben Rasmussen re: pilot discussion', due: '2026-03-14', pri: 'High' }, priority: 'Normal', createdAt: daysAgo(1) },
    { id: 'q5', type: 'outreach_draft', title: 'Sequence Step 2 — Enel Green Power follow-up', accName: 'Enel Green Power', agent: 'Outreach Drafter', confidence: 0.55, confidenceBreakdown: { relevance: 0.70, personalization: 0.42, timing: 0.52 }, reasoning: 'Low confidence: no response to initial outreach. Contact role unverified.', sources: [{ name: 'Sequence: Cold Outreach — GoO Pain', url: null }], payload: { to: 'Energy Certs Team <certs@enelgreenpower.com>', subject: 'Following up — GoO issuance at scale', body: 'Hi there,\n\nI reached out last week about Eco-Insight\'s GoO issuance platform...' }, priority: 'Low', createdAt: daysAgo(1) },
  ]});
  console.log('  ✓ 5 queue items');

  // ── Inbox Emails ───────────────────────────────
  await prisma.inboxEmail.createMany({ data: [
    { subject: 'Re: ELcert Module Pricing', fromEmail: 'erik.sandvik@axpo.com', fromName: 'Erik Sandvik', preview: "Thanks for the revised offer. 8.5% works for us. Let's finalize in the QBR.", receivedAt: hoursAgo(2), isUnread: true, classification: 'positive_reply', classificationConf: 0.95, isLinked: true, accountId: 'a5', accountName: 'Axpo Nordic AS' },
    { subject: 'RE: SAP Integration — E.ON', fromEmail: 'kai.mueller@eon.com', fromName: 'Kai Mueller', preview: 'IT team has follow-up questions on REST endpoints. Can you send API docs?', receivedAt: hoursAgo(6), isUnread: true, classification: 'question', classificationConf: 0.91, isLinked: true, accountId: 'a3', accountName: 'E.ON Energy Markets' },
    { subject: 'Eco-Insight Interest', fromEmail: 'maria.hoffmann@rwe.com', fromName: 'Maria Hoffmann', preview: "We'd like to learn about GoO issuance capabilities for our European portfolio.", receivedAt: daysAgo(2), isUnread: false, classification: 'positive_reply', classificationConf: 0.88, isLinked: false, domain: 'rwe.com', accountName: 'RWE Renewables Europe', accountId: 'a6' },
    { subject: 'Out of Office: Johan Lindgren', fromEmail: 'johan.lindgren@vattenfall.com', fromName: 'Johan Lindgren', preview: 'I am out of office until March 17. For urgent matters contact Lars Eriksson.', receivedAt: daysAgo(1), isUnread: false, classification: 'auto_reply', classificationConf: 0.99, isLinked: true, accountId: 'a1', accountName: 'Vattenfall Nordic AB' },
    { subject: 'Speaker Invitation — Nordic Energy Summit', fromEmail: 'events@nordicenergy.org', fromName: 'Nordic Energy Events', preview: "We'd like to invite Eco-Insight to speak at our May summit.", receivedAt: daysAgo(3), isUnread: false, classification: 'meeting_request', classificationConf: 0.82, isLinked: false },
    { subject: 'Partnership Inquiry — Green Certificate Platform', fromEmail: 'contact@certiverde.io', fromName: 'CertiVerde', preview: 'We are a new GoO marketplace and would love to discuss API integration.', receivedAt: daysAgo(4), isUnread: false, classification: 'new_domain', classificationConf: 0.75, isLinked: false, domain: 'certiverde.io' },
  ]});
  console.log('  ✓ 6 inbox emails');

  // ── Meetings ───────────────────────────────────
  await prisma.meeting.createMany({ data: [
    { title: 'E.ON API Integration Review', startTime: daysFromNow(0), duration: 60, date: daysFromNow(0), attendees: ['Kai Mueller', 'Thomas Weber'], attendeeEmails: ['kai.mueller@eon.com', 'thomas.weber@eon.com'], prepStatus: 'ready', accountId: 'a3', accountName: 'E.ON Energy Markets' },
    { title: 'RWE Discovery Call', startTime: daysFromNow(6), duration: 30, date: daysFromNow(6), attendees: ['Maria Hoffmann'], attendeeEmails: ['maria.hoffmann@rwe.com'], prepStatus: 'draft', accountId: 'a6', accountName: 'RWE Renewables Europe' },
    { title: 'Axpo QBR — Q1 Review', startTime: daysFromNow(14), duration: 90, date: daysFromNow(14), attendees: ['Erik Sandvik', 'Nick Schoch'], attendeeEmails: ['erik.sandvik@axpo.com', 'nick.schoch@axpo.com'], prepStatus: 'ready', accountId: 'a5', accountName: 'Axpo Nordic AS' },
  ]});
  console.log('  ✓ 3 meetings');

  // ── Agent Configs ─────────────────────────────
  await prisma.agentConfig.createMany({ data: [
    { name: 'lead_qualifier', displayName: 'Lead Qualifier', description: 'Scores and qualifies inbound leads using FIUAC criteria, company research, and signal correlation.', status: 'active', parameters: {} },
    { name: 'signal_hunter', displayName: 'Signal Hunter', description: 'Monitors news, job postings, and market events to detect buying signals for target accounts.', status: 'active', parameters: {} },
    { name: 'pipeline_hygiene', displayName: 'Pipeline Hygiene', description: 'Analyzes deal health, detects stalled opportunities, and suggests next actions to keep pipeline moving.', status: 'active', parameters: {} },
    { name: 'meeting_prep', displayName: 'Meeting Prep', description: 'Generates pre-meeting briefs with account context, stakeholder insights, and suggested talking points.', status: 'active', parameters: {} },
    { name: 'relationship_monitor', displayName: 'Relationship Monitor', description: 'Tracks engagement levels across accounts and contacts, alerting when relationships cool or warm.', status: 'active', parameters: {} },
    { name: 'data_enrichment', displayName: 'Data Enrichment', description: 'Enriches account and contact records with firmographic data, tech stack info, and public financial data.', status: 'active', parameters: {} },
  ]});
  console.log('  ✓ 6 agent configs');

  console.log('\n✅ Seed complete: 3 users, 6 signals, 4 leads, 6 accounts, 9 contacts, 7 opps, 3 goals, 6 tasks, 6 activities, 5 queue items, 6 emails, 3 meetings, 6 agent configs');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
