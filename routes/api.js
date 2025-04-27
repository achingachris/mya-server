const express = require('express');
const router = express.Router();
// Ensure Paystack is initialized with the secret key
const Paystack = require('paystack-api')(
  process.env.PAYSTACK_SECRET_KEY
);
const crypto = require('crypto');
const Admin = require('../models/Admin');
const NominationCategory = require('../models/NominationCategory');
const Nominee = require('../models/Nominee');
const TicketType = require('../models/TicketType');
const Ticket = require('../models/Ticket'); // Make sure Ticket model is required
const Vote = require('../models/Vote');
const { apiAuthMiddleware } = require('../middleware/auth');

const voteTiers = {
  10: 50,
  20: 100,
  30: 150,
  100: 500,
  200: 1000,
  400: 2000,
};

// Helper function to generate a unique ticket reference number
const generateTicketReference = () => {
  // Simple example: TICKET-timestamp-random_string
  // Using a slightly longer random part for better uniqueness
  return `TICKET-${Date.now()}-${crypto
    .randomBytes(4) // Increased from 3 to 4 bytes
    .toString('hex')
    .toUpperCase()}`;
};


// NOMINEES AND VOTING APIS

// Get all categories
router.get(
  '/categories',
  apiAuthMiddleware,
  async (req, res) => {
    try {
      const categories = await NominationCategory.find();
      res.json(categories);
    } catch (err) {
      console.error('GET /categories error:', err);
      res
        .status(500)
        .json({ error: 'Failed to fetch categories' });
    }
  }
);

// Get all nominees
router.get(
  '/nominees',
  apiAuthMiddleware,
  async (req, res) => {
    try {
      const nominees = await Nominee.find().populate(
        'category'
      );
      res.json(nominees);
    } catch (err) {
      console.error('GET /nominees error:', err);
      res
        .status(500)
        .json({ error: 'Failed to fetch nominees' });
    }
  }
);

// Get nominees by category
router.get(
  '/nominees/category/:categoryId',
  apiAuthMiddleware,
  async (req, res) => {
    const { categoryId } = req.params;

    try {
      const category = await NominationCategory.findById(
        categoryId
      );
      if (!category)
        return res
          .status(404)
          .json({ error: 'Category not found' });

      const nominees = await Nominee.find({
        category: categoryId,
      }).populate('category');
      res.json(nominees);
    } catch (err) {
      console.error(
        `GET /nominees/category/${categoryId} error:`,
        err
      );
      res.status(500).json({
        error: 'Failed to fetch nominees by category',
      });
    }
  }
);

// Initiate vote and payment
router.post(
  '/vote/initiate/:nomineeId',
  async (req, res) => {
    const { nomineeId } = req.params;
    const {
      numberOfVotes,
      voterName,
      voterEmail,
      voterPhone,
    } = req.body;

    if (
      !numberOfVotes ||
      !voterName ||
      !voterEmail ||
      !voterPhone
    ) {
      return res
        .status(400)
        .json({ error: 'All fields are required' });
    }

    if (!voteTiers[numberOfVotes]) {
      return res.status(400).json({
        error:
          'Invalid number of votes. Allowed options: 10 (50 KES), 20 (100), 30 (150), 100 (500), 200 (1000), 400 (2000).',
      });
    }

    try {
      const nominee = await Nominee.findById(nomineeId);
      if (!nominee)
        return res
          .status(404)
          .json({ error: 'Nominee not found' });

      const payment_amount = voteTiers[numberOfVotes];

      const vote = await Vote.create({
        nominee: nomineeId,
        voter_name: voterName,
        voter_email: voterEmail,
        voter_phone: voterPhone,
        number_of_votes: numberOfVotes,
        payment_amount,
        payment_status: 'pending',
      });

      const reference = `vote-${vote._id.toString()}`;
      const frontendUrl = process.env.FRONTEND_URL;

      const paystackResponse =
        await Paystack.transaction.initialize({
          email: voterEmail,
          amount: payment_amount * 100,
          reference,
          currency: 'KES',
          callback_url: `${frontendUrl}/vote-success?nominee=${encodeURIComponent(
            nominee.name
          )}&votes=${numberOfVotes}`,
        });

      vote.payment_reference = reference;
      await vote.save();

      res.json({
        authorization_url:
          paystackResponse.data.authorization_url,
      });
    } catch (err) {
      console.error(
        `POST /vote/initiate/${req.params.nomineeId} error:`,
        err
      );
      res.status(500).json({
        error: 'Failed to initiate vote and payment',
      });
    }
  }
);
// END NOMINEES AND VOTING APIS

// TICKETS APIS

// Get all ticket types
router.get(
  '/ticket-types',
  // apiAuthMiddleware, // Decide if this public endpoint needs auth
  async (req, res) => {
    try {
      // Fetch only necessary fields for display on the frontend
      // Include maximum_tickets and tickets_sold for frontend availability check
      const ticketTypes = await TicketType.find(
        {},
        'name amount _id maximum_tickets tickets_sold'
      );
      res.json(ticketTypes);
    } catch (err) {
      console.error('GET /ticket-types error:', err);
      res
        .status(500)
        .json({ error: 'Failed to fetch ticket types' });
    }
  }
);

// Initiate ticket purchase and payment
router.post(
  '/tickets/purchase/:ticketTypeId',
  async (req, res) => {
    const { ticketTypeId } = req.params;
    const {
      purchaser_name,
      purchaser_email,
      purchaser_phone,
      quantity,
    } = req.body;

    // Validate required fields
    if (
      !purchaser_name ||
      !purchaser_email ||
      !purchaser_phone ||
      !quantity ||
      quantity <= 0
    ) {
      return res
        .status(400)
        .json({
          error:
            'Purchaser details and a valid quantity are required',
        });
    }

    try {
      // Find the ticket type
      const ticketType = await TicketType.findById(
        ticketTypeId
      );
      if (!ticketType) {
        return res
          .status(404)
          .json({ error: 'Ticket type not found' });
      }

      // Check if enough tickets are available (Backend verification)
      if (
        ticketType.tickets_sold + quantity >
        ticketType.maximum_tickets
      ) {
        return res
          .status(400)
          .json({
            error: `Only ${
              ticketType.maximum_tickets -
              ticketType.tickets_sold
            } tickets remaining for this type.`,
          });
      }

      const totalAmount = ticketType.amount * quantity;
      const ticketReference = generateTicketReference(); // Generate a unique reference number
      const frontendUrl = process.env.FRONTEND_URL; // Assuming frontend URL is in env

      // Create a new Ticket document with pending status
      // This document exists BEFORE payment is confirmed.
      const ticket = await Ticket.create({
        purchaser_name,
        purchaser_email,
        purchaser_phone,
        ticket_type: ticketTypeId,
        number_of_tickets: quantity,
        total_amount: totalAmount,
        ticket_reference_number: ticketReference, // Store the generated reference
        payment_status: 'pending', // Initial status
      });

      // Initiate payment with Paystack
      const paystackResponse =
        await Paystack.transaction.initialize({
          email: purchaser_email,
          amount: totalAmount * 100, // Amount in kobo/pesewas
          reference: ticketReference, // Use the generated ticket reference as Paystack reference
          currency: 'KES',
          // Define a callback URL for successful ticket purchases
          callback_url: `${frontendUrl}/ticket-success?reference=${encodeURIComponent(
            ticketReference
          )}`, // Pass the reference back to the success page
          metadata: {
            ticketId: ticket._id.toString(), // Store ticket ID in metadata for webhook
            ticketType: ticketType.name,
            quantity: quantity,
            // Add a type indicator to distinguish from vote webhooks
            type: 'ticket',
          },
        });

        // Paystack initialization successful, return auth URL
        res.json({
            authorization_url: paystackResponse.data.authorization_url,
        });

    } catch (err) {
        console.error(
            `POST /tickets/purchase/${ticketTypeId} error:`,
            err
        );
        // If an error occurs AFTER ticket creation but BEFORE successful Paystack initialization,
        // you might want to mark the ticket status as 'initialization_failed' or similar,
        // or even delete the pending ticket to prevent orphaned records.
        // For simplicity here, we just log and return 500.
        // if (ticket && ticket._id) {
        //     ticket.payment_status = 'initialization_failed';
        //     await ticket.save();
        // }
        res
            .status(500)
            .json({
                error: 'Failed to initiate ticket purchase',
            });
    }
});

// --- NEW ENDPOINT: Get Ticket Details by Reference for Frontend Verification ---
router.get('/tickets/by-reference/:reference', async (req, res) => {
    const { reference } = req.params;

    try {
        // Find the ticket by its reference number
        const ticket = await Ticket.findOne({ ticket_reference_number: reference }).populate('ticket_type');

        if (!ticket) {
            console.warn(`GET /tickets/by-reference/${reference}: Ticket not found.`);
            return res.status(404).json({ error: 'Ticket not found for this reference.' });
        }

        // Check the payment status of the ticket
        if (ticket.payment_status === 'completed') {
            // If completed, return the ticket details (including populated ticket_type)
            console.log(`GET /tickets/by-reference/${reference}: Payment completed.`);
            res.json(ticket);
        } else if (ticket.payment_status === 'pending') {
             // If pending, return a 400 with a specific message so the frontend can retry
             console.log(`GET /tickets/by-reference/${reference}: Payment status is pending.`);
             // Use a distinct error message that the frontend can specifically look for
             res.status(400).json({ error: 'Payment status for this ticket is pending.' });
        } else {
            // If failed or other status, return a 400 with a failure message
            console.warn(`GET /tickets/by-reference/${reference}: Payment status is ${ticket.payment_status}.`);
             res.status(400).json({ error: `Payment failed for this ticket (Status: ${ticket.payment_status}).` });
        }

    } catch (err) {
        console.error(`GET /tickets/by-reference/${reference} error:`, err);
        res.status(500).json({ error: 'Failed to retrieve ticket details.' });
    }
});
// --- END NEW ENDPOINT ---


// END TICKETS APIS


// Paystack webhook
router.post('/webhook/paystack', async (req, res) => {
  // Verify the webhook signature
  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (hash !== req.headers['x-paystack-signature']) {
    console.error('Invalid Paystack signature');
    // Return 401 if signature is invalid
    return res.status(401).send('Invalid signature');
  }

  // Signature is valid, process the event
  const event = req.body;
  const reference = event.data.reference; // Get the reference from the event data

  console.log(
    'Received Paystack webhook event:',
    event.event,
    'for reference:',
    reference
  );

  // Handle charge success event
  if (event.event === 'charge.success') {
    try {
      // Determine if the reference is for a vote or a ticket based on prefix or metadata
      // Using metadata is more robust if available
      const eventType = event.data.metadata?.type; // Check metadata first

      if (eventType === 'vote' || reference.startsWith('vote-')) {
        // --- Handle Vote Payment ---
        console.log(
          'Handling vote charge.success for:',
          reference
        );
        const vote = await Vote.findOne({
          payment_reference: reference,
        });
        if (!vote) {
          console.error(
            'Vote not found for reference:',
            reference
          );
          // Still return 200 to acknowledge webhook receipt, even if we can't find the record
          return res.sendStatus(200);
        }

        if (vote.payment_status === 'completed') {
          console.log(
            'Vote already completed for:',
            reference
          );
          return res.sendStatus(200); // Already processed
        }

        // Verify amount (optional but good practice)
        // const expectedAmount = vote.payment_amount * 100; // Amount in kobo
        // if (event.data.amount !== expectedAmount) {
        //     console.warn(`Amount mismatch for vote reference ${reference}. Expected: ${expectedAmount}, Received: ${event.data.amount}`);
        //     // You might want to handle this discrepancy, e.g., log it or mark vote status differently
        // }

        // Update vote payment status to completed
        vote.payment_status = 'completed';
        await vote.save();
        console.log('Marked vote as completed:', reference);


        // Increment nominee vote count
        const nominee = await Nominee.findByIdAndUpdate(
          vote.nominee,
          {
            $inc: { number_of_votes: vote.number_of_votes },
          },
          { new: true } // Return the updated nominee document
        );

        if (!nominee) {
          console.error('Nominee not found for vote:', vote);
        } else {
          console.log(
            `Updated nominee vote count: ${nominee.name} (+${vote.number_of_votes})`
          );
        }

      } else if (eventType === 'ticket' || reference.startsWith('TICKET-')) {
        // --- Handle Ticket Payment ---
        console.log(
          'Handling ticket charge.success for:',
          reference
        );
        // Find the ticket using the reference number
        const ticket = await Ticket.findOne({
          ticket_reference_number: reference,
        });
        if (!ticket) {
          console.error(
            'Ticket not found for reference:',
            reference
          );
          // Still return 200 to acknowledge webhook receipt
          return res.sendStatus(200);
        }

        if (ticket.payment_status === 'completed') {
          console.log(
            'Ticket already completed for:',
            reference
          );
          return res.sendStatus(200); // Already processed
        }

        // Verify amount (optional but good practice)
        // const expectedAmount = ticket.total_amount * 100; // Amount in kobo
        // if (event.data.amount !== expectedAmount) {
        //     console.warn(`Amount mismatch for ticket reference ${reference}. Expected: ${expectedAmount}, Received: ${event.data.amount}`);
        //     // Handle discrepancy - maybe mark ticket status as 'completed_amount_mismatch'
        // }

        // Update ticket payment status to completed
        ticket.payment_status = 'completed';
        await ticket.save();
        console.log(
          'Marked ticket as completed:',
          reference
        );

        // Increment tickets_sold count on the associated TicketType
        // Find the associated TicketType and increment its tickets_sold count
        const ticketType =
          await TicketType.findByIdAndUpdate(
            ticket.ticket_type, // Use the ticket_type ObjectId from the ticket document
            {
              $inc: {
                tickets_sold: ticket.number_of_tickets,
              },
            }, // Increment by the number of tickets purchased in this transaction
            { new: true } // Return the updated TicketType document
          );

        if (!ticketType) {
          console.error(
            'TicketType not found for ticket:',
            ticket._id,
            'type ID:',
            ticket.ticket_type
          );
        } else {
          console.log(
            `Updated TicketType tickets_sold: ${ticketType.name} (+${ticket.number_of_tickets})`
          );
        }
      } else {
        // Handle unknown reference format or event type
        console.warn(
          'Received webhook for unknown reference format or type:',
          reference,
          'Event Type:',
          eventType
        );
      }

    } catch (err) {
      console.error('Webhook charge.success error:', err);
      // Log the error but still send 200 to Paystack to prevent retries
      // You will need to manually investigate this error in your logs
    }

  } else if (event.event === 'charge.failed') {
    // Handle charge failed event
    try {
       // Determine if the reference is for a vote or a ticket
       const eventType = event.data.metadata?.type; // Check metadata first

       if (eventType === 'vote' || reference.startsWith('vote-')) {
            // --- Handle Vote Payment Failure ---
            console.log(
              'Handling vote charge.failed for:',
              reference
            );
            const vote = await Vote.findOne({
              payment_reference: reference,
            });
            // Only update status if it's still pending
            if (vote && vote.payment_status === 'pending') {
              vote.payment_status = 'failed';
              await vote.save();
              console.log('Marked vote as failed:', reference);
            }
       } else if (eventType === 'ticket' || reference.startsWith('TICKET-')) {
            // --- Handle Ticket Payment Failure ---
            console.log(
              'Handling ticket charge.failed for:',
              reference
            );
            const ticket = await Ticket.findOne({
              ticket_reference_number: reference,
            });
            // Only update status if it's still pending
            if (ticket && ticket.payment_status === 'pending') {
                ticket.payment_status = 'failed';
                await ticket.save();
                console.log('Marked ticket as failed:', reference);
            }
       } else {
           console.warn(
             'Received failed webhook for unknown reference format or type:',
             reference,
             'Event Type:',
             eventType
           );
       }
    } catch (err) {
      console.error('Webhook charge.failed error:', err);
       // Log the error but still send 200 to Paystack
    }
  }
  // You might handle other Paystack events here if necessary (e.g., 'transfer.success')

  // Always send a 200 status code to acknowledge receipt of the webhook
  // This is crucial for Paystack to stop sending the same event
  res.sendStatus(200);
});

module.exports = router;
