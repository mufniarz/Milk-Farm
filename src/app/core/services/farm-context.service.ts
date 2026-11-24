import { Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import {
  FarmMember,
  FarmMembership,
  FarmRole,
} from '../models/user.model';

/**
 * Resolves the farms the signed-in user can access and which one is active.
 *
 * `users/{uid}.farmId` remains a compatibility fallback while the
 * `farmMembers` backfill rolls out, but the membership collection is the
 * authorization source: a consultant can hold memberships in several farms.
 */
@Injectable({ providedIn: 'root' })
export class FarmContextService {
  private auth = inject(AuthService);
  private firestore = inject(Firestore);

  private _memberships = signal<FarmMembership[]>([]);
  private _activeFarmId = signal<string>('');
  private _loading = signal(true);

  private loadedForUid = '';
  private loadedProfileKey = '';

  readonly memberships = this._memberships.asReadonly();
  readonly activeFarmId = this._activeFarmId.asReadonly();
  readonly loading = this._loading.asReadonly();

  readonly activeRole = computed<FarmRole | null>(() => {
    const active = this._activeFarmId();
    return this._memberships().find((m) => m.farmId === active)?.role ?? null;
  });

  /** Can the active user write farm data (recipes, feeds, inventory, ...)? */
  readonly canWrite = computed(() => {
    const role = this.activeRole();
    return role === 'owner' || role === 'farmAdmin' || role === 'consultant';
  });

  constructor() {
    effect(() => {
      const user = this.auth.currentUser();
      const profile = this.auth.userProfile();
      if (!user) {
        this.loadedForUid = '';
        this.loadedProfileKey = '';
        this._memberships.set([]);
        this._activeFarmId.set('');
        this._loading.set(false);
        return;
      }
      const profileKey = profile ? `${user.uid}:${profile.farmId}` : '';
      if (
        this.loadedForUid === user.uid &&
        this.loadedProfileKey === profileKey
      ) {
        return;
      }
      this.loadedForUid = user.uid;
      this.loadedProfileKey = profileKey;
      void this.load(user.uid, profile?.farmId ?? '');
    });
  }

  /** Switch the active farm. Throws if the user has no membership in it. */
  async switchFarm(farmId: string): Promise<void> {
    if (!this._memberships().some((m) => m.farmId === farmId)) {
      throw new Error(`No access to farm ${farmId}`);
    }
    this._activeFarmId.set(farmId);
  }

  private async load(uid: string, profileFarmId: string): Promise<void> {
    this._loading.set(true);
    try {
      const membershipQuery = query(
        collection(this.firestore, 'farmMembers'),
        where('uid', '==', uid),
        where('status', '==', 'active'),
      );
      const snapshot = await getDocs(membershipQuery);
      const members = snapshot.docs.map((entry) => entry.data() as FarmMember);

      const withNames = await Promise.all(
        members.map(async (member) => {
          let farmName = member.farmId;
          try {
            const farm = await getDoc(
              doc(this.firestore, 'farms', member.farmId),
            );
            if (farm.exists()) {
              farmName = String(farm.data()['name'] ?? member.farmId);
            }
          } catch {
            // The farm doc may be unreadable during the migration window;
            // the id is still a usable label.
          }
          return { ...member, farmName } as FarmMembership;
        }),
      );

      // Compatibility fallback: existing users may not have a membership
      // document until the backfill has run.
      if (withNames.length === 0 && profileFarmId) {
        withNames.push({
          farmId: profileFarmId,
          uid,
          role: 'owner',
          status: 'active',
          invitedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          farmName: profileFarmId,
        });
      }

      this._memberships.set(withNames);
      const current = this._activeFarmId();
      if (!withNames.some((member) => member.farmId === current)) {
        this._activeFarmId.set(withNames[0]?.farmId ?? '');
      }
    } catch (error) {
      console.error('Failed to load farm memberships', error);
      this._memberships.set([]);
      this._activeFarmId.set(profileFarmId);
    } finally {
      this._loading.set(false);
    }
  }
}
