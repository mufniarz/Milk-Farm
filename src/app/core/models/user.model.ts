/**
 * User profile stored in Firestore: /users/{uid}
 */
export interface UserProfile {
  /** Firebase Auth UID */
  uid: string;
  /** Display name */
  displayName: string;
  /** Email address */
  email: string;
  /** Farm ID for multi-tenancy isolation */
  farmId: string;
  /** User's preferred language */
  language: 'it' | 'en';
  /** Account creation timestamp */
  createdAt: Date;
  /** Last login timestamp */
  lastLoginAt?: Date;
}

/**
 * Farm entity (could be a standalone collection or embedded in user profile).
 * For now, farmId is a simple string identifier.
 */
export interface Farm {
  /** Unique farm identifier */
  id: string;
  /** Farm display name */
  name: string;
  /** Owner UID */
  ownerUid: string;
  /** Creation timestamp */
  createdAt: Date;
}
