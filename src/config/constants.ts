/**
 * Every tunable number of the app in one place. Change a value here, not inside a component.
 */

// ---- the driving animation ------------------------------------------------------
export const MS_PER_CELL = 900;
export const AMBIENT_MS_PER_CELL = 550;
export const DETECT_MS = 1000;
export const SEARCH_MS = 1000;
export const PING_MS = 700;

// ---- simulated traffic ------------------------------------------------------------
export const AMBIENT_SPAWN_MS = 3200;
export const MAX_AMBIENT_CARS = 3;
export const REROUTE_STEAL_CHANCE = 0.55;

// ---- the real sensor spot -----------------------------------------------------------
// The spot driven by the real D35 sensor. Starts at S25 (closest to the entrance); drag the HW tag to move it.
export const DEFAULT_HARDWARE_SPOT_ID = 'S25';

// ---- detection thresholds (centimetres) ---------------------------------------------
// The firmware accepts the same range (THRESHOLD_MIN_CM / THRESHOLD_MAX_CM in config.h).
export const THRESHOLD_MIN_CM = 5;
export const THRESHOLD_MAX_CM = 60;
export const DEFAULT_ENTRANCE_THRESHOLD_CM = 15;
export const DEFAULT_SPOT_THRESHOLD_CM = 15;
/** Distance the sensors report when nothing is in range. */
export const SENSOR_FAR_CM = 80;

// ---- the emulator -------------------------------------------------------------------
export const EMULATOR_SAMPLE_MS = 150;

// ---- the link to the board -----------------------------------------------------------
/** The app pings the board this often. The board warns on its LEDs after 3 s without one (HOST_TIMEOUT_MS in config.h). */
export const HEARTBEAT_MS = 1000;
