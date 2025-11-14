const express = require("express");
const xlsx = require('xlsx');
const multer = require("multer");
const crypto = require("crypto");
const router = express.Router();
const moment = require('moment');
const fs = require("fs");
const path = require("path");
const { primaryConnection } = require('../db'); // must be mysql2/promise pool

// Helper function to hash password
function hashPassword(password) {
  return crypto.createHash("sha1").update(password).digest("hex");
}

// Small helper to run queries (handles CALL result shapes)
async function dbQuery(sql, params = []) {
  const [results] = await primaryConnection.query(sql, params);
  // For CALL stored procs, results is often an array whose first element is the rows
  if (Array.isArray(results) && results.length > 0 && Array.isArray(results[0])) {
    return results[0];
  }
  if (Array.isArray(results)) return results;
  return [];
}

// Helper function to get user password from database
async function getUserPassword(userid) {
  const rows = await dbQuery(
    "SELECT USER_PWD FROM balcorpdb.intranet_user_login WHERE EMPID = ?",
    [userid]
  );
  if (rows && rows.length > 0) {
    // DB column is USER_PWD — return that
    // normalize to string for safe comparisons
    return rows[0].USER_PWD ? String(rows[0].USER_PWD) : null;
  }
  return null;
}

// Helper function to check password
async function checkPassword(userid, inputPassword) {
  const inputHash = hashPassword(inputPassword);
  const storedPassword = await getUserPassword(userid);
  if (!storedPassword) return false;
  // case-insensitive compare (hex may be uppercase/lowercase in DB)
  return storedPassword.toLowerCase() === inputHash.toLowerCase();
}

/* ----------------------------
   Routes
   ---------------------------- */

// GET all users (example)
router.get("/", async (req, res) => {
  try {
    const results = await dbQuery("SELECT * FROM balcorpdb.sap_employee_details");
    res.json(results);
  } catch (err) {
    console.error("Error fetching mines_users:", err);
    res.status(500).json({ error: "DB error" });
  }
});

// Admin login
router.post("/adminlogin", async (req, res) => {
  try {
    const { userid, password } = req.body;
    if (!userid || !password) {
      return res.status(400).json({ error: "userid and password are required!" });
    }

    const isValid = await checkPassword(userid, password);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials!" });
    }

    const inputHash = hashPassword(password);

    // Use dbQuery helper for consistent result-shape handling
    const procRows = await dbQuery("CALL balcorpdb.SP_MINES_VALIDATE_USER(?, ?)", [userid, inputHash]);

    // procRows should be an array of row objects if the proc returns rows
    const userRow = Array.isArray(procRows) && procRows.length > 0 ? procRows[0] : null;

    if (!userRow) {
      return res.status(404).json({ error: "User data not found" });
    }

    // If stored user field is USER_PWD remove it before sending response
    if (userRow.USER_PWD) {
      delete userRow.USER_PWD;
    }
    // also remove common alternative property name if present
    if (userRow.password) {
      delete userRow.password;
    }

    return res.json({ user: userRow });
  } catch (err) {
    console.error("Error in /adminlogin:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});


// Show All Location Wise Data
router.get("/showLocation", async (req, res) => {
  try {
    const [results] = await primaryConnection.query("CALL balcorpdb.SP_MINES_LOCATION_SHOW()");
    // results may be [rows, ...] or rows; pick rows if nested
    const rows = Array.isArray(results) && Array.isArray(results[0]) ? results[0] : results;
    return res.json(rows);
  } catch (err) {
    console.error("Error in /showLocation:", err);
    return res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});
// Insert Daily Excavation Plan
const uploadEx = multer();
router.post("/daily-excavation", uploadEx.none(), async (req, res) => {
  const { Prod_date, Shift, Loc_id, Face_Desc, OB_QTY_Cum, ORE_QTY, HG_QTY, MG_QTY, LG_QTY, userId } = req.body;
  try {
    mysqlConnection.query(
      "CALL balcorpdb.SP_MINES_DAILY_EXCAVATION_PLAN_INSERT(?, ?, ?, ?, ?, ?, ?, ?)",
      [Prod_date, Shift, Loc_id, Face_Desc, OB_QTY_Cum, ORE_QTY, HG_QTY, MG_QTY, LG_QTY, userId],
      async (err, results) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        return res.status(200).json({
          status: "success",
          message: "Daily Excavation Plan  data Submitted successfully!",
          data: results[0],
        });
      }
    );
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
// Show All Location Wise Data
router.get("/showLocation", async (req, res) => {
  try {
    const [results] = await primaryConnection.query("CALL balcorpdb.SP_MINES_LOCATION_SHOW()");
    // results may be [rows, ...] or rows; pick rows if nested
    const rows = Array.isArray(results) && Array.isArray(results[0]) ? results[0] : results;
    return res.json(rows);
  } catch (err) {
    console.error("Error in /showLocation:", err);
    return res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});
// Submit HR Dashboard Form
const uploadHR = multer();
router.post("/hr-dashboard", uploadHR.none(), async (req, res) => {
  const { date, plant_id, func_id, kpi_code, uom, hr_target, actual_data, userId } = req.body;
  try {
    mysqlConnection.query(
      "CALL balcorpdb.SP_KPI_DAILY_ACTUAL_INSERT(?, ?, ?, ?, ?, ?, ?, ?)",
      [date, plant_id, func_id, kpi_code, uom, hr_target, actual_data, userId],
      async (err, results) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        return res.status(200).json({
          status: "success",
          message: "Submitted successfully!",
          data: results[0],
        });
      }
    );
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// API to fetch 360 HR KPI details
router.post("/get-kpi", async (req, res) => {
  const { userId } = req.body;
  try {
    mysqlConnection.query(
      "CALL balcorpdb.SP_KPI_DAILY_ACTUAL_SHOW(?)", [userId],
      (err, results) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json(results[0]);
      }
    );
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Unable to fetch KPI Datas" });
  }
});

// Submit Finance Dashboard Form
const uploadFinance = multer();
router.post("/finance-dashboard", uploadFinance.none(), async (req, res) => {
  const { date, plant_id, func_id, kpi_code, uom, hr_target, actual_data, userId } = req.body;
  try {
    mysqlConnection.query(
      "CALL balcorpdb.SP_KPI_DAILY_ACTUAL_INSERT(?, ?, ?, ?, ?, ?, ?, ?)",
      [date, plant_id, func_id, kpi_code, uom, hr_target, actual_data, userId],
      async (err, results) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        return res.status(200).json({
          status: "success",
          message: "Submitted successfully!",
          data: results[0],
        });
      }
    );
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// API to fetch 360 Finance KPI details
router.post("/get-kpiFinance", async (req, res) => {
  const { userId } = req.body;
  try {
    mysqlConnection.query(
      "CALL balcorpdb.SP_KPI_DAILY_ACTUAL_SHOW(?)", [userId],
      (err, results) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json(results[0]);
      }
    );
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Unable to fetch KPI Datas" });
  }
});

// Submit Environment Dashboard Form
const uploadEnvironment = multer();
router.post("/environment-dashboard", uploadEnvironment.none(), async (req, res) => {
  const { date, plant_id, func_id, kpi_code, uom, hr_target, actual_data, userId } = req.body;
  try {
    mysqlConnection.query(
      "CALL balcorpdb.SP_KPI_DAILY_ACTUAL_INSERT(?, ?, ?, ?, ?, ?, ?, ?)",
      [date, plant_id, func_id, kpi_code, uom, hr_target, actual_data, userId],
      async (err, results) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        return res.status(200).json({
          status: "success",
          message: "Submitted successfully!",
          data: results[0],
        });
      }
    );
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// API to fetch 360 Environment KPI details
router.post("/get-kpiEnvironment", async (req, res) => {
  const { userId } = req.body;
  try {
    mysqlConnection.query(
      "CALL balcorpdb.SP_KPI_DAILY_ACTUAL_SHOW(?)", [userId],
      (err, results) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json(results[0]);
      }
    );
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Unable to fetch KPI Datas" });
  }
});

module.exports = router;