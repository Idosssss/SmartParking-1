import type { IconName } from './Icons';

/** The edge cases the live demo can set up with one click. App.tsx runs them (runScenario). */

export type ScenarioId = 'one-left' | 'stolen' | 'full' | 'roadwork' | 'no-way-in' | 'line' | 'rush' | 'glitch';

export interface Scenario {
  id: ScenarioId;
  icon: IconName;
  title: string;
  /** What the button sets up. */
  setup: string;
  /** What should happen, so the viewer knows what to look for. */
  expect: string;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'one-left',
    icon: 'pin',
    title: 'One spot left',
    setup: 'Fills every spot but S8, the farthest one, and sends a car in.',
    expect: 'The car drives the whole lot to S8. Nothing else is offered.',
  },
  {
    id: 'stolen',
    icon: 'warning',
    title: 'Someone takes your spot',
    setup: 'Sends a car in, then a faster car heads for the same spot.',
    expect: 'The other car parks first and the phone reroutes you to the next nearest spot.',
  },
  {
    id: 'full',
    icon: 'car',
    title: 'Lot full',
    setup: 'Fills every spot and a car arrives at the gate.',
    expect: 'The car waits at the gate. When a driver leaves a few seconds later, it is guided in by itself.',
  },
  {
    id: 'roadwork',
    icon: 'cone',
    title: 'Roadwork in an aisle',
    setup: 'Closes part of the bottom aisle. Only S14 and S22 are free; S22 is behind the barrier.',
    expect: 'S22 is greyed out as unreachable and the car is sent around to S14.',
  },
  {
    id: 'no-way-in',
    icon: 'cone',
    title: 'Free spots, no way in',
    setup: 'Closes the main lane to the top aisle and fills the bottom aisle.',
    expect: 'Sixteen spots are free but none can be reached, so the car waits. Click the barrier to reopen the lane.',
  },
  {
    id: 'line',
    icon: 'queue',
    title: 'Three cars at once',
    setup: 'Three cars arrive at the gate together.',
    expect: 'One is guided at a time. The phone shows how many wait, and each starts when the one before parks.',
  },
  {
    id: 'rush',
    icon: 'chart',
    title: 'Rush hour',
    setup: 'Fills two thirds of the lot, turns Live traffic on at the Rush hour level, and sends a car in.',
    expect: 'Cars come and go fast. Reroutes are likely and the session panel counts them.',
  },
  {
    id: 'glitch',
    icon: 'signal',
    title: 'Noisy sensor reading',
    setup: 'Turns the emulator on and makes the entrance sensor read 5 cm for one moment.',
    expect: 'No car is reported: a car needs three close readings in a row. The trace shows the spike.',
  },
];
