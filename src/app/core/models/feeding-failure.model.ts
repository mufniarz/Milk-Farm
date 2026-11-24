/** A queued trigger failure at `/farms/{farmId}/feedingTriggerFailures`. */
export interface FeedingFailure {
  id?: string;
  farmId: string;
  feedingId: string;
  error: string;
  status: 'pending' | 'retrying' | 'resolved' | 'dead';
  retryCount: number;
  attemptedAt?: Date;
  lastRetryAt?: Date;
  deadAt?: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
}
