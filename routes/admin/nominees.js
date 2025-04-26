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
  '',
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
  '/new',
  authMiddleware,
  async (req, res) => {
    try {
      const categories = await NominationCategory.find() // Need categories to select for nominee
      // Assuming views/admin/nominees/new.ejs
      // FIX: Changed res.render('/new', ...) to res.render('nominees/new', ...)
      res.render('nominees/new', { categories })
    } catch (err) {
      console.error('GET /dashboard/nominees/new error:', err)
      res.status(500).send('Server Error')
    }
  }
)

// Create Nominee
router.post(
  '',
  authMiddleware,
  async (req, res) => {
    try {
      // Basic validation - ensure required fields are present
      // Added validation for image_url as per your template
      if (
        !req.body.name ||
        !req.body.category ||
        !req.body.image_url // Assuming image_url is required based on the template structure
      ) {
        return res
          .status(400)
          .send('Missing required fields for nominee')
      }
      await Nominee.create(req.body)
      // Redirecting to the list page after creation
      res.redirect('/dashboard/nominees') // Changed redirect to /dashboard/nominees
    } catch (err) {
      console.error('POST /dashboard/nominees error:', err)
      res.status(500).send('Error creating nominee')
    }
  }
)

// Edit Nominee Form
router.get(
  '/:id/edit',
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
        `GET /dashboard/nominees/${req.params.id}/edit error:`,
        err
      )
      res.status(500).send('Server Error')
    }
  }
)

// Update Nominee
router.put(
  '/:id',
  authMiddleware,
  async (req, res) => {
    try {
      // Basic validation
       // Added validation for image_url as per your template
      if (
        !req.body.name ||
        !req.body.category ||
        !req.body.image_url // Assuming image_url is required based on the template structure
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
      // Redirecting to the list page after update
      res.redirect('/dashboard/nominees') // Changed redirect to /dashboard/nominees
    } catch (err) {
      console.error(
        `PUT /dashboard/nominees/${req.params.id} error:`,
        err
      )
      res.status(500).send('Error updating nominee')
    }
  }
)

// Delete Nominee
router.delete(
  '/:id',
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
      // Redirecting to the list page after deletion
      res.redirect('/dashboard/nominees') // Changed redirect to /dashboard/nominees
    } catch (err) {
      console.error(
        `DELETE /dashboard/nominees/${req.params.id} error:`,
        err
      )
      res.status(500).send('Error deleting nominee')
    }
  }
)

module.exports = router
