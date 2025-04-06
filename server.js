require('dotenv').config()
const express = require('express')
const mongoose = require('mongoose')
const cookieParser = require('cookie-parser')
const methodOverride = require('method-override')
const cors = require('cors');
const connectDB = require('./config/db')
const adminRoutes = require('./routes/admin')
const apiRoutes = require('./routes/api')
const Admin = require('./models/Admin')
const bcrypt = require('bcryptjs')

const app = express()

// Middleware
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(methodOverride('_method'))
// app.use(cors({
//   origin: 'http://localhost:8080',
//   credentials: true,
// }));
app.use(cors());
app.set('view engine', 'ejs')

// Routes
app.use('/admin', adminRoutes)
app.use('/api', apiRoutes)

// Function to create a default admin user
const createDefaultAdmin = async () => {
  try {
    const adminCount = await Admin.countDocuments()
    if (adminCount === 0) {
      const defaultAdmin = new Admin({
        username: 'admin',
        password: 'admin123',
      })
      await defaultAdmin.save()
      console.log(
        'Default admin created: username=admin, password=admin123'
      )
    } else {
      console.log(
        'Admin user already exists, skipping default admin creation'
      )
    }
  } catch (err) {
    console.error('Error creating default admin:', err)
  }
}

// Connect to DB, create default admin, and start server
connectDB().then(async () => {
  await createDefaultAdmin()
  app.listen(process.env.PORT, () => {
    console.log(
      `Server running on port ${process.env.PORT}`
    )
  })
})
