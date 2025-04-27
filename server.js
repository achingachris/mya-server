require('dotenv').config()
const express = require('express')
const mongoose = require('mongoose')
const cookieParser = require('cookie-parser')
const methodOverride = require('method-override')
const cors = require('cors')
const connectDB = require('./config/db')

// Updated Admin routes
const adminDashboardRoutes = require('./routes/admin/dashboard')
const votesDashboardRoutes = require('./routes/admin/votes')
const categoriesDashboardRoutes = require('./routes/admin/categories')
const nomineesDashboardRoutes = require('./routes/admin/nominees')
const titcketTypesDashboardRoutes = require('./routes/admin/ticketypes')
const ticketDashboardRoutes = require('./routes/admin/tickets')
const couponsDashboardRoutes = require('./routes/admin/coupons')

// API Routes
const apiRoutes = require('./routes/api')
const votingApiRoutes = require('./routes/api/voting')
const ticketsApiRoutes = require('./routes/api/tickets')
const paystackWebhook = require('./routes/api/paystack')

// Import models
const Admin = require('./models/Admin')

const bcrypt = require('bcryptjs')
const engine = require('ejs-mate')
const path = require('path')

const app = express()

// --- Middleware to capture raw body for Paystack webhooks ---
// This middleware MUST come BEFORE any express.json() or body-parser middleware
// that would parse the body for other routes.
// The path here must match the path where you mount your Paystack webhook router.
app.use(
  '/api/v2/paystack-webhook',
  express.raw({ type: 'application/json' })
)

// Middleware for parsing request bodies (JSON and URL-encoded)
// This should come AFTER the raw body middleware for webhooks
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(methodOverride('_method'))

// Serve general static files from the 'public' directory
// This will serve files like /css/style.css from public/css/style.css
app.use(express.static(path.join(__dirname, 'public')))

// Configure ejs-mate as the view engine
app.engine('ejs', engine) // Use ejs-mate
app.set('view engine', 'ejs')
// Use path.join for robustness
app.set('views', path.join(__dirname, '/views'))

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
app.use(
  '/admin',
  express.static(path.join(__dirname, 'public'))
)
// --- End of specific static serving for /admin ---

// Define your main routes AFTER static files are served

// updated admin routes
app.use('/dashboard', adminDashboardRoutes)
app.use('/dashboard/votes', votesDashboardRoutes)
app.use('/dashboard/nominees', nomineesDashboardRoutes)
app.use(
  '/dashboard/nomination-categories',
  categoriesDashboardRoutes
)
app.use(
  '/dashboard/ticket-types',
  titcketTypesDashboardRoutes
)
app.use('/dashboard/tickets', ticketDashboardRoutes)
app.use('/dashboard/coupons', couponsDashboardRoutes)

// app.use('/api', apiRoutes)

// Version 2 APIs
// Mount the webhook router AFTER the raw body middleware for its specific path
app.use('/api/v2/paystack-webhook', paystackWebhook) // Ensure this path matches the raw middleware path
app.use('/api/v2/voting', votingApiRoutes)
app.use('/api/v2/tickets', ticketsApiRoutes)

// Function to create a default admin user
const createDefaultAdmin = async () => {
  try {
    const adminCount = await Admin.countDocuments()
    if (adminCount === 0) {
      const defaultAdmin = new Admin({
        username: 'admin',
        password: 'admin123',
      })
      // Hash the password before saving (you should ideally do this in your Admin model's pre-save hook)
      const salt = await bcrypt.genSalt(10)
      defaultAdmin.password = await bcrypt.hash(
        defaultAdmin.password,
        salt
      )

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
