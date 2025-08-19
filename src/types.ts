export type FlightRow = {
  flight_id: number;
  takeoff_date_time: number;
  takeoff_airport: string;
  landing_date_time: number;
  landing_airport: string;
  airplane_id: number;
};

export type PassengerRow = {
  passenger_id: number;
  dni: number;
  name: string;
  age: number;
  country: string;
};

export type BoardingPassRow = {
  boarding_pass_id: number;
  purchase_id: number;
  passenger_id: number;
  seat_type_id: number;
  seat_id: number | null;
  flight_id: number;
};

export type SeatRow = {
  seat_id: number;
  seat_column: string;
  seat_row: number;
  seat_type_id: number;
  airplane_id: number;
};
