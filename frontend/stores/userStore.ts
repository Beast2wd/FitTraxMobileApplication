import { create } from 'zustand';

interface UserProfile {
  user_id: string;
  name: string;
  age: number;
  gender: string;
  height_feet: number;
  height_inches: number;
  weight: number;
  goal_weight: number;
  activity_level: string;
  daily_calorie_goal?: number;
  custom_calorie_goal?: number;
}

interface TosAcceptance {
  accepted: boolean;
  acceptedAt: string;
  version: string;
}

interface MembershipStatus {
  is_premium: boolean;
  is_trial: boolean;
  trial_days_remaining?: number;
  subscription_status?: string;
}

interface UserStore {
  userId: string | null;
  profile: UserProfile | null;
  tosAccepted: TosAcceptance | null;
  membershipStatus: MembershipStatus | null;
  isLoading: boolean;
  lastMealLoggedAt: number | null;
  setUserId: (userId: string) => void;
  setProfile: (profile: UserProfile) => void;
  setTosAccepted: (tos: TosAcceptance) => void;
  setMembershipStatus: (status: MembershipStatus) => void;
  setLoading: (loading: boolean) => void;
  triggerMealRefresh: () => void;
  clearUser: () => void;
}

export const useUserStore = create<UserStore>((set) => ({
  userId: null,
  profile: null,
  tosAccepted: null,
  // All users are now premium by default - premium features managed via App Store
  membershipStatus: { is_premium: true, is_trial: false },
  isLoading: false,
  lastMealLoggedAt: null,
  setUserId: (userId) => set({ userId }),
  setProfile: (profile) => set({ profile }),
  setTosAccepted: (tosAccepted) => set({ tosAccepted }),
  // Always keep premium true regardless of what backend says
  setMembershipStatus: (_membershipStatus) => set({ membershipStatus: { is_premium: true, is_trial: false } }),
  setLoading: (isLoading) => set({ isLoading }),
  triggerMealRefresh: () => set({ lastMealLoggedAt: Date.now() }),
  clearUser: () => set({ 
    userId: null, 
    profile: null, 
    tosAccepted: null, 
    membershipStatus: { is_premium: true, is_trial: false }, 
    lastMealLoggedAt: null 
  }),
}));
