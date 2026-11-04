import { afterEach, describe, expect, it } from 'vitest';
import { config, configure } from './config.js';

const defaults = structuredClone(config);

describe('configure', () => {
  afterEach(() => {
    configure(defaults);
  });

  it('has neutral defaults', () => {
    expect(config.flashKey).toBe('mm-notify.flash');
    expect(config.closeLabel).toBe('Close the message');
    expect(config.injectCss).toBe(true);
    expect(config.durations).toEqual({
      success: 5000,
      neutral: 5000,
      alert: 8000,
      error: 10_000,
    });
  });

  it('changes only the given values', () => {
    configure({ closeLabel: 'Fermer', durations: { error: 0 } });
    expect(config.closeLabel).toBe('Fermer');
    expect(config.flashKey).toBe('mm-notify.flash');
    expect(config.durations.error).toBe(0);
    expect(config.durations.alert).toBe(8000);
  });
});
