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

// --- Nominees CRUD ---

// List Nominees
router.get(
  '/nominees',
  authMiddleware,
  async (req, res) => {
    try {
      const { search, category } = req.query
      let query = {}
      if (search)
        query.name = { $regex: search, $options: 'i' }
      if (category) query.category = category

      const nominees = await Nominee.find(query).populate(
        'category'
      )
      const categories = await NominationCategory.find() // Fetch categories for filter dropdown

      // Assuming views/admin/nominees/index.ejs
      res.render('nominees/index', {
        nominees,
        categories, // Pass categories to the view
        search, // Pass current search query back
        category, // Pass current category filter back
      })
    } catch (err) {
      console.error('GET /admin/nominees error:', err)
      res.status(500).send('Server Error')
    }
  }
)

// New Nominee Form
router.get(
  '/nominees/new',
  authMiddleware,
  async (req, res) => {
    try {
      const categories = await NominationCategory.find() // Need categories to select for nominee
      // Assuming views/admin/nominees/new.ejs
      res.render('nominees/new', { categories })
    } catch (err) {
      console.error('GET /admin/nominees/new error:', err)
      res.status(500).send('Server Error')
    }
  }
)

// Create Nominee
router.post(
  '/nominees',
  authMiddleware,
  async (req, res) => {
    try {
      // Basic validation - ensure required fields are present
      if (
        !req.body.name ||
        !req.body.category ||
        !req.body.image_url
      ) {
        return res
          .status(400)
          .send('Missing required fields for nominee')
      }
      await Nominee.create(req.body)
      res.redirect('/admin/nominees')
    } catch (err) {
      console.error('POST /admin/nominees error:', err)
      res.status(500).send('Error creating nominee')
    }
  }
)

// Edit Nominee Form
router.get(
  '/nominees/:id/edit',
  authMiddleware,
  async (req, res) => {
    try {
      const nominee = await Nominee.findById(req.params.id)
      if (!nominee) {
        return res.status(404).send('Nominee not found')
      }
      const categories = await NominationCategory.find() // Need categories to select for nominee
      // Assuming views/admin/nominees/edit.ejs
      res.render('nominees/edit', { nominee, categories })
    } catch (err) {
      console.error(
        `GET /admin/nominees/${req.params.id}/edit error:`,
        err
      )
      res.status(500).send('Server Error')
    }
  }
)

// Update Nominee
router.put(
  '/nominees/:id',
  authMiddleware,
  async (req, res) => {
    try {
      // Basic validation
      if (
        !req.body.name ||
        !req.body.category ||
        !req.body.image_url
      ) {
        return res
          .status(400)
          .send('Missing required fields for nominee')
      }
      const nominee = await Nominee.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true }
      )
      if (!nominee) {
        return res.status(404).send('Nominee not found')
      }
      res.redirect('/admin/nominees')
    } catch (err) {
      console.error(
        `PUT /admin/nominees/${req.params.id} error:`,
        err
      )
      res.status(500).send('Error updating nominee')
    }
  }
)

// Delete Nominee
router.delete(
  '/nominees/:id',
  authMiddleware,
  async (req, res) => {
    try {
      const nominee = await Nominee.findByIdAndDelete(
        req.params.id
      )
      if (!nominee) {
        return res.status(404).send('Nominee not found')
      }
      // TODO: Add logic to handle votes linked to this nominee (e.g., prevent deletion if linked votes exist, or nullify the reference)
      res.redirect('/admin/nominees')
    } catch (err) {
      console.error(
        `DELETE /admin/nominees/${req.params.id} error:`,
        err
      )
      res.status(500).send('Error deleting nominee')
    }
  }
)

module.exports = router