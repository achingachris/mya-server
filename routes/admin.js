const express = require('express')
const router = express.Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const Admin = require('../models/Admin')
const NominationCategory = require('../models/NominationCategory')
const Nominee = require('../models/Nominee')
const Vote = require('../models/Vote')
const TicketType = require('../models/TicketType')
const Ticket = require('../models/Ticket');
const { authMiddleware } = require('../middleware/auth')

// Login Page
router.get('/login', (req, res) =>
  res.render('login', { error: null })
)
router.post('/login', async (req, res) => {
  const { username, password } = req.body
  const admin = await Admin.findOne({ username })
  if (!admin || !(await admin.matchPassword(password))) {
    return res.render('login', {
      error: 'Invalid credentials',
    })
  }
  const token = jwt.sign(
    { id: admin._id },
    process.env.JWT_SECRET,
    { expiresIn: '5h' }
  )
  res.cookie('token', token, { httpOnly: true })
  res.redirect('/admin/dashboard')
})

// Dashboard
router.get(
  '/dashboard',
  authMiddleware,
  async (req, res) => {
    const totalRevenue = await Vote.aggregate([
      { $match: { payment_status: 'completed' } },
      {
        $group: {
          _id: null,
          total: { $sum: '$payment_amount' },
        },
      },
    ])
    res.render('dashboard', {
      totalRevenue: totalRevenue[0]?.total || 0,
    })
  }
)

// Categories
router.get(
  '/categories',
  authMiddleware,
  async (req, res) => {
    const categories = await NominationCategory.find()
    res.render('categories/index', { categories })
  }
)
router.get('/categories/new', authMiddleware, (req, res) =>
  res.render('categories/new')
)
router.post(
  '/categories',
  authMiddleware,
  async (req, res) => {
    await NominationCategory.create(req.body)
    res.redirect('/admin/categories')
  }
)
router.get(
  '/categories/:id/edit',
  authMiddleware,
  async (req, res) => {
    const category = await NominationCategory.findById(
      req.params.id
    )
    res.render('categories/edit', { category })
  }
)
router.put(
  '/categories/:id',
  authMiddleware,
  async (req, res) => {
    await NominationCategory.findByIdAndUpdate(
      req.params.id,
      req.body
    )
    res.redirect('/admin/categories')
  }
)
router.delete(
  '/categories/:id',
  authMiddleware,
  async (req, res) => {
    await NominationCategory.findByIdAndDelete(
      req.params.id
    )
    res.redirect('/admin/categories')
  }
)

// Nominees
router.get(
  '/nominees',
  authMiddleware,
  async (req, res) => {
    const { search, category } = req.query
    let query = {}
    if (search)
      query.name = { $regex: search, $options: 'i' }
    if (category) query.category = category
    const nominees = await Nominee.find(query).populate(
      'category'
    )
    const categories = await NominationCategory.find()
    res.render('nominees/index', {
      nominees,
      categories,
      search,
      category,
    })
  }
)
router.get(
  '/nominees/new',
  authMiddleware,
  async (req, res) => {
    const categories = await NominationCategory.find()
    res.render('nominees/new', { categories })
  }
)
router.post(
  '/nominees',
  authMiddleware,
  async (req, res) => {
    await Nominee.create(req.body)
    res.redirect('/admin/nominees')
  }
)
router.get(
  '/nominees/:id/edit',
  authMiddleware,
  async (req, res) => {
    const nominee = await Nominee.findById(req.params.id)
    const categories = await NominationCategory.find()
    res.render('nominees/edit', { nominee, categories })
  }
)
router.put(
  '/nominees/:id',
  authMiddleware,
  async (req, res) => {
    await Nominee.findByIdAndUpdate(req.params.id, req.body)
    res.redirect('/admin/nominees')
  }
)
router.delete(
  '/nominees/:id',
  authMiddleware,
  async (req, res) => {
    await Nominee.findByIdAndDelete(req.params.id)
    res.redirect('/admin/nominees')
  }
)

// Votes
router.get('/votes', authMiddleware, async (req, res) => {
  const votes = await Vote.find().populate('nominee')
  res.render('votes', { votes })
})

// --- Ticket Types Routes ---

// List all Ticket Types
router.get(
  '/ticket-types',
  authMiddleware,
  async (req, res) => {
    try {
      const ticketTypes = await TicketType.find({})
      res.render('tickettypes/index', { ticketTypes })
    } catch (err) {
      handleError(res, err, 'tickettypes/index', {
        ticketTypes: [],
      })
    }
  }
)

// Show form to create a new Ticket Type
router.get(
  '/ticket-types/new',
  authMiddleware,
  (req, res) => {
    res.render('tickettypes/new')
  }
)

// Handle creation of a new Ticket Type
router.post(
  '/ticket-types',
  authMiddleware,
  async (req, res) => {
    try {
      await TicketType.create(req.body)
      res.redirect('/admin/ticket-types')
    } catch (err) {
      // Handle validation errors specifically if needed
      if (err.name === 'ValidationError') {
        console.error('Validation Error:', err.message)
        // You might want to re-render the form with error messages
        return res
          .status(400)
          .render('tickettypes/new', {
            error: err.message,
            formData: req.body,
          })
      }
      handleError(res, err, 'tickettypes/new', {
        formData: req.body,
      })
    }
  }
)

// Show form to edit a Ticket Type
router.get(
  '/ticket-types/:id/edit',
  authMiddleware,
  async (req, res) => {
    try {
      const ticketType = await TicketType.findById(
        req.params.id
      )
      if (!ticketType)
        return res
          .status(404)
          .render('error', {
            message: 'Ticket Type not found',
          })
      res.render('tickettypes/edit', { ticketType })
    } catch (err) {
      handleError(res, err, 'tickettypes/edit', {
        ticketType: null,
      })
    }
  }
)

// Handle update of a Ticket Type
router.put(
  '/ticket-types/:id',
  authMiddleware,
  async (req, res) => {
    try {
      const updatedTicketType =
        await TicketType.findByIdAndUpdate(
          req.params.id,
          req.body,
          { new: true, runValidators: true }
        ) // runValidators ensures pre-save hooks run
      if (!updatedTicketType)
        return res
          .status(404)
          .render('error', {
            message: 'Ticket Type not found',
          })
      res.redirect('/admin/ticket-types')
    } catch (err) {
      // Handle validation errors specifically if needed
      if (err.name === 'ValidationError') {
        console.error('Validation Error:', err.message)
        // You might want to re-render the form with error messages
        const ticketType = await TicketType.findById(
          req.params.id
        ) // Fetch original document or use req.body
        return res
          .status(400)
          .render('tickettypes/edit', {
            error: err.message,
            ticketType: ticketType || req.body,
          })
      }
      handleError(res, err, 'tickettypes/edit') // Might need to fetch ticketType again on error
    }
  }
)

// Handle deletion of a Ticket Type
router.delete(
  '/ticket-types/:id',
  authMiddleware,
  async (req, res) => {
    try {
      const deletedTicketType =
        await TicketType.findByIdAndDelete(req.params.id)
      if (!deletedTicketType)
        return res
          .status(404)
          .render('error', {
            message: 'Ticket Type not found',
          })
      res.redirect('/admin/ticket-types')
    } catch (err) {
      handleError(res, err, 'tickettypes/index') // Might need to fetch ticketTypes again on error
    }
  }
)

// --- Tickets Routes ---

// List all Tickets
router.get('/tickets', authMiddleware, async (req, res) => {
  try {
    // Fetch all tickets and populate the ticket_type details
    const tickets = await Ticket.find({}).populate('ticket_type');
    res.render('tickets/index', { tickets }); // Render the new tickets index view
  } catch (err) {
    handleError(res, err, 'tickets/index', { tickets: [] }); // Handle errors
  }
});

// Get Ticket Sales Summary
router.get('/ticket-sales-summary', authMiddleware, async (req, res) => {
  try {
    const summary = await Ticket.aggregate([
      { $match: { payment_status: 'completed' } }, // Only consider completed payments
      {
        $group: {
          _id: null, // Group all documents together
          totalRevenue: { $sum: '$total_amount' }, // Sum the total_amount field
          totalTicketsSold: { $sum: '$number_of_tickets' }, // Sum the number_of_tickets field
        },
      },
    ]);

    // The aggregation result is an array, summary[0] contains the totals if any documents matched
    const totalRevenue = summary[0]?.totalRevenue || 0;
    const totalTicketsSold = summary[0]?.totalTicketsSold || 0;

    res.render('tickets/summary', { totalRevenue, totalTicketsSold }); // Render a new summary view

  } catch (err) {
    handleError(res, err, 'tickets/summary', { totalRevenue: 0, totalTicketsSold: 0 }); // Handle errors
  }
});


// --- End of Tickets Routes ---


// Revenue
router.get('/revenue', authMiddleware, async (req, res) => {
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
})

module.exports = router
