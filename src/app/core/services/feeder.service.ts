import { Injectable, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import {
  Firestore,
  addDoc,
  collection,
  collectionData,
  doc,
  orderBy,
  query,
  updateDoc,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { filter, switchMap } from 'rxjs/operators';
import { Feeder } from '../models/feeder.model';
import { FarmContextService } from './farm-context.service';

/** Feeders are names, not logins; the loading sheet selects one. */
@Injectable({ providedIn: 'root' })
export class FeederService {
  private firestore = inject(Firestore);
  private farmContext = inject(FarmContextService);

  private readonly farmId$ = toObservable(this.farmContext.activeFarmId).pipe(
    filter((id) => !!id),
  );

  getFeeders(): Observable<Feeder[]> {
    return this.farmId$.pipe(
      switchMap((farmId) => {
        const ref = collection(this.firestore, 'farms', farmId, 'feeders');
        return collectionData(query(ref, orderBy('name', 'asc')), {
          idField: 'id',
        }) as Observable<Feeder[]>;
      }),
    );
  }

  async createFeeder(name: string): Promise<string> {
    const farmId = this.farmContext.activeFarmId();
    if (!farmId) throw new Error('No active farm');
    const ref = await addDoc(
      collection(this.firestore, 'farms', farmId, 'feeders'),
      { farmId, name: name.trim(), active: true, createdAt: new Date() },
    );
    return ref.id;
  }

  async setActive(feederId: string, active: boolean): Promise<void> {
    const farmId = this.farmContext.activeFarmId();
    if (!farmId) throw new Error('No active farm');
    await updateDoc(doc(this.firestore, 'farms', farmId, 'feeders', feederId), {
      active,
    });
  }
}
