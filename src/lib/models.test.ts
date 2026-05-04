import { describe, expect, it } from 'vitest';
import { MODEL, MODEL_LABEL } from './models';

describe('models 定数', () => {
  it('MODEL は Claude Haiku 4.5 の API ID', () => {
    expect(MODEL).toBe('claude-haiku-4-5-20251001');
  });

  it('MODEL_LABEL は人間可読のモデル名', () => {
    expect(MODEL_LABEL).toBe('Claude Haiku 4.5');
  });
});
