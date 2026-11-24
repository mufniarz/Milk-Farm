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

/** Roles a user can hold on a farm. */
export type FarmRole = 'owner' | 'farmAdmin' | 'consultant' | 'feeder';

/** Lifecycle of a farm membership. */
export type FarmMemberStatus = 'invited' | 'active' | 'revoked';

/**
 * A user's membership in one farm. Stored in Firestore:
 * `/farmMembers/{farmId}_{uid}`. The deterministic id keeps rule lookups to a
 * single document get and lets a consultant belong to several farms.
 */
export interface FarmMember {
  farmId: string;
  uid: string;
  role: FarmRole;
  status: FarmMemberStatus;
  invitedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A membership together with the farm's display name, for the switcher. */
export interface FarmMembership extends FarmMember {
  farmName: string;
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
