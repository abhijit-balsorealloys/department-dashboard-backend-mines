const mysql = require('mysql2/promise');

const db = mysql.createPool({
  host: '192.168.3.62',
  user: 'corpappdb',
  password: 'Baldev@123',
  database: 'balcorpdb',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const db1 = mysql.createPool({
  host: '80.9.2.78',
  user: 'corpappdb',
  password: 'Bal@12345',
  database: 'balpms',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function testConnections() {
  try {
    const conn1 = await db.getConnection();
    console.log('Connected to MySQL balcorpdb database.');
    conn1.release();
  } catch (err) {
    console.error('Error connecting to MySQL balcorpdb:', err);
  }

  try {
    const conn2 = await db1.getConnection();
    console.log('Connected to MySQL balpms database.');
    conn2.release();
  } catch (err) {
    console.error('Error connecting to MySQL balpms:', err);
  }
}

module.exports = {
  primaryConnection: db,
  secondaryConnection: db1,
};

