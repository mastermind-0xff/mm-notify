import { afterEach, describe, expect, it } from 'vitest';
import { config, configure } from './config.js';

const defaults = structuredClone(config);

describe('configure', () => {
  afterEach(() => {
    configure(defaults);
  });

  it('has neutral defaults', () => {
    expect(config.closeLabel).toBe('Close the message');
    expect(config.clearAllLabel).toBe('Clear all');
    expect(config.clearAllFrom).toBe(3);
    expect(config.sequential).toBe(false);
    expect(config.injectCss).toBe(true);
    expect(config.repeats).toBe(false);
    expect(config.durations).toEqual({
      success: 5000,
      neutral: 5000,
      alert: 8000,
      error: 10_000,
    });
  });

  it('changes only the given values', () => {
    configure({ closeLabel: 'Fermer', durations: { error: 9000 } });
    expect(config.closeLabel).toBe('Fermer');
    expect(config.injectCss).toBe(true);
    expect(config.durations.error).toBe(9000);
    expect(config.durations.alert).toBe(8000);
    expect(config.durations.success).toBe(5000);
  });
});
