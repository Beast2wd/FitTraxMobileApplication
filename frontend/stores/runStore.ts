import { create } from 'zustand';

interface RunState {
  isRunning: boolean;
  isPaused: boolean;
  runTime: number; // seconds
  distance: number; // miles
  routeCoords: Array<{ latitude: number; longitude: number; timestamp: number }>;
  startTime: number | null;
  
  // Actions
  startRun: () => void;
  stopRun: () => void;
  pauseRun: () => void;
  resumeRun: () => void;
  updateRunTime: (time: number) => void;
  updateDistance: (distance: number) => void;
  addRouteCoord: (coord: { latitude: number; longitude: number; timestamp: number }) => void;
  resetRun: () => void;
}

export const useRunStore = create<RunState>((set, get) => ({
  isRunning: false,
  isPaused: false,
  runTime: 0,
  distance: 0,
  routeCoords: [],
  startTime: null,
  
  startRun: () => set({ 
    isRunning: true, 
    isPaused: false, 
    runTime: 0, 
    distance: 0, 
    routeCoords: [],
    startTime: Date.now()
  }),
  
  stopRun: () => set({ 
    isRunning: false, 
    isPaused: false,
    startTime: null
  }),
  
  pauseRun: () => set({ isPaused: true }),
  
  resumeRun: () => set({ isPaused: false }),
  
  updateRunTime: (time: number) => set({ runTime: time }),
  
  updateDistance: (distance: number) => set({ distance }),
  
  addRouteCoord: (coord) => set((state) => ({ 
    routeCoords: [...state.routeCoords, coord] 
  })),
  
  resetRun: () => set({ 
    isRunning: false, 
    isPaused: false, 
    runTime: 0, 
    distance: 0, 
    routeCoords: [],
    startTime: null
  }),
}));
