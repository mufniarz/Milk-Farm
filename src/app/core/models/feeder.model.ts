/**
 * A person who loads feed, stored at `/farms/{farmId}/feeders/{feederId}`.
 *
 * Feeders are names, not logins: the accuracy report attributes loads by
 * name, while `Feeding.createdBy` records the logged-in operator who entered
 * the load.
 */
export interface Feeder {
  id?: string;
  farmId: string;
  name: string;
  active: boolean;
  createdAt?: Date;
}
