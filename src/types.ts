export enum GameState {
  START,
  PLAYING,
  LEVEL_COMPLETE,
  GAME_OVER
}

export interface GameObject {
  id: string;
  x: number;
  y: number;
  radius: number;
  type: 'gold_small' | 'gold_medium' | 'gold_large' | 'rock_small' | 'rock_large' | 'diamond' | 'tnt';
  value: number;
  weight: number; // Affects pull speed
}

export interface HookState {
  angle: number;
  length: number;
  status: 'swinging' | 'extending' | 'retracting';
  attachedObject: GameObject | null;
}

export interface Explosion {
  id: string;
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
}
