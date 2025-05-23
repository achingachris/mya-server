require('dotenv').config()
const express = require('express')
const mongoose = require('mongoose')
const cookieParser = require('cookie-parser')
const methodOverride = require('method-override')
const cors = require('cors')
const connectDB = require('./config/db')
const adminRoutes = require('./routes/admin')
const apiRoutes = require('./routes/api')
const Admin = require('./models/Admin')
const bcrypt = require('bcryptjs')
const engine = require('ejs-mate');
const path = require('path');

const app = express()

// Middleware
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(methodOverride('_method'))

// Serve general static files from the 'public' directory
// This will serve files like /css/style.css from public/css/style.css
app.use(express.static(path.join(__dirname, 'public')));


// Configure ejs-mate as the view engine
app.engine('ejs', engine); // Use ejs-mate
app.set('view engine', 'ejs')
// Use path.join for robustness
app.set('views', path.join(__dirname, '/views'));

// Routes

const allowedOrigins = [
  'http://localhost:8080',
  'http://localhost:3000',
  'https://mya-server.onrender.com',
  'https://www.mombasayouthawards.com',
]


app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true)
      if (allowedOrigins.includes(origin)) {
        return callback(null, true)
      } else {
        return callback(new Error('Not allowed by CORS'))
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
)

// --- IMPORTANT: Serve static files for the /admin path BEFORE the adminRoutes router ---
// This ensures requests like /admin/static/css/style.css are handled by serving the file
// from public/static/css/style.css instead of falling into the adminRoutes router.
app.use('/admin', express.static(path.join(__dirname, 'public')));
// --- End of specific static serving for /admin ---


// Define your main routes AFTER static files are served
app.use('/admin', adminRoutes) // This router now handles paths under /admin that are NOT static files
app.use('/api', apiRoutes)


// Function to create a default admin user
const createDefaultAdmin = async () => {
  try {
    const adminCount = await Admin.countDocuments()
    if (adminCount === 0) {
      const defaultAdmin = new Admin({
        username: 'admin',
        password: 'admin123', // Remember to change this in production!
      })
      // Hash the password before saving (you should ideally do this in your Admin model's pre-save hook)
      const salt = await bcrypt.genSalt(10);
      defaultAdmin.password = await bcrypt.hash(defaultAdmin.password, salt);

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