import pool from '../db';
import { FlightRow, BoardingPassRow, PassengerRow, SeatRow } from '../types';
import { isAdjacent } from '../utils/seat-helpers';

type PassengerWithBP = PassengerRow & BoardingPassRow;

export async function getFlightHeader(flightId: number) {
  const [rows] = await pool.query<FlightRow[]>(
    `SELECT * FROM flight WHERE flight_id = ?`,
    [flightId]
  );
  return rows[0] ?? null;
}

export async function getPassengersForFlight(flightId: number) {
  const [rows] = await pool.query<(PassengerWithBP)[]>(`
    SELECT p.passenger_id, p.dni, p.name, p.age, p.country,
           bp.boarding_pass_id, bp.purchase_id, bp.seat_type_id, bp.seat_id, bp.flight_id
    FROM boarding_pass bp
    JOIN passenger p USING (passenger_id)
    WHERE bp.flight_id = ?
    ORDER BY bp.purchase_id, p.passenger_id
  `, [flightId]);
  return rows;
}

export async function getSeatsForAirplane(airplaneId: number) {
  const [rows] = await pool.query<SeatRow[]>(`
    SELECT seat_id, seat_column, seat_row, seat_type_id, airplane_id
    FROM seat
    WHERE airplane_id = ?
    ORDER BY seat_row ASC, seat_column ASC
  `, [airplaneId]);
  return rows;
}

/**
 * Heurística de asignación:
 * - Respeta seat_type_id.
 * - Intenta agrupar por purchase_id en la misma fila; si no hay, usa filas cercanas.
 * - Si hay menores (age<18) y adultos, fuerza al menos un par adyacente menor-adulto.
 * - No pisa asientos ya asignados (seat_id no null).
 */
export function assignSeats(
  pax: PassengerWithBP[],
  seats: SeatRow[]
): Map<number, number> {
  const assigned = new Map<number, number>(); // boarding_pass_id -> seat_id
  const occupied = new Set<number>(pax.filter(x => x.seat_id != null).map(x => x.seat_id!));
  const seatsByType = new Map<number, SeatRow[]>();
  for (const s of seats) {
    if (!seatsByType.has(s.seat_type_id)) seatsByType.set(s.seat_type_id, []);
    seatsByType.get(s.seat_type_id)!.push(s);
  }
  const seatById = new Map(seats.map(s => [s.seat_id, s]));

  // Agrupar por compra
  const groups = new Map<number, PassengerWithBP[]>();
  for (const p of pax) {
    if (!groups.has(p.purchase_id)) groups.set(p.purchase_id, []);
    groups.get(p.purchase_id)!.push(p);
  }

  // Respetar seat_id ya asignados
  for (const p of pax) {
    if (p.seat_id) assigned.set(p.boarding_pass_id, p.seat_id);
  }

  for (const [, members] of groups) {
    const byType = new Map<number, PassengerWithBP[]>();
    for (const m of members) {
      if (!byType.has(m.seat_type_id)) byType.set(m.seat_type_id, []);
      byType.get(m.seat_type_id)!.push(m);
    }

    for (const [typeId, people] of byType) {
      const poolSeats = seatsByType.get(typeId) ?? [];
      const freeSeats = poolSeats.filter(s => !occupied.has(s.seat_id));
      freeSeats.sort((a, b) =>
        a.seat_row - b.seat_row || a.seat_column.localeCompare(b.seat_column)
      );

      const need = people.filter(p => !assigned.has(p.boarding_pass_id));
      if (!need.length) continue;

      // buscar bloque contiguo en misma fila
      let assignList: number[] = [];
      outer:
      for (let i = 0; i < freeSeats.length; i++) {
        const row = freeSeats[i].seat_row;
        const sameRow = freeSeats
          .filter(s => s.seat_row === row)
          .sort((a,b)=>a.seat_column.localeCompare(b.seat_column));
        for (let j = 0; j + need.length <= sameRow.length; j++) {
          const slice = sameRow.slice(j, j + need.length);
          let consecutive = true;
          for (let k = 1; k < slice.length; k++) {
            const prev = slice[k-1].seat_column.charCodeAt(0);
            const cur  = slice[k].seat_column.charCodeAt(0);
            if (cur - prev !== 1) { consecutive = false; break; }
          }
          if (consecutive && slice.every(s => !occupied.has(s.seat_id))) {
            assignList = slice.map(s => s.seat_id);
            break outer;
          }
        }
      }
      if (!assignList.length) {
        assignList = freeSeats.slice(0, need.length).map(s => s.seat_id);
      }

      const minors = need.filter(p => p.age < 18);
      const adults = need.filter(p => p.age >= 18);
      const chosenSeats = assignList.map(id => seatById.get(id)!);

      if (minors.length && adults.length) {
        let paired = false;
        for (let i = 0; i < chosenSeats.length && !paired; i++) {
          for (let j = i + 1; j < chosenSeats.length && !paired; j++) {
            if (isAdjacent(chosenSeats[i], chosenSeats[j])) {
              const m = minors.shift();
              const a = adults.shift();
              if (m && a) {
                assigned.set(m.boarding_pass_id, chosenSeats[i].seat_id);
                assigned.set(a.boarding_pass_id, chosenSeats[j].seat_id);
                occupied.add(chosenSeats[i].seat_id);
                occupied.add(chosenSeats[j].seat_id);
                assignList = assignList.filter(id => id !== chosenSeats[i].seat_id && id !== chosenSeats[j].seat_id);
                paired = true;
              }
            }
          }
        }
        // reorganizar cola restante (si quedó) en el mismo orden
        const remaining: PassengerWithBP[] = [];
        remaining.push(...minors, ...adults);
        if (remaining.length) {
          let idx = 0;
          for (const p of remaining) {
            const seatId = assignList[idx++];
            if (seatId == null) break;
            assigned.set(p.boarding_pass_id, seatId);
            occupied.add(seatId);
          }
        }
      } else {
        // asignación directa
        let idx = 0;
        for (const p of need) {
          const seatId = assignList[idx++];
          if (seatId == null) break;
          assigned.set(p.boarding_pass_id, seatId);
          occupied.add(seatId);
        }
      }
    }
  }

  return assigned;
}
