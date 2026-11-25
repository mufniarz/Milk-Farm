import { Injectable, inject } from '@angular/core';
import { Firestore, doc, docData } from '@angular/fire/firestore';
import { Observable } from 'rxjs';

export interface RetryScanHeartbeat {
  lastRunAt?: Date | { toDate(): Date };
  lastRunStatus?: 'ok' | 'error';
  docsScanned?: number;
  error?: string;
}

/** Reads the scheduled retry scan's heartbeat document. */
@Injectable({ providedIn: 'root' })
export class SystemHealthService {
  private firestore = inject(Firestore);

  getRetryScanHeartbeat(): Observable<RetryScanHeartbeat | undefined> {
    return docData(
      doc(this.firestore, 'system', 'feedingRetryScan'),
    ) as Observable<RetryScanHeartbeat | undefined>;
  }
}
