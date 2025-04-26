const express = require('express')
const router = express.Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const Admin = require('../../models/Admin')
const NominationCategory = require('../../models/NominationCategory')
const Nominee = require('../../models/Nominee')
const Vote = require('../../models/Vote')
const TicketType = require('../../models/TicketType')
const Ticket = require('../../models/Ticket')
const Coupon = require('../../models/Coupon')

const { authMiddleware } = require('../../middleware/auth')

// Ensure JWT Secret is available
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  console.error(
    'FATAL ERROR: JWT_SECRET is not defined in your .env file.'
  )
  process.exit(1) // Exit the process if JWT_SECRET is missing
}

// Login Page (GET)
router.get('/login', (req, res) =>
  res.render('login', { error: null })
)

// Login (POST) - Handle form submission
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body

    // 1. Find admin by username
    const admin = await Admin.findOne({ username })

    // 2. Check if admin exists and password is correct
    if (
      !admin ||
      !(await bcrypt.compare(password, admin.password))
    ) {
      // If not found or password doesn't match, render login with error
      return res
        .status(401)
        .render('login', {
          error: 'Invalid username or password',
        })
    }

    // 3. Generate JWT token
    const token = jwt.sign(
      { id: admin._id, username: admin.username },
      JWT_SECRET, // Use the JWT_SECRET from environment variables
      { expiresIn: '1h' } // Token expires in 1 hour (adjust as needed)
    )

    // 4. Set token as an HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true, // Make the cookie inaccessible to client-side scripts
      secure: process.env.NODE_ENV === 'production', // Use secure cookies in production (requires HTTPS)
      maxAge: 3600000, // Cookie expires in 1 hour (in milliseconds)
    })

    // 5. Redirect to the dashboard
    res.redirect('/dashboard')
  } catch (err) {
    console.error('POST /dashboard/login error:', err)
    res
      .status(500)
      .render('login', {
        error: 'Server Error during login',
      })
  }
})

// Logout
router.get('/logout', (req, res) => {
  res.clearCookie('token')
  res.redirect('/dashboard/login')
})

// --- Dashboard --- //

router.get('', authMiddleware, async (req, res) => {
  try {
    // Calculate total revenue from completed votes
    const totalRevenue = await Vote.aggregate([
      { $match: { payment_status: 'completed' } },
      {
        $group: {
          _id: null,
          total: { $sum: '$payment_amount' },
        },
      },
    ])

    // Calculate total tickets sold from TicketType model
    const totalTicketsSold = await TicketType.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: '$tickets_sold' },
        },
      },
    ])

    // Fetch counts of other models for dashboard overview
    const totalTicketTypes =
      await TicketType.countDocuments()
    const totalTickets = await Ticket.countDocuments()
    const totalCoupons = await Coupon.countDocuments()
    const totalNominees = await Nominee.countDocuments()
    const totalCategories =
      await NominationCategory.countDocuments()

    res.render('dashboard', {
      totalRevenue: totalRevenue[0]?.total || 0,
      totalTicketsSold: totalTicketsSold[0]?.total || 0,
      totalTicketTypes,
      totalTickets,
      totalCoupons,
      totalNominees,
      totalCategories,
    })
  } catch (err) {
    console.error('Dashboard route error:', err)
    res.status(500).send('Server Error')
  }
})

// Revenue endpoint (Already existed, keeping it, though dashboard shows it)
router.get('/revenue', authMiddleware, async (req, res) => {
  try {
    const totalRevenue = await Vote.aggregate([
      { $match: { payment_status: 'completed' } },
      {
        $group: {
          _id: null,
          total: { $sum: '$payment_amount' },
        },
      },
    ])
    res.json({ totalRevenue: totalRevenue[0]?.total || 0 })
  } catch (err) {
    console.error('GET /dashboard/revenue error:', err)
    res.status(500).json({ error: 'Server Error' })
  }
})

module.exports = router
