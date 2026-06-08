import { describe, expect, it } from 'vitest';
import { MODEL, MODEL_LABEL } from './models';

describe('models定数', () => {
  it('MODELはClaude Haiku 4.5 のAPI ID', () => {
    expect(MODEL).toBe('claude-haiku-4-5-20251001');
  });

  it('MODEL_LABELは人間可読のモデル名', () => {
    expect(MODEL_LABEL).toBe('Claude Haiku 4.5');
  });
});
