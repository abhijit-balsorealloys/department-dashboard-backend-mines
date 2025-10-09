
const express = require("express");
const xlsx = require('xlsx');
const multer = require("multer");
const crypto = require("crypto");
const router = express.Router();
const moment = require('moment');
const fs = require("fs");
const path = require("path");

const { mysqlConnection, poolPromise,mssql } = require('../db');


// Get all users
router.get("/", (req, res) => {
  mysqlConnection.query("SELECT * FROM SAP_EMPLOYEE_details", (err, results) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});
// Get CMS Login 
router.post("/adminlogin", async (req, res) => {
  const { userid, password } = req.body;
  const inputHash = hashPassword(password);
  if (!userid || !password) {
    return res.status(400).json({ error: "userid and password are required!" });
  }

  try {
    const isValidPassword = await checkPassword(userid, password);

    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid credentials!" });
    }
    // If password is correct, fetch additional user details
    mysqlConnection.query(
      "CALL balcorpdb.SP_KPI_DEPT_ADMIN_USER_GET(?, ?)",
      [userid, inputHash],
      (err, results) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json(results); // Return user data
      }
    );
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: "Unable to login" });
  }
});

//get user password
const getUserPassword = (userid) => {
  return new Promise((resolve, reject) => {
    mysqlConnection.query(
      "SELECT USER_PWD FROM balcorpdb.intranet_user_login WHERE EMPID = ?",
      [userid],
      (err, results) => {
        if (err) {
          return reject(err); // Handle errors
        }
        if (results.length > 0) {
          resolve(results[0].USER_PWD); // Return password if found
        } else {
          resolve(null); // Return null if no match
        }
      }
    );
  });
};
// ✅ Setup Multer storage
const uploadDir = "D:/intranet/public/images/banner";
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, uploadDir);
        },
        filename: (req, file, cb) => {
          const uniqueName = file.originalname;
          cb(null, uniqueName);
        }
    });
  const upload = multer({ storage });
// API for Insert Banner in CMS
router.post("/bannerform", upload.single("bannerImage"), async (req, res) => {
  const { heading, shortDesc } = req.body;
  const imageFile = req.file;

  if (!heading || !shortDesc) {
    return res.status(400).json({ error: "Title and Short Description are required!" });
  }

  if (!imageFile) {
    return res.status(400).json({ error: "Banner image is missing!" });
  }

  try {
    mysqlConnection.query(
      "CALL balcorpdb.SP_INTRANET_CMS_BANNER_INSERT(?, ?)",
      [heading, shortDesc],
      async (err, results) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        const dbResponse = results?.[0]?.[0];
        const dbImageName = dbResponse?.ICB_NAME;
        
        const fileExtension = path.extname(imageFile.originalname);
        const finalFileName = dbImageName +'.jpg';

        // 2. Paths
        const oldPath = imageFile.path;
        const newPath = path.join(uploadDir, finalFileName);

        // 3. Ensure uploadDir exists
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
         const width = 540;
        const height = 939;
        // 4. Rename file from temp to final name
        fs.rename(oldPath, newPath, (renameErr) => {
          if (renameErr) {
            console.error("❌ Rename error:", renameErr);
            return res.status(500).json({ error: "Failed to rename uploaded file" });
          }

          return res.status(200).json({
            status: "success",
            message: "Banner uploaded & renamed successfully!",
             dimensions: { width: 939, height: 540 },
            savedImage: `/public/images/banner/${finalFileName}`,
            data: results[0],
          });
        });
      }
    );
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
const uploadDirmd = "D:/intranet/public/images/md_message";
    const storagemd = multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, uploadDirmd);
        },
        filename: (req, file, cb) => {
          const uniqueName = file.originalname;
          cb(null, uniqueName);
        }
    });
  const uploadmd = multer({ storage: storagemd });
// API for Insert MD Message in CMS
router.post("/md-form", upload.single("Image"), async (req, res) => {
  const { heading, desc } = req.body;
  const imageFile = req.file;

  if (!heading || !desc) {
    return res.status(400).json({ error: "Title and Description are required!" });
  }

  if (!imageFile) {
    return res.status(400).json({ error: "MD image is missing!" });
  }

  try {
    mysqlConnection.query(
      "CALL balcorpdb.SP_INTRANET_CMS_MD_MESSAGES_INSERT(?, ?)",
      [heading, desc],
      async (err, results) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        const dbResponse = results?.[0]?.[0];
        const dbImageName = dbResponse?.ICMDM_NAME;
        
        const fileExtension = path.extname(imageFile.originalname);
        const finalFileName = dbImageName +'.jpg';

        // 2. Paths
        const oldPath = imageFile.path;
        const newPath = path.join(uploadDirmd, finalFileName);

        // 3. Ensure uploadDir exists
        if (!fs.existsSync(uploadDirmd)) {
          fs.mkdirSync(uploadDirmd, { recursive: true });
        }
         const width = 540;
        const height = 939;
        // 4. Rename file from temp to final name
        fs.rename(oldPath, newPath, (renameErr) => {
          if (renameErr) {
            console.error("❌ Rename error:", renameErr);
            return res.status(500).json({ error: "Failed to rename uploaded file" });
          }

          return res.status(200).json({
            status: "success",
            message: "MD Image uploaded & renamed successfully!",
             dimensions: { width: 939, height: 540 },
            savedImage: `/public/images/md_message/${finalFileName}`,
            data: results[0],
          });
        });
      }
    );
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
// Submit Current happenings Form
router.post("/current-happening", async (req, res) => {
  const { heading, desc } = req.body;

  if (!heading || !desc) {
    return res.status(400).json({ error: "Title and Description are required!" });
  }

  try {
    mysqlConnection.query(
      "CALL balcorpdb.SP_INTRANET_CMS_CURRENT_HAPPEN_INSERT(?, ?)",
      [heading, desc],
      async (err, results) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

         return res.status(200).json({
            status: "success",
            message: "Subitted successfully!",
            data: results[0],
          });
      }
    );
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
const uploadDirBNews = "D:/intranet/public/images/news";
    const storageBNews = multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, uploadDirBNews);
        },
        filename: (req, file, cb) => {
          const uniqueName = file.originalname;
          cb(null, uniqueName);
        }
    });
  const uploadBNews = multer({ storage: storageBNews });
// API for Insert BAL News in CMS
router.post("/bal-news", uploadBNews.single("Image"), async (req, res) => {
  const { heading, desc } = req.body;
  const imageFile = req.file;

  if (!heading || !desc) {
    return res.status(400).json({ error: "Title and Description are required!" });
  }

  if (!imageFile) {
    return res.status(400).json({ error: "BAL News image is missing!" });
  }

  try {
    mysqlConnection.query(
      "CALL balcorpdb.SP_INTRANET_CMS_COMP_NEWS_INSERT(?, ?)",
      [heading, desc],
      async (err, results) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        const dbResponse = results?.[0]?.[0];
        const dbImageName = dbResponse?.ICCN_NAME;
        
        const fileExtension = path.extname(imageFile.originalname);
        const finalFileName = dbImageName +'.jpg';

        // 2. Paths
        const oldPath = imageFile.path;
        const newPath = path.join(uploadDirBNews, finalFileName);

        // 3. Ensure uploadDir exists
        if (!fs.existsSync(uploadDirBNews)) {
          fs.mkdirSync(uploadDirBNews, { recursive: true });
        }
    
        // 4. Rename file from temp to final name
        fs.rename(oldPath, newPath, (renameErr) => {
          if (renameErr) {
            console.error("❌ Rename error:", renameErr);
            return res.status(500).json({ error: "Failed to rename uploaded file" });
          }

          return res.status(200).json({
            status: "success",
            message: "BAL News Image uploaded & renamed successfully!",
            dimensions: { width: 939, height: 540 },
            savedImage: `/public/images/news/${finalFileName}`,
            data: results[0],
          });
        });
      }
    );
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
// Submit BAL Stories Form
router.post("/bal-stories", async (req, res) => {
  const { heading, desc } = req.body;

  if (!heading || !desc) {
    return res.status(400).json({ error: "Title and Description are required!" });
  }
  try {
    mysqlConnection.query(
      "CALL balcorpdb.SP_INTRANET_CMS_COMP_STORIES_INSERT(?, ?)",
      [heading, desc],
      async (err, results) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

         return res.status(200).json({
            status: "success",
            message: "Subitted successfully!",
            data: results[0],
          });
      }
    );
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
// API for Insert BAL Videos in CMS
const uploadDirVideo = "D:/intranet/public/images/videos";
    const storagevideo = multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, uploadDirVideo);
        },
        filename: (req, file, cb) => {
          const uniqueName = file.originalname;
          cb(null, uniqueName);
        }
    });
    const fileFilter = (req, file, cb) => {
  const allowedTypes = ['video/mp4', 'video/x-matroska', 'video/avi', 'video/mpeg'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only video files are allowed!"), false);
  }
};
const uploadVideos = multer({ storage: storagevideo, fileFilter });
router.post("/bal-videos", uploadVideos.single("video"), async (req, res) => {
  const { heading } = req.body;
  const videoFile = req.file;

  if (!heading) {
    return res.status(400).json({ error: "Title is required!" });
  }

  if (!videoFile) {
    return res.status(400).json({ error: "BAL Video is missing!" });
  }

  try {
    mysqlConnection.query(
      "CALL balcorpdb.SP_INTRANET_CMS_COMPANY_VIDEOS_INSERT(?)",
      [heading],
      async (err, results) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        const dbResponse = results?.[0]?.[0];
        const dbVideoName = dbResponse?.ICCV_NAME;
        
        const fileExtension = path.extname(videoFile.originalname);
        const finalFileName = dbVideoName +'.MP4';

        // 2. Paths
        const oldPath = videoFile.path;
        const newPath = path.join(uploadDirVideo, finalFileName);

        // 3. Ensure uploadDir exists
        if (!fs.existsSync(uploadDirVideo)) {
          fs.mkdirSync(uploadDirVideo, { recursive: true });
        }
    
        // 4. Rename file from temp to final name
        fs.rename(oldPath, newPath, (renameErr) => {
          if (renameErr) {
            console.error("❌ Rename error:", renameErr);
            return res.status(500).json({ error: "Failed to rename uploaded file" });
          }

          return res.status(200).json({
            status: "success",
            message: "BAL Video is uploaded & renamed successfully!",
            savedImage: `/public/images/videos/${finalFileName}`,
            data: results[0],
          });
        });
      }
    );
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
const uploadDirtraining = "D:/intranet/public/images/training";
    // const storagetraining = multer.diskStorage({
    //     destination: (req, file, cb) => {
    //         cb(null, uploadDirtraining);
    //     },
    //     filename: (req, file, cb) => {
    //       const uniqueName = file.originalname;
    //       cb(null, uniqueName);
    //     }
    // });
  const uploadtraining = multer({ storage });
// API for Insert BAL Training Calendar in CMS
router.post("/training-calendar", uploadtraining.single("file"), async (req, res) => {
  const { month } = req.body;
  const imageFile = req.file;

  if (!month) {
    return res.status(400).json({ error: "Month & Year Selection is required!" });
  }

  if (!imageFile) {
    return res.status(400).json({ error: "Training Calendar is missing!" });
  }

  try {
    const workbook = xlsx.readFile(imageFile.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(worksheet);

    // Track inserted results
    const inserted = [];

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];

      const SN = `${index + 1}`;
      const ProgramCategory = row['Program Category'] || "";
      const TrainerName = row['Trainer/ Faculty Name'] || "";
      const TrainerCategory = row['Trainer Category'] || "";
      const TrainingTopic = row['Training Topic'] || "";
      const ProgramDuration = row['Program Duration (In Hrs.)'] || "";
      const Nosession = row['No. of session'] || "";
      const TargetAudience = row['Target Audience'] || "";
      const AudienceNos = row['Audience Nos'] || "";
      const Venue = row['Venue'] || "";
      const ProgramDateRaw = row['Program Date'];

      let NewDate = null;
      if (typeof ProgramDateRaw === 'number') {
        NewDate = new Date((ProgramDateRaw - 25569) * 86400 * 1000);
      } else {
        NewDate = new Date(ProgramDateRaw);
      }
      const formattedDate = moment(NewDate).format("YYYY-MM-DD");

      // Wrap query in a Promise
      const result = await new Promise((resolve, reject) => {
        mysqlConnection.query(
          "CALL balcorpdb.SP_INTRANET_TRAINING_CALENDAR_INSERT(?,?,?,?,?,?,?,?,?,?,?,?)",
          [month, SN, ProgramCategory, TrainerName, TrainerCategory, TrainingTopic, ProgramDuration, Nosession, TargetAudience, AudienceNos, Venue, formattedDate],
          (err, results) => {
            if (err) {
              return reject(err);
            }
            resolve(results);
          }
        );
      });

      inserted.push(result);
    }

    return res.status(200).json({
      status: "success",
      message: "BAL Training Calendar inserted successfully!",
      insertedRows: inserted.length,
    });

  } catch (err) {
    console.error("❌ Server error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message });
  }
});
const uploadDirthought = "D:/intranet/public/images/thought";
    const storagethought = multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, uploadDirthought);
        },
        filename: (req, file, cb) => {
          const uniqueName = file.originalname;
          cb(null, uniqueName);
        }
    });
  const uploadthought = multer({ storage: storagethought });
// API for Insert BAL Thought Of The Day in CMS
router.post("/thought", uploadthought.single("Image"), async (req, res) => {
  const { heading } = req.body;
  const imageFile = req.file;

  if (!heading) {
    return res.status(400).json({ error: "Title is required!" });
  }

  if (!imageFile) {
    return res.status(400).json({ error: "BAL Thought For The Day image is missing!" });
  }

  try {
    mysqlConnection.query(
      "CALL balcorpdb.SP_INTRANET_CMS_THOUGHT_OF_DAY_INSERT(?)",
      [heading],
      async (err, results) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        const dbResponse = results?.[0]?.[0];
        const dbImageName = dbResponse?.ICTOD_NAME;
        
        const fileExtension = path.extname(imageFile.originalname);
        const finalFileName = dbImageName +'.jpg';

        // 2. Paths
        const oldPath = imageFile.path;
        const newPath = path.join(uploadDirthought, finalFileName);

        // 3. Ensure uploadDir exists
        if (!fs.existsSync(uploadDirthought)) {
          fs.mkdirSync(uploadDirthought, { recursive: true });
        }
    
        // 4. Rename file from temp to final name
        fs.rename(oldPath, newPath, (renameErr) => {
          if (renameErr) {
            console.error("❌ Rename error:", renameErr);
            return res.status(500).json({ error: "Failed to rename uploaded file" });
          }

          return res.status(200).json({
            status: "success",
            message: "BAL Thought For the Day Image is Uploaded successfully!",
            dimensions: { width: 939, height: 540 },
            savedImage: `/public/images/thought/${finalFileName}`,
            data: results[0],
          });
        });
      }
    );
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
const uploadDirholiday = "D:/intranet/public/images/holiday_notice";
    const storageholiday = multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, uploadDirholiday);
        },
        filename: (req, file, cb) => {
          const uniqueName = file.originalname;
          cb(null, uniqueName);
        }
    });
  const uploadholiday = multer({ storage: storageholiday });
// API for Insert BAL Thought Of The Day in CMS
router.post("/holiday-notice", uploadholiday.single("Image"), async (req, res) => {
  const { heading } = req.body;
  const imageFile = req.file;

  if (!heading) {
    return res.status(400).json({ error: "Title is required!" });
  }

  if (!imageFile) {
    return res.status(400).json({ error: "BAL Holiday Notice image is missing!" });
  }

  try {
    mysqlConnection.query(
      "CALL balcorpdb.SP_INTRANET_CMS_HOLIDAY_NOTICE_INSERT(?)",
      [heading],
      async (err, results) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        const dbResponse = results?.[0]?.[0];
        const dbImageName = dbResponse?.ICHN_NAME;
        
        const fileExtension = path.extname(imageFile.originalname);
        const finalFileName = dbImageName +'.jpg';

        // 2. Paths
        const oldPath = imageFile.path;
        const newPath = path.join(uploadDirholiday, finalFileName);

        // 3. Ensure uploadDir exists
        if (!fs.existsSync(uploadDirholiday)) {
          fs.mkdirSync(uploadDirholiday, { recursive: true });
        }
    
        // 4. Rename file from temp to final name
        fs.rename(oldPath, newPath, (renameErr) => {
          if (renameErr) {
            console.error("❌ Rename error:", renameErr);
            return res.status(500).json({ error: "Failed to rename uploaded file" });
          }

          return res.status(200).json({
            status: "success",
            message: "BAL Holiday Notice Image is Uploaded successfully!",
            dimensions: { width: 939, height: 540 },
            savedImage: `/public/images/holiday_notice/${finalFileName}`,
            data: results[0],
          });
        });
      }
    );
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
const uploadDirNotice = "D:/intranet/public/images/notice";
    const storageNotice = multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, uploadDirNotice);
        },
        filename: (req, file, cb) => {
          const uniqueName = file.originalname;
          cb(null, uniqueName);
        }
    });
  const uploadNotice = multer({ storage: storageNotice });
// API for Insert BAL Notice Board in CMS
router.post("/notice", uploadNotice.single("Image"), async (req, res) => {
  const { heading } = req.body;
  const imageFile = req.file;

  if (!heading) {
    return res.status(400).json({ error: "Title is required!" });
  }

  if (!imageFile) {
    return res.status(400).json({ error: "BAL Notice File is missing!" });
  }

  try {
    mysqlConnection.query(
      "CALL balcorpdb.SP_INTRANET_CMS_NOTICE_BOARD_INSERT(?)",
      [heading],
      async (err, results) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        const dbResponse = results?.[0]?.[0];
        const dbImageName = dbResponse?.ICNB_NAME;
        
        const fileExtension = path.extname(imageFile.originalname);
        const finalFileName = dbImageName +'.pdf';

        // 2. Paths
        const oldPath = imageFile.path;
        const newPath = path.join(uploadDirNotice, finalFileName);

        // 3. Ensure uploadDir exists
        if (!fs.existsSync(uploadDirNotice)) {
          fs.mkdirSync(uploadDirNotice, { recursive: true });
        }
    
        // 4. Rename file from temp to final name
        fs.rename(oldPath, newPath, (renameErr) => {
          if (renameErr) {
            console.error("❌ Rename error:", renameErr);
            return res.status(500).json({ error: "Failed to rename uploaded file" });
          }

          return res.status(200).json({
            status: "success",
            message: "BAL Notice Board File is Uploaded successfully!",
            savedImage: `/public/images/notice/${finalFileName}`,
            data: results[0],
          });
        });
      }
    );
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
const uploadDirAward = "D:/intranet/public/images/award";
    const storageAward = multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, uploadDirAward);
        },
        filename: (req, file, cb) => {
          const uniqueName = file.originalname;
          cb(null, uniqueName);
        }
    });
  const uploadAward = multer({ storage: storageAward });
// API for Insert BAL Notice Board in CMS
router.post("/awards", uploadAward.single("Image"), async (req, res) => {
  const { heading } = req.body;
  const imageFile = req.file;

  if (!heading) {
    return res.status(400).json({ error: "Title is required!" });
  }

  if (!imageFile) {
    return res.status(400).json({ error: "BAL Employee Award Image is missing!" });
  }

  try {
    mysqlConnection.query(
      "CALL balcorpdb.SP_INTRANET_CMS_EMPLOYEE_AWARD_INSERT(?)",
      [heading],
      async (err, results) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        const dbResponse = results?.[0]?.[0];
        const dbImageName = dbResponse?.ICEA_NAME;
        
        const fileExtension = path.extname(imageFile.originalname);
        const finalFileName = dbImageName +'.jpg';

        // 2. Paths
        const oldPath = imageFile.path;
        const newPath = path.join(uploadDirAward, finalFileName);

        // 3. Ensure uploadDir exists
        if (!fs.existsSync(uploadDirAward)) {
          fs.mkdirSync(uploadDirAward, { recursive: true });
        }
    
        // 4. Rename file from temp to final name
        fs.rename(oldPath, newPath, (renameErr) => {
          if (renameErr) {
            console.error("❌ Rename error:", renameErr);
            return res.status(500).json({ error: "Failed to rename uploaded file" });
          }

          return res.status(200).json({
            status: "success",
            message: "BAL Employee Award File is Uploaded successfully!",
            savedImage: `/public/images/award/${finalFileName}`,
            data: results[0],
          });
        });
      }
    );
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
//API to change password 
router.post("/changepassword", async (req, res) => {
  const { userid ,newpassword,confirmpassword} = req.body;
   const storedPassword = await getUserPassword(userid);
   const passwordhash = hashPassword(newpassword);
   switch (true) {
    case !userid:
      return res.status(400).json({ error: "userid is required" });

    case passwordhash !== storedPassword:
      return res.status(400).json({ error: "New password must not be equal to old password" });

    case newpassword !== confirmpassword:
      return res.status(400).json({ error: "New password must be equal to confirm password" });

    default:
      break;
  }
 const confirmpasswordhash = hashPassword(confirmpassword);
  try {
   mysqlConnection.query(
      "CALL balcorpdb.SP_INTRANET_CHANGE_PASSWORD(?,?)",
      [userid,passwordhash],
      (err, results) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
         res.status(200).json({
          status: "success",
          message: "Password updated successfully",
          data: results[0]
        });// Return user data
      }
    );
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: "Unable to change password" });
  }
});
// Function to encrypt user password
const hashPassword = (password) => {
  return crypto.createHash("sha1").update(password).digest("hex");
};

// Function to check if password matches stored hash
async function checkPassword(userid, inputPassword) {
  const inputHash = hashPassword(inputPassword); // Hash input password
  const storedPassword = await getUserPassword(userid); // Fetch stored password
  if (!storedPassword) return false; // Handle case where user does not exist
  return storedPassword.toLowerCase() === inputHash; // Directly return comparison result
}
//API to fetch employee attendance
router.get("/getemployeeattendance/:P_EmpId", async (req, res) => {
  const { P_EmpId } = req.params;
  try {
    const pool = await poolPromise;
    const result = await pool
          .request()
          .input('P_EmpId', mssql.VarChar(10), P_EmpId )
          .execute('spEmpAttendance');
        return res.json(result.recordset);
      } catch (err) {
        console.error('Error in retriving store procedure data', err);
      }
});
//API to fetch training details
router.get("/gettrainingcalender", async (req, res) => {
  try {
    mysqlConnection.query(
      "CALL balcorpdb.SP_INTRANET_TRAINING_CALENDAR_GET();",
      (err, results) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json(results[0]); // Return user data
      }
    );
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: "Unable to fetch training data" });
  }
});

//API to fetch User Page Count details
router.get("/getuserpagecount/:empid", async (req, res) => {
  const { empid } = req.params;
  try {
    mysqlConnection.query(
      "CALL balcorpdb.SP_INTRANET_USER_LOGIN_HIT_SHOW(?);",
       [empid],
      (err, results) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json(results[0]); // Return user data
      }
    );
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: "Unable to fetch training data" });
  }
});
//API to Polling  Vote Insert
router.post("/pollvote", async (req, res) => {
const { userid ,poll_rating } = req.body;
  
  if (!userid || !poll_rating) {
    return res.status(400).json({ error: "userid and Poll Rating are required!" });
  }

  try {
   mysqlConnection.query(
      "CALL balcorpdb.SP_INTRANET_POLL_RESULT_INSERT(?,?)",
      [userid,poll_rating],
      (err, results) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
         res.status(200).json({
          status: "success",
          message: "Thank You For Your Vote !!",
          data: results[0]
        });// Return user data
      }
    );
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: "Unable to Insert" });
  }
});
//API to fetch User Poll Result Details
router.get("/getpollresult", async (req, res) => {
  const { empid } = req.params;
  try {
    mysqlConnection.query(
      "CALL balcorpdb.SP_INTRANET_POLL_RESULT_SHOW();",
      (err, results) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json(results[0]); // Return user data
      }
    );
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: "Unable to fetch Poll Result data" });
  }
});
//API to fetch KRA Details
router.get("/kpi/:empid", async (req, res) => {
  const { empid } = req.params;
  try {
    mysqlConnection.query(
      "CALL balcorpdb.SP_KPI_MASTER_SHOW(?)",
       [empid],
      (err, results) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json(results[0]); // Return user data
      }
    );
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: "Unable to fetch training data" });
  }
});
// Submit HR Dashboard Form
const uploadHR = multer();
router.post("/hr-dashboard", uploadHR.none(), async (req, res) => {
  const { date, plant_id, func_id, kpi_code, uom, hr_target, actual_data,userId } = req.body;
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
    console.error("❌ Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
//API to fetch 360 HR KPI details
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
    console.error("❌ Error:", err);
    res.status(500).json({ error: "Unable to fetch KPI Datas" });
  }
});
// Submit Finance Dashboard Form
const uploadFinance = multer();
router.post("/finance-dashboard", uploadFinance.none(), async (req, res) => {
  const { date, plant_id, func_id, kpi_code, uom, hr_target, actual_data,userId } = req.body;
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
    console.error("❌ Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
//API to fetch 360 Finance KPI details
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
    console.error("❌ Error:", err);
    res.status(500).json({ error: "Unable to fetch KPI Datas" });
  }
});
// Submit Environment Dashboard Form
const uploadEnvironment = multer();
router.post("/environment-dashboard", uploadEnvironment.none(), async (req, res) => {
  const { date, plant_id, func_id, kpi_code, uom, hr_target, actual_data,userId } = req.body;
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
    console.error("❌ Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
//API to fetch 360 Environment KPI details
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
    console.error("❌ Error:", err);
    res.status(500).json({ error: "Unable to fetch KPI Datas" });
  }
});
module.exports = router;
