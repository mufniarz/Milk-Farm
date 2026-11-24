import { Injectable, inject, signal, computed } from '@angular/core';
import {
  Auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
  user,
  User,
  updateProfile,
} from '@angular/fire/auth';
import {
  Firestore,
  doc,
  setDoc,
  getDoc,
} from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { UserProfile } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private router = inject(Router);

  /** Current Firebase user (observable converted to signal) */
  private _currentUser = signal<User | null>(null);
  readonly currentUser = this._currentUser.asReadonly();

  /** User profile loaded from Firestore */
  private _userProfile = signal<UserProfile | null>(null);
  readonly userProfile = this._userProfile.asReadonly();

  /** Convenience computed signals */
  readonly isAuthenticated = computed(() => this._currentUser() !== null);
  readonly farmId = computed(() => this._userProfile()?.farmId ?? '');
  readonly displayName = computed(() => this._currentUser()?.displayName ?? '');

  constructor() {
    // Subscribe to auth state changes
    user(this.auth).subscribe(async (firebaseUser) => {
      this._currentUser.set(firebaseUser);
      if (firebaseUser) {
        await this.loadUserProfile(firebaseUser.uid);
      } else {
        this._userProfile.set(null);
      }
    });
  }

  /**
   * Register a new user with email/password, create farm and user profile.
   */
  async register(
    email: string,
    password: string,
    displayName: string,
    farmName: string
  ): Promise<void> {
    const credential = await createUserWithEmailAndPassword(this.auth, email, password);
    await updateProfile(credential.user, { displayName });

    // Create farm document
    const farmId = crypto.randomUUID();
    const farmRef = doc(this.firestore, 'farms', farmId);
    await setDoc(farmRef, {
      id: farmId,
      name: farmName,
      ownerUid: credential.user.uid,
      createdAt: new Date(),
    });

    // Owner membership: the authorization source for every farm rule.
    // If this write fails, the idempotent backfill repairs it and the
    // legacy users.farmId fallback still lets the user in.
    await setDoc(
      doc(this.firestore, 'farmMembers', `${farmId}_${credential.user.uid}`),
      {
        farmId,
        uid: credential.user.uid,
        role: 'owner',
        status: 'active',
        invitedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );

    // Create user profile
    const userRef = doc(this.firestore, 'users', credential.user.uid);
    const profile: UserProfile = {
      uid: credential.user.uid,
      displayName,
      email,
      farmId,
      language: 'it',
      createdAt: new Date(),
    };
    await setDoc(userRef, profile);
    this._userProfile.set(profile);

    this.router.navigate(['/dashboard']);
  }

  /**
   * Sign in with email and password.
   */
  async loginWithEmail(email: string, password: string): Promise<void> {
    const userCredential = await signInWithEmailAndPassword(
      this.auth,
      email,
      password
    );
    const firebaseUser = userCredential.user;

    // Sync real Firebase Auth info into Firestore profile
    const userRef = doc(this.firestore, 'users', firebaseUser.uid);
    await setDoc(
      userRef,
      {
        uid: firebaseUser.uid,
        displayName: firebaseUser.displayName || 'User',
        email: firebaseUser.email || '',
        lastLoginAt: new Date(),
      },
      { merge: true }
    );

    this.router.navigate(['/dashboard']);
  }

  /**
   * Sign in with Google OAuth.
   */
  async loginWithGoogle(): Promise<void> {
    const provider = new GoogleAuthProvider();
    const credential = await signInWithPopup(this.auth, provider);

    // Check if user profile exists; if not, this is a new user
    const userRef = doc(this.firestore, 'users', credential.user.uid);
    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) {
      // New Google user — create farm and profile
      const farmId = crypto.randomUUID();
      const farmRef = doc(this.firestore, 'farms', farmId);
      await setDoc(farmRef, {
        id: farmId,
        name: `${credential.user.displayName}'s Farm`,
        ownerUid: credential.user.uid,
        createdAt: new Date(),
      });

      await setDoc(
        doc(this.firestore, 'farmMembers', `${farmId}_${credential.user.uid}`),
        {
          farmId,
          uid: credential.user.uid,
          role: 'owner',
          status: 'active',
          invitedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      );

      const profile: UserProfile = {
        uid: credential.user.uid,
        displayName: credential.user.displayName || 'User',
        email: credential.user.email || '',
        farmId,
        language: 'it',
        createdAt: new Date(),
      };
      await setDoc(userRef, profile);
      this._userProfile.set(profile);
    }

    this.router.navigate(['/dashboard']);
  }

  /**
   * Send a password reset email for the given address.
   */
  async sendPasswordResetEmail(email: string): Promise<void> {
    await sendPasswordResetEmail(this.auth, email);
  }

  /**
   * Sign out and redirect to login.
   */
  async logout(): Promise<void> {
    await signOut(this.auth);
    this._userProfile.set(null);
    this.router.navigate(['/login']);
  }

  /**
   * Load user profile from Firestore.
   */
  private async loadUserProfile(uid: string): Promise<void> {
    const userRef = doc(this.firestore, 'users', uid);
    const snapshot = await getDoc(userRef);
    if (snapshot.exists()) {
      this._userProfile.set(snapshot.data() as UserProfile);
    }
  }
}
