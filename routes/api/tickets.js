const express = require('express');
const router = express.Router();
const Paystack = require('paystack-api')(
  process.env.PAYSTACK_SECRET_KEY
);
// crypto is no longer needed here as webhook is moved
// const crypto = require('crypto')
const { v4: uuidv4 } = require('uuid'); // For generating unique parts of the code

const TicketType = require('../../models/TicketType');
const Ticket = require('../../models/Ticket');

const {
  apiAuthMiddleware,
} = require('../../middleware/auth');

// --- Ticket APIs ---
// GET /api/tickets/types
// Fetches available ticket types
router.get(
  '/types',
  apiAuthMiddleware, // Apply authentication middleware if needed
  async (req, res) => {
    try {
      // Find TicketType documents where total_available is greater than tickets_sold
      // $expr allows using aggregation framework expressions to compare fields within the same document
      const availableTicketTypes = await TicketType.find({
        $expr: {
          $gt: ['$total_available', '$tickets_sold'],
        },
        // Uncomment and use this if you have an expiry_date field
        // and only want to show tickets that haven't expired yet:
        // expiry_date: { $gt: new Date() }
      }).select('-createdAt -updatedAt'); // Optionally exclude timestamps from response

      // If no ticket types are found or available, an empty array is returned, which is standard.
      res.json(availableTicketTypes);
    } catch (err) {
      console.error('GET /api/tickets/types error:', err);
      // Provide a more generic error message to the client, but log details server-side
      res.status(500).json({
        error: 'Failed to fetch available ticket types',
        // Avoid sending raw error details to the client in production unless necessary for debugging
        // details: err.message,
      });
    }
  }
);

// POST /api/tickets/purchase/:ticketTypeId
// Initiate ticket purchase and payment (Assumes one ticket per transaction)
router.post(
  '/purchase/:ticketTypeId',
  apiAuthMiddleware,
  async (req, res) => {
    const { ticketTypeId } = req.params;
    const {
      purchaser_name,
      purchaser_email,
      purchaser_phone,
    } = req.body;

    // Basic input validation - enhance with express-validator for production
    if (
      !purchaser_name ||
      !purchaser_email ||
      !purchaser_phone
    ) {
      return res.status(400).json({
        error:
          'Purchaser name, email, and phone are required.',
      });
    }
    // Basic email format check (can be more rigorous with a validator)
    if (!/\S+@\S+\.\S+/.test(purchaser_email)) {
      return res
        .status(400)
        .json({ error: 'Invalid email format.' });
    }

    try {
      const ticketType = await TicketType.findById(
        ticketTypeId
      );
      if (!ticketType) {
        console.warn(
          `Purchase initiated for non-existent ticket type ID: ${ticketTypeId}`
        );
        return res
          .status(404)
          .json({ error: 'Ticket type not found.' });
      }

      // Check for availability BEFORE creating the ticket record
      if (
        ticketType.tickets_sold >=
        ticketType.total_available
      ) {
        console.warn(
          `Purchase initiated for sold-out ticket type: ${ticketType.name} (${ticketTypeId})`
        );
        return res.status(400).json({
          error: 'No more tickets available for this type.',
        });
      }

      const payment_amount = ticketType.price; // Price for one ticket of this type

      // Generate a unique identifier for this specific ticket instance
      // Format: TICKET- followed by a unique string (e.g., part of a UUID)
      // Ensure your Ticket model has `ticket_code: { type: String, unique: true, required: true }`
      const uniqueIdPart = uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase(); // Get first 8 chars of UUID, remove dashes, make uppercase
      const ticketCode = `TICKET-${uniqueIdPart}`; // Format: TICKET-XXXXXXXX

      // Create the ticket record with 'pending' payment status.
      // We create it *before* payment initiation so we have an _id to use in the reference.
      // The webhook will update its status upon payment confirmation.
      // Ensure your Ticket model has `payment_status` and `payment_reference` fields.
      const ticket = await Ticket.create({
        ticket_type: ticketTypeId,
        purchaser_name,
        purchaser_email,
        purchaser_phone,
        ticket_code: ticketCode, // Store the generated unique code
        status: 'unused', // Initial status for a ticket instance awaiting payment confirmation
        payment_status: 'pending',
        // payment_reference will be added after Paystack initialization success
      });

      // Generate a unique reference for Paystack transaction
      // Use the newly created ticket's ID to easily find it in the webhook
      const reference = `ticket-${ticket._id.toString()}`;
      const frontendUrl = process.env.FRONTEND_URL; // Ensure this env var is set

      // Initialize transaction with Paystack
      const paystackResponse =
        await Paystack.transaction.initialize({
          email: purchaser_email,
          amount: payment_amount * 100, // Paystack amount is in cents (for KES)
          reference: reference,
          currency: 'KES',
          // CORRECTED Callback URL to match frontend route
          callback_url: `${frontendUrl}/ticket-success?reference=${reference}`,
        });

      // Check if Paystack initialization was successful
      if (!paystackResponse.status) {
        console.error(
          'Paystack initialization failed:',
          paystackResponse.message
        );
        // If initialization failed, you might want to clean up the pending ticket record,
        // or mark it with a specific status like 'initialization_failed'
        // await Ticket.findByIdAndDelete(ticket._id); // Option 1: Delete the ticket
        ticket.payment_status = 'initialization_failed'; // Option 2: Mark as failed
        await ticket.save();
        return res.status(500).json({
          error:
            'Failed to initiate payment with Paystack.',
          details: paystackResponse.message,
        });
      }

      // Save the generated Paystack reference to the ticket record
      // Ensure `payment_reference` field exists in your Ticket model
      ticket.payment_reference = reference;
      await ticket.save(); // Update the ticket document with the reference

      // Send the authorization URL back to the client
      res.json({
        authorization_url:
          paystackResponse.data.authorization_url,
        reference: reference, // Optionally return reference for frontend tracking
        ticket_code: ticketCode, // Optionally return ticket code
      });
    } catch (err) {
      console.error(
        `POST /api/tickets/purchase/${ticketTypeId} error:`,
        err
      );
      // If an error occurred *after* creating the ticket but before Paystack initialization,
      // the pending ticket will remain. The webhook for a failed/abandoned payment won't fire
      // because initialization failed. You might need a cleanup process for old 'pending' tickets
      // without a corresponding successful Paystack transaction.
      res.status(500).json({
        error:
          'Failed to initiate ticket purchase and payment.',
        // Avoid sending raw error details in production
        // details: err.message,
      });
    }
  }
);

// GET /api/tickets/by-reference/:reference
// NEW ENDPOINT: Fetches details for a purchased ticket by its Paystack reference
router.get('/by-reference/:reference', async (req, res) => {
    const { reference } = req.params;

    if (!reference) {
        console.warn('GET /by-reference: Missing reference parameter');
        return res.status(400).json({ error: 'Payment reference is required.' });
    }

    try {
        // Find the ticket by the payment reference
        // Populate ticket_type details as the frontend expects them
        const ticket = await Ticket.findOne({ payment_reference: reference }).populate('ticket_type');

        if (!ticket) {
            console.warn(`GET /by-reference: Ticket not found for reference: ${reference}`);
            return res.status(404).json({ error: 'Ticket not found for this reference.' });
        }

        // Check the payment status
        if (ticket.payment_status === 'completed') {
            // Payment is completed, return the ticket details
            console.log(`GET /by-reference: Ticket payment completed for reference: ${reference}. Returning details.`);
            res.json(ticket);
        } else if (ticket.payment_status === 'pending' || ticket.payment_status === 'initialization_failed') {
            // Payment is not yet completed (webhook hasn't fired or failed init)
            console.log(`GET /by-reference: Ticket payment status is ${ticket.payment_status} for reference: ${reference}. Signalling frontend to retry.`);
            // Return a 400 status to signal the frontend to potentially retry
            // Include the current payment status in the error message
            return res.status(400).json({ error: `Payment status for this ticket is ${ticket.payment_status}. Please wait or contact support if it doesn't update.` });
        } else {
            // Handle other statuses like 'failed', 'cancelled', 'refunded'
            console.warn(`GET /by-reference: Ticket has payment status "${ticket.payment_status}" for reference: ${reference}.`);
             return res.status(400).json({ error: `Ticket payment status is ${ticket.payment_status}. Please contact support.` });
        }

    } catch (err) {
        console.error(`GET /api/tickets/by-reference/${reference} error:`, err);
        res.status(500).json({
            error: 'Failed to fetch ticket details by reference.',
            details: err.message,
        });
    }
});


module.exports = router; // Export the router
