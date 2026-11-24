import { AnimalGroupId } from './recipe.model';

/**
 * A farm's herd group (pen / ration group).
 *
 * Stored at `/farms/{farmId}/groups/{groupId}`. The `animalGroupId` field
 * links the herd group to its nutritional category, which is what target
 * ranges resolve against.
 */
export interface HerdGroup {
  id?: string;
  farmId: string;
  name: string;
  animalGroupId: AnimalGroupId;
  /** Number of animals in the group; the source of truth for group economics. */
  headCount: number;
  /** The ration currently fed to this group, if any. */
  activeRecipeId: string | null;
  /** Optional id used by the herd-data ingestion API. */
  externalId: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}
