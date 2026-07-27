import type {
  AssignedRealtor,
  RelationshipStage,
} from '../../lib/types/realtors';

export interface RealtorDirectoryFilters {
  search?: string;
  stage?: RelationshipStage | 'all';
  needsLove?: boolean;
}

export interface RealtorDirectoryPageState {
  nextOffset: number;
  hasMore: boolean;
  totalCount: number;
}

export function getRealtorDirectoryPageState(
  offset: number,
  itemCount: number,
  totalCount: number
): RealtorDirectoryPageState {
  const safeOffset =
    Number.isFinite(offset) && offset >= 0 ? Math.floor(offset) : 0;
  const safeItemCount =
    Number.isFinite(itemCount) && itemCount >= 0 ? Math.floor(itemCount) : 0;
  const safeTotalCount =
    Number.isFinite(totalCount) && totalCount >= 0
      ? Math.floor(totalCount)
      : safeOffset + safeItemCount;
  const nextOffset = safeOffset + safeItemCount;

  return {
    nextOffset,
    hasMore: nextOffset < safeTotalCount,
    totalCount: safeTotalCount,
  };
}

export function filterAndSortRealtors(
  realtors: AssignedRealtor[],
  options: RealtorDirectoryFilters = {}
): AssignedRealtor[] {
  const search = options.search?.trim().toLocaleLowerCase();
  const needsLoveCutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;

  return realtors
    .filter((realtor) => {
      if (
        options.stage &&
        options.stage !== 'all' &&
        realtor.relationship_stage !== options.stage
      ) {
        return false;
      }
      if (options.needsLove) {
        const lastTouched = Date.parse(realtor.last_touched_at);
        if (Number.isFinite(lastTouched) && lastTouched >= needsLoveCutoff)
          return false;
      }
      if (!search) return true;

      const fullName = `${realtor.first_name || ''} ${
        realtor.last_name || ''
      }`.toLocaleLowerCase();
      return (
        fullName.includes(search) ||
        realtor.brokerage?.toLocaleLowerCase().includes(search) ||
        realtor.phone?.includes(options.search?.trim() || '') ||
        realtor.email?.toLocaleLowerCase().includes(search)
      );
    })
    .sort((a, b) => {
      const leadCountDifference = (b.lead_count || 0) - (a.lead_count || 0);
      if (leadCountDifference !== 0) return leadCountDifference;
      const lastNameDifference = (a.last_name || '').localeCompare(
        b.last_name || ''
      );
      if (lastNameDifference !== 0) return lastNameDifference;
      return (a.first_name || '').localeCompare(b.first_name || '');
    });
}

export function mergeRealtorPages(
  current: AssignedRealtor[],
  incoming: AssignedRealtor[]
): AssignedRealtor[] {
  const byId = new Map(current.map((realtor) => [realtor.realtor_id, realtor]));
  incoming.forEach((realtor) => byId.set(realtor.realtor_id, realtor));
  return Array.from(byId.values());
}
