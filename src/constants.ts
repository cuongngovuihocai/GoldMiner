export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

export const MINER_X = CANVAS_WIDTH / 2;
export const MINER_Y = 80;

export const HOOK_MIN_LENGTH = 40;
export const HOOK_MAX_LENGTH = 750;
export const SWING_SPEED = 0.03;
export const EXTEND_SPEED = 7;
export const RETRACT_SPEED_BASE = 7;

export const LEVELS = [
  { target: 500, time: 60, objects: 15 },
  { target: 1200, time: 60, objects: 20 },
  { target: 2500, time: 60, objects: 25 },
  { target: 4000, time: 60, objects: 30 },
];

export const OBJECT_TYPES = {
  gold_small: { radius: 15, value: 50, weight: 1, color: '#FFD700', image: 'https://lh3.googleusercontent.com/d/13PW_9g97VCezQs4CSOGZ6nRmDP0R8Cb9' },
  gold_medium: { radius: 25, value: 100, weight: 2, color: '#FFD700', image: 'https://lh3.googleusercontent.com/d/13PW_9g97VCezQs4CSOGZ6nRmDP0R8Cb9' },
  gold_large: { radius: 45, value: 500, weight: 5, color: '#FFD700', image: 'https://lh3.googleusercontent.com/d/13PW_9g97VCezQs4CSOGZ6nRmDP0R8Cb9' },
  rock_small: { radius: 20, value: 10, weight: 3, color: '#8B4513', image: 'https://lh3.googleusercontent.com/d/1p3L6-HJeMULdhri7SLMaumLIqnk-mesB' },
  rock_large: { radius: 40, value: 20, weight: 7, color: '#8B4513', image: 'https://lh3.googleusercontent.com/d/1p3L6-HJeMULdhri7SLMaumLIqnk-mesB' },
  diamond: { radius: 10, value: 600, weight: 0.5, color: '#B0E0E6', image: 'https://lh3.googleusercontent.com/d/1LsBbHLBKfMjQw-2PMSbpA-ou5HvH5yhN' },
  tnt: { radius: 20, value: 0, weight: 1, color: '#FF0000', image: 'https://lh3.googleusercontent.com/d/1pcyEsUWG2V75_Y5A4NmvWtupUSStZ7gJ' },
};

export const MINER_IMAGE = 'https://lh3.googleusercontent.com/d/1p53ltt3RQMZXUV5YEDrAoosmyr2tF_yq';

export const SOUNDS = {
  coin: 'https://assets.mixkit.co/active_storage/sfx/2069/2069-preview.mp3',
  thud: 'https://assets.mixkit.co/active_storage/sfx/2204/2204-preview.mp3',
  explosion: 'https://assets.mixkit.co/active_storage/sfx/1691/1691-preview.mp3',
  success: 'https://assets.mixkit.co/active_storage/sfx/2059/2059-preview.mp3',
  fail: 'https://assets.mixkit.co/active_storage/sfx/2042/2042-preview.mp3',
};
