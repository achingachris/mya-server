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

// --- Ticket Types CRUD ---

// List Ticket Types
router.get(
  '/tickettypes',
  authMiddleware,
  async (req, res) => {
    try {
      const ticketTypes = await TicketType.find()
      // Assuming views/admin/tickettypes/index.ejs
      res.render('tickettypes/index', { ticketTypes })
    } catch (err) {
      console.error('GET /admin/tickettypes error:', err)
      res.status(500).send('Server Error')
    }
  }
)

// New Ticket Type Form
router.get(
  '/tickettypes/new',
  authMiddleware,
  (req, res) => {
    // Assuming views/admin/tickettypes/new.ejs
    res.render('tickettypes/new')
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
        req.body.price === undefined ||
        req.body.total_available === undefined
      ) {
        return res
          .status(400)
          .send('Missing required fields for ticket type')
      }
      // Ensure price and total_available are numbers
      if (
        isNaN(req.body.price) ||
        isNaN(req.body.total_available)
      ) {
        return res
          .status(400)
          .send('Price and Total Available must be numbers')
      }
      await TicketType.create(req.body)
      res.redirect('/admin/tickettypes')
    } catch (err) {
      console.error('POST /admin/tickettypes error:', err)
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
      // Assuming views/admin/tickettypes/edit.ejs
      res.render('tickettypes/edit', { ticketType })
    } catch (err) {
      console.error(
        `GET /admin/tickettypes/${req.params.id}/edit error`,
        err
      )
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
        req.body.price === undefined ||
        req.body.total_available === undefined
      ) {
        return res
          .status(400)
          .send('Missing required fields for ticket type')
      }
      // Ensure price and total_available are numbers
      if (
        isNaN(req.body.price) ||
        isNaN(req.body.total_available)
      ) {
        return res
          .status(400)
          .send('Price and Total Available must be numbers')
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
      console.error(
        `PUT /admin/tickettypes/${req.params.id} error:`,
        err
      )
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
      console.error(
        `DELETE /admin/tickettypes/${req.params.id} error:`,
        err
      )
      res.status(500).send('Error deleting ticket type')
    }
  }
)

module.exports = router