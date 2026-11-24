import { Injectable, inject } from '@angular/core';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { FarmContextService } from './farm-context.service';

/** Small farm-settings facade; currently only the milk-price default. */
@Injectable({ providedIn: 'root' })
export class FarmService {
  private firestore = inject(Firestore);
  private functions = inject(Functions);
  private farmContext = inject(FarmContextService);

  async getMilkPricePerKg(): Promise<number | null> {
    const farmId = this.farmContext.activeFarmId();
    if (!farmId) return null;
    const snapshot = await getDoc(doc(this.firestore, 'farms', farmId));
    if (!snapshot.exists()) return null;
    const value = snapshot.data()['milkPricePerKg'];
    return typeof value === 'number' ? value : null;
  }

  async setMilkPricePerKg(value: number): Promise<void> {
    const farmId = this.farmContext.activeFarmId();
    if (!farmId) throw new Error('No active farm');
    const callable = httpsCallable<
      { farmId: string; milkPricePerKg: number },
      { ok: boolean; milkPricePerKg: number }
    >(this.functions, 'set_farm_milk_price');
    await callable({ farmId, milkPricePerKg: value });
  }
}
