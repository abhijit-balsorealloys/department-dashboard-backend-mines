
const mysql = require('mysql2');
const sql = require('mssql');

// SQL Server (MSSQL) config
const mssqlConfig = {
  user: "sa",
  password: 'sa#1234*',
  server: '80.9.2.75',
  database: 'SmartFace',
  port: 1433,
   options: {
    encrypt: false,
    enableArithAbort: true,
    trustServerCertificate: true
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

// MySQL config
const mysqlPool = mysql.createPool({
  host: "80.9.2.78",
  user: "corpappdb",
  password: "Bal@12345",
  database: "balcorpdb",
});

//Connect to SQL Server
async function connectToMSSQL() {
  try {
    await sql.connect(mssqlConfig);
    console.log('✅ Connected to SQL Server');
  } catch (err) {
    console.error('❌ SQL Server Connection Error:', err);
  }
}
const poolPromise = new sql.ConnectionPool(mssqlConfig)
  .connect()
  .then(pool => {
    console.log('✅ MSSQL pool connected');
    return pool;
  })
  .catch(err => {
    console.error('❌ MSSQL pool connection failed', err);
    throw err;
  });


// Connect to MySQL
mysqlPool.getConnection((err) => {
  if (err) {
    console.error("❌ MySQL Connection Error:", err);
  } else {
    console.log("✅ Connected to MySQL database.");
  }
});

// Export connections
module.exports = {
  mysqlConnection: mysqlPool,
   poolPromise,
  mssql: sql
};
