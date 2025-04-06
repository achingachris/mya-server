const express = require('express')
const router = express.Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const Admin = require('../models/Admin')
const NominationCategory = require('../models/NominationCategory')
const Nominee = require('../models/Nominee')
const Vote = require('../models/Vote')
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
    { expiresIn: '1h' }
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
