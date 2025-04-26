const express = require('express')
const router = express.Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const Admin = require('../../models/Admin')
const NominationCategory = require('../../models/NominationCategory')
const Nominee = require('../../models/Nominee')
const Vote = require('../../models/Vote')
const TicketType = require('../../models/TicketType') // Need TicketType to link tickets
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

// --- Tickets CRUD ---

// List Tickets with Search
// This route matches GET /dashboard/tickets
router.get('', authMiddleware, async (req, res) => { // Changed path from '/tickets' to ''
  try {
    // Extract search parameters from the query string
    const { code, name, ticket_type, email, phone } =
      req.query
    let query = {} // Initialize the Mongoose query object

    // Handle single ticket code search
    if (code) {
      // Case-insensitive search for ticket code
      query.ticket_code = { $regex: code, $options: 'i' }
    } else if (name || ticket_type || email || phone) {
      // Handle advanced search - only apply if at least one advanced search field is present
      if (name) {
        query.purchaser_name = {
          $regex: name,
          $options: 'i',
        }
      }
      if (ticket_type) {
        // Ensure ticket_type is a valid ObjectId if provided
        if (mongoose.Types.ObjectId.isValid(ticket_type)) {
          query.ticket_type = ticket_type // This expects a TicketType ObjectId
        } else {
          console.warn(
            `Invalid ticket_type ObjectId received: ${ticket_type}`
          )
          // You might want to handle this error more gracefully, e.g., return no results or an error message
        }
      }
      // Handle email OR phone search
      if (email || phone) {
        const orConditions = []
        if (email) {
          orConditions.push({
            purchaser_email: {
              $regex: email,
              $options: 'i',
            },
          })
        }
        if (phone) {
          orConditions.push({
            purchaser_phone: {
              $regex: phone,
              $options: 'i',
            },
          })
        }
        if (orConditions.length > 0) {
          query.$or = orConditions
        }
      }
    }
    // Note: If neither 'code' nor any advanced search parameters are provided (or they are empty strings),
    // the `query` object will be empty, and `Ticket.find({})` will return all tickets.
    // This means the /dashboard/tickets route by default lists all tickets, and also handles search when parameters are present.

    // Populate the linked ticket_type document for display in the results
    const tickets = await Ticket.find(query).populate(
      'ticket_type'
    )
    // Fetch all ticket types to populate the dropdown in the advanced search form
    const ticketTypes = await TicketType.find()

    // Get status message from query parameter after Paystack callback (still relevant here)
    const paymentStatus = req.query.payment_status
    const metadataMissing =
      req.query.metadata_missing === 'true' // Check for metadata issue flag

    // Render the tickets index view (which is tickets/index.ejs)
    // Assuming views/admin/tickets/index.ejs is the view that contains the search forms and displays results.
    // If you have a separate check.ejs, you would render that here instead.
    // Based on your previous request to create tickets/check.ejs, we should render that view.
    res.render('tickets/check', {
      // Render the check.ejs view
      tickets, // Pass the search results (or all tickets if no search)
      ticketTypes, // Pass ticket types for the filter dropdown
      paymentStatus, // Pass payment status message
      metadataMissing, // Pass metadata flag
      searchQuery: req.query, // Pass back search query values to pre-fill the form
    })
  } catch (err) {
    console.error('GET /dashboard/tickets error:', err) // Updated error log
    res.status(500).send('Server Error')
  }
})

// New Ticket Form
// This route matches GET /dashboard/tickets/new
router.get(
  '/new', // Changed path from '/tickets/new' to '/new'
  authMiddleware,
  async (req, res) => {
    try {
      // Need ticket types to link the new ticket to
      const ticketTypes = await TicketType.find()
      // Assuming views/admin/tickets/new.ejs
      res.render('tickets/new', { ticketTypes })
    } catch (err) {
      console.error('GET /dashboard/tickets/new error:', err) // Updated error log
      res.status(500).send('Server Error')
    }
  }
)

// Create Ticket and Initiate Paystack Payment
// This route matches POST /dashboard/tickets
router.post(
  '/', // Changed path from '/tickets' to '/'
  authMiddleware,
  async (req, res) => {
    try {
      // Removed ticket_code from req.body as it will be auto-generated
      const {
        ticket_type,
        purchaser_name,
        purchaser_email,
        purchaser_phone,
      } = req.body

      // Basic validation (ticket_code is now generated, not required in body)
      if (
        !ticket_type ||
        !purchaser_name ||
        !purchaser_email ||
        !purchaser_phone
      ) {
        // You might want to re-render the form with errors instead of just sending text
        return res
          .status(400)
          .send('Missing required fields')
      }

      // Find the selected ticket type to get the price
      const selectedTicketType = await TicketType.findById(
        ticket_type
      )
      if (!selectedTicketType) {
        return res
          .status(400)
          .send('Invalid ticket type selected')
      }

      // --- Auto-generate Ticket Code ---
      const ticketCode = `TICKET-${uuidv4()
        .split('-')[0]
        .toUpperCase()}` // Example: TICKET-xxxxxxx (uppercase for consistency)
      // Ensure the generated code is unique (add a loop/retry if needed, though UUID collision is rare)
      let isCodeUnique = false
      let generatedCode = ticketCode // Use a separate variable for generation attempts
      let attempts = 0
      while (!isCodeUnique && attempts < 5) {
        // Try up to 5 times
        const existingTicket = await Ticket.findOne({
          ticket_code: generatedCode,
        })
        if (!existingTicket) {
          isCodeUnique = true
        } else {
          generatedCode = `TICKET-${uuidv4()
            .split('-')[0]
            .toUpperCase()}` // Generate a new one
          attempts++
        }
      }
      if (!isCodeUnique) {
        console.error(
          'Failed to generate a unique ticket code after multiple attempts.'
        )
        return res
          .status(500)
          .send('Failed to generate a unique ticket code.')
      }

      // Generate a unique reference for Paystack
      const paystackReference = `ticket_${uuidv4()}` // Use uuid or similar for uniqueness

      // Create the ticket record with pending status, generated code, and the reference
      const newTicket = new Ticket({
        ticket_type,
        purchaser_name,
        purchaser_email,
        purchaser_phone,
        ticket_code: generatedCode, // Use the final generated code
        status: 'unused', // Initial ticket status
        payment_status: 'pending', // Initial payment status
        paystack_reference: paystackReference, // Store the reference
      })

      await newTicket.save() // Save the ticket first

      // --- Initiate Paystack Transaction ---
      const amountInKobo = Math.round(
        selectedTicketType.price * 100
      ) // Paystack uses kobo/cents

      try {
        const paystackResponse =
          await Paystack.transaction.initialize({
            email: purchaser_email,
            amount: amountInKobo,
            reference: paystackReference, // Use the generated reference
            currency: 'KES', // Assuming KES as per your api.js
            metadata: {
              ticket_id: newTicket._id.toString(), // Link Paystack transaction to the ticket ID
              ticket_code: generatedCode, // Also include the generated ticket code
              purchaser_name: purchaser_name,
              purchaser_email: purchaser_email,
              ticket_type_name: selectedTicketType.name,
              ticket_price: selectedTicketType.price,
            },
            // Set the callback URL that Paystack will redirect to after payment
            // Corrected callback URL to match the router's path
            callback_url: `${BASE_URL}/dashboard/tickets/paystack/ticket-callback`,
          })

        // Paystack initiation successful, redirect the admin's browser to the payment page
        if (paystackResponse.status) {
          // Check Paystack's response status
          // Redirect the admin to the Paystack payment page
          return res.redirect(
            paystackResponse.data.authorization_url
          )
        } else {
          // Handle unexpected response from Paystack
          console.error(
            'Paystack initiation failed:',
            paystackResponse.message
          )
          // Update ticket status to failed if initiation didn't return URL
          newTicket.payment_status = 'failed'
          await newTicket.save()
          return res
            .status(500)
            .send(
              'Failed to initiate payment with Paystack: ' +
                paystackResponse.message
            )
        }
      } catch (paystackErr) {
        console.error(
          'Error initiating Paystack transaction:',
          paystackErr.message
        )
        // Update ticket status to failed on initiation error
        newTicket.payment_status = 'failed'
        await newTicket.save()
        return res
          .status(500)
          .send(
            'Error initiating payment: ' +
              paystackErr.message
          )
      }
    } catch (err) {
      console.error('POST /dashboard/tickets error:', err) // Updated error log
      // If ticket creation failed before Paystack initiation
      res.status(500).send('Error creating ticket record')
    }
  }
)

// Paystack Callback Route for Tickets (where Paystack redirects after payment)
// This route matches GET /dashboard/tickets/paystack/ticket-callback
router.get(
  '/paystack/ticket-callback', // Path is '/paystack/ticket-callback' relative to the router's base path
  authMiddleware,
  async (req, res) => {
    // Added authMiddleware here
    const paystackReference = req.query.reference // Get the reference from Paystack query params

    if (!paystackReference) {
      console.error(
        'Paystack ticket callback received without reference'
      )
      // Redirect to the tickets list with a status message
      // Corrected redirect path
      return res.redirect(
        '/dashboard/tickets?payment_status=callback_error'
      )
    }

    try {
      // --- Debugging Log ---
      console.log(
        'Verifying Paystack transaction. Reference type:',
        typeof paystackReference,
        'Reference value:',
        paystackReference
      )
      // --- End Debugging Log ---

      // --- Verify Paystack Transaction ---
      // FIX: Pass the reference within an object as expected by paystack-api
      const verificationResponse =
        await Paystack.transaction.verify({
          reference: paystackReference,
        })

      const verificationData = verificationResponse.data

      if (verificationResponse.status && verificationData) {
        const paystackStatus = verificationData.status // 'success', 'failed', 'abandoned' etc.
        const ticketId =
          verificationData.metadata?.ticket_id // Get ticket ID from metadata

        let ticketToUpdate

        if (ticketId) {
          // Try to find ticket by ID from metadata first
          ticketToUpdate = await Ticket.findById(ticketId)
        }

        // If ticket not found by ID or ID was missing, try finding by reference
        if (!ticketToUpdate) {
          console.warn(
            `Ticket not found by ID ${
              ticketId || 'missing ID'
            } from metadata. Attempting to find by reference: ${paystackReference}`
          )
          ticketToUpdate = await Ticket.findOne({
            paystack_reference: paystackReference,
          })
        }

        if (ticketToUpdate) {
          if (paystackStatus === 'success') {
            // Prevent updating if already completed (idempotency)
            if (
              ticketToUpdate.payment_status !== 'completed'
            ) {
              ticketToUpdate.payment_status = 'completed'
              // --- Increment tickets_sold count on the linked TicketType ---
              const ticketType = await TicketType.findById(
                ticketToUpdate.ticket_type
              )
              if (ticketType) {
                ticketType.tickets_sold += 1
                await ticketType.save()
                console.log(
                  `Incremented tickets_sold for TicketType: ${ticketType.name}`
                )
              } else {
                console.warn(
                  `TicketType not found for ticket ${ticketToUpdate._id}. Cannot increment tickets_sold.`
                )
              }
              // --- End Increment Logic ---
            } else {
              console.log(
                `Ticket ${ticketToUpdate._id} already completed. Skipping update.`
              )
            }
          } else if (
            paystackStatus === 'failed' ||
            paystackStatus === 'abandoned'
          ) {
            // Consider abandoned as failed
            ticketToUpdate.payment_status = 'failed'
          }
          // Add other statuses if Paystack has them

          await ticketToUpdate.save()

          // Redirect the admin back to the tickets list with the payment status
          // Include a flag if metadata was missing but found by reference
          // Corrected redirect path
          const redirectUrl = `/dashboard/tickets?payment_status=${
            ticketToUpdate.payment_status
          }${!ticketId ? '&metadata_missing=true' : ''}`
          res.redirect(redirectUrl)
        } else {
          console.error(
            `Ticket not found for ID ${ticketId} (from metadata) or reference ${paystackReference}`
          )
          // Handle case where ticket ID from metadata doesn't exist and reference lookup also fails
          // Corrected redirect path
          res.redirect(
            '/dashboard/tickets?payment_status=completed_ticket_missing'
          )
        }
      } else {
        console.error(
          'Paystack verification failed or returned error status:',
          verificationResponse.message
        )
        // Find ticket by reference and update status to failed if verification itself failed
        const ticketToUpdate = await Ticket.findOne({
          paystack_reference: paystackReference,
        })
        if (ticketToUpdate) {
          ticketToUpdate.payment_status = 'failed'
          await ticketToUpdate.save()
        }
        // Corrected redirect path
        res.redirect(
          '/dashboard/tickets?payment_status=verification_error'
        )
      }
    } catch (verifyErr) {
      console.error(
        'Error verifying Paystack transaction:',
        verifyErr.message
      )
      // Find ticket by reference and update status to failed on verification error
      const ticketToUpdate = await Ticket.findOne({
        paystack_reference: paystackReference,
      })
      if (ticketToUpdate) {
        ticketToUpdate.payment_status = 'failed'
        await ticketToUpdate.save()
      }
      // Corrected redirect path
      res.redirect(
        '/dashboard/tickets?payment_status=verification_error'
      )
    }
  }
)

// --- Tickets Edit and Delete (keep as is, but ensure payment_status is handled) ---

// Edit Ticket Form (Ensure payment_status and paystack_reference are displayed)
// This route matches GET /dashboard/tickets/:id/edit
router.get(
  '/:id/edit', // Changed path from '/tickets/:id/edit' to '/:id/edit'
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
      ] // Allow manual editing of status
      const used_at_formatted = ticket.used_at
        ? ticket.used_at.toISOString().slice(0, 16)
        : ''

      // Assuming views/admin/tickets/edit.ejs
      res.render('tickets/edit', {
        ticket,
        ticketTypes,
        paymentStatuses,
        used_at_formatted,
      })
    } catch (err) {
      console.error(
        `GET /dashboard/tickets/${req.params.id}/edit error:`, // Updated error log
        err
      )
      res.status(500).send('Server Error')
    }
  }
)

// Update Ticket (Allow manual update of details and status)
// This route matches PUT /dashboard/tickets/:id
router.put(
  '/:id', // Changed path from '/tickets/:id' to '/:id'
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
      // Note: Manually changing payment_status here won't trigger Paystack verification.
      // This is for recording status based on external confirmation or correcting data.
      const ticket = await Ticket.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true }
      )
      if (!ticket) {
        return res.status(404).send('Ticket not found')
      }

      // TODO: If manually changing status to 'completed', you might need to manually increment tickets_sold on the linked TicketType

      // Corrected redirect path
      res.redirect('/dashboard/tickets')
    } catch (err) {
      console.error(
        `PUT /dashboard/tickets/${req.params.id} error:`, // Updated error log
        err
      )
      res.status(500).send('Error updating ticket')
    }
  }
)

// Delete Ticket (keep as is)
// This route matches DELETE /dashboard/tickets/:id
router.delete(
  '/:id', // Changed path from '/tickets/:id' to '/:id'
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

      // Corrected redirect path
      res.redirect('/dashboard/tickets')
    } catch (err) {
      console.error(
        `DELETE /dashboard/tickets/${req.params.id} error:`, // Updated error log
        err
      )
      res.status(500).send('Error deleting ticket')
    }
  }
)


module.exports = router
