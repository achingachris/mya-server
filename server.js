require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const methodOverride = require('method-override');
const connectDB = require('./config/db');
const adminRoutes = require('./routes/admin');
const apiRoutes = require('./routes/api');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(methodOverride('_method'));
app.set('view engine', 'ejs');

// Routes
app.use('/admin', adminRoutes);
app.use('/api', apiRoutes);

// Connect to DB and Start Server
connectDB().then(() => {
  app.listen(process.env.PORT, () => {
    console.log(`Server running on port ${process.env.PORT}`);
  });
});