export type CellType = 'empty' | 'lane' | 'spot' | 'entrance';

export interface Cell {
  row: number;
  col: number;
  type: CellType;
  spotId?: string;
  /** A lane closed for roadwork: cars cannot drive through it. */
  closed?: boolean;
}

export interface Spot {
  id: string;
  row: number;
  col: number;
  occupied: boolean;
}

export interface LotModel {
  rows: number;
  cols: number;
  cells: Cell[][];
  spots: Spot[];
  entrance: { row: number; col: number };
}

export type GridPoint = [number, number];
