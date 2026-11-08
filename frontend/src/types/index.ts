// User and Authentication Types
export interface UserProfile {
  userId: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

// Authentication Context Types
export type Role = 'admin' | 'speaker';

export interface AuthContextType {
  /** Derived from the ID token's cognito:groups claim; admin takes precedence. */
  role: Role | null;
  /** All Cognito groups from the ID token (an admin may also be in speaker). */
  groups: string[];
  /** True when the user is in the speaker group (admins in it can open the speaker view). */
  canUseSpeakerView: boolean;
  /** True when the user is in the dmin group. */
  canUseAdminView: boolean;
  /** Re-reads the session with forceRefresh so group changes show up in the token. */
  refreshSession: () => Promise<void>;
  user: UserProfile | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name?: string) => Promise<void>;
  confirmSignup: (email: string, confirmationCode: string) => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
}
