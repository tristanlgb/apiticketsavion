import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST!,
  user: process.env.MYSQL_USER!,
  password: process.env.MYSQL_PASSWORD!,
  database: process.env.MYSQL_DATABASE!,
  waitForConnections: true,
  connectionLimit: Number(process.env.MYSQL_CONN_LIMIT ?? 10),
  enableKeepAlive: (process.env.MYSQL_ENABLE_KEEPALIVE ?? 'true') === 'true',
  keepAliveInitialDelay: 0
});

export default pool;
