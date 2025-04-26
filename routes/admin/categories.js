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

// List Categories
router.get(
  '/categories',
  authMiddleware,
  async (req, res) => {
    try {
      const categories = await NominationCategory.find()
      // Assuming views/admin/categories/index.ejs
      res.render('categories/index', { categories })
    } catch (err) {
      console.error('GET /admin/categories error:', err)
      res.status(500).send('Server Error')
    }
  }
)

// New Category Form
router.get('/categories/new', authMiddleware, (req, res) =>
  // Assuming views/admin/categories/new.ejs
  res.render('categories/new')
)

// Create Category
router.post(
  '/categories',
  authMiddleware,
  async (req, res) => {
    try {
      // Basic validation - you might need more robust validation
      if (!req.body.name) {
        // Assuming 'name' is the primary field
        return res
          .status(400)
          .send('Category name is required')
      }
      await NominationCategory.create(req.body)
      res.redirect('/admin/categories')
    } catch (err) {
      console.error('POST /admin/categories error:', err)
      // You might want to re-render the form again with error messages
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
      // Assuming views/admin/categories/edit.ejs
      res.render('categories/edit', { category })
    } catch (err) {
      console.error(
        `GET /admin/categories/${req.params.id}/edit error`,
        err
      )
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
      // Basic validation - you might need more robust validation
      if (!req.body.name) {
        // Assuming 'name' is the primary field
        return res
          .status(400)
          .send('Category name is required')
      }
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
      console.error(
        `PUT /admin/categories/${req.params.id} error:`,
        err
      )
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
      // TODO: Add logic to handle nominees linked to this category (e.g., prevent deletion if linked nominees exist, or nullify the reference)
      res.redirect('/admin/categories')
    } catch (err) {
      console.error(
        `DELETE /admin/categories/${req.params.id} error:`,
        err
      )
      res.status(500).send('Error deleting category')
    }
  }
)

module.exports = router