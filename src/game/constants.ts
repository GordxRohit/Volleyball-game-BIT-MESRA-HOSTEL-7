// Shared gameplay & world constants for Hostel 7 Volleyball

export const COURT = {
  halfWidth: 4.0, // x: -4..4
  halfLength: 7.0, // z: red side -7..0, blue side 0..7
  attackLineDist: 3.0, // distance of attack line from net
  netHeight: 2.25,
  netTopExtra: 0.14, // tape thickness visual
  poleX: 4.6,
};

export const PHYSICS = {
  gravity: -15.5,
  airDrag: 0.06,
  restitution: 0.52,
  groundFriction: 0.72,
  ballRadius: 0.21,
  substeps: 4,
};

export const TEAM = {
  RED: "RED",
  BLUE: "BLUE",
} as const;
export type TeamId = (typeof TEAM)[keyof typeof TEAM];

export const MAX_TOUCHES = 3;
export const POINTS_TO_WIN_SET = 15;
export const MIN_WIN_MARGIN = 2;
export const SETS_TO_WIN_MATCH = 2; // best of 3

export type TimeOfDay = "day" | "sunset" | "night";
export type Season = "summer" | "autumn" | "winter";
