/**
 * Client-side mirror of the Cognito user pool PasswordPolicy in template.yaml:
 * MinimumLength 8, RequireUppercase, RequireLowercase, RequireNumbers,
 * RequireSymbols false. Keep in sync with the template.
 */
export const PASSWORD_MIN_LENGTH = 8;

export interface PasswordRule {
  id: 'length' | 'uppercase' | 'lowercase' | 'number';
  /** Short requirement text, e.g. for a hint list. */
  label: string;
  /** Error text shown when the rule is unmet. */
  message: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: 'length',
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`,
    test: (p) => p.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: 'uppercase',
    label: 'One uppercase letter (A-Z)',
    message: 'Password must include at least one uppercase letter (A-Z).',
    test: (p) => /[A-Z]/.test(p),
  },
  {
    id: 'lowercase',
    label: 'One lowercase letter (a-z)',
    message: 'Password must include at least one lowercase letter (a-z).',
    test: (p) => /[a-z]/.test(p),
  },
  {
    id: 'number',
    label: 'One number (0-9)',
    message: 'Password must include at least one number (0-9).',
    test: (p) => /[0-9]/.test(p),
  },
];

/** Returns the rules the password does not satisfy (empty when valid). */
export function getUnmetPasswordRules(password: string): PasswordRule[] {
  return PASSWORD_RULES.filter((rule) => !rule.test(password));
}
