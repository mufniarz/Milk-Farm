/** A queued trigger failure at `/farms/{farmId}/feedingTriggerFailures`. */
export interface FeedingFailure {
  id?: string;
  farmId: string;
  feedingId: string;
  error: string;
  status: 'pending' | 'retrying' | 'needs-review' | 'resolved' | 'dead';
  retryCount: number;
  attemptedAt?: Date;
  lastRetryAt?: Date;
  deadAt?: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolution?: 'manual-adjustment' | 'acknowledged-no-action';
}
