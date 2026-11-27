import { describe, expect, it } from 'vitest';
import { jobCreatedState, readCreatedJobNumber } from './jobCreated';

describe('readCreatedJobNumber', () => {
  it('reads the number that jobCreatedState sent', () => {
    expect(readCreatedJobNumber(jobCreatedState('J-1013'))).toBe('J-1013');
  });

  it.each([null, undefined, 'J-1013', {}, { jobCreated: 5 }, { jobCreated: '  ' }])(
    'returns null for %j',
    (state) => {
      expect(readCreatedJobNumber(state)).toBeNull();
    },
  );
});
