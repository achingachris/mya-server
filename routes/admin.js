const express = require('express')
const router = express.Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const Admin = require('../models/Admin')
const NominationCategory = require('../models/NominationCategory')
const Nominee = require('../models/Nominee')
const Vote = require('../models/Vote')
// Import the new models
const TicketType = require('../models/TicketType')
const Ticket = require('../models/Ticket')
const Coupon = require('../models/Coupon')

const { authMiddleware } = require('../middleware/auth') // Assuming authMiddleware is correctly implemented

// --- Admin Authentication Routes ---

// Login Page
router.get(
  '/login',
  (req, res) => res.render('login', { error: null }) // Assuming 'login.ejs' exists in your views directory
)

// Handle Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body
  try {
    const admin = await Admin.findOne({ username })
    // Assuming Admin model has a method matchPassword(password)
    if (!admin || !(await admin.matchPassword(password))) {
      return res.render('login', {
        error: 'Invalid credentials',
      })
    }
    const token = jwt.sign(
      { id: admin._id },
      process.env.JWT_SECRET,
      { expiresIn: '1h' } // Token expires in 1 hour
    )
    res.cookie('token', token, { httpOnly: true })
    res.redirect('/admin/dashboard')
  } catch (err) {
    console.error(err)
    res.render('login', {
      error: 'An error occurred during login',
    })
  }
})

// Logout
router.get('/logout', (req, res) => {
  res.clearCookie('token')
  res.redirect('/admin/login')
})

// --- Dashboard ---

// Dashboard View
router.get(
  '/dashboard',
  authMiddleware,
  async (req, res) => {
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
      const totalTicketsSold = await TicketType.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: '$tickets_sold' },
          },
        },
      ])

      res.render('dashboard', {
        // Assuming 'dashboard.ejs' exists
        totalRevenue: totalRevenue[0]?.total || 0,
        totalTicketsSold: totalTicketsSold[0]?.total || 0,
        // You might fetch counts of TicketTypes, Tickets, Coupons here too
      })
    } catch (err) {
      console.error(err)
      res.status(500).send('Server Error') // Or render an error page
    }
  }
)

// --- Nomination Categories CRUD ---

// List Categories
router.get(
  '/categories',
  authMiddleware,
  async (req, res) => {
    try {
      const categories = await NominationCategory.find()
      res.render('categories/index', { categories }) // Assuming views/admin/categories/index.ejs
    } catch (err) {
      console.error(err)
      res.status(500).send('Server Error')
    }
  }
)

// New Category Form
router.get(
  '/categories/new',
  authMiddleware,
  (req, res) => res.render('categories/new') // Assuming views/admin/categories/new.ejs
)

// Create Category
router.post(
  '/categories',
  authMiddleware,
  async (req, res) => {
    try {
      await NominationCategory.create(req.body)
      res.redirect('/admin/categories')
    } catch (err) {
      console.error(err)
      // You might want to render the form again with error messages
      res.status(500).send('Error creating category')
    }
  }
)

// Edit Category Form
router.get(
  '/categories/:id/edit',
  authMiddleware,
  async (req, res) => {
    try {
      const category = await NominationCategory.findById(
        req.params.id
      )
      if (!category) {
        return res.status(404).send('Category not found')
      }
      res.render('categories/edit', { category }) // Assuming views/admin/categories/edit.ejs
    } catch (err) {
      console.error(err)
      res.status(500).send('Server Error')
    }
  }
)

// Update Category
router.put(
  '/categories/:id',
  authMiddleware,
  async (req, res) => {
    try {
      const category =
        await NominationCategory.findByIdAndUpdate(
          req.params.id,
          req.body,
          { new: true } // Return the updated document
        )
      if (!category) {
        return res.status(404).send('Category not found')
      }
      res.redirect('/admin/categories')
    } catch (err) {
      console.error(err)
      res.status(500).send('Error updating category')
    }
  }
)

// Delete Category
router.delete(
  '/categories/:id',
  authMiddleware,
  async (req, res) => {
    try {
      const category =
        await NominationCategory.findByIdAndDelete(
          req.params.id
        )
      if (!category) {
        return res.status(404).send('Category not found')
      }
      res.redirect('/admin/categories')
    } catch (err) {
      console.error(err)
      res.status(500).send('Error deleting category')
    }
  }
)

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

      res.render('nominees/index', {
        // Assuming views/admin/nominees/index.ejs
        nominees,
        categories, // Pass categories to the view
        search, // Pass current search query back
        category, // Pass current category filter back
      })
    } catch (err) {
      console.error(err)
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
      res.render('nominees/new', { categories }) // Assuming views/admin/nominees/new.ejs
    } catch (err) {
      console.error(err)
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
      await Nominee.create(req.body)
      res.redirect('/admin/nominees')
    } catch (err) {
      console.error(err)
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
      res.render('nominees/edit', { nominee, categories }) // Assuming views/admin/nominees/edit.ejs
    } catch (err) {
      console.error(err)
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
      console.error(err)
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
      res.redirect('/admin/nominees')
    } catch (err) {
      console.error(err)
      res.status(500).send('Error deleting nominee')
    }
  }
)

// --- Votes (Read Only - typically no CRUD) ---

// List Votes
router.get('/votes', authMiddleware, async (req, res) => {
  try {
    const votes = await Vote.find().populate('nominee') // Populate nominee details
    res.render('votes/index', { votes }) // Assuming views/admin/votes/index.ejs
  } catch (err) {
    console.error(err)
    res.status(500).send('Server Error')
  }
})

// Revenue endpoint (Already existed, keeping it)
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
    console.error(err)
    res.status(500).json({ error: 'Server Error' })
  }
})

// --- Ticket Types CRUD ---

// List Ticket Types
router.get(
  '/tickettypes',
  authMiddleware,
  async (req, res) => {
    try {
      const ticketTypes = await TicketType.find()
      res.render('tickettypes/index', { ticketTypes }) // Assuming views/admin/tickettypes/index.ejs
    } catch (err) {
      console.error(err)
      res.status(500).send('Server Error')
    }
  }
)

// New Ticket Type Form
router.get(
  '/tickettypes/new',
  authMiddleware,
  (req, res) => {
    res.render('tickettypes/new') // Assuming views/admin/tickettypes/new.ejs
  }
)

// Create Ticket Type
router.post(
  '/tickettypes',
  authMiddleware,
  async (req, res) => {
    try {
      // Basic validation - you might need more robust validation
      if (
        !req.body.name ||
        !req.body.price ||
        req.body.total_available === undefined
      ) {
        return res
          .status(400)
          .send('Missing required fields')
      }
      await TicketType.create(req.body)
      res.redirect('/admin/tickettypes')
    } catch (err) {
      console.error(err)
      // Handle potential duplicate name errors etc.
      res.status(500).send('Error creating ticket type')
    }
  }
)

// Edit Ticket Type Form
router.get(
  '/tickettypes/:id/edit',
  authMiddleware,
  async (req, res) => {
    try {
      const ticketType = await TicketType.findById(
        req.params.id
      )
      if (!ticketType) {
        return res.status(404).send('Ticket type not found')
      }
      res.render('tickettypes/edit', { ticketType }) // Assuming views/admin/tickettypes/edit.ejs
    } catch (err) {
      console.error(err)
      res.status(500).send('Server Error')
    }
  }
)

// Update Ticket Type
router.put(
  '/tickettypes/:id',
  authMiddleware,
  async (req, res) => {
    try {
      // Basic validation - you might need more robust validation
      if (
        !req.body.name ||
        !req.body.price ||
        req.body.total_available === undefined
      ) {
        return res
          .status(400)
          .send('Missing required fields')
      }
      const ticketType = await TicketType.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true }
      )
      if (!ticketType) {
        return res.status(404).send('Ticket type not found')
      }
      res.redirect('/admin/tickettypes')
    } catch (err) {
      console.error(err)
      res.status(500).send('Error updating ticket type')
    }
  }
)

// Delete Ticket Type
router.delete(
  '/tickettypes/:id',
  authMiddleware,
  async (req, res) => {
    try {
      const ticketType = await TicketType.findByIdAndDelete(
        req.params.id
      )
      if (!ticketType) {
        return res.status(404).send('Ticket type not found')
      }
      // TODO: Add logic to handle existing Tickets linked to this type (e.g., prevent deletion if linked tickets exist, or nullify the reference)
      res.redirect('/admin/tickettypes')
    } catch (err) {
      console.error(err)
      res.status(500).send('Error deleting ticket type')
    }
  }
)

// --- Tickets CRUD ---
// NOTE: Creating individual tickets via the admin panel might be for manual entry.
// Ticket creation often happens automatically upon a successful purchase in a real app.
// Editing might be used to change status (used/cancelled) or purchaser details.

// List Tickets
router.get('/tickets', authMiddleware, async (req, res) => {
  try {
    const tickets = await Ticket.find().populate(
      'ticket_type'
    )
    res.render('tickets/index', { tickets }) // Assuming views/admin/tickets/index.ejs
  } catch (err) {
    console.error(err)
    res.status(500).send('Server Error')
  }
})

// New Ticket Form
router.get(
  '/tickets/new',
  authMiddleware,
  async (req, res) => {
    try {
      const ticketTypes = await TicketType.find()
      // Pass possible payment statuses to the view
      const paymentStatuses = [
        'pending',
        'completed',
        'failed',
        'refunded',
      ]
      res.render('tickets/new', {
        ticketTypes,
        paymentStatuses,
      }) // Assuming views/admin/tickets/new.ejs
    } catch (err) {
      console.error(err)
      res.status(500).send('Server Error')
    }
  }
)

// Create Ticket
router.post(
  '/tickets',
  authMiddleware,
  async (req, res) => {
    try {
      // Basic validation - ensure required fields from schema are present
      if (
        !req.body.ticket_type ||
        !req.body.purchaser_name ||
        !req.body.purchurer_email ||
        !req.body.purchaser_phone ||
        !req.body.ticket_code ||
        !req.body.status ||
        !req.body.payment_status
      ) {
        return res
          .status(400)
          .send('Missing required fields')
      }
      // TODO: Add server-side validation for ticket_code uniqueness

      await Ticket.create(req.body)

      // TODO: If creating manually via admin and payment_status is 'completed',
      // you might need to manually increment tickets_sold on the linked TicketType

      res.redirect('/admin/tickets')
    } catch (err) {
      console.error(err)
      // Handle potential duplicate ticket_code errors etc.
      res.status(500).send('Error creating ticket')
    }
  }
)

// Edit Ticket Form
router.get(
  '/tickets/:id/edit',
  authMiddleware,
  async (req, res) => {
    try {
      const ticket = await Ticket.findById(req.params.id)
      if (!ticket) {
        return res.status(404).send('Ticket not found')
      }
      const ticketTypes = await TicketType.find()
      const paymentStatuses = [
        'pending',
        'completed',
        'failed',
        'refunded',
      ] // Pass possible payment statuses
      // Format used_at date for the form input if needed
      const used_at_formatted = ticket.used_at
        ? ticket.used_at.toISOString().slice(0, 16)
        : ''

      res.render('tickets/edit', {
        ticket,
        ticketTypes,
        paymentStatuses,
        used_at_formatted,
      }) // Assuming views/admin/tickets/edit.ejs
    } catch (err) {
      console.error(err)
      res.status(500).send('Server Error')
    }
  }
)

// Update Ticket
router.put(
  '/tickets/:id',
  authMiddleware,
  async (req, res) => {
    try {
      // Basic validation
      if (
        !req.body.ticket_type ||
        !req.body.purchaser_name ||
        !req.body.purchaser_email ||
        !req.body.purchaser_phone ||
        !req.body.ticket_code ||
        !req.body.status ||
        !req.body.payment_status
      ) {
        return res
          .status(400)
          .send('Missing required fields')
      }
      const ticket = await Ticket.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true }
      )
      if (!ticket) {
        return res.status(404).send('Ticket not found')
      }

      // TODO: If manually changing status to 'used', you might want to set 'used_at' date if not provided

      res.redirect('/admin/tickets')
    } catch (err) {
      console.error(err)
      res.status(500).send('Error updating ticket')
    }
  }
)
// Delete Ticket
router.delete(
  '/tickets/:id',
  authMiddleware,
  async (req, res) => {
    try {
      const ticket = await Ticket.findByIdAndDelete(
        req.params.id
      )
      if (!ticket) {
        return res.status(404).send('Ticket not found')
      }

      // TODO: If deleting a ticket that was marked 'completed', you might need to manually decrement tickets_sold on the linked TicketType

      res.redirect('/admin/tickets')
    } catch (err) {
      console.error(err)
      res.status(500).send('Error deleting ticket')
    }
  }
)

// --- Coupons CRUD ---

// List Coupons
router.get('/coupons', authMiddleware, async (req, res) => {
  try {
    // Optionally populate applicable_ticket_type if you want to display its details
    const coupons = await Coupon.find().populate(
      'applicable_ticket_type'
    )
    res.render('coupons/index', { coupons }) // Assuming views/admin/coupons/index.ejs
  } catch (err) {
    console.error(err)
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
      res.render('coupons/new', { ticketTypes }) // Assuming views/admin/coupons/new.ejs
    } catch (err) {
      console.error(err)
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
          .send('Missing required fields')
      }
      // Ensure expiry_date is a valid Date
      if (isNaN(new Date(req.body.expiry_date).getTime())) {
        return res.status(400).send('Invalid expiry date')
      }
      // TODO: Add server-side validation for coupon code uniqueness

      await Coupon.create(req.body)
      res.redirect('/admin/coupons')
    } catch (err) {
      console.error(err)
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
      // Format expiry date for the form input if needed (YYYY-MM-DD)
      const expiry_date_formatted = coupon.expiry_date
        ? coupon.expiry_date.toISOString().split('T')[0]
        : ''

      res.render('coupons/edit', {
        coupon,
        ticketTypes,
        expiry_date_formatted,
      }) // Assuming views/admin/coupons/edit.ejs
    } catch (err) {
      console.error(err)
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
          .send('Missing required fields')
      }
      // Ensure expiry_date is a valid Date
      if (isNaN(new Date(req.body.expiry_date).getTime())) {
        return res.status(400).send('Invalid expiry date')
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
      console.error(err)
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
      console.error(err)
      res.status(500).send('Error deleting coupon')
    }
  }
)

module.exports = router
