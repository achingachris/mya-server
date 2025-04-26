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

// Login Page
router.get('/login', (req, res) =>
  res.render('login', { error: null })
)

// Logout
router.get('/logout', (req, res) => {
  res.clearCookie('token')
  res.redirect('/admin/login')
})

// --- Dashboard --- //

router.get(
  '',
  authMiddleware,
  async (req, res) => {
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
  }
)

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
    console.error('GET /admin/revenue error:', err)
    res.status(500).json({ error: 'Server Error' })
  }
})


module.exports = router