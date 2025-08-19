# Airline Check-in API (TypeScript + Express)

**Objetivo:** Implementar un único endpoint `GET /flights/:id/passengers` que consulta la base MySQL provista, aplica reglas de negocio de check‑in (clase de asiento, agrupación por compra y proximidad menor‑adulto) y expone la respuesta en **camelCase**, con manejo de **404/400** y conexión resiliente al corte por inactividad.

---

## 1) Requisitos

- Node.js 18+
- Base MySQL accesible (según enunciado)
- Variables de entorno (.env)

### Variables de entorno
Crea un archivo `.env` a partir de `.env.example` y ajusta si hace falta:
```
PORT=3000
MYSQL_HOST=mdb-test.c6vunyturrl6.us-west-1.rds.amazonaws.com
MYSQL_USER=postulaciones
MYSQL_PASSWORD=post123456
MYSQL_DATABASE=airline
MYSQL_CONN_LIMIT=10
MYSQL_ENABLE_KEEPALIVE=true
```

---

## 2) Instalación y ejecución

```bash
npm i
npm run dev  # http://localhost:3000
# build prod:
npm run build && npm start
```

Probar:
```
GET http://localhost:3000/flights/1/passengers
```

---

## 3) Estructura del proyecto

```
src/
  app.ts                # bootstrap Express y manejo de errores 400
  db.ts                 # pool mysql2 con keep-alive (reconexión rápida si hay corte)
  routes/flights.ts     # único endpoint GET /flights/:id/passengers
  services/checkin.ts   # queries + lógica de asignación de asientos
  utils/case.ts         # snake_case -> camelCase
  utils/seat-helpers.ts # helpers de asientos
  types.ts              # tipos para filas de DB
```

---

## 4) Especificación del endpoint

### Ruta
`GET /flights/:id/passengers`

### Respuestas
- **200 OK**
  ```json
  {
    "code": 200,
    "data": {
      "flightId": 1,
      "takeoffDateTime": 1717171717,
      "takeoffAirport": "EZE",
      "landingDateTime": 1717179999,
      "landingAirport": "SCL",
      "airplaneId": 2,
      "passengers": [
        {
          "passengerId": 10,
          "dni": 12345678,
          "name": "Jane Doe",
          "age": 12,
          "country": "AR",
          "boardingPassId": 77,
          "purchaseId": 999,
          "seatTypeId": 1,
          "seatId": 42
        }
      ]
    }
  }
  ```
- **404 Not Found**
  ```json
  { "code": 404, "data": {} }
  ```
- **400 Bad Request**
  ```json
  { "code": 400, "errors": "invalid_flight_id" }
  ```

---

## 5) Fuente de datos (consultas)

En `services/checkin.ts`:

- **Cabecera del vuelo**: `SELECT * FROM flight WHERE flight_id = ?`
  - De aquí salen: `flight_id`, `takeoff_date_time`, `takeoff_airport`, `landing_date_time`, `landing_airport`, `airplane_id`.
- **Pasajeros del vuelo**: join `boarding_pass` + `passenger` por `flight_id`.
  - Trae: `purchase_id`, `passenger_id`, `seat_type_id`, `seat_id` (puede venir `NULL`), `age`, etc.
- **Asientos del avión**: `seat` filtrado por `airplane_id`, ordenado por `seat_row`, `seat_column`.

---

## 6) Transformación snake_case → camelCase

- El payload se arma ya en camelCase.
- `utils/case.ts` asegura camelCase ante cualquier resto en snake: reemplaza `_*` por su versión camel en objetos y arrays de forma recursiva.

---

## 7) Lógica de negocio: asignación de asientos

Meta: respetar la **clase** (`seat_type_id`), **agrupar por compra** y garantizar que al menos un **menor** quede adyacente a un **adulto** dentro del mismo grupo si es posible.

**Paso a paso**

1. **Respeto de asignaciones existentes**  
   Si algún `boarding_pass` ya trae `seat_id` distinto de `NULL`, se **conserva** y se marca como **ocupado**.

2. **Agrupación por compra (`purchase_id`)**  
   Se procesa cada grupo y, dentro del grupo, se separa por **tipo de asiento** (`seat_type_id`).

3. **Búsqueda de bloque contiguo en misma fila**  
   Para cada subgrupo (misma clase), se intenta encontrar un **bloque de asientos libres** en la **misma fila** con **columnas consecutivas** del tamaño necesario.  
   - Si se encuentra, se usa ese bloque.  
   - Si no, se hace **best effort** tomando los primeros asientos libres de la clase, ordenados por fila y columna.

4. **Proximidad menor‑adulto**  
   Si en el subgrupo hay **menores** (`age < 18`) y **adultos**, se intenta armar al menos **una pareja adyacente** (lateral o adelante/atrás) usando dos asientos del bloque elegido. Si se logra, se asigna primero esa dupla y luego se completan los restantes.

5. **Idempotencia y no mutación**  
   No se escribe en la base. La asignación es **efímera** y calculada por request. Así, múltiples consultas no alteran el estado original de la DB.

**Notas de implementación**
- La adyacencia se define como:
  - **Lateral**: misma fila y columnas contiguas (por ejemplo, C–D).
  - **Frontal**: misma columna y filas contiguas (por ejemplo, 10C–11C).

---

## 8) Manejo de errores y códigos

- **400**: parámetros inválidos (por ejemplo, `id` no numérico).  
- **404**: vuelo inexistente.  
- **500→400**: cualquier excepción no controlada se captura y responde como `{ code: 400, errors: "..." }` para simplificar el contrato (ajustable si se prefiere 500 real).

---

## 9) Conexión MySQL resiliente

Se usa `mysql2/promise` con `enableKeepAlive` y `keepAliveInitialDelay: 0`.  
Esto ayuda ante **timeouts de inactividad (~5s)** del servidor: el pool mantiene viva la conexión y se recupera rápido si el server corta.

---

## 10) Cómo verificar con ejemplos

### cURL
```bash
curl -s http://localhost:3000/flights/1/passengers | jq .
curl -s http://localhost:3000/flights/99999/passengers | jq .  # 404
curl -s http://localhost:3000/flights/abc/passengers | jq .    # 400
```

### Postman
1. Crear request **GET** `http://localhost:3000/flights/1/passengers`.
2. Agregar **Tests** para validar `status=200` y presencia de `data.passengers`.

---

## 11) Decisiones y límites conocidos

- La heurística busca **bloques contiguos** por fila; si el avión tiene configuraciones irregulares, podría no ser óptima pero cumple el requerimiento de **agrupar** y **proximidad** menor‑adulto en la medida de lo posible.
- No se persiste la asignación generada (la base del enunciado es de **solo lectura**).
- Se respeta el `seat_type_id` del boarding pass, por lo que un grupo que mezcla clases se asigna en **subgrupos** por clase.

---

## 12) Script de build y despliegue rápido

```bash
npm run build
NODE_ENV=production node dist/app.js
```

Para contenedores, bastaría agregar un `Dockerfile` multi-stage y mapear `PORT`.

---

**Autor:** *Tristán Lenzberg Gonzalez*
