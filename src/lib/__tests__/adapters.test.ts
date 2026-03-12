import { describe, it, expect } from 'vitest';
import {
  mapOppStage,
  mapContactRole,
  mapTaskStatus,
  adaptFIUAC,
  adaptHealth,
} from '@/lib/adapters';

describe('mapOppStage', () => {
  it('maps SolutionFit to "Solution Fit"', () => {
    expect(mapOppStage('SolutionFit')).toBe('Solution Fit');
  });

  it('maps ClosedWon to "Closed Won"', () => {
    expect(mapOppStage('ClosedWon')).toBe('Closed Won');
  });

  it('passes through unmapped values like Discovery', () => {
    expect(mapOppStage('Discovery')).toBe('Discovery');
  });
});

describe('mapContactRole', () => {
  it('maps EconomicBuyer to "Economic Buyer"', () => {
    expect(mapContactRole('EconomicBuyer')).toBe('Economic Buyer');
  });

  it('passes through unmapped values like Champion', () => {
    expect(mapContactRole('Champion')).toBe('Champion');
  });
});

describe('mapTaskStatus', () => {
  it('maps InProgress to "In Progress"', () => {
    expect(mapTaskStatus('InProgress')).toBe('In Progress');
  });

  it('passes through unmapped values like Open', () => {
    expect(mapTaskStatus('Open')).toBe('Open');
  });
});

describe('adaptFIUAC', () => {
  it('maps score fields to abbreviated keys', () => {
    const row = {
      scoreFit: 80,
      scoreIntent: 65,
      scoreUrgency: 90,
      scoreAccess: 50,
      scoreCommercial: 75,
    };
    expect(adaptFIUAC(row)).toEqual({
      f: 80,
      i: 65,
      u: 90,
      a: 50,
      c: 75,
    });
  });
});

describe('adaptHealth', () => {
  it('maps health fields to abbreviated keys', () => {
    const row = {
      healthEngagement: 7,
      healthStakeholders: 5,
      healthCompetitive: 8,
      healthTimeline: 6,
    };
    expect(adaptHealth(row)).toEqual({
      eng: 7,
      stake: 5,
      comp: 8,
      time: 6,
    });
  });
});
