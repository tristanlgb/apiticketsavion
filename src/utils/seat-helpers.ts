import { SeatRow } from '../types';

export type SeatKey = string; // `${row}:${col}`

export const seatKey = (s: SeatRow) => `${s.seat_row}:${s.seat_column}`;

export const isAdjacent = (a: SeatRow, b: SeatRow) => {
  const dc = Math.abs(a.seat_column.charCodeAt(0) - b.seat_column.charCodeAt(0));
  const dr = Math.abs(a.seat_row - b.seat_row);
  // adyacente lateral (misma fila columnas contiguas) o adelante/atrás (misma columna filas contiguas)
  return (dr === 0 && dc === 1) || (dc === 0 && dr === 1);
};
