import type { GridPoint } from './types';

type DirName = 'up' | 'down' | 'left' | 'right';

const CLOCKWISE: DirName[] = ['up', 'right', 'down', 'left'];

function dirFromDelta(dr: number, dc: number): DirName {
  if (dr === -1) return 'up';
  if (dr === 1) return 'down';
  if (dc === -1) return 'left';
  return 'right';
}

function turnLabel(prev: DirName, next: DirName): 'straight' | 'left' | 'right' | 'turn around' {
  if (prev === next) return 'straight';
  const i = CLOCKWISE.indexOf(prev);
  if (CLOCKWISE[(i + 1) % 4] === next) return 'right';
  if (CLOCKWISE[(i + 3) % 4] === next) return 'left';
  return 'turn around';
}

export interface DirectionStep {
  text: string;
  /**
   * Position along the path (in cells) where this instruction becomes the current one. A turn starts half a
   * cell before its corner and the straight after it half a cell past it, so every step gets its moment.
   */
  fromIndex: number;
}

/** Turns a grid path into human-readable turn-by-turn steps. */
export function buildDirections(path: GridPoint[], spotId: string): DirectionStep[] {
  if (path.length < 2) {
    return [{ text: `You're right next to Spot ${spotId}.`, fromIndex: 0 }];
  }

  const steps: DirectionStep[] = [];
  let segmentStart = 0;
  let segmentDir = dirFromDelta(
    path[1][0] - path[0][0],
    path[1][1] - path[0][1],
  );
  let segmentLength = 1;

  const flushStraight = () => {
    if (segmentLength > 0) {
      const spaces = segmentLength === 1 ? 'space' : 'spaces';
      steps.push({
        text: `Go straight for ${segmentLength} ${spaces}`,
        fromIndex: segmentStart,
      });
    }
  };

  for (let i = 1; i < path.length - 1; i++) {
    const dir = dirFromDelta(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
    if (dir === segmentDir) {
      segmentLength++;
      continue;
    }
    // A single cell between two turns needs no "go straight" of its own: the next turn already starts there.
    if (segmentLength > 1 || segmentStart === 0) flushStraight();
    const turn = turnLabel(segmentDir, dir);
    steps.push({
      text: turn === 'straight' ? 'Continue straight' : `Turn ${turn}`,
      fromIndex: i - 0.5,
    });
    segmentDir = dir;
    segmentStart = i + 0.5;
    segmentLength = 1;
  }
  flushStraight();

  steps.push({
    text: `Arrived — park at Spot ${spotId}`,
    fromIndex: path.length - 1,
  });

  return steps;
}
