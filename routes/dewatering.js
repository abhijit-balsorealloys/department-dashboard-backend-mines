// // backend/routes/dewateringRoutes.js
// const express = require('express');
// const router = express.Router();
// const { primaryConnection } = require('../db');


// // Helper function to unwrap stored procedure results
// function unwrapCallRows(rows) {
//   if (!rows || rows.length === 0) {
//     return [];
//   }
//   // Stored procedures return an array of result sets
//   // The first element [0] contains the actual data
//   return rows[0] || [];
// }
// // =============================================
// // GET: Fetch Active KPIs
// // =============================================
// router.get('/kpis', async (req, res) => {
//   try {
//     const [kpis] = await primaryConnection.query('CALL SP_MINES_DEWATERING_GET_ACTIVE_KPIS()');
    
//     res.status(200).json({
//       success: true,
//       data: kpis[0],
//       message: 'Active KPIs retrieved successfully'
//     });
//   } catch (error) {
//     console.error('Error fetching KPIs:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to fetch KPIs',
//       error: error.message
//     });
//   }
// });

// // =============================================
// // GET: Fetch Dewatering KPI values for the particular date 
// // =============================================
// router.get('/kpi-values', async (req, res) => {
//   try {
//     const { date, area = 'Quality' } = req.query;
    
//     if (!date) {
//       return res.status(400).json({
//         success: false,
//         message: 'Date is required'
//       });
//     }
    
//     const [results] = await primaryConnection.query(
//       'CALL SP_DEWATERING_GET_KPI_FOR_DATE(?, ?)',
//       [date, area]
//     );
    
//     const data = results[0];
    
//     // Transform to key-value pairs for easy access
//     const kpiValues = {};
//     data.forEach(row => {
//       kpiValues[row.kpi_desc] = row.calculation_value || row.text_value;
//     });
    
//     res.status(200).json({
//       success: true,
//       data: kpiValues,
//       message: 'KPI values retrieved successfully'
//     });
//   } catch (error) {
//     console.error('Error fetching KPI values:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to fetch KPI values',
//       error: error.message
//     });
//   }
// });
// // =============================================
// // GET: Fetch Dewatering Data with Pagination
// // =============================================
// router.get('/data', async (req, res) => {
//   try {
//     const { date, area = 'Quality', page = 1, pageSize = 10 } = req.query;
    
//     const [results] = await primaryConnection.query(
//       'CALL SP_MINES_DEWATERING_GET_DEWATERING_DATA(?, ?, ?, ?)',
//       [date || null, area, parseInt(page), parseInt(pageSize)]
//     );
    
//     const data = results[0];
    
//     if (data.length === 0) {
//       return res.status(200).json({
//         success: true,
//         data: [],
//         pagination: {
//           totalRecords: 0,
//           totalPages: 0,
//           currentPage: parseInt(page),
//           hasNextPage: false,
//           hasPreviousPage: false
//         }
//       });
//     }
    
//     const totalRecords = data[0].total_records;
//     const totalPages = data[0].total_pages;
//     const currentPage = data[0].current_page;
    
//     const formattedData = data.map(row => ({
//       ENTRY_ID: row.entry_id,
//       DATE: row.date,
//       AREA: row.area,
//       KPI_DESC: row.kpi_desc,
//       UOM: row.uom,
//       FREQ: row.frequency,
//       CALCULATION_TYPE: row.calculation_type,
//       CALCULATION: row.calculation,
//       USER_ID: row.user_id,
//       CREATED_AT: row.created_at,
//       UPDATED_AT: row.updated_at
//     }));
    
//     res.status(200).json({
//       success: true,
//       data: formattedData,
//       pagination: {
//         totalRecords: totalRecords,
//         totalPages: totalPages,
//         currentPage: currentPage,
//         hasNextPage: currentPage < totalPages,
//         hasPreviousPage: currentPage > 1
//       }
//     });
//   } catch (error) {
//     console.error('Error fetching dewatering data:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to fetch dewatering data',
//       error: error.message
//     });
//   }
// });

// // =============================================
// // GET: Fetch Previous Day Closing Stock
// // =============================================
// router.get('/previous-closing-stock', async (req, res) => {
//   try {
//     const { currentDate, area = 'Quality' } = req.query;
    
//     if (!currentDate) {
//       return res.status(400).json({
//         success: false,
//         message: 'Current date is required'
//       });
//     }
    
//     const [results] = await primaryConnection.query(
//       'CALL SP_MINES_DEWATERING_PREVIOUS_DAY_STOCK(?, ?, @closing_stock)',
//       [currentDate, area]
//     );
    
//     const [output] = await primaryConnection.query('SELECT @closing_stock as closing_stock');
    
//     res.status(200).json({
//       success: true,
//       closingStock: output[0].closing_stock || 0,
//       message: 'Previous day closing stock retrieved successfully'
//     });
//   } catch (error) {
//     console.error('Error fetching previous closing stock:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to fetch previous closing stock',
//       error: error.message
//     });
//   }
// });

// // =============================================
// // POST: Save/Update Dewatering Data
// // =============================================
// router.post('/data', async (req, res) => {
//   try {
//     const { date, area, kpiDesc, calculation, userId } = req.body;
    
//     if (!date || !area || !kpiDesc || !userId) {
//       return res.status(400).json({
//         success: false,
//         message: 'Missing required fields: date, area, kpiDesc, userId'
//       });
//     }
    
//     let calculationValue = null;
//     let textValue = null;
    
//     const textKpis = [
//       'Reason for Variances in Dewatering',
//       'Challenges in SLURRY discharge by EDDY PUMP',
//       'Challenges in SLURRY discharge by SLURRY PUMP'
//     ];
    
//     if (textKpis.includes(kpiDesc)) {
//       textValue = calculation;
//     } else {
//       calculationValue = parseFloat(calculation);
//       if (isNaN(calculationValue)) {
//         calculationValue = 0;
//       }
//     }
    
//     const [results] = await primaryConnection.query(
//       'CALL SP_MINES_DEWATERING_SAVE_DEWATERING_DATA(?, ?, ?, ?, ?, ?)',
//       [date, area, kpiDesc, calculationValue, textValue, userId]
//     );
    
//     const savedData = results[0][0];
    
//     res.status(200).json({
//       success: true,
//       data: {
//         ENTRY_ID: savedData.entry_id,
//         DATE: savedData.date,
//         AREA: savedData.area,
//         KPI_DESC: savedData.kpi_desc,
//         UOM: savedData.uom,
//         FREQ: savedData.frequency,
//         CALCULATION: savedData.calculation_value || savedData.text_value,
//         USER_ID: savedData.user_id
//       },
//       message: 'Data saved successfully'
//     });
//   } catch (error) {
//     console.error('Error saving dewatering data:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to save dewatering data',
//       error: error.message
//     });
//   }
// });

// // =============================================
// // POST: Calculate Formula KPI
// // =============================================
// router.post('/calculate', async (req, res) => {
//   try {
//     const { date, area, formulaKey } = req.body;
    
//     if (!date || !area || !formulaKey) {
//       return res.status(400).json({
//         success: false,
//         message: 'Missing required fields: date, area, formulaKey'
//       });
//     }
    
//     const [results] = await primaryConnection.query(
//       'CALL SP_MINES_DEWATERING_CALCULATE_KPI_VALUE(?, ?, ?, @calculated_value)',
//       [date, area, formulaKey]
//     );
    
//     const [output] = await primaryConnection.query('SELECT @calculated_value as calculated_value');
    
//     res.status(200).json({
//       success: true,
//       calculatedValue: output[0].calculated_value,
//       message: 'KPI calculated successfully'
//     });
//   } catch (error) {
//     console.error('Error calculating KPI:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to calculate KPI',
//       error: error.message
//     });
//   }
// });

// // =============================================
// // GET: Fetch Data for Specific Date and Area
// // =============================================
// router.get('/data/:date', async (req, res) => {
//   try {
//     const { date } = req.params;
//     const { area = 'Quality' } = req.query;
    
//     const [results] = await primaryConnection.query(
//       'CALL sp_get_dewatering_data(?, ?, 1, 1000)',
//       [date, area]
//     );
    
//     const data = results[0];
    
//     const formattedData = data.map(row => ({
//       ENTRY_ID: row.entry_id,
//       DATE: row.date,
//       AREA: row.area,
//       KPI_DESC: row.kpi_desc,
//       UOM: row.uom,
//       FREQ: row.frequency,
//       CALCULATION_TYPE: row.calculation_type,
//       CALCULATION: row.calculation,
//       USER_ID: row.user_id
//     }));
    
//     res.status(200).json({
//       success: true,
//       data: formattedData,
//       message: 'Data retrieved successfully'
//     });
//   } catch (error) {
//     console.error('Error fetching date-specific data:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to fetch data',
//       error: error.message
//     });
//   }
// });



// // // =============================================
// // // GET: Export data to Excel format
// // // =============================================
// // router.get('/export', async (req, res) => {
// //   try {
// //     const { startDate, endDate, area = 'Quality' } = req.query;
    
// //     let query = `
// //       SELECT 
// //         dd.date,
// //         dd.area,
// //         km.kpi_desc,
// //         km.uom,
// //         km.frequency,
// //         COALESCE(dd.calculation_value, dd.text_value) as value,
// //         dd.user_id,
// //         dd.updated_at
// //       FROM dewatering_daily_data dd
// //       JOIN dewatering_kpi_master km ON dd.kpi_id = km.kpi_id
// //       WHERE km.status = 'active'
// //     `;
    
// //     const params = [];
    
// //     if (startDate) {
// //       query += ' AND dd.date >= ?';
// //       params.push(startDate);
// //     }
    
// //     if (endDate) {
// //       query += ' AND dd.date <= ?';
// //       params.push(endDate);
// //     }
    
// //     if (area) {
// //       query += ' AND dd.area = ?';
// //       params.push(area);
// //     }
    
// //     query += ' ORDER BY dd.date DESC, km.display_order ASC';
    
// //     const [results] = await primaryConnection.query(query, params);
    
// //     res.status(200).json({
// //       success: true,
// //       data: results,
// //       message: 'Export data retrieved successfully'
// //     });
// //   } catch (error) {
// //     console.error('Error exporting data:', error);
// //     res.status(500).json({
// //       success: false,
// //       message: 'Failed to export data',
// //       error: error.message
// //     });
// //   }
// // });
// const KPI_ORDER = {
//   "Rain fall in mm": 1,
//   "Adjusted Pump Capacity": 2,
//   "Opening Stock as on Date": 3,
//   "Day Water Seepage": 4,
//   "Day Rain Water": 5,
//   "PLAN Pump Running 450 kw & 425 hp pump": 6,
//   "PLAN  Disposal": 7,
//   "ACTUAL Pump Running 450 kw & 425 hp pump": 8,
//   "ACTUAL  Disposal": 9,
//   "Variance": 10,
//   "Day Closing Stock": 11,
//   "Plan Compliance": 12,
//   "Present Water level-West Dewatering pond": 13,
//   "Present Mud/Silt level-West Dewatering pond": 14,
//   "Dewatering Pump ( Seapage water diversion) Running": 15,
//   "Reason for Variances in Dewatering": 16,
//   "Slurry Pump-1(East Side-40HP GOODWIN)": 17,
//   "Slurry Pump (East)-2": 18,
//   "Water Level (East Pit)": 19,
//   "Slurry Pump (West)-3": 20,
//   "Challenges in SLURRY discharge by SLURRY PUMP": 21,
//   "EDDY PUMP Operation - A shift": 22,
//   "EDDY PUMP Operation - B shift": 23,
//   "EDDY PUMP Operation - Day": 24,
//   "Total Discharge by EDDY": 25,
//   "Total Slurry Discharge": 26,
//   "Challenges in SLURRY discharge by EDDY PUMP": 27
// };

// // Helper function to get Sr No for a KPI
// function getSrNo(kpiDesc) {
//   if (KPI_ORDER[kpiDesc] !== undefined) {
//     return KPI_ORDER[kpiDesc];
//   }

//   const lowerKpi = kpiDesc.toLowerCase().trim();
//   for (const [key, value] of Object.entries(KPI_ORDER)) {
//     if (key.toLowerCase().trim() === lowerKpi) {
//       return value;
//     }
//   }

//   return 999;
// }

// // Helper function to format calculation value
// function formatCalculation(value, kpiDesc) {
//   if (value === null || value === undefined || value === "") {
//     return "";
//   }

//   const strVal = String(value);
//   const num = parseFloat(strVal);

//   if (isNaN(num)) {
//     return strVal;
//   }

//   if (kpiDesc === "Plan Compliance") {
//     return `${Math.round(num)}%`;
//   }

//   return num.toString();
// }

// // GET /api/mines-dewatering/view-dewatering-data
// router.get("/view-dewatering-data", async (req, res) => {
//   const { from, to } = req.query;

//   if (!from || !to) {
//     return res
//       .status(400)
//       .json({ error: "from and to dates (YYYY-MM-DD) are required" });
//   }

//   try {
//     const conn = await primaryConnection.getConnection();
//     try {
//       const [rows] = await conn.query(
//         "CALL balcorpdb.SP_MINES_DEWATERING_VIEW_RECORD(?, ?)",
//         [from, to]
//       );
//       const data = unwrapCallRows(rows);
      
//       // Text KPIs that need word wrapping
//       const textKpis = [
//         'Reason for Variances in Dewatering',
//         'Challenges in SLURRY discharge by EDDY PUMP',
//         'Challenges in SLURRY discharge by SLURRY PUMP'
//       ];
      
//       // Process data to break long text values
//       const processedData = data.map(row => {
//         if (textKpis.includes(row.KPI_DESC) && row.CALCULATION) {
//           const text = String(row.CALCULATION);
          
//           // If text length is more than 50 characters, break it
//           if (text.length > 50) {
//             row.CALCULATION = breakTextIntoLines(text, 50);
//           }
//         }
//         return row;
//       });
      
//       res.json(processedData);
//     } finally {
//       conn.release();
//     }
//   } catch (e) {
//     console.error("CALL SP_MINES_DEWATERING_VIEW_RECORD error:", e);
//     res.status(500).json({ error: "Failed to fetch records" });
//   }
// });

// // Helper function to break text into lines without breaking words
// function breakTextIntoLines(text, maxLength) {
//   if (!text || text.length <= maxLength) {
//     return text;
//   }
  
//   const words = text.split(' ');
//   const lines = [];
//   let currentLine = '';
  
//   for (const word of words) {
//     // If adding this word would exceed the limit
//     if (currentLine.length + word.length + 1 > maxLength) {
//       // If current line has content, push it
//       if (currentLine) {
//         lines.push(currentLine.trim());
//         currentLine = word;
//       } else {
//         // If a single word is longer than maxLength, add it anyway
//         lines.push(word);
//       }
//     } else {
//       // Add word to current line
//       currentLine += (currentLine ? ' ' : '') + word;
//     }
//   }
  
//   // Add the last line if there's content
//   if (currentLine) {
//     lines.push(currentLine.trim());
//   }
  
//   // Join lines with newline character
//   return lines.join('\n');
// }
// // GET /api/mines-dewatering/export
// router.get("/export", async (req, res) => {
//   const { fromDate, toDate } = req.query;

//   if (!fromDate || !toDate) {
//     return res
//       .status(400)
//       .json({ error: "from and to dates (YYYY-MM-DD) are required" });
//   }

//   try {
//     const conn = await primaryConnection.getConnection();
//     try {
//       const [rows] = await conn.query(
//         "CALL balcorpdb.SP_MINES_DEWATERING_VIEW_RECORD(?, ?)",
//         [fromDate, toDate]
//       );
//       const data = unwrapCallRows(rows);

//       // Data is already sorted by SR_NO from the stored procedure
//       const sortedData = [...data].sort((a, b) => {
//         return (a.SR_NO || 999) - (b.SR_NO || 999);
//       });

//       const header = [
//         "Sr No",
//         "Date",
//         "Area",
//         "KPI Description",
//         "UOM",
//         "Frequency",
//         "Value",
//         "Entry ID",
//         "Entry Date",
//         "Updated Date"
//       ];

//       const lines = [];
//       lines.push(header.join(","));

//       for (const r of sortedData) {
//         const srNo = r.SR_NO || getSrNo(r.KPI_DESC);
//         const calculationValue = formatCalculation(r.CALCULATION, r.KPI_DESC);

//         const line = [
//           srNo,
//           r.DATE ?? "",
//           r.AREA ?? "",
//           r.KPI_DESC ?? "",
//           r.UOM ?? "",
//           r.FREQ ?? "",
//           calculationValue,
//           r.ENTRY_ID ?? "",
//           r.ENTRY_DATE ?? "",
//           r.UPDATED_DATE ?? ""
//         ]
//           .map((v) => {
//             const s = String(v);
//             if (s.includes(",") || s.includes('"') || s.includes("\n")) {
//               return `"${s.replace(/"/g, '""')}"`;
//             }
//             return s;
//           })
//           .join(",");
//         lines.push(line);
//       }

//       const csv = lines.join("\r\n");
//       const filename = `mines_dewatering_${from}_to_${to}.csv`;

//       res.setHeader("Content-Type", "text/csv; charset=utf-8");
//       res.setHeader(
//         "Content-Disposition",
//         `attachment; filename="${filename}"`
//       );
//       res.send(csv);
//     } finally {
//       conn.release();
//     }
//   } catch (e) {
//     console.error("CALL SP_MINES_DEWATERING_VIEW_RECORD (export) error:", e);
//     res.status(500).json({ error: "Export failed" });
//   }
// });
// module.exports = router;
// backend/routes/dewateringRoutes.js
const express = require('express');
const router = express.Router();
const { primaryConnection } = require('../db');

// Helper function to unwrap stored procedure results
function unwrapCallRows(rows) {
  if (!rows || rows.length === 0) {
    return [];
  }
  return rows[0] || [];
}

// =============================================
// GET: Fetch Active KPIs
// =============================================
router.get('/kpis', async (req, res) => {
  try {
    const [kpis] = await primaryConnection.query('CALL SP_MINES_DEWATERING_GET_ACTIVE_KPIS()');
    
    res.status(200).json({
      success: true,
      data: kpis[0],
      message: 'Active KPIs retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching KPIs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch KPIs',
      error: error.message
    });
  }
});

// =============================================
// GET: Fetch Dewatering KPI values for the particular date 
// =============================================
router.get('/kpi-values', async (req, res) => {
  try {
    const { date, area = 'Quality' } = req.query;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required'
      });
    }
    
    const [results] = await primaryConnection.query(
      'CALL SP_DEWATERING_GET_KPI_FOR_DATE(?, ?)',
      [date, area]
    );
    
    const data = results[0];
    
    // Transform to key-value pairs for easy access
    const kpiValues = {};
    data.forEach(row => {
      kpiValues[row.kpi_desc] = row.calculation_value || row.text_value;
    });
    
    res.status(200).json({
      success: true,
      data: kpiValues,
      message: 'KPI values retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching KPI values:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch KPI values',
      error: error.message
    });
  }
});

// =============================================
// GET: Fetch Dewatering Data with Pagination
// =============================================
router.get('/data', async (req, res) => {
  try {
    const { date, area = 'Quality', page = 1, pageSize = 10 } = req.query;
    
    const [results] = await primaryConnection.query(
      'CALL SP_MINES_DEWATERING_GET_DEWATERING_DATA(?, ?, ?, ?)',
      [date || null, area, parseInt(page), parseInt(pageSize)]
    );
    
    const data = results[0];
    
    if (data.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        pagination: {
          totalRecords: 0,
          totalPages: 0,
          currentPage: parseInt(page),
          hasNextPage: false,
          hasPreviousPage: false
        }
      });
    }
    
    const totalRecords = data[0].total_records;
    const totalPages = data[0].total_pages;
    const currentPage = data[0].current_page;
    
    const formattedData = data.map(row => ({
      ENTRY_ID: row.entry_id,
      DATE: row.date,
      AREA: row.area,
      KPI_DESC: row.kpi_desc,
      UOM: row.uom,
      FREQ: row.frequency,
      CALCULATION_TYPE: row.calculation_type,
      CALCULATION: row.calculation,
      USER_ID: row.user_id,
      CREATED_AT: row.created_at,
      UPDATED_AT: row.updated_at
    }));
    
    res.status(200).json({
      success: true,
      data: formattedData,
      pagination: {
        totalRecords: totalRecords,
        totalPages: totalPages,
        currentPage: currentPage,
        hasNextPage: currentPage < totalPages,
        hasPreviousPage: currentPage > 1
      }
    });
  } catch (error) {
    console.error('Error fetching dewatering data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dewatering data',
      error: error.message
    });
  }
});

// =============================================
// GET: Fetch Previous Day Closing Stock
// =============================================
router.get('/previous-closing-stock', async (req, res) => {
  try {
    const { currentDate, area = 'Quality' } = req.query;
    
    if (!currentDate) {
      return res.status(400).json({
        success: false,
        message: 'Current date is required'
      });
    }
    
    const [results] = await primaryConnection.query(
      'CALL SP_MINES_DEWATERING_PREVIOUS_DAY_STOCK(?, ?, @closing_stock)',
      [currentDate, area]
    );
    
    const [output] = await primaryConnection.query('SELECT @closing_stock as closing_stock');
    
    res.status(200).json({
      success: true,
      closingStock: output[0].closing_stock || 0,
      message: 'Previous day closing stock retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching previous closing stock:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch previous closing stock',
      error: error.message
    });
  }
});

// =============================================
// POST: Save/Update Dewatering Data
// This will UPDATE existing records or INSERT new ones
// =============================================
router.post('/data', async (req, res) => {
  try {
    const { date, area, kpiDesc, calculation, userId } = req.body;
    
    if (!date || !area || !kpiDesc || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: date, area, kpiDesc, userId'
      });
    }
    
    let calculationValue = null;
    let textValue = null;
    
    const textKpis = [
      'Reason for Variances in Dewatering',
      'Challenges in SLURRY discharge by EDDY PUMP',
      'Challenges in SLURRY discharge by SLURRY PUMP'
    ];
    
    if (textKpis.includes(kpiDesc)) {
      textValue = calculation;
      console.log('Saving text KPI:', { kpiDesc, textValue });
    } else {
      calculationValue = parseFloat(calculation);
      if (isNaN(calculationValue)) {
        calculationValue = 0;
      }
      // Round to 4 decimal places to match database precision
      calculationValue = Math.round(calculationValue * 10000) / 10000;
      
      console.log('Saving numeric KPI:', { 
        kpiDesc, 
        originalValue: calculation,
        calculationValue,
        type: typeof calculationValue 
      });
    }
    
    const [results] = await primaryConnection.query(
      'CALL SP_MINES_DEWATERING_SAVE_DEWATERING_DATA(?, ?, ?, ?, ?, ?)',
      [date, area, kpiDesc, calculationValue, textValue, userId]
    );
    
    const savedData = results[0][0];
    
    console.log('Data saved/updated successfully:', {
      entry_id: savedData.entry_id,
      date: savedData.date,
      kpi_desc: savedData.kpi_desc,
      calculation_value: savedData.calculation_value,
      text_value: savedData.text_value
    });
    
    res.status(200).json({
      success: true,
      data: {
        ENTRY_ID: savedData.entry_id,
        DATE: savedData.date,
        AREA: savedData.area,
        KPI_DESC: savedData.kpi_desc,
        UOM: savedData.uom,
        FREQ: savedData.frequency,
        CALCULATION: savedData.calculation_value || savedData.text_value,
        USER_ID: savedData.user_id,
        CREATED_AT: savedData.created_at,
        UPDATED_AT: savedData.updated_at
      },
      message: 'Data saved successfully'
    });
  } catch (error) {
    console.error('Error saving dewatering data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save dewatering data',
      error: error.message
    });
  }
});

// =============================================
// POST: Calculate Formula KPI
// =============================================
router.post('/calculate', async (req, res) => {
  try {
    const { date, area, formulaKey } = req.body;
    
    if (!date || !area || !formulaKey) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: date, area, formulaKey'
      });
    }
    
    const [results] = await primaryConnection.query(
      'CALL SP_MINES_DEWATERING_CALCULATE_KPI_VALUE(?, ?, ?, @calculated_value)',
      [date, area, formulaKey]
    );
    
    const [output] = await primaryConnection.query('SELECT @calculated_value as calculated_value');
    
    res.status(200).json({
      success: true,
      calculatedValue: output[0].calculated_value,
      message: 'KPI calculated successfully'
    });
  } catch (error) {
    console.error('Error calculating KPI:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate KPI',
      error: error.message
    });
  }
});

// =============================================
// GET: Fetch Data for Specific Date and Area
// =============================================
router.get('/data/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const { area = 'Quality' } = req.query;
    
    const [results] = await primaryConnection.query(
      'CALL SP_MINES_DEWATERING_GET_DEWATERING_DATA(?, ?, 1, 1000)',
      [date, area]
    );
    
    const data = results[0];
    
    const formattedData = data.map(row => ({
      ENTRY_ID: row.entry_id,
      DATE: row.date,
      AREA: row.area,
      KPI_DESC: row.kpi_desc,
      UOM: row.uom,
      FREQ: row.frequency,
      CALCULATION_TYPE: row.calculation_type,
      CALCULATION: row.calculation,
      USER_ID: row.user_id
    }));
    
    res.status(200).json({
      success: true,
      data: formattedData,
      message: 'Data retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching date-specific data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch data',
      error: error.message
    });
  }
});

// Helper function to break text into lines without breaking words
function breakTextIntoLines(text, maxLength) {
  if (!text || text.length <= maxLength) {
    return text;
  }
  
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  
  for (const word of words) {
    if (currentLine.length + word.length + 1 > maxLength) {
      if (currentLine) {
        lines.push(currentLine.trim());
        currentLine = word;
      } else {
        lines.push(word);
      }
    } else {
      currentLine += (currentLine ? ' ' : '') + word;
    }
  }
  
  if (currentLine) {
    lines.push(currentLine.trim());
  }
  
  return lines.join('\n');
}

// =============================================
// GET: View Dewatering Data
// =============================================
router.get("/view-dewatering-data", async (req, res) => {
  const { from, to } = req.query;

  if (!from || !to) {
    return res
      .status(400)
      .json({ error: "from and to dates (YYYY-MM-DD) are required" });
  }

  try {
    const conn = await primaryConnection.getConnection();
    try {
      const [rows] = await conn.query(
        "CALL balcorpdb.SP_MINES_DEWATERING_VIEW_RECORD(?, ?)",
        [from, to]
      );
      const data = unwrapCallRows(rows);
      
      const textKpis = [
        'Reason for Variances in Dewatering',
        'Challenges in SLURRY discharge by EDDY PUMP',
        'Challenges in SLURRY discharge by SLURRY PUMP'
      ];
      
      const processedData = data.map(row => {
        if (textKpis.includes(row.KPI_DESC) && row.CALCULATION) {
          const text = String(row.CALCULATION);
          if (text.length > 50) {
            row.CALCULATION = breakTextIntoLines(text, 50);
          }
        }
        return row;
      });
      
      res.json(processedData);
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error("CALL SP_MINES_DEWATERING_VIEW_RECORD error:", e);
    res.status(500).json({ error: "Failed to fetch records" });
  }
});

const KPI_ORDER = {
  "Rain fall in mm": 1,
  "Adjusted Pump Capacity": 2,
  "Opening Stock as on Date": 3,
  "Day Water Seepage": 4,
  "Day Rain Water": 5,
  "PLAN Pump Running 450 kw & 425 hp pump": 6,
  "PLAN  Disposal": 7,
  "ACTUAL Pump Running 450 kw & 425 hp pump": 8,
  "ACTUAL  Disposal": 9,
  "Variance": 10,
  "Day Closing Stock": 11,
  "Plan Compliance": 12,
  "Present Water level-West Dewatering pond": 13,
  "Present Mud/Silt level-West Dewatering pond": 14,
  "Dewatering Pump ( Seapage water diversion) Running": 15,
  "Reason for Variances in Dewatering": 16,
  "Slurry Pump-1(East Side-40HP GOODWIN)": 17,
  "Slurry Pump (East)-2": 18,
  "Water Level (East Pit)": 19,
  "Slurry Pump (West)-3": 20,
  "Challenges in SLURRY discharge by SLURRY PUMP": 21,
  "EDDY PUMP Operation - A shift": 22,
  "EDDY PUMP Operation - B shift": 23,
  "EDDY PUMP Operation - Day": 24,
  "Total Discharge by EDDY": 25,
  "Total Slurry Discharge": 26,
  "Challenges in SLURRY discharge by EDDY PUMP": 27
};

function getSrNo(kpiDesc) {
  if (KPI_ORDER[kpiDesc] !== undefined) {
    return KPI_ORDER[kpiDesc];
  }

  const lowerKpi = kpiDesc.toLowerCase().trim();
  for (const [key, value] of Object.entries(KPI_ORDER)) {
    if (key.toLowerCase().trim() === lowerKpi) {
      return value;
    }
  }

  return 999;
}

function formatCalculation(value, kpiDesc) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const strVal = String(value);
  const num = parseFloat(strVal);

  if (isNaN(num)) {
    return strVal;
  }

  if (kpiDesc === "Plan Compliance") {
    return `${Math.round(num)}%`;
  }

  return num.toString();
}

// =============================================
// GET: Export data to Excel/CSV format
// =============================================
router.get("/export", async (req, res) => {
  const { fromDate, toDate } = req.query;

  if (!fromDate || !toDate) {
    return res
      .status(400)
      .json({ error: "fromDate and toDate (YYYY-MM-DD) are required" });
  }

  try {
    const conn = await primaryConnection.getConnection();
    try {
      const [rows] = await conn.query(
        "CALL balcorpdb.SP_MINES_DEWATERING_VIEW_RECORD(?, ?)",
        [fromDate, toDate]
      );
      const data = unwrapCallRows(rows);

      const sortedData = [...data].sort((a, b) => {
        return (a.SR_NO || 999) - (b.SR_NO || 999);
      });

      const header = [
        "Sr No",
        "Date",
        "Area",
        "KPI Description",
        "UOM",
        "Frequency",
        "Value",
        "Entry ID",
        "Entry Date",
        "Updated Date"
      ];

      const lines = [];
      lines.push(header.join(","));

      for (const r of sortedData) {
        const srNo = r.SR_NO || getSrNo(r.KPI_DESC);
        const calculationValue = formatCalculation(r.CALCULATION, r.KPI_DESC);

        const line = [
          srNo,
          r.DATE ?? "",
          r.AREA ?? "",
          r.KPI_DESC ?? "",
          r.UOM ?? "",
          r.FREQ ?? "",
          calculationValue,
          r.ENTRY_ID ?? "",
          r.ENTRY_DATE ?? "",
          r.UPDATED_DATE ?? ""
        ]
          .map((v) => {
            const s = String(v);
            if (s.includes(",") || s.includes('"') || s.includes("\n")) {
              return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
          })
          .join(",");
        lines.push(line);
      }

      const csv = lines.join("\r\n");
      const filename = `mines_dewatering_${fromDate}_to_${toDate}.csv`;

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );
      res.send(csv);
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error("CALL SP_MINES_DEWATERING_VIEW_RECORD (export) error:", e);
    res.status(500).json({ error: "Export failed" });
  }
});

module.exports = router;