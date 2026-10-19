/**
 * Every assumption of the simulation lives here, in one place, with the reason for it.
 * Change a number and re-run `npm run simulate` to see how the result moves.
 */

export interface SimParams {
  /** Metres of driving that one grid cell stands for. */
  cellMeters: number;
  /** How far down a straight lane a driver can see free spots, in cells. */
  sightCells: number;
  /** Which "no app" driver model to compare against. */
  baseline: 'explorer' | 'wanderer';
  /** Share of drivers who use the app (0 to 1). Only used in "mixed" runs. */
  adoption: number;
  /** Multiplies the hourly arrival rates (1 = the default busy-day profile). */
  demandScale: number;
  /** Mean time a car stays parked, minutes. */
  meanDwellMin: number;
  /** Spread of the parked time (log-space standard deviation of a lognormal). */
  dwellSigma: number;
  /** Mean arrivals per hour, one entry per hour starting at `startHour`. */
  hourlyArrivals: number[];
  startHour: number;
  /** Average speed inside the lot, km/h. */
  speedKmh: number;
  /** CO2 emitted per km driven, kg. */
  co2KgPerKm: number;
}

export const DEFAULT_PARAMS: SimParams = {
  // The lot is 9 x 8 cells with 32 spots. At 3.6 m per cell that is 32.4 m x 28.8 m = 933 m2,
  // i.e. 29 m2 per space, which is inside the usual 25-35 m2 per space of a surface lot.
  cellMeters: 3.6,
  // 4 cells = 14.4 m: roughly the six or seven spots you can make out when you turn into an aisle.
  // Deliberately generous to the drivers who do NOT have the app.
  sightCells: 4,
  baseline: 'explorer',
  adoption: 1,
  demandScale: 1,
  // A work / campus style lot: people stay about 90 minutes on average, with a long tail.
  meanDwellMin: 90,
  dwellSigma: 0.7,
  // A busy weekday, 07:00 to 19:00: morning ramp-up, a plateau at 09:00-13:00, then a slow tail.
  hourlyArrivals: [8, 16, 20, 20, 18, 20, 18, 16, 14, 12, 8, 4],
  startHour: 7,
  // Parking-lot speed limits are typically 5-10 mph (8-16 km/h).
  speedKmh: 10,
  // Typical passenger car on a mixed fleet is about 0.12 kg CO2 per km (stop-and-go is worse, so this is conservative).
  co2KgPerKm: 0.12,
};
