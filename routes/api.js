const express = require('express')
const router = express.Router()
const Paystack = require('paystack-api')(
  process.env.PAYSTACK_SECRET_KEY
)
const crypto = require('crypto')
const { v4: uuidv4 } = require('uuid')
const mongoose = require('mongoose')

// Models
const Admin = require('../models/Admin')
const NominationCategory = require('../models/NominationCategory')
const Nominee = require('../models/Nominee')
const Vote = require('../models/Vote')
const TicketType = require('../models/TicketType')
const Ticket = require('../models/Ticket')

// Middleware
const { apiAuthMiddleware } = require('../middleware/auth')

// Environment variables
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY
const FRONTEND_URL = process.env.FRONTEND_URL // Used for vote callbacks
const CLIENT_URL = process.env.CLIENT_URL // Used for ticket callbacks

// Validate environment variables
if (!PAYSTACK_SECRET_KEY || !FRONTEND_URL || !CLIENT_URL) {
  console.error(
    'FATAL ERROR: PAYSTACK_SECRET_KEY, FRONTEND_URL, and CLIENT_URL must be defined in your .env file.'
  )
  // In a production app, you might want a more graceful shutdown or logging
  // process.exit(1); // Consider exiting if essential config is missing
}

// Vote tiers
const voteTiers = {
  10: 50,
  20: 100,
  30: 150,
  100: 500,
  200: 1000,
  400: 2000,
}

// --- Existing Routes (Unchanged) ---

// Get all categories
router.get(
  '/categories',
  apiAuthMiddleware,
  async (req, res) => {
    try {
      const categories = await NominationCategory.find()
      res.json(categories)
    } catch (err) {
      console.error('GET /api/categories error:', err)
      res
        .status(500)
        .json({ error: 'Failed to fetch categories' })
    }
  }
)

// Get all nominees
router.get(
  '/nominees',
  apiAuthMiddleware,
  async (req, res) => {
    try {
      const nominees = await Nominee.find().populate(
        'category'
      )
      res.json(nominees)
    } catch (err) {
      console.error('GET /api/nominees error:', err)
      res
        .status(500)
        .json({ error: 'Failed to fetch nominees' })
    }
  }
)

// Get nominees by category
router.get(
  '/nominees/category/:categoryId',
  apiAuthMiddleware,
  async (req, res) => {
    const { categoryId } = req.params
    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res
        .status(400)
        .json({ error: 'Invalid category ID format' })
    }
    try {
      const category = await NominationCategory.findById(
        categoryId
      )
      if (!category)
        return res
          .status(404)
          .json({ error: 'Category not found' })
      const nominees = await Nominee.find({
        category: categoryId,
      }).populate('category')
      res.json(nominees)
    } catch (err) {
      console.error(
        `GET /api/nominees/category/${categoryId} error:`,
        err
      )
      res.status(500).json({
        error: 'Failed to fetch nominees by category',
      })
    }
  }
)

// Initiate vote and payment
router.post(
  '/vote/initiate/:nomineeId',
  async (req, res) => {
    const { nomineeId } = req.params
    const {
      numberOfVotes,
      voterName,
      voterEmail,
      voterPhone,
    } = req.body
    if (!mongoose.Types.ObjectId.isValid(nomineeId)) {
      return res
        .status(400)
        .json({ error: 'Invalid nominee ID format' })
    }
    if (
      !numberOfVotes ||
      !voterName ||
      !voterEmail ||
      !voterPhone
    ) {
      return res
        .status(400)
        .json({ error: 'All fields are required' })
    }
    if (!voteTiers[numberOfVotes]) {
      return res.status(400).json({
        error:
          'Invalid number of votes. Allowed options: 10 (50 KES), 20 (100), 30 (150), 100 (500), 200 (1000), 400 (2000).',
      })
    }
    try {
      const nominee = await Nominee.findById(nomineeId)
      if (!nominee)
        return res
          .status(404)
          .json({ error: 'Nominee not found' })
      const payment_amount = voteTiers[numberOfVotes]
      // Create vote record with pending status
      const vote = await Vote.create({
        nominee: nomineeId,
        voter_name: voterName,
        voter_email: voterEmail,
        voter_phone: voterPhone,
        number_of_votes: numberOfVotes,
        payment_amount,
        payment_status: 'pending',
      })
      // Generate a unique reference for Paystack transaction
      const reference = `vote-${vote._id.toString()}`
      const paystackResponse =
        await Paystack.transaction.initialize({
          email: voterEmail,
          amount: payment_amount * 100,
          reference,
          currency: 'KES',
          callback_url: `${FRONTEND_URL}/vote-success?nominee=${encodeURIComponent(
            nominee.name
          )}&votes=${numberOfVotes}&reference=${reference}`,
          metadata: {
            vote_id: vote._id.toString(),
            nominee_id: nomineeId,
            number_of_votes: numberOfVotes,
          },
        })
      // Assuming Vote model has payment_reference field
      if (vote.schema.paths.payment_reference) {
        vote.payment_reference = reference
        await vote.save()
      } else {
        console.warn(
          "Vote model does not have 'payment_reference' field. Webhook will need to find by other means if reference isn't the _id."
        )
      }

      res.json({
        authorization_url:
          paystackResponse.data.authorization_url,
      })
    } catch (err) {
      console.error(
        `POST /api/vote/initiate/${nomineeId} error:`,
        err
      )
      res.status(500).json({
        error: 'Failed to initiate vote and payment',
        details: err.message,
      })
    }
  }
)

// GET /api/tickets - Fetch all available ticket types
router.get(
  '/tickets',
  apiAuthMiddleware,
  async (req, res) => {
    try {
      const availableTicketTypes = await TicketType.find({
        $expr: {
          $gt: ['$total_available', '$tickets_sold'],
        },
        // Add date check: and { expiry_date: { $gt: new Date() } }
      })
      res.json(availableTicketTypes)
    } catch (err) {
      console.error('GET /api/tickets error:', err)
      res.status(500).json({
        error: 'Failed to fetch available ticket types',
        details: err.message,
      })
    }
  }
)

// POST /api/tickets/purchase/:ticketTypeId - Initiate ticket purchase payment
router.post(
  '/tickets/purchase/:ticketTypeId',
  async (req, res) => {
    const { ticketTypeId } = req.params
    const {
      purchaserName,
      purchaserEmail,
      purchaserPhone,
    } = req.body
    if (!mongoose.Types.ObjectId.isValid(ticketTypeId)) {
      return res
        .status(400)
        .json({ error: 'Invalid ticket type ID format' })
    }
    if (
      !purchaserName ||
      !purchaserEmail ||
      !purchaserPhone
    ) {
      return res.status(400).json({
        error:
          'Purchaser name, email, and phone are required',
      })
    }
    try {
      const selectedTicketType = await TicketType.findById(
        ticketTypeId
      )
      if (!selectedTicketType) {
        return res
          .status(404)
          .json({ error: 'Ticket type not found' })
      }
      if (
        selectedTicketType.tickets_sold >=
        selectedTicketType.total_available
      ) {
        return res.status(400).json({
          error: 'Tickets of this type are sold out',
        })
      }
      let generatedCode = `TICKET-${uuidv4()
        .split('-')[0]
        .toUpperCase()}`
      let isCodeUnique = false
      let attempts = 0
      while (!isCodeUnique && attempts < 5) {
        const existingTicket = await Ticket.findOne({
          ticket_code: generatedCode,
        })
        if (!existingTicket) {
          isCodeUnique = true
        } else {
          generatedCode = `TICKET-${uuidv4()
            .split('-')[0]
            .toUpperCase()}`
          attempts++
        }
      }
      if (!isCodeUnique) {
        return res.status(500).json({
          error: 'Failed to generate a unique ticket code.',
        })
      }
      // Assuming Ticket model has paystack_reference field
      const paystackReference = `ticket_${uuidv4()}` // Generate unique reference
      const newTicket = new Ticket({
        ticket_type: ticketTypeId,
        purchaser_name: purchaserName,
        purchaser_email: purchaserEmail,
        purchaser_phone: purchaserPhone,
        ticket_code: generatedCode,
        status: 'unused',
        payment_status: 'pending',
        paystack_reference: paystackReference, // Store the reference
      })
      await newTicket.save()
      const amountInKobo = Math.round(
        selectedTicketType.price * 100
      )
      try {
        const paystackResponse =
          await Paystack.transaction.initialize({
            email: purchaserEmail,
            amount: amountInKobo,
            reference: paystackReference, // Use the generated reference
            currency: 'KES',
            callback_url: `${CLIENT_URL}/ticket-success?reference=${paystackReference}`, // Pass reference to frontend
            metadata: {
              ticket_id: newTicket._id.toString(),
              ticket_code: generatedCode,
              purchaser_name: purchaserName,
              purchaser_email: purchaserEmail,
              ticket_type_id: ticketTypeId,
              ticket_type_name: selectedTicketType.name,
              ticket_price: selectedTicketType.price,
            },
          })
        if (paystackResponse.status) {
          res.json({
            authorization_url:
              paystackResponse.data.authorization_url,
          })
        } else {
          // Mark the ticket as failed if initiation didn't return a URL
          const ticketToMarkFailed = await Ticket.findById(
            newTicket._id
          )
          if (ticketToMarkFailed) {
            ticketToMarkFailed.payment_status = 'failed'
            await ticketToMarkFailed.save()
          }
          res.status(500).json({
            error:
              'Failed to initiate payment with Paystack',
            details: paystackResponse.message,
          })
        }
      } catch (paystackErr) {
        console.error(
          'Error initiating Paystack ticket transaction:',
          paystackErr.message
        )
        // Mark the ticket as failed on initiation error
        const ticketToMarkFailed = await Ticket.findById(
          newTicket._id
        )
        if (ticketToMarkFailed) {
          ticketToMarkFailed.payment_status = 'failed'
          await ticketToMarkFailed.save()
        }
        res.status(500).json({
          error: 'Error initiating payment',
          details: paystackErr.message,
        })
      }
    } catch (err) {
      console.error(
        'POST /api/tickets/purchase error:',
        err
      )
      res.status(500).json({
        error: 'Failed to create ticket record',
        details: err.message,
      })
    }
  }
)

// GET /api/tickets/by-code/:ticketCode - Fetch ticket details by ticket code
router.get(
  '/tickets/by-code/:ticketCode',
  async (req, res) => {
    const { ticketCode } = req.params
    if (!ticketCode) {
      return res
        .status(400)
        .json({ error: 'Ticket code is required' })
    }
    try {
      const ticket = await Ticket.findOne({
        ticket_code: ticketCode,
      }).populate('ticket_type', 'name price')
      if (!ticket) {
        console.warn(
          `API: Ticket not found for code: ${ticketCode}`
        )
        return res
          .status(404)
          .json({ error: 'Ticket not found' })
      }
      // Add a check to ensure the ticket payment is completed
      // The frontend success page is primarily for completed payments.
      if (ticket.payment_status !== 'completed') {
        console.warn(
          `API: Attempted to fetch non-completed ticket details for code: ${ticketCode}, status: ${ticket.payment_status}`
        )
        // Return an error indicating payment isn't completed
        return res.status(400).json({
          error: `Payment status for this ticket is "${ticket.payment_status}". It must be "completed".`,
        })
      }
      const ticketDetails = {
        _id: ticket._id,
        ticket_type: ticket.ticket_type,
        purchaser_name: ticket.purchaser_name,
        purchaser_email: ticket.purchaser_email,
        purchaser_phone: ticket.purchaser_phone,
        ticket_code: ticket.ticket_code,
        status: ticket.status,
        payment_status: ticket.payment_status,
        createdAt: ticket.createdAt,
      }
      res.json(ticketDetails)
    } catch (err) {
      console.error(
        `GET /api/tickets/by-code/${ticketCode} error:`,
        err
      )
      res
        .status(500)
        .json({ error: 'Failed to fetch ticket details' })
    }
  }
)

// --- Webhook Route (Content from api_js_webhook_logic immersive) ---

router.post('/webhook/paystack', async (req, res) => {
  // Verify Paystack signature
  const hash = crypto
    .createHmac('sha512', PAYSTACK_SECRET_KEY)
    .update(JSON.stringify(req.body))
    .digest('hex')

  if (hash !== req.headers['x-paystack-signature']) {
    console.error(
      'Webhook: Invalid Paystack webhook signature'
    )
    return res.status(401).send('Invalid signature')
  }

  const event = req.body
  const reference = event.data?.reference

  if (!reference) {
    console.error(
      'Webhook: received event without reference'
    )
    return res.sendStatus(200) // Acknowledge receipt
  }

  console.log(
    `Webhook: Processing event: ${event.event} for reference: ${reference}`
  )

  try {
    if (event.event === 'charge.success') {
      // Check if the reference starts with 'vote-'
      if (reference.startsWith('vote-')) {
        const vote = await Vote.findOne({
          payment_reference: reference,
        })
        if (!vote) {
          console.error(
            `Webhook: Vote not found for reference: ${reference}`
          )
          return res.sendStatus(200) // Acknowledge receipt even if not found
        }
        if (vote.payment_status === 'completed') {
          console.log(
            `Webhook: Vote already completed for reference: ${reference}`
          )
          return res.sendStatus(200) // Acknowledge receipt
        }
        vote.payment_status = 'completed'
        await vote.save()
        const nominee = await Nominee.findByIdAndUpdate(
          vote.nominee,
          {
            $inc: { number_of_votes: vote.number_of_votes },
          },
          { new: true }
        )
        if (nominee) {
          console.log(
            `Webhook: Updated nominee vote count: ${nominee.name} (+${vote.number_of_votes})`
          )
        } else {
          console.error(
            `Webhook: Nominee not found for vote: ${vote._id}`
          )
        }
      }
      // This block handles ticket transactions identified by the 'ticket_' prefix
      else if (reference.startsWith('ticket_')) {
        const ticket = await Ticket.findOne({
          paystack_reference: reference, // Finds the ticket using the stored reference
        })
        if (!ticket) {
          console.error(
            `Webhook: Ticket not found for reference: ${reference}`
          )
          return res.sendStatus(200) // Acknowledge receipt
        }
        if (ticket.payment_status === 'completed') {
          console.log(
            `Webhook: Ticket already completed for reference: ${reference}`
          )
          return res.sendStatus(200) // Acknowledge receipt
        }

        // This is the crucial part that updates the status:
        ticket.payment_status = 'completed'
        await ticket.save() // Saves the updated status to the database
        console.log(
          `Webhook: Marked ticket as completed: ${reference}`
        )

        // Increment tickets_sold count on the linked TicketType
        const ticketType = await TicketType.findById(
          ticket.ticket_type
        )
        if (ticketType) {
          ticketType.tickets_sold += 1
          await ticketType.save()
          console.log(
            `Webhook: Incremented tickets_sold for TicketType: ${ticketType.name}`
          )
        } else {
          console.warn(
            `Webhook: TicketType not found for ticket ${ticket._id}`
          )
        }
      } else {
        console.warn(
          `Webhook: Received event for unhandled reference format: ${reference}`
        )
      }
    } else if (event.event === 'charge.failed') {
      // Handle failed charge event for votes
      if (reference.startsWith('vote-')) {
        const vote = await Vote.findOne({
          payment_reference: reference,
        })
        if (vote) {
          vote.payment_status = 'failed'
          await vote.save()
          console.log(
            'Webhook: Marked vote as failed:',
            reference
          )
        } else {
          console.warn(
            'Webhook: Vote not found for failed reference:',
            reference
          )
        }
      } else if (reference.startsWith('ticket_')) {
        // Handle failed charge event for tickets
        const ticket = await Ticket.findOne({
          paystack_reference: reference,
        })
        if (ticket) {
          ticket.payment_status = 'failed'
          await ticket.save()
          console.log(
            'Webhook: Marked ticket as failed:',
            reference
          )
          // You could potentially send a failed payment email here
        } else {
          console.warn(
            'Webhook: Ticket not found for failed reference:',
            reference
          )
        }
      } else {
        console.warn(
          'Webhook: Received failed event for unhandled reference format:',
          reference
        )
      }
    } else {
      // Handle other Paystack events if needed (e.g., refund, etc.)
      console.log(
        `Webhook: Received unhandled event type: ${event.event} for reference: ${event.data.reference}`
      )
    }
  } catch (err) {
    console.error(
      `Webhook processing error for ${event.event}:`,
      err
    )
    // In case of an error during processing, you might want to log more details
    // or attempt to find the record by reference and mark it as errored/failed
    // if its status is still pending.
  }

  // Always acknowledge receipt of the webhook event
  res.sendStatus(200)
})

// --- Callback Route (Content from your provided code) ---

router.get(
  '/paystack/ticket-purchase-callback',
  async (req, res) => {
    const { reference } = req.query // Get the reference from Paystack query params

    if (!reference) {
      console.error(
        'Callback: Paystack callback received without reference'
      )
      return res.redirect(
        `${CLIENT_URL}/ticket-success?status=failed&message=${encodeURIComponent(
          'Payment reference missing'
        )}`
      )
    }

    console.log(
      `Callback: Processing ticket purchase callback with reference: ${reference}`
    )

    try {
      // Verify transaction with Paystack
      const verificationResponse =
        await Paystack.transaction.verify({ reference })
      const verificationData = verificationResponse.data

      if (
        !verificationResponse.status ||
        !verificationData
      ) {
        console.error(
          `Callback: Paystack verification failed for reference: ${reference}`,
          verificationResponse.message
        )
        // Attempt to find the ticket by reference and mark as failed if pending
        const ticket = await Ticket.findOne({
          paystack_reference: reference,
        })
        if (ticket && ticket.payment_status === 'pending') {
          ticket.payment_status = 'failed'
          await ticket.save()
          console.log(
            `Callback: Marked ticket ${ticket._id} as failed due to verification failure.`
          )
        }
        return res.redirect(
          `${CLIENT_URL}/ticket-success?status=failed&message=${encodeURIComponent(
            'Payment verification failed'
          )}&reference=${reference}`
        )
      }

      const paystackStatus = verificationData.status
      // const ticketId = verificationData.metadata?.ticket_id; // Not strictly needed if finding by reference

      // Find ticket using the paystack_reference
      const ticket = await Ticket.findOne({
        paystack_reference: reference,
      })

      if (!ticket) {
        console.error(
          `Callback: Ticket not found for reference: ${reference}`
        )
        return res.redirect(
          `${CLIENT_URL}/ticket-success?status=failed&message=${encodeURIComponent(
            'Ticket not found after payment'
          )}&reference=${reference}`
        )
      }

      // --- Redirect based on Paystack status ---
      // Note: The webhook is the primary source for updating the DB status.
      // This callback primarily redirects the user.
      if (paystackStatus === 'success') {
        // Redirect to frontend success page, pass ticket code and reference
        // The frontend will then fetch the ticket details by code.
        console.log(
          `Callback: Paystack status success for ticket ${ticket._id}. Redirecting to success page.`
        )
        return res.redirect(
          `${CLIENT_URL}/ticket-success?status=completed&ticketCode=${ticket.ticket_code}&reference=${reference}`
        )
      } else if (
        paystackStatus === 'failed' ||
        paystackStatus === 'abandoned'
      ) {
        // Mark as failed in DB if it's still pending (webhook might not have arrived yet)
        if (ticket.payment_status === 'pending') {
          ticket.payment_status = 'failed'
          await ticket.save()
          console.log(
            `Callback: Marked ticket ${ticket._id} as failed based on Paystack status.`
          )
        }
        console.log(
          `Callback: Paystack status failed/abandoned for ticket ${ticket._id}. Redirecting to failed page.`
        )
        return res.redirect(
          `${CLIENT_URL}/ticket-success?status=failed&reference=${reference}&message=${encodeURIComponent(
            `Payment ${paystackStatus}`
          )}`
        )
      } else {
        // Handle other potential statuses (e.g., pending, reversed)
        console.log(
          `Callback: Unhandled Paystack status '${paystackStatus}' for ticket ${ticket._id}. Redirecting to status page.`
        )
        // Redirect to a page that can handle other statuses or shows verification pending
        return res.redirect(
          `${CLIENT_URL}/ticket-success?status=${paystackStatus}&reference=${reference}&message=${encodeURIComponent(
            `Payment status: ${paystackStatus}`
          )}`
        )
      }
    } catch (err) {
      console.error(
        `Callback: Error in ticket callback verification for reference ${reference}:`,
        err
      )
      // Attempt to find the ticket by reference and mark as failed if pending
      const ticket = await Ticket.findOne({
        paystack_reference: reference,
      })
      if (ticket && ticket.payment_status === 'pending') {
        ticket.payment_status = 'failed'
        await ticket.save()
        console.log(
          `Callback: Marked ticket ${ticket._id} as failed due to callback error.`
        )
      }
      return res.redirect(
        `${CLIENT_URL}/ticket-success?status=failed&message=${encodeURIComponent(
          'Error during payment verification'
        )}&reference=${reference}`
      )
    }
  }
)

module.exports = router
