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
  const rows = await dbQuery("SELECT USER_PWD FROM balcorpdb.intranet_user_login WHERE EMPID = ?", [userid]);
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
    const results = await dbQuery("SELECT * FROM balcorpdb.intranet_user_login");
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
  try {
    const { Prod_date, Shift, Loc_Id, Face_Desc, OB_QTY_Cum, ORE_QTY, HG_QTY, MG_QTY, LG_QTY, userId } = req.body;

    const [results] = await primaryConnection.query(
      "CALL balcorpdb.SP_MINES_DAILY_EXCAVATION_PLAN_INSERT(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [Prod_date, Shift, Loc_Id, Face_Desc, OB_QTY_Cum, ORE_QTY, HG_QTY, MG_QTY, LG_QTY, userId]
    );

    return res.status(200).json({
      status: "success",
      message: "Daily Excavation Plan data Submitted successfully!",
      data: results[0],
    });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: err.message });
  }
});


//get Daily Excavation Plans
router.get("/showPlan", async (req, res) => {
  try {
    const [results] = await primaryConnection.query("CALL balcorpdb.SP_MINES_DAILY_EXCAVATION_PLAN_GET()");

    const rows = Array.isArray(results) && Array.isArray(results[0]) ? results[0] : results;
    return res.json(rows);
  } catch (err) {
    console.error("Error in fetching:", err);
    return res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});


// Geology Face Sampling
//Insert Geology Face Sampling
const uploadGeo = multer();
router.post("/geology-face-analysis", uploadGeo.none(), async (req, res) => {
  try {
    const { Prod_date, Shift, LAB_ID, Loc_Id, SAMPLE_ID, Cr2O3, FeO, Ratio, Analysis_Name, userId } = req.body;

    const [existing] = await primaryConnection.query(
      `SELECT * FROM balcorpdb.mines_geology_face_sample_analysis
       WHERE Prod_date = ? AND Shift = ? AND Loc_Id = ?`,
      [Prod_date, Shift, Loc_Id]
    );

    if (existing.length > 0) {
      console.log("Updating existing geology record:", existing[0]);
    } else {
      console.log("Inserting new geology record...");
    }

    const [results] = await primaryConnection.query(
      "CALL balcorpdb.SP_MINES_GEOLOGY_FACE_SAMPLING_ANALYSIS_INSERT_UPDATE(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [Prod_date, Shift, LAB_ID, Loc_Id, SAMPLE_ID, Cr2O3, FeO, Ratio, Analysis_Name, userId]
    );

    res.status(200).json({
      status: "success",
      message: existing.length > 0
        ? "Record updated successfully!"
        : "Record inserted successfully!",
      data: results[0],
    });

  } catch (err) {
    console.error("Server error (Geology Face Analysis Insert/Update):", err);
    res.status(500).json({ error: err.message });
  }
});


// GET: Fetch all Geology Face Sampling Analysis records
router.get("/geology-face-analysis/show", async (req, res) => {
  try {
    const [results] = await primaryConnection.query(
      "CALL balcorpdb.SP_MINES_GEOLOGY_FACE_SAMPLING_ANALYSIS_GET()"
    );
    const rows = Array.isArray(results) && Array.isArray(results[0]) ? results[0] : results;
    return res.json(rows);
  } catch (err) {
    console.error("Error in fetching Geology Face Analysis records:", err);
    return res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});


// Mines Opearations
//show Varient Types
router.get("/showVariant", async (req, res) => {
  try {
    const [results] = await primaryConnection.query("CALL balcorpdb.SP_MINES_VARIANT_MASTER_SHOW()");
    const rows = Array.isArray(results) && Array.isArray(results[0]) ? results[0] : results;
    return res.json(rows);
  } catch (err) {
    console.error("Error in /showVariant:", err);
    return res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});

// show Agency Types
router.get("/showAgency", async (req, res) => {
  try {
    const [results] = await primaryConnection.query("CALL balcorpdb.SP_MINES_AGENCY_MASTER_SHOW()");
    const rows = Array.isArray(results) && Array.isArray(results[0]) ? results[0] : results;
    return res.json(rows);
  } catch (err) {
    console.error("Error in /showAgency:", err);
    return res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});
// Monthly Excavation Plan
const uploadMonthyOre = multer();
router.post("/monthly-excavation-plan", uploadMonthyOre.none(), async (req, res) => {
  try {
    const {Prod_Month,Shift,Loc_Id,Mode,Z_Range,Grade,Tonnage,Cr2O3_Percentage,CrFe_Ratio,Remarks,UserId 
    } = req.body;

    const [results] = await primaryConnection.query(
      "CALL balcorpdb.SP_MINES_MONTHLY_EXCAVATION_PLAN_INSERT_UPDATE(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [Prod_Month, Shift, Loc_Id, Mode, Z_Range, Grade, Tonnage, Cr2O3_Percentage, CrFe_Ratio,Remarks, UserId]
    );

    return res.status(200).json({
      status: "success",
      message: "Monthly Excavation (ORE) submitted successfully!",
      data: results[0]
    });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET Monthly ORE
router.get("/monthly-excavation-plan/show", async (req, res) => {
 try {
    const [results] = await primaryConnection.query(
      "CALL balcorpdb.SP_MINES_MONTHLY_EXCAVATION_PLAN_GET()"
    );
    const rows = Array.isArray(results) && Array.isArray(results[0]) ? results[0] : results;
    return res.json(rows);
  } catch (err) {
    console.error("Error in fetching Monthly Excavation Plan records:", err);
    return res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});

//Insert Mines Daywise Excavation
const uploadExcavation = multer();

router.post("/mines-daywise-excavation", uploadExcavation.none(), async (req, res) => {
  try {
    const { Prod_date, Shift, Loc_Id, Variant, Agency, No_Of_trips, Qty, UserId } = req.body;
    console.log(UserId);

    const [existing] = await primaryConnection.query(
      `SELECT * FROM balcorpdb.mines_day_wise_excavation
       WHERE Prod_date = ? AND Shift = ? AND Loc_Id = ? AND Variant = ? AND Agency = ?`,
      [Prod_date, Shift, Loc_Id, Variant, Agency]
    );

    if (existing.length > 0) {
       console.log("Updating existing Day Wise Mines excavation record:", existing[0]);
    } else {
      console.log("Inserting new Day Wise Mines excavation record...");
    }

    const [results] = await primaryConnection.query(
      "CALL balcorpdb.SP_MINES_DAY_WISE_EXCAVATION_INSERT_UPDATE(?, ?, ?, ?, ?, ?, ?, ?)",
      [Prod_date, Shift, Loc_Id, Variant, Agency, No_Of_trips, Qty, UserId]
    );

    return res.status(200).json({
      status: "success",
      message: "Record inserted successfully!",
      data: results[0],
    });
  } catch (err) {
    console.error("Server error (Daily Excavation Insert/Update):", err);
    res.status(500).json({ error: err.message });
  }
});
router.get("/mines-daywise-excavation/show", async (req, res) => {
  try {
    const [results] = await primaryConnection.query(
      "CALL balcorpdb.SP_MINES_DAY_WISE_EXCAVATION_GET()"
    );

    const rows = Array.isArray(results) && Array.isArray(results[0]) ? results[0] : results;
    res.json(rows);
  } catch (err) {
    console.error("Error fetching Daily Excavation records:", err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});

//Mines Daywise ROM Entry
//Insert Mines Daywise ROM Entry
const uploadRomEntry = multer();

router.post("/mines-daywise-rom-entry", uploadRomEntry.none(), async (req, res) => {
  try {
    const { Prod_date, Shift, Loc_Id, Variant, No_Of_trips, Stack_no, Qty, UserId } = req.body;

    const [results] = await primaryConnection.query(
      "CALL balcorpdb.SP_MINES_DAY_WISE_ROM_ENTRY_INSERT(?, ?, ?, ?, ?, ?, ?, ?)",
      [Prod_date, Shift, Loc_Id, Variant, No_Of_trips, Stack_no, Qty, UserId] 
    );

    return res.status(200).json({
      status: "success",
      message: "Record inserted/updated successfully!",
      data: results[0],
    });
  } catch (err) {
    console.error("Server error (Daywise ROM Entry Insert/Update):", err);
    res.status(500).json({ error: err.message });
  }
});

// GET API — Fetch All Daywise ROM Entries
router.get("/mines-daywise-rom-entry/show", async (req, res) => {
  try {
    const [results] = await primaryConnection.query(
      "CALL balcorpdb.SP_MINES_DAY_WISE_ROM_ENTRY_GET()"
    );

    const rows = Array.isArray(results) && Array.isArray(results[0]) ? results[0] : results;

    const formatted = rows.map((row) => {
      let dateStr = null;

      if (row.Prod_date) {
        const d = new Date(row.Prod_date);
        dateStr = d.getFullYear() + "-" +
                  String(d.getMonth() + 1).padStart(2, "0") + "-" +
                  String(d.getDate()).padStart(2, "0");
      }
      return {
        ...row,
        Prod_date: dateStr,
      };
    });

    res.json(formatted);
  } catch (err) {
    console.error("Error fetching Daywise ROM Entry records:", err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});

//COB Production & Dispatch
// Insert / Update COBP Production
const uploadCobpProduction = multer();

router.post("/cobp-production", uploadCobpProduction.none(), async (req, res) => {
  try {
    const {
      Prod_date,
      Variant,
      Ore_Type,
      No_Of_trips,
      Stack_no,
      Qty,
      Cr2O3,
      FeO,
      Ratio,
      Analysis_Name,
      userId
    } = req.body;


    const [results] = await primaryConnection.query(
      "CALL balcorpdb.SP_MINES_COB_PRODUCTION_DESPATCH_INSERT_UPDATE(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [Prod_date,
      Variant,
      Ore_Type,
      No_Of_trips,
      Stack_no,
      Qty,
      Cr2O3,
      FeO,
      Ratio, 
      Analysis_Name,
      userId]
    );

    console.log("SP results:", results);

    res.status(200).json({
      status: "success",
      message: "COBP Production data submitted successfully!",
      data: results[0],
    });
  } catch (err) {
    console.error("Server error (COBP Production Insert/Update):", err);
    res.status(500).json({ error: err.message });
  }
});

// GET API — Fetch All COBP Production Records
router.get("/cobp-production/show", async (req, res) => {
  try {
    const [results] = await primaryConnection.query(
      "CALL balcorpdb.SP_MINES_COB_PRODUCTION_DESPATCH_GET()"
    );
    const rows = Array.isArray(results) && Array.isArray(results[0]) ? results[0] : results;
    res.json(rows);
  } catch (err) {
    console.error("Error fetching COBP Production records:", err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});

//COBP Sample Analysis
// INSERT / UPDATE COBP Sample Analysis
const uploadCobAnalysis = multer();
router.post("/cobp-analysis",  uploadCobAnalysis.none(), async (req, res) => {
  try {
    const { Prod_date, Shift, Sampling_Type, No_Of_trips, Qty, Cr2O3, FeO, Ratio, Analysis_Name, UserId } = req.body;


    const [results] = await primaryConnection.query(
      "CALL balcorpdb.SP_MINES_COBP_SAMPLE_ANALYSIS_INSERT_UPDATE(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [Prod_date, Shift, Sampling_Type, No_Of_trips, Qty, Cr2O3, FeO, Ratio, Analysis_Name, UserId ]
    );

    return res.status(200).json({
      status: "success",
      message: "Record inserted successfully!",
      data: results[0],
    });

  } catch (err) {
    console.error("Server error (COBP Sample Analysis):", err);
    res.status(500).json({ error: err.message });
  }
});
// GET COBP Sample Analysis — Fetch all records
router.get("/cobp-analysis/show", async (req, res) => {
  try {
    const [results] = await primaryConnection.query(
      "CALL balcorpdb.SP_MINES_COBP_SAMPLE_ANALYSIS_GET()"
    );

    const rows = Array.isArray(results) && Array.isArray(results[0]) ? results[0] : results;

    const formatted = rows.map((row) => {
      let dateStr = null;

      if (row.Prod_date) {
        const d = new Date(row.Prod_date);
        dateStr = d.getFullYear() + "-" +
                  String(d.getMonth() + 1).padStart(2, "0") + "-" +
                  String(d.getDate()).padStart(2, "0");
      }
      return {
        ...row,
        Prod_date: dateStr,
      };
    });

    res.json(formatted);
  } catch (err) {
    console.error("Error fetching COBP Analysis records:", err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});
     
//Equipment Engagement

// Show All Location Wise Data
router.get("/showVehicleType", async (req, res) => {
  try {
    const [results] = await primaryConnection.query("CALL balcorpdb.SP_MINES_VEHICLE_TYPE_MASTER_SHOW()");
    const rows = Array.isArray(results) && Array.isArray(results[0]) ? results[0] : results;
    return res.json(rows);
  } catch (err) {
    console.error("Error in /showVehicleType:", err);
    return res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});
//Insert/Update Equipment Engagement
const uploadEquipEngage = multer();

router.post("/equipment-engagement", uploadEquipEngage.none(), async (req, res) => {
  try {
    const { Prod_date, Shift, Loc_Id, Vehicle_Type, Plan_No_of_Ex_and_other_Eq_Engaged, Actual_No_of_Eq_Engaged, Engaged_Equipment_Name, Vehicle_Id,  Vehicle_Desc, Owner_Name, UserId } = req.body;
    const [results] = await primaryConnection.query(
      "CALL balcorpdb.SP_MINES_EQUIPMENT_ENGAGEMENTS_INSERT_UPDATE(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [Prod_date, Shift, Loc_Id, Vehicle_Type, Plan_No_of_Ex_and_other_Eq_Engaged, Actual_No_of_Eq_Engaged, Engaged_Equipment_Name, Vehicle_Id, Vehicle_Desc, Owner_Name, UserId]
    );
    return res.status(200).json({
      status: "success",
      message: "Equipment Engagement data Submitted successfully!",
      data: results[0],
    });
  } catch (err) {
    console.error("Server error (Equipment Engagement Insert/Update):", err);
    res.status(500).json({ error: err.message });
  }
});

// GET: Fetch all Equipment Engagement records
router.get("/equipment-engagement/show", async (req, res) => {
  try {
    const [results] = await primaryConnection.query(
      "CALL balcorpdb.SP_MINES_EQUIPMENT_ENGAGEMENTS_GET()"
    );
    const rows = Array.isArray(results) && Array.isArray(results[0]) ? results[0] : results;
    return res.json(rows);
  } catch (err) {   
    console.error("Error in fetching Equipment Engagement records:", err);
    return res.status(500).json({ error: err.message || "Internal Server Error" });
  } 
});
const uploadEquipStatus = multer();
router.post("/equipment-status", uploadEquipStatus.none(), async (req, res) => {
  try {
    const { Prod_date, Planned_Maintenance, Operating_Hours_on_previous_day, Output_for_the_day_Trips, Breakdown_Start, Total_Breakdown, Availability_of_equipment, Hours_utilized_for_Ore_excavation, Hours_utilized_for_OB_excavation, Idle, Utilization, Breakdown_details, Mitigation_Plan_for_Breakdown, UserId } = req.body;    
    const [results] = await primaryConnection.query(
      "CALL balcorpdb.SP_MINES_EQUIPMENT_STATUS_AUTOMOBILE_INSERT_UPDATE(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [Prod_date, Planned_Maintenance, Operating_Hours_on_previous_day, Output_for_the_day_Trips, Breakdown_Start, Total_Breakdown, Availability_of_equipment, Hours_utilized_for_Ore_excavation, Hours_utilized_for_OB_excavation, Idle, Utilization, Breakdown_details, Mitigation_Plan_for_Breakdown, UserId]  
    );
    return res.status(200).json({
      status: "success",
      message: "Equipment Status data Submitted successfully!",
      data: results[0],
    });
  } catch (err) {
    console.error("Server error (Equipment Status Insert):", err);
    res.status(500).json({ error: err.message });
  } 
});

// GET: Fetch Equipment Status records
router.get("/equipment-status/show", async (req, res) => {
  try {
    const [results] = await primaryConnection.query(
      "CALL balcorpdb.SP_MINES_EQUIPMENT_STATUS_AUTOMOBILE_GET()"
    );
    const rows = Array.isArray(results) && Array.isArray(results[0]) ? results[0] : results;
    return res.json(rows);
  } catch (err) {
    console.error("Error in fetching Equipment Status records:", err);
    return res.status(500).json({ error: err.message || "Internal Server Error" });
  } 
});

// HSD Fuel API
const uploadHsd = multer();

//Show Equipment Type
router.get("/showEquipmentType", async (req, res) => {
  try {
    const [results] = await primaryConnection.query("CALL balcorpdb.SP_MINES_EQUIPMENT_MASTER_SHOW()");
    const rows = Array.isArray(results) && Array.isArray(results[0]) ? results[0] : results;
    return res.json(rows);
  } catch (err) {
    console.error("Error in /showEquipmentType:", err);
    return res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});

// INSERT / UPDATE HSD Fuel Issued
router.post("/hsd-fuel-issued", uploadHsd.none(), async (req, res) => {
  try {
    const { Prod_Date,Shift,Equipment_Type,Make_Model,Fuel_Tank_Capacity,Average_Daily_Consumption,Fuel_Issued_Location,Operator_Driver_Name,HSD_Issued,Issued_By,Received_By,Remarks,UserId} = req.body;

    const [existing] = await primaryConnection.query(
      `SELECT * FROM balcorpdb.mines_hsd_fuel_issued
       WHERE Prod_Date = ? AND Shift = ?`,
      [Prod_Date, Shift]
    );

    const [results] = await primaryConnection.query(
      "CALL balcorpdb.SP_MINES_HSD_FUEL_ISSUED_INSERT_UPDATE(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [Prod_Date,Shift,Equipment_Type, Make_Model,Fuel_Tank_Capacity,Average_Daily_Consumption,Fuel_Issued_Location,Operator_Driver_Name,HSD_Issued,Issued_By,Received_By,Remarks,UserId]
    );

    res.status(200).json({
      status: "success",
      message: existing.length > 0
        ? "Record updated successfully!"
        : "Record inserted successfully!",
      data: results[0],
    });

  } catch (err) {
    console.error("Server error (HSD Fuel Issued Insert/Update):", err);
    res.status(500).json({ error: err.message });
  }
});

// GET: Fetch all HSD Fuel Issued Records
router.get("/hsd-fuel-issued/show", async (req, res) => {
  try {
    const [results] = await primaryConnection.query(
      "CALL balcorpdb.SP_MINES_HSD_FUEL_ISSUED_GET()"
    );

    const rows = Array.isArray(results) && Array.isArray(results[0])
      ? results[0]
      : results;

    return res.json(rows);

  } catch (err) {
    console.error("Error fetching HSD Fuel Issued records:", err);
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