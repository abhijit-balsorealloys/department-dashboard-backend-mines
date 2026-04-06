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
const uploadEx1 = multer();
router.post("/daily-excavation-repeat", uploadEx1.none(), async (req, res) => {
  try {

    const { Prod_date, Shift, Loc_Id, Face_Desc, OB_QTY_Cum, ORE_QTY, HG_QTY, MG_QTY, LG_QTY, userId } = req.body;

    const [results] = await primaryConnection.query(
      "CALL balcorpdb.SP_MINES_DAILY_EXCAVATION_PLAN_ONLY_INSERT(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [Prod_date, Shift, Loc_Id, Face_Desc, OB_QTY_Cum, ORE_QTY, HG_QTY, MG_QTY, LG_QTY, userId]
    );

    return res.status(200).json({
      status: "success",
      message: "Daily Excavation Plan data Re-Submitted successfully!",
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
    const { Prod_date, Shift, Loc_Id, Cr2O3, FeO, Ratio, Analysis_Name, userId } = req.body;

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
      "CALL balcorpdb.SP_MINES_GEOLOGY_FACE_SAMPLING_ANALYSIS_INSERT_UPDATE(?, ?, ?, ?, ?, ?, ?, ?)",
      [Prod_date, Shift, Loc_Id,  Cr2O3, FeO, Ratio, Analysis_Name, userId]
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

const uploadGeoBlock = multer();
router.post("/geology-block-analysis", uploadGeoBlock.none(), async (req, res) => {
  try {
    const { Prod_date, Loc_Id, Cr2O3,  Ratio, userId } = req.body;

    const [existing] = await primaryConnection.query(
      `SELECT * FROM balcorpdb.mines_geology_block_sample_analysis
       WHERE Prod_date = ?  AND Loc_Id = ?`,
      [Prod_date, Loc_Id]
    );

    if (existing.length > 0) {
      console.log("Updating existing geology Block Sample record:", existing[0]);
    } else {
      console.log("Inserting new geology record...");
    }

    const [results] = await primaryConnection.query(
      "CALL balcorpdb.SP_MINES_GEOLOGY_BLOCK_SAMPLING_ANALYSIS_INSERT_UPDATE(?, ?, ?, ?, ?)",
      [Prod_date, Loc_Id, Cr2O3, Ratio, userId]
    );

    res.status(200).json({
      status: "success",
      message: existing.length > 0
        ? "Record updated successfully!"
        : "Record inserted successfully!",
      data: results[0],
    });

  } catch (err) {
    console.error("Server error (Geology Block Analysis Insert/Update):", err);
    res.status(500).json({ error: err.message });
  }
});

// GET: Fetch all Geology Face Sampling Analysis records
router.get("/geology-block-analysis/show", async (req, res) => {
  try {
    const [results] = await primaryConnection.query(
      "CALL balcorpdb.SP_MINES_GEOLOGY_BLOCK_SAMPLING_ANALYSIS_GET()"
    );
    const rows = Array.isArray(results) && Array.isArray(results[0]) ? results[0] : results;
    return res.json(rows);
  } catch (err) {
    console.error("Error in fetching Geology Block Analysis records:", err);
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
    const { Prod_date, Shift, Loc_Id, Variant, Agency, No_Of_trips, Units, Qty, UserId } = req.body;
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
      "CALL balcorpdb.SP_MINES_DAY_WISE_EXCAVATION_INSERT_UPDATE(?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [Prod_date, Shift, Loc_Id, Variant, Agency, No_Of_trips, Units, Qty, UserId]
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
    const { Prod_date, Shift, Loc_Id, Variant, No_Of_trips, Stack_no, Qty, Cr2O3, FeO,
      Ratio, UserId } = req.body;

    const [results] = await primaryConnection.query(
      "CALL balcorpdb.SP_MINES_DAY_WISE_ROM_ENTRY_INSERT(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [Prod_date, Shift, Loc_Id, Variant, No_Of_trips, Stack_no, Qty, Cr2O3, FeO,
      Ratio, UserId] 
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
      Qty1,
      despatch_location,
      Cr2O3,
      FeO,
      Ratio,
      Analysis_Name,
      userId
    } = req.body;


    const [results] = await primaryConnection.query(
      "CALL balcorpdb.SP_MINES_COB_PRODUCTION_DESPATCH_INSERT_UPDATE(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [Prod_date,
      Variant,
      Ore_Type,
      No_Of_trips,
      Stack_no,
      Qty,
      Qty1,
      despatch_location,
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
    const { Prod_date, Shift, Sampling_Type,  Qty, Cr2O3, FeO, Ratio, Analysis_Name, UserId } = req.body;


    const [results] = await primaryConnection.query(
      "CALL balcorpdb.SP_MINES_COBP_SAMPLE_ANALYSIS_INSERT_UPDATE(?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [Prod_date, Shift, Sampling_Type, Qty, Cr2O3, FeO, Ratio, Analysis_Name, UserId ]
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
     
//Tipper Management

const uploadTipper = multer();
router.post("/tipper-management",  uploadTipper.none(), async (req, res) => {
  try {
    const { Prod_date, Shift, Loc_Id, type_work, ore_quantity, lg_quantity, ob_quantity, silt_quantity, boulder, tailing, feed_to_cobp, equipment_name, omr, cmr, running_hours, deviation_hours, late_start, tiffin, breakdown, maintenance, hsd_shortage, strike, idle_requ_basic, safety_talk, dump_jam, lmv_availability, illumination_problem, absence_operator, idle, tipper_shortage, early_close, not_operation, rain_slippery, trains_truck, imfa_blasting, face_preparation, job_allocation, other, total, remark,  UserId } = req.body;

    const [results] = await primaryConnection.query(
      "CALL balcorpdb.SP_MINES_TIPPER_MANAGEMENT_INSERT_UPDATE(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [Prod_date, Shift, Loc_Id, type_work, ore_quantity, lg_quantity, ob_quantity, silt_quantity, boulder, tailing, feed_to_cobp, equipment_name, omr, cmr, running_hours, deviation_hours, late_start, tiffin, breakdown, maintenance, hsd_shortage, strike, idle_requ_basic, safety_talk, dump_jam, lmv_availability, illumination_problem, absence_operator, idle, tipper_shortage, early_close, not_operation, rain_slippery, trains_truck, imfa_blasting, face_preparation, job_allocation, other, total, remark, 2738]
    );

    return res.status(200).json({
      status: "success",
      message: "Record Saved successfully!",
      data: results[0],
    });

  } catch (err) {
    console.error("Server error (Tipper Management):", err);
    res.status(500).json({ error: err.message });
  }
});
// GET Tipper Management — Fetch all records
router.get("/tipper-management/show", async (req, res) => {
  try {
    const [results] = await primaryConnection.query(
      "CALL balcorpdb.SP_MINES_TIPPER_MANAGEMENT_GET()"
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
    console.error("Error fetching Tipper Management records:", err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});

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
    const { Prod_date, Vehicle_Type, No_of_vehicle, Planned_Maintenance, Operating_Hours_on_previous_day, Output_for_the_day_Trips, Breakdown_Start, Total_Breakdown, Availability_of_equipment, Hours_utilized_for_Ore_excavation, Hours_utilized_for_OB_excavation, Idle, Utilization, Breakdown_details, Mitigation_Plan_for_Breakdown, UserId } = req.body;    
    const [results] = await primaryConnection.query(
      "CALL balcorpdb.SP_MINES_EQUIPMENT_STATUS_AUTOMOBILE_INSERT_UPDATE(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [Prod_date, Vehicle_Type, No_of_vehicle, Planned_Maintenance, Operating_Hours_on_previous_day, Output_for_the_day_Trips, Breakdown_Start, Total_Breakdown, Availability_of_equipment, Hours_utilized_for_Ore_excavation, Hours_utilized_for_OB_excavation, Idle, Utilization, Breakdown_details, Mitigation_Plan_for_Breakdown, UserId]  
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
router.post("/handover/", async (req, res) => {

  const {
    Prod_date, Shift, equipmentType,
    vehicleType, vehicleNo, department,
    hmrStart, hmrEnd,
    handoverName, handoverEmpId,
    takeoverName, takeoverEmpId,
    visualInspectionStatus,      visualInspectionRemarks,
    engineConditionStatus,       engineConditionRemarks,
    engineOilLevelStatus,        engineOilLevelRemarks,
    coolantLevelStatus,          coolantLevelRemarks,
    hydraulicOilStatus,          hydraulicOilRemarks,
    transmissionOilStatus,       transmissionOilRemarks,
    fuelLevelStatus,             fuelLevelRemarks,
    batteryConditionStatus,      batteryConditionRemarks,
    tyresConditionStatus,        tyresConditionRemarks,
    tyrePressureStatus,          tyrePressureRemarks,
    brakesConditionStatus,       brakesConditionRemarks,
    steeringConditionStatus,     steeringConditionRemarks,
    seatBeltConditionStatus,     seatBeltConditionRemarks,
    lightsConditionStatus,       lightsConditionRemarks,
    hornConditionStatus,         hornConditionRemarks,
    ACconditionStatus,           ACconditionRemarks,
    doorConditionStatus,         doorConditionRemarks,
    indicatorsConditionStatus,   indicatorsConditionRemarks,
    reverseAlarmConditionStatus, reverseAlarmConditionRemarks,
    wipersConditionStatus,       wipersConditionRemarks,
    mirrorsConditionStatus,      mirrorsConditionRemarks,
    windshieldConditionStatus,   windshieldConditionRemarks,
    safetyGuardsStatus,          safetyGuardsRemarks,
    fireExtinguisherStatus,      fireExtinguisherRemarks,
    firstAidKitStatus,           firstAidKitRemarks,
    trailTestRunStatus,          trailTestRunRemarks,
    leakageStatus,               leakageRemarks,
    unusualNoiseStatus,          unusualNoiseRemarks,
    overallCondition,            observation,
  } = req.body;

  // Loc_Id is INT NOT NULL — parse it or reject early
  const Loc_Id = req.body.Loc_Id ? parseInt(req.body.Loc_Id) : null;
  if (!Loc_Id) {
    return res.status(400).json({ error: "Location is required." });
  }

  // Sanitize helpers
  const c    = (v) => (v === "" || v === undefined) ? null : v;
  const cInt = (v) => (v === "" || v === undefined || v === null) ? null : parseInt(v);

  const USERID = cInt(req.body.USERID) || 1;

  // ── 72 params matching SP exactly ──────────────────────────────────────
  const params = [
    c(Prod_date),         // 01 p_Prod_date
    c(Shift),             // 02 p_Shift
    Loc_Id,               // 03 p_Loc_Id          (INT)
    c(equipmentType),     // 04 p_equipmentType    ← was missing before!
    c(vehicleType),       // 05 p_vehicleType
    c(vehicleNo),         // 06 p_vehicleNo
    c(department),        // 07 p_department
    c(hmrStart),          // 08 p_hmrStart
    c(hmrEnd),            // 09 p_hmrEnd
    c(handoverName),      // 10 p_handoverName
    c(handoverEmpId),     // 11 p_handoverEmpId
    c(takeoverName),      // 12 p_takeoverName
    c(takeoverEmpId),     // 13 p_takeoverEmpId

    // Checklist — 28 items × 2 = 56 params (14–69)
    c(visualInspectionStatus),      c(visualInspectionRemarks),      // 14-15
    c(engineConditionStatus),       c(engineConditionRemarks),        // 16-17
    c(engineOilLevelStatus),        c(engineOilLevelRemarks),         // 18-19
    c(coolantLevelStatus),          c(coolantLevelRemarks),           // 20-21
    c(hydraulicOilStatus),          c(hydraulicOilRemarks),           // 22-23
    c(transmissionOilStatus),       c(transmissionOilRemarks),        // 24-25
    c(fuelLevelStatus),             c(fuelLevelRemarks),              // 26-27
    c(batteryConditionStatus),      c(batteryConditionRemarks),       // 28-29
    c(tyresConditionStatus),        c(tyresConditionRemarks),         // 30-31
    c(tyrePressureStatus),          c(tyrePressureRemarks),           // 32-33
    c(brakesConditionStatus),       c(brakesConditionRemarks),        // 34-35
    c(steeringConditionStatus),     c(steeringConditionRemarks),      // 36-37
    c(seatBeltConditionStatus),     c(seatBeltConditionRemarks),      // 38-39
    c(lightsConditionStatus),       c(lightsConditionRemarks),        // 40-41
    c(hornConditionStatus),         c(hornConditionRemarks),          // 42-43
    c(ACconditionStatus),           c(ACconditionRemarks),            // 44-45
    c(doorConditionStatus),         c(doorConditionRemarks),          // 46-47
    c(indicatorsConditionStatus),   c(indicatorsConditionRemarks),    // 48-49
    c(reverseAlarmConditionStatus), c(reverseAlarmConditionRemarks),  // 50-51
    c(wipersConditionStatus),       c(wipersConditionRemarks),        // 52-53
    c(mirrorsConditionStatus),      c(mirrorsConditionRemarks),       // 54-55
    c(windshieldConditionStatus),   c(windshieldConditionRemarks),    // 56-57
    c(safetyGuardsStatus),          c(safetyGuardsRemarks),           // 58-59
    c(fireExtinguisherStatus),      c(fireExtinguisherRemarks),       // 60-61
    c(firstAidKitStatus),           c(firstAidKitRemarks),            // 62-63
    c(trailTestRunStatus),          c(trailTestRunRemarks),           // 64-65
    c(leakageStatus),               c(leakageRemarks),                // 66-67
    c(unusualNoiseStatus),          c(unusualNoiseRemarks),           // 68-69

    // Footer
    c(overallCondition),  // 70 p_overallCondition
    c(observation),       // 71 p_observation
    USERID,               // 72 p_USERID           (INT)
  ];

  // Guard — fail fast if count drifts
  if (params.length !== 72) {
    console.error(`❌ Param count mismatch! Expected 72, got ${params.length}`);
    return res.status(500).json({ error: `Param count mismatch: expected 72, got ${params.length}` });
  }

  const placeholders = params.map(() => "?").join(", ");

  try {
    primaryConnection.query(
      `CALL balcorpdb.SP_MINES_HANDOVER_TAKEOVER_INSERT_UPDATE(${placeholders})`,
      params,
      (err, results) => {
        if (err) {
          console.error("❌ Handover SP error:", err.message);
          return res.status(500).json({ error: err.message });
        }
        res.status(200).json({ message: "Submitted successfully!" });
      }
    );
  } catch (err) {
    console.error("❌ Server error:", err.message);
    res.status(500).json({ error: "Internal server error: " + err.message });
  }
});
router.get("/showHandover", async (req, res) => {
  try {
    const [rows] = await primaryConnection.query("CALL balcorpdb.SP_MINES_HANDOVER_TAKEOVER_GET()");

    // MySQL returns nested array
    res.json(rows[0]); // ✅ IMPORTANT
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});
router.post("/cobpHandover/", async (req, res) => {
  try {
    const data = req.body;

    const c = (v) => (v === "" || v === undefined) ? null : v;
    const USERID = data.USERID ? parseInt(data.USERID) : 1;

    // ================= BASIC =================
    const baseParams = [
      c(data.Prod_date),
      c(data.Shift),
      c(data.handoverShiftIC),
      c(data.handoverEmpId),
      c(data.takeoverShiftIC),
      c(data.takeoverEmpId),
      
    ];

    // ================= CHECKLIST KEYS =================
    const checklistKeys = [
      "beltFeeder1","beltConveyor1","beltScaleSystem","dryVibratingScreen",
      "jawCrusher","hammerMill","beltConveyor2","wetVibratingScreen",
      "rodMill1","rodMill2",
      "spiral","slurryPump2","slurryPump3","slurryPump4","slurryPump5",
      "slurryPump6","slurryPump7","slurryPump8","slurryPump9","slurryPump10",
      "slurryPump11","slurryPump12","slurryPump13",
      "verticalSlurryPump1","verticalSlurryPump2","verticalSlurryPump3",
      "hydroCyclone","freshWaterPump1","freshWaterPump2",
      "shakingTable1","shakingTable2","shakingTable3",
      "shakingTable4","shakingTable5","shakingTable6",
      "weldingMachine1","weldingMachine2","weldingMachine3",
      "ups3kva","upsNewPlc",
      "industrialVacuumCleaner",
      "benchGrinder","ag4GrindingMachine",
      "hydraulicJack90t",
      "benchVice",
      "chainPulley1t","chainPulley3t",
      "gearBox200",
      "metsoHm75Pump","metsoHm100Pump",
      "akay32SlurryPump","akay43SlurryPump",
      "kirloskar25125Pump","metsoVspPump",
    ];

    // ================= BUILD CHECKLIST PARAMS =================
    const checklistParams = [];

    checklistKeys.forEach((key) => {
      checklistParams.push(
        c(data[`${key}Status`]),
        c(data[`${key}Remarks`])
      );
    });

    // ================= FINAL PARAMS =================
    const params = [
      ...baseParams,
      ...checklistParams,
      USERID
    ];

    // Expected count = 6 base + (N * 2) + 1
    const expected = 6 + (checklistKeys.length * 2) + 1;

    if (params.length !== expected) {
      console.error(`❌ Param mismatch: expected ${expected}, got ${params.length}`);
      return res.status(500).json({
        error: `Param mismatch: expected ${expected}, got ${params.length}`
      });
    }

    const placeholders = params.map(() => "?").join(", ");

    // ================= CALL STORED PROCEDURE =================
    primaryConnection.query(
      `CALL balcorpdb.SP_MINES_HANDOVER_TAKEOVER_COBP_INSERT_UPDATE(${placeholders})`,
      params,
      (err, results) => {
        if (err) {
          console.error("❌ COBP SP error:", err.message);
          return res.status(500).json({ error: err.message });
        }

        res.status(200).json({ message: "COBP Submitted successfully!" });
      }
    );

  } catch (err) {
    console.error("❌ Server error:", err.message);
    res.status(500).json({ error: "Internal server error: " + err.message });
  }
});
router.get("/showCOBPHandover", async (req, res) => {
  try {
    const [rows] = await primaryConnection.query("CALL balcorpdb.SP_MINES_HANDOVER_TAKEOVER_COBP_GET()");

    // MySQL returns nested array
    res.json(rows[0]); // ✅ IMPORTANT
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});
router.post("/electricalHandover/", async (req, res) => {
  try {
    const data = req.body;

    const c = (v) => (v === "" || v === undefined) ? null : v;
    const USERID = data.USERID ? parseInt(data.USERID) : 1;

    // ================= BASIC =================
    const baseParams = [
      c(data.Prod_date),
      c(data.Shift),
      c(data.handoverShiftIC),
      c(data.handoverEmpId),
      c(data.takeoverShiftIC),
      c(data.takeoverEmpId),
    ];

    // ================= CHECKLIST KEYS =================
    const checklistKeys = [

      // AIR CONDITIONER
      ...Array.from({ length: 55 }, (_, i) => `airConditioner${i + 1}`),

      // CHARGING MACHINE
      "evChargingMachine1","evChargingMachine2","evChargingMachine3","evChargingMachine4",

      // DG
      "dgSet1","dgSet2","dgSet3",

      // LIGHTING
      "lightingTower1","lightingTower2","lightingTower3","lightingTower4","lightingTower5",
      "movableLightingTower1","movableLightingTower2","movableLightingTower3","movableLightingTower4",

      // MOTOR
      "motor1","motor2","motor3","motor4","motor5","motor6","motor7","motor8",

      // PANEL
      ...Array.from({ length: 20 }, (_, i) => `panel${i + 1}`),

      // OTHER
      "ACservice","solarSystem6kw",

      // TRANSFORMER
      "transformer500kva",
      "transformerOutdoorPotential",
      "transformerOutdoorCurrent",
      "transformerPower",
      "transformer16kva1","transformer16kva2","transformer16kva3","transformer16kva4","transformer16kva5",

      // UPS
      "ups3kva","ups3kva2","ups3kva3","ups3kva4","ups3kva5",

      // WATER COOLER
      "waterCoolerCanteen","waterCoolerStaffMess","waterCoolerDieselDispensing",
      "waterCoolerViewPoint","waterCoolerGarage",

      // TREE CUTTER
      "treeGrassCutter",

      // VCB
      "vcbOutdoor33kv","vcbOutdoor33kv2",
    ];

    // ================= BUILD CHECKLIST PARAMS =================
    const checklistParams = [];

    checklistKeys.forEach((key) => {
      checklistParams.push(
        c(data[`${key}Status`]),
        c(data[`${key}Remarks`])
      );
    });

    // ================= FINAL PARAMS =================
    const params = [
      ...baseParams,
      ...checklistParams,
      USERID
    ];

    const expected = 6 + (checklistKeys.length * 2) + 1;

    if (params.length !== expected) {
      console.error(`❌ Param mismatch: expected ${expected}, got ${params.length}`);
      return res.status(500).json({
        error: `Param mismatch: expected ${expected}, got ${params.length}`
      });
    }

    const placeholders = params.map(() => "?").join(", ");

    primaryConnection.query(
      `CALL balcorpdb.SP_MINES_HANDOVER_TAKEOVER_ELECTRICAL_INSERT_UPDATE(${placeholders})`,
      params,
      (err, results) => {
        if (err) {
          console.error("❌ Electrical SP error:", err.message);
          return res.status(500).json({ error: err.message });
        }
        res.status(200).json({ message: "Electrical Handover Submitted successfully!" });
      }
    );

  } catch (err) {
    console.error("❌ Server error:", err.message);
    res.status(500).json({ error: "Internal server error: " + err.message });
  }
});
router.get("/showElectricalHandover", async (req, res) => {
  try {
    const [rows] = await primaryConnection.query("CALL balcorpdb.SP_MINES_HANDOVER_TAKEOVER_ELECTRICAL_GET()");

    res.json(rows[0]); 
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});
module.exports = router;