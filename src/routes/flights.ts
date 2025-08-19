import { Router } from 'express';
import { getFlightHeader, getPassengersForFlight, getSeatsForAirplane, assignSeats } from '../services/checkin';
import { toCamel } from '../utils/case';

const router = Router();

/**
 * GET /flights/:id/passengers
 * Respuestas:
 *  200 -> { code: 200, data: {...} }
 *  404 -> { code: 404, data: {} }
 *  400 -> { code: 400, errors: "..." }
 */
router.get('/:id/passengers', async (req, res, next) => {
  try {
    const flightId = Number(req.params.id);
    if (!Number.isFinite(flightId)) {
      return res.status(400).json({ code: 400, errors: 'invalid_flight_id' });
    }

    const header = await getFlightHeader(flightId);
    if (!header) {
      return res.status(404).json({ code: 404, data: {} });
    }

    const pax = await getPassengersForFlight(flightId);
    const seats = await getSeatsForAirplane(header.airplane_id);

    const assigned = assignSeats(pax, seats);

    const passengers = pax.map(p => ({
      passengerId: p.passenger_id,
      dni: p.dni,
      name: p.name,
      age: p.age,
      country: p.country,
      boardingPassId: p.boarding_pass_id,
      purchaseId: p.purchase_id,
      seatTypeId: p.seat_type_id,
      seatId: assigned.get(p.boarding_pass_id) ?? p.seat_id ?? null
    }));

    const payload = {
      code: 200,
      data: {
        flightId: header.flight_id,
        takeoffDateTime: header.takeoff_date_time,
        takeoffAirport: header.takeoff_airport,
        landingDateTime: header.landing_date_time,
        landingAirport: header.landing_airport,
        airplaneId: header.airplane_id,
        passengers
      }
    };

    return res.json(toCamel(payload));
  } catch (err) {
    next(err);
  }
});

export default router;
