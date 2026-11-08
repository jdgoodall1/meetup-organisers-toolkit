import { getUnmetPasswordRules } from '../password';

const unmet = (p: string) => getUnmetPasswordRules(p).map((r) => r.id);

describe('getUnmetPasswordRules', () => {
  it('accepts a compliant password', () => {
    expect(unmet('Abcdefg1')).toEqual([]);
  });

  it('flags missing uppercase', () => {
    expect(unmet('abcdefg1')).toEqual(['uppercase']);
  });

  it('flags missing lowercase', () => {
    expect(unmet('ABCDEFG1')).toEqual(['lowercase']);
  });

  it('flags missing number', () => {
    expect(unmet('Abcdefgh')).toEqual(['number']);
  });

  it('enforces the 8 character boundary', () => {
    expect(unmet('Abcdef1')).toEqual(['length']);
    expect(unmet('Abcdefg1')).toEqual([]);
  });

  it('does not require symbols', () => {
    expect(unmet('Abcdefg1')).not.toContain('symbol');
    expect(unmet('Abcdefg1!')).toEqual([]);
  });

  it('reports every unmet rule for an empty password', () => {
    expect(unmet('')).toEqual(['length', 'uppercase', 'lowercase', 'number']);
  });
});
