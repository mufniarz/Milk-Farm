import { Injectable, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import {
  Firestore,
  collection,
  collectionData,
  query,
  where,
} from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Observable } from 'rxjs';
import { filter, switchMap } from 'rxjs/operators';
import { FeedingFailure } from '../models/feeding-failure.model';
import { FarmContextService } from './farm-context.service';

export interface RetryFailuresResult {
  ok: boolean;
  resolved: number;
  failed: number;
}

/** Reads the trigger failure queue and drives the admin retry callable. */
@Injectable({ providedIn: 'root' })
export class FeedingFailureService {
  private firestore = inject(Firestore);
  private functions = inject(Functions);
  private farmContext = inject(FarmContextService);

  private readonly farmId$ = toObservable(this.farmContext.activeFarmId).pipe(
    filter((id) => !!id),
  );

  getOpenFailures(): Observable<FeedingFailure[]> {
    return this.farmId$.pipe(
      switchMap((farmId) => {
        const ref = collection(
          this.firestore,
          'farms',
          farmId,
          'feedingTriggerFailures',
        );
        const q = query(
          ref,
          where('status', 'in', ['pending', 'retrying', 'needs-review', 'dead']),
        );
        return collectionData(q, { idField: 'id' }) as Observable<
          FeedingFailure[]
        >;
      }),
    );
  }

  async markHandled(
    feedingId: string,
    resolution: 'manual-adjustment' | 'acknowledged-no-action',
  ): Promise<void> {
    const callable = httpsCallable<
      { farmId: string; feedingId: string; resolution: string },
      { ok: boolean }
    >(this.functions, 'mark_feeding_failure_handled');
    await callable({
      farmId: this.farmContext.activeFarmId(),
      feedingId,
      resolution,
    });
  }

  async retryAll(status?: 'pending' | 'dead'): Promise<RetryFailuresResult> {
    const callable = httpsCallable<
      { farmId: string; status?: 'pending' | 'dead' },
      RetryFailuresResult
    >(this.functions, 'retry_feeding_failures');
    const { data } = await callable({
      farmId: this.farmContext.activeFarmId(),
      ...(status ? { status } : {}),
    });
    return data;
  }
}
