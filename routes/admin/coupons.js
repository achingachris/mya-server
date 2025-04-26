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

const Paystack = require('paystack-api')(
  process.env.PAYSTACK_SECRET_KEY
)
const { v4: uuidv4 } = require('uuid')

const { authMiddleware } = require('../../middleware/auth')
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY
const BASE_URL = process.env.FRONTEND_URL

if (!PAYSTACK_SECRET_KEY || !BASE_URL) {
  console.error(
    'FATAL ERROR: PAYSTACK_SECRET_KEY and FRONTEND_URL must be defined in your .env file.'
  )
  process.exit(1)
}

// List Coupons
router.get('/coupons', authMiddleware, async (req, res) => {
  try {
    // Optionally populate applicable_ticket_type if you want to display its details
    const coupons = await Coupon.find().populate(
      'applicable_ticket_type'
    )
    // Assuming views/admin/coupons/index.ejs
    res.render('coupons/index', { coupons })
  } catch (err) {
    console.error('GET /admin/coupons error:', err)
    res.status(500).send('Server Error')
  }
})

// New Coupon Form
router.get(
  '/coupons/new',
  authMiddleware,
  async (req, res) => {
    try {
      // Need ticket types if the coupon can be restricted to one
      const ticketTypes = await TicketType.find()
      // Assuming views/admin/coupons/new.ejs
      res.render('coupons/new', { ticketTypes })
    } catch (err) {
      console.error('GET /admin/coupons/new error:', err)
      res.status(500).send('Server Error')
    }
  }
)

// Create Coupon
router.post(
  '/coupons',
  authMiddleware,
  async (req, res) => {
    try {
      // Basic validation for required fields from schema (code, type, value, expiry_date)
      if (
        !req.body.code ||
        !req.body.type ||
        req.body.value === undefined ||
        !req.body.expiry_date
      ) {
        return res
          .status(400)
          .send('Missing required fields for coupon')
      }
      // Ensure expiry_date is a valid Date
      if (isNaN(new Date(req.body.expiry_date).getTime())) {
        return res
          .status(400)
          .send('Invalid expiry date format')
      }
      // TODO: Add server-side validation for coupon code uniqueness

      await Coupon.create(req.body)
      res.redirect('/admin/coupons')
    } catch (err) {
      console.error('POST /admin/coupons error:', err)
      // Handle potential duplicate code errors etc.
      res.status(500).send('Error creating coupon')
    }
  }
)

// Edit Coupon Form
router.get(
  '/coupons/:id/edit',
  authMiddleware,
  async (req, res) => {
    try {
      const coupon = await Coupon.findById(req.params.id)
      if (!coupon) {
        return res.status(404).send('Coupon not found')
      }
      // Need ticket types if the coupon can be restricted to one
      const ticketTypes = await TicketType.find()
      // Format expiry date for the form input (YYYY-MM-DD)
      const expiry_date_formatted = coupon.expiry_date
        ? coupon.expiry_date.toISOString().split('T')[0]
        : ''

      // Assuming views/admin/coupons/edit.ejs
      res.render('coupons/edit', {
        coupon,
        ticketTypes,
        expiry_date_formatted,
      })
    } catch (err) {
      console.error(
        `GET /admin/coupons/${req.params.id}/edit error:`,
        err
      )
      res.status(500).send('Server Error')
    }
  }
)

// Update Coupon
router.put(
  '/coupons/:id',
  authMiddleware,
  async (req, res) => {
    try {
      // Basic validation for required fields
      if (
        !req.body.code ||
        !req.body.type ||
        req.body.value === undefined ||
        !req.body.expiry_date
      ) {
        return res
          .status(400)
          .send('Missing required fields for coupon')
      }
      // Ensure expiry_date is a valid Date
      if (isNaN(new Date(req.body.expiry_date).getTime())) {
        return res
          .status(400)
          .send('Invalid expiry date format')
      }

      const coupon = await Coupon.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true }
      )
      if (!coupon) {
        return res.status(404).send('Coupon not found')
      }
      res.redirect('/admin/coupons')
    } catch (err) {
      console.error(
        `PUT /admin/coupons/${req.params.id} error:`,
        err
      )
      res.status(500).send('Error updating coupon')
    }
  }
)

// Delete Coupon
router.delete(
  '/coupons/:id',
  authMiddleware,
  async (req, res) => {
    try {
      const coupon = await Coupon.findByIdAndDelete(
        req.params.id
      )
      if (!coupon) {
        return res.status(404).send('Coupon not found')
      }
      // TODO: Consider if you need logic to handle coupons used in past orders
      res.redirect('/admin/coupons')
    } catch (err) {
      console.error(
        `DELETE /admin/coupons/${req.params.id} error:`,
        err
      )
      res.status(500).send('Error deleting coupon')
    }
  }
)

module.exports = router
