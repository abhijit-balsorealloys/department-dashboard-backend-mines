const express = require("express");
const cors = require('cors');
const bodyParser = require("body-parser");
const userRoutes = require("./routes/users");

const app = express();

app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 


const PORT = 3018;

app.use(cors({
  origin: ['http://localhost:3017','http://80.9.2.78:3017'], 
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
// Middleware
app.use(bodyParser.json());

// Routes
app.use("/api/users", userRoutes);

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
