import { useCallback, useEffect, useState } from 'react';
import type { Book } from '../../core/types';
import { listBooks } from '../../core/storage/db';
import { getProfile, listBlocks, listNotes, listReviews, listStates } from '../../growth/store';
import { DEFAULT_PROFILE, type BusinessProfile, type DailyBlock, type GrowthBookState, type GrowthNote, type WeeklyReview } from '../../growth/types';

export interface GrowthData {
  loaded: boolean;
  states: Map<string, GrowthBookState>;
  notes: GrowthNote[];
  blocks: DailyBlock[];
  reviews: WeeklyReview[];
  profile: BusinessProfile;
  libraryBooks: Book[];
  refresh(): Promise<void>;
}

/** Loads everything the Growth Library screens need from on-device storage. */
export function useGrowth(): GrowthData {
  const [data, setData] = useState<Omit<GrowthData, 'refresh'>>({
    loaded: false,
    states: new Map(),
    notes: [],
    blocks: [],
    reviews: [],
    profile: DEFAULT_PROFILE,
    libraryBooks: [],
  });
  const refresh = useCallback(async () => {
    const [states, notes, blocks, reviews, profile, libraryBooks] = await Promise.all([
      listStates(),
      listNotes(),
      listBlocks(),
      listReviews(),
      getProfile(),
      listBooks(),
    ]);
    setData({ loaded: true, states, notes, blocks, reviews, profile, libraryBooks });
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { ...data, refresh };
}
