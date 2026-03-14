import { describe, it, expect } from 'vitest';
import { patchTaskSchema } from '../tasks';

describe('patchTaskSchema — subtasks', () => {
  it('accepts valid subtasks array', () => {
    const result = patchTaskSchema.safeParse({
      subtasks: [
        { title: 'Do thing', done: false, position: 0 },
        { id: 'existing-1', title: 'Done thing', done: true, position: 1 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects subtask with empty title', () => {
    const result = patchTaskSchema.safeParse({
      subtasks: [{ title: '', done: false, position: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 20 subtasks', () => {
    const subtasks = Array.from({ length: 21 }, (_, i) => ({
      title: `Task ${i}`, done: false, position: i,
    }));
    const result = patchTaskSchema.safeParse({ subtasks });
    expect(result.success).toBe(false);
  });

  it('rejects subtask title over 200 chars', () => {
    const result = patchTaskSchema.safeParse({
      subtasks: [{ title: 'x'.repeat(201), done: false, position: 0 }],
    });
    expect(result.success).toBe(false);
  });
});
