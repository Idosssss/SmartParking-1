import type { Cell, CellType, LotModel } from '../lot/types';

/**
 * Bigger (or smaller) lots built from the same pattern as the demo lot in `src/lot/generateLot.ts`:
 * a vertical lane at column 0, blocks of "spot row / lane / spot row" separated by a gap row, and
 * the entrance road along the bottom. `scaledLot(2, 9)` is exactly the 32-spot demo lot (checked in
 * `checks.ts`). Used only for the lot-size sweep of the study; the live demo is untouched.
 */
export function scaledLot(blocks: number, cols: number): LotModel {
  const rows = blocks * 4;
  const entrance = { row: rows - 1, col: 0 };
  const cells: Cell[][] = [];
  const spots: LotModel['spots'] = [];
  let counter = 1;

  for (let row = 0; row < rows; row++) {
    const inBlock = row % 4; // 0 spot row, 1 lane, 2 spot row, 3 gap (or the road, for the last block)
    const isRoad = row === rows - 1;
    const rowCells: Cell[] = [];
    for (let col = 0; col < cols; col++) {
      let type: CellType = 'empty';
      let spotId: string | undefined;
      if (col === 0) {
        type = isRoad ? 'entrance' : 'lane';
      } else if (inBlock === 0 || inBlock === 2) {
        type = 'spot';
        spotId = `S${counter++}`;
      } else if (inBlock === 1 || isRoad) {
        type = 'lane';
      }
      rowCells.push({ row, col, type, spotId });
      if (type === 'spot' && spotId) spots.push({ id: spotId, row, col, occupied: false });
    }
    cells.push(rowCells);
  }
  return { rows, cols, cells, spots, entrance };
}
