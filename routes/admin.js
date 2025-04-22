const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const NominationCategory = require('../models/NominationCategory');
const Nominee = require('../models/Nominee');
const Vote = require('../models/Vote');
const TicketType = require('../models/TicketType');
const Ticket = require('../models/Ticket');
const Coupon = require('../models/Coupon');
// Use the paystack-api library similar to api.js
const Paystack = require('paystack-api')(process.env.PAYSTACK_SECRET_KEY);
const { v4: uuidv4 } = require('uuid'); // For generating unique references

const { authMiddleware } = require('../middleware/auth'); // Assuming authMiddleware is correctly implemented

// Ensure Paystack Secret Key and FRONTEND_URL are defined in your .env file
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
// Corrected: Use FRONTEND_URL as defined in the user's .env
const BASE_URL = process.env.FRONTEND_URL; // Your app's base URL (e.g., http://localhost:3000)

// Check for essential environment variables on startup
if (!PAYSTACK_SECRET_KEY || !BASE_URL) {
    console.error("FATAL ERROR: PAYSTACK_SECRET_KEY and FRONTEND_URL must be defined in your .env file.");
    // In a production app, you might want a more graceful shutdown or logging
    process.exit(1); // Exit the process if essential config is missing
}


// --- Admin Authentication Routes ---

// Login Page
router.get('/login', (req, res) =>
  // Assuming 'login.ejs' exists in your views directory (views/admin/login.ejs)
  res.render('login', { error: null })
);

// Handle Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const admin = await Admin.findOne({ username });
    // Assuming Admin model has a method matchPassword(password)
    if (!admin || !(await admin.matchPassword(password))) {
      return res.render('login', {
        error: 'Invalid credentials',
      });
    }
    // Generate JWT token
    const token = jwt.sign(
      { id: admin._id },
      process.env.JWT_SECRET,
      { expiresIn: '1h' } // Token expires in 1 hour
    );
    // Set token as a cookie
    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' }); // Add secure flag in production
    res.redirect('/admin/dashboard');
  } catch (err) {
    console.error('Admin login error:', err);
    res.render('login', { error: 'An error occurred during login' });
  }
});

// Logout
router.get('/logout', (req, res) => {
    res.clearCookie('token'); // Clear the authentication cookie
    res.redirect('/admin/login'); // Redirect to login page
});


// --- Dashboard ---

// Dashboard View
router.get(
  '/dashboard',
  authMiddleware, // Protect this route with authentication middleware
  async (req, res) => {
    try {
      // Calculate total revenue from completed votes
      const totalRevenue = await Vote.aggregate([
        { $match: { payment_status: 'completed' } },
        {
          $group: {
            _id: null,
            total: { $sum: '$payment_amount' },
          },
        },
      ]);

      // Calculate total tickets sold from TicketType model
       const totalTicketsSold = await TicketType.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: '$tickets_sold' },
          },
        },
      ]);

      // Fetch counts of other models for dashboard overview (optional)
      const totalTicketTypes = await TicketType.countDocuments();
      const totalTickets = await Ticket.countDocuments();
      const totalCoupons = await Coupon.countDocuments();
      const totalNominees = await Nominee.countDocuments();
      const totalCategories = await NominationCategory.countDocuments();


      res.render('dashboard', { // Assuming 'dashboard.ejs' exists in views/admin/
        totalRevenue: totalRevenue[0]?.total || 0,
        totalTicketsSold: totalTicketsSold[0]?.total || 0,
        totalTicketTypes,
        totalTickets,
        totalCoupons,
        totalNominees,
        totalCategories,
      });
    } catch (err) {
      console.error('Dashboard route error:', err);
      res.status(500).send('Server Error'); // Or render an error page
    }
  }
);


// --- Nomination Categories CRUD ---

// List Categories
router.get(
  '/categories',
  authMiddleware,
  async (req, res) => {
    try {
      const categories = await NominationCategory.find();
      // Assuming views/admin/categories/index.ejs
      res.render('categories/index', { categories });
    } catch (err) {
      console.error('GET /admin/categories error:', err);
      res.status(500).send('Server Error');
    }
  }
);

// New Category Form
router.get('/categories/new', authMiddleware, (req, res) =>
  // Assuming views/admin/categories/new.ejs
  res.render('categories/new')
);

// Create Category
router.post(
  '/categories',
  authMiddleware,
  async (req, res) => {
    try {
       // Basic validation - you might need more robust validation
        if (!req.body.name) { // Assuming 'name' is the primary field
             return res.status(400).send('Category name is required');
        }
      await NominationCategory.create(req.body);
      res.redirect('/admin/categories');
    } catch (err) {
      console.error('POST /admin/categories error:', err);
      // You might want to render the form again with error messages
      res.status(500).send('Error creating category');
    }
  }
);

// Edit Category Form
router.get(
  '/categories/:id/edit',
  authMiddleware,
  async (req, res) => {
    try {
      const category = await NominationCategory.findById(
        req.params.id
      );
      if (!category) {
        return res.status(404).send('Category not found');
      }
      // Assuming views/admin/categories/edit.ejs
      res.render('categories/edit', { category });
    } catch (err) {
      console.error(`GET /admin/categories/${req.params.id}/edit error:`, err);
      res.status(500).send('Server Error');
    }
  }
);

// Update Category
router.put(
  '/categories/:id',
  authMiddleware,
  async (req, res) => {
    try {
         // Basic validation - you might need more robust validation
        if (!req.body.name) { // Assuming 'name' is the primary field
             return res.status(400).send('Category name is required');
        }
      const category = await NominationCategory.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true } // Return the updated document
      );
       if (!category) {
        return res.status(404).send('Category not found');
      }
      res.redirect('/admin/categories');
    } catch (err) {
      console.error(`PUT /admin/categories/${req.params.id} error:`, err);
      res.status(500).send('Error updating category');
    }
  }
);

// Delete Category
router.delete(
  '/categories/:id',
  authMiddleware,
  async (req, res) => {
    try {
      const category = await NominationCategory.findByIdAndDelete(
        req.params.id
      );
       if (!category) {
        return res.status(404).send('Category not found');
      }
      // TODO: Add logic to handle nominees linked to this category (e.g., prevent deletion if linked nominees exist, or nullify the reference)
      res.redirect('/admin/categories');
    } catch (err) {
      console.error(`DELETE /admin/categories/${req.params.id} error:`, err);
      res.status(500).send('Error deleting category');
    }
  }
);


// --- Nominees CRUD ---

// List Nominees
router.get(
  '/nominees',
  authMiddleware,
  async (req, res) => {
    try {
      const { search, category } = req.query;
      let query = {};
      if (search)
        query.name = { $regex: search, $options: 'i' };
      if (category) query.category = category;

      const nominees = await Nominee.find(query).populate('category');
      const categories = await NominationCategory.find(); // Fetch categories for filter dropdown

      // Assuming views/admin/nominees/index.ejs
      res.render('nominees/index', {
        nominees,
        categories, // Pass categories to the view
        search, // Pass current search query back
        category, // Pass current category filter back
      });
    } catch (err) {
      console.error('GET /admin/nominees error:', err);
      res.status(500).send('Server Error');
    }
  }
);

// New Nominee Form
router.get(
  '/nominees/new',
  authMiddleware,
  async (req, res) => {
    try {
      const categories = await NominationCategory.find(); // Need categories to select for nominee
      // Assuming views/admin/nominees/new.ejs
      res.render('nominees/new', { categories });
    } catch (err) {
      console.error('GET /admin/nominees/new error:', err);
       res.status(500).send('Server Error');
    }
  }
);

// Create Nominee
router.post(
  '/nominees',
  authMiddleware,
  async (req, res) => {
    try {
       // Basic validation - ensure required fields are present
        if (!req.body.name || !req.body.category || !req.body.image_url) {
             return res.status(400).send('Missing required fields for nominee');
        }
      await Nominee.create(req.body);
      res.redirect('/admin/nominees');
    } catch (err) {
      console.error('POST /admin/nominees error:', err);
       res.status(500).send('Error creating nominee');
    }
  }
);

// Edit Nominee Form
router.get(
  '/nominees/:id/edit',
  authMiddleware,
  async (req, res) => {
    try {
      const nominee = await Nominee.findById(req.params.id);
      if (!nominee) {
         return res.status(404).send('Nominee not found');
      }
      const categories = await NominationCategory.find(); // Need categories to select for nominee
      // Assuming views/admin/nominees/edit.ejs
      res.render('nominees/edit', { nominee, categories });
    } catch (err) {
      console.error(`GET /admin/nominees/${req.params.id}/edit error:`, err);
       res.status(500).send('Server Error');
    }
  }
);

// Update Nominee
router.put(
  '/nominees/:id',
  authMiddleware,
  async (req, res) => {
    try {
       // Basic validation
        if (!req.body.name || !req.body.category || !req.body.image_url) {
             return res.status(400).send('Missing required fields for nominee');
        }
      const nominee = await Nominee.findByIdAndUpdate(req.params.id, req.body, { new: true });
       if (!nominee) {
         return res.status(404).send('Nominee not found');
      }
      res.redirect('/admin/nominees');
    } catch (err) {
      console.error(`PUT /admin/nominees/${req.params.id} error:`, err);
       res.status(500).send('Error updating nominee');
    }
  }
);

// Delete Nominee
router.delete(
  '/nominees/:id',
  authMiddleware,
  async (req, res) => {
    try {
      const nominee = await Nominee.findByIdAndDelete(req.params.id);
       if (!nominee) {
         return res.status(404).send('Nominee not found');
      }
      // TODO: Add logic to handle votes linked to this nominee (e.g., prevent deletion if linked votes exist, or nullify the reference)
      res.redirect('/admin/nominees');
    } catch (err) {
      console.error(`DELETE /admin/nominees/${req.params.id} error:`, err);
       res.status(500).send('Error deleting nominee');
    }
  }
);


// --- Votes (Read Only - typically no CRUD) ---

// List Votes
router.get('/votes', authMiddleware, async (req, res) => {
  try {
    const votes = await Vote.find().populate('nominee'); // Populate nominee details
    // Assuming views/admin/votes/index.ejs
    res.render('votes/index', { votes });
  } catch (err) {
    console.error('GET /admin/votes error:', err);
    res.status(500).send('Server Error');
  }
});

// Revenue endpoint (Already existed, keeping it, though dashboard shows it)
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
    ]);
    res.json({ totalRevenue: totalRevenue[0]?.total || 0 });
  } catch (err) {
    console.error('GET /admin/revenue error:', err);
    res.status(500).json({ error: 'Server Error' });
  }
});


// --- Ticket Types CRUD ---

// List Ticket Types
router.get('/tickettypes', authMiddleware, async (req, res) => {
    try {
        const ticketTypes = await TicketType.find();
        // Assuming views/admin/tickettypes/index.ejs
        res.render('tickettypes/index', { ticketTypes });
    } catch (err) {
        console.error('GET /admin/tickettypes error:', err);
        res.status(500).send('Server Error');
    }
});

// New Ticket Type Form
router.get('/tickettypes/new', authMiddleware, (req, res) => {
    // Assuming views/admin/tickettypes/new.ejs
    res.render('tickettypes/new');
});

// Create Ticket Type
router.post('/tickettypes', authMiddleware, async (req, res) => {
    try {
        // Basic validation - you might need more robust validation
        if (!req.body.name || req.body.price === undefined || req.body.total_available === undefined) {
             return res.status(400).send('Missing required fields for ticket type');
        }
        // Ensure price and total_available are numbers
        if (isNaN(req.body.price) || isNaN(req.body.total_available)) {
             return res.status(400).send('Price and Total Available must be numbers');
        }
        await TicketType.create(req.body);
        res.redirect('/admin/tickettypes');
    } catch (err) {
        console.error('POST /admin/tickettypes error:', err);
        // Handle potential duplicate name errors etc.
        res.status(500).send('Error creating ticket type');
    }
});

// Edit Ticket Type Form
router.get('/tickettypes/:id/edit', authMiddleware, async (req, res) => {
    try {
        const ticketType = await TicketType.findById(req.params.id);
         if (!ticketType) {
            return res.status(404).send('Ticket type not found');
         }
        // Assuming views/admin/tickettypes/edit.ejs
        res.render('tickettypes/edit', { ticketType });
    } catch (err) {
        console.error(`GET /admin/tickettypes/${req.params.id}/edit error`, err);
        res.status(500).send('Server Error');
    }
});

// Update Ticket Type
router.put('/tickettypes/:id', authMiddleware, async (req, res) => {
    try {
         // Basic validation - you might need more robust validation
        if (!req.body.name || req.body.price === undefined || req.body.total_available === undefined) {
             return res.status(400).send('Missing required fields for ticket type');
        }
         // Ensure price and total_available are numbers
        if (isNaN(req.body.price) || isNaN(req.body.total_available)) {
             return res.status(400).send('Price and Total Available must be numbers');
        }
        const ticketType = await TicketType.findByIdAndUpdate(req.params.id, req.body, { new: true });
         if (!ticketType) {
            return res.status(404).send('Ticket type not found');
         }
        res.redirect('/admin/tickettypes');
    } catch (err) {
        console.error(`PUT /admin/tickettypes/${req.params.id} error:`, err);
        res.status(500).send('Error updating ticket type');
    }
});

// Delete Ticket Type
router.delete('/tickettypes/:id', authMiddleware, async (req, res) => {
    try {
        const ticketType = await TicketType.findByIdAndDelete(req.params.id);
         if (!ticketType) {
            return res.status(404).send('Ticket type not found');
         }
         // TODO: Add logic to handle existing Tickets linked to this type (e.g., prevent deletion if linked tickets exist, or nullify the reference)
        res.redirect('/admin/tickettypes');
    } catch (err) {
        console.error(`DELETE /admin/tickettypes/${req.params.id} error:`, err);
        res.status(500).send('Error deleting ticket type');
    }
});


// --- Tickets CRUD ---
// NOTE: Creating individual tickets via the admin panel with payment initiation.
// Editing might be used to change status (used/cancelled) or purchaser details or manually update payment status.

// List Tickets
router.get('/tickets', authMiddleware, async (req, res) => {
    try {
        // Populate ticket_type to show type details in the list
        const tickets = await Ticket.find().populate('ticket_type');
        // Get status message from query parameter after Paystack callback
        const paymentStatus = req.query.payment_status;
        const metadataMissing = req.query.metadata_missing === 'true'; // Check for metadata issue flag

        // Assuming views/admin/tickets/index.ejs
        res.render('tickets/index', { tickets, paymentStatus, metadataMissing });
    } catch (err) {
        console.error('GET /admin/tickets error:', err);
        res.status(500).send('Server Error');
    }
});

// New Ticket Form
router.get('/tickets/new', authMiddleware, async (req, res) => {
    try {
        // Need ticket types to link the new ticket to
        const ticketTypes = await TicketType.find();
        // Assuming views/admin/tickets/new.ejs
        res.render('tickets/new', { ticketTypes });
    } catch (err) {
        console.error('GET /admin/tickets/new error:', err);
        res.status(500).send('Server Error');
    }
});

// Create Ticket and Initiate Paystack Payment
router.post('/tickets', authMiddleware, async (req, res) => {
    try {
        // Removed ticket_code from req.body as it will be auto-generated
        const { ticket_type, purchaser_name, purchaser_email, purchaser_phone } = req.body;

        // Basic validation (ticket_code is now generated, not required in body)
        if (!ticket_type || !purchaser_name || !purchaser_email || !purchaser_phone) {
             // You might want to re-render the form with errors instead of just sending text
             return res.status(400).send('Missing required fields');
        }

        // Find the selected ticket type to get the price
        const selectedTicketType = await TicketType.findById(ticket_type);
        if (!selectedTicketType) {
            return res.status(400).send('Invalid ticket type selected');
        }

        // --- Auto-generate Ticket Code ---
        const ticketCode = `TICKET-${uuidv4().split('-')[0]}`; // Example: TICKET-xxxxxxx

        // Generate a unique reference for Paystack
        const paystackReference = `ticket_${uuidv4()}`; // Use uuid or similar for uniqueness

        // Create the ticket record with pending status, generated code, and the reference
        const newTicket = new Ticket({
            ticket_type,
            purchaser_name,
            purchaser_email,
            purchaser_phone,
            ticket_code: ticketCode, // Use the generated code
            status: 'unused', // Initial ticket status
            payment_status: 'pending', // Initial payment status
            paystack_reference: paystackReference, // Store the reference
        });

        await newTicket.save(); // Save the ticket first

        // --- Initiate Paystack Transaction ---
        const amountInKobo = Math.round(selectedTicketType.price * 100); // Paystack uses kobo/cents

        try {
            const paystackResponse = await Paystack.transaction.initialize({
                email: purchaser_email,
                amount: amountInKobo,
                reference: paystackReference, // Use the generated reference
                currency: 'KES', // Assuming KES as per your api.js
                metadata: {
                    ticket_id: newTicket._id.toString(), // Link Paystack transaction to the ticket ID
                    ticket_code: ticketCode, // Also include the generated ticket code
                    purchaser_name: purchaser_name,
                    purchaser_email: purchaser_email,
                    ticket_type_name: selectedTicketType.name,
                    ticket_price: selectedTicketType.price,
                },
                // Set the callback URL that Paystack will redirect to after payment
                callback_url: `${BASE_URL}/admin/paystack/ticket-callback`, // New callback route
            });

            // Paystack initiation successful, redirect the admin's browser to the payment page
            if (paystackResponse.status) { // Check Paystack's response status
                 // Redirect the admin to the Paystack payment page
                 return res.redirect(paystackResponse.data.authorization_url);
            } else {
                // Handle unexpected response from Paystack
                console.error('Paystack initiation failed:', paystackResponse.message);
                 // Update ticket status to failed if initiation didn't return URL
                 newTicket.payment_status = 'failed';
                 await newTicket.save();
                return res.status(500).send('Failed to initiate payment with Paystack: ' + paystackResponse.message);
            }

        } catch (paystackErr) {
            console.error('Error initiating Paystack transaction:', paystackErr.message);
             // Update ticket status to failed on initiation error
             newTicket.payment_status = 'failed';
             await newTicket.save();
            return res.status(500).send('Error initiating payment: ' + paystackErr.message);
        }

    } catch (err) {
        console.error('POST /admin/tickets error:', err);
        // If ticket creation failed before Paystack initiation
        res.status(500).send('Error creating ticket record');
    }
});

// Paystack Callback Route for Tickets (where Paystack redirects after payment)
// This route will verify the transaction and update the ticket's status
router.get('/paystack/ticket-callback', async (req, res) => {
    const paystackReference = req.query.reference; // Get the reference from Paystack query params

    if (!paystackReference) {
        console.error('Paystack ticket callback received without reference');
        // Redirect to the tickets list with a status message
        return res.redirect('/admin/tickets?payment_status=callback_error');
    }

    try {
        // --- Verify Paystack Transaction ---
        const verificationResponse = await Paystack.transaction.verify(paystackReference);

        const verificationData = verificationResponse.data;

        if (verificationResponse.status && verificationData) {
            const paystackStatus = verificationData.status; // 'success', 'failed', 'abandoned' etc.
            const ticketId = verificationData.metadata?.ticket_id; // Get ticket ID from metadata

            let ticketToUpdate;

            if (ticketId) {
                 // Try to find ticket by ID from metadata first
                 ticketToUpdate = await Ticket.findById(ticketId);
            }

            // If ticket not found by ID or ID was missing, try finding by reference
            if (!ticketToUpdate) {
                 console.warn(`Ticket not found by ID ${ticketId || 'missing ID'} from metadata. Attempting to find by reference: ${paystackReference}`);
                 ticketToUpdate = await Ticket.findOne({ paystack_reference: paystackReference });
            }


            if (ticketToUpdate) {
                if (paystackStatus === 'success') {
                    // Prevent updating if already completed (idempotency)
                    if (ticketToUpdate.payment_status !== 'completed') {
                         ticketToUpdate.payment_status = 'completed';
                         // --- Increment tickets_sold count on the linked TicketType ---
                         const ticketType = await TicketType.findById(ticketToUpdate.ticket_type);
                         if (ticketType) {
                             ticketType.tickets_sold += 1;
                             await ticketType.save();
                             console.log(`Incremented tickets_sold for TicketType: ${ticketType.name}`);
                         } else {
                             console.warn(`TicketType not found for ticket ${ticketToUpdate._id}. Cannot increment tickets_sold.`);
                         }
                         // --- End Increment Logic ---
                    } else {
                         console.log(`Ticket ${ticketToUpdate._id} already completed. Skipping update.`);
                    }
                } else if (paystackStatus === 'failed' || paystackStatus === 'abandoned') { // Consider abandoned as failed
                    ticketToUpdate.payment_status = 'failed';
                }
                 // Add other statuses if Paystack has them

                await ticketToUpdate.save();

                // Redirect the admin back to the tickets list with the payment status
                // Include a flag if metadata was missing but found by reference
                const redirectUrl = `/admin/tickets?payment_status=${ticketToUpdate.payment_status}${!ticketId ? '&metadata_missing=true' : ''}`;
                res.redirect(redirectUrl);

            } else {
                console.error(`Ticket not found for ID ${ticketId} (from metadata) or reference ${paystackReference}`);
                 // Handle case where ticket ID from metadata doesn't exist and reference lookup also fails
                 res.redirect('/admin/tickets?payment_status=completed_ticket_missing');
            }

        } else {
            console.error('Paystack verification failed or returned error status:', verificationResponse.message);
             // Find ticket by reference and update status to failed if verification itself failed
             const ticketToUpdate = await Ticket.findOne({ paystack_reference: paystackReference });
             if(ticketToUpdate) {
                  ticketToUpdate.payment_status = 'failed';
                  await ticketToUpdate.save();
             }
            res.redirect('/admin/tickets?payment_status=verification_error');
        }

    } catch (verifyErr) {
        console.error('Error verifying Paystack transaction:', verifyErr.message);
         // Find ticket by reference and update status to failed on verification error
         const ticketToUpdate = await Ticket.findOne({ paystack_reference: paystackReference });
         if(ticketToUpdate) {
              ticketToUpdate.payment_status = 'failed';
              await ticketToUpdate.save();
         }
        res.redirect('/admin/tickets?payment_status=verification_error');
    }
});


// --- Tickets Edit and Delete (keep as is, but ensure payment_status is handled) ---

// Edit Ticket Form (Ensure payment_status and paystack_reference are displayed)
router.get('/tickets/:id/edit', authMiddleware, async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id);
         if (!ticket) {
            return res.status(404).send('Ticket not found');
         }
        const ticketTypes = await TicketType.find();
        const paymentStatuses = ['pending', 'completed', 'failed', 'refunded']; // Allow manual editing of status
        const used_at_formatted = ticket.used_at ? ticket.used_at.toISOString().slice(0, 16) : '';

        // Assuming views/admin/tickets/edit.ejs
        res.render('tickets/edit', { ticket, ticketTypes, paymentStatuses, used_at_formatted });
    } catch (err) {
        console.error(`GET /admin/tickets/${req.params.id}/edit error:`, err);
        res.status(500).send('Server Error');
    }
});

// Update Ticket (Allow manual update of details and status)
router.put('/tickets/:id', authMiddleware, async (req, res) => {
    try {
         // Basic validation
         if (!req.body.ticket_type || !req.body.purchaser_name || !req.body.purchaser_email || !req.body.purchaser_phone || !req.body.ticket_code || !req.body.status || !req.body.payment_status) {
             return res.status(400).send('Missing required fields');
        }
        // Note: Manually changing payment_status here won't trigger Paystack verification.
        // This is for recording status based on external confirmation or correcting data.
        const ticket = await Ticket.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!ticket) {
            return res.status(404).send('Ticket not found');
         }

        // TODO: If manually changing status to 'completed', you might need to manually increment tickets_sold on the linked TicketType

        res.redirect('/admin/tickets');
    } catch (err) {
        console.error(`PUT /admin/tickets/${req.params.id} error:`, err);
        res.status(500).send('Error updating ticket');
    }
});

// Delete Ticket (keep as is)
router.delete('/tickets/:id', authMiddleware, async (req, res) => {
    try {
        const ticket = await Ticket.findByIdAndDelete(req.params.id);
         if (!ticket) {
            return res.status(404).send('Ticket not found');
         }

         // TODO: If deleting a ticket that was marked 'completed', you might need to manually decrement tickets_sold on the linked TicketType

        res.redirect('/admin/tickets');
    } catch (err) {
        console.error(`DELETE /admin/tickets/${req.params.id} error:`, err);
        res.status(500).send('Error deleting ticket');
    }
});


// --- Coupons CRUD ---

// List Coupons
router.get('/coupons', authMiddleware, async (req, res) => {
    try {
        // Optionally populate applicable_ticket_type if you want to display its details
        const coupons = await Coupon.find().populate('applicable_ticket_type');
        // Assuming views/admin/coupons/index.ejs
        res.render('coupons/index', { coupons });
    } catch (err) {
        console.error('GET /admin/coupons error:', err);
        res.status(500).send('Server Error');
    }
});

// New Coupon Form
router.get('/coupons/new', authMiddleware, async (req, res) => {
    try {
        // Need ticket types if the coupon can be restricted to one
        const ticketTypes = await TicketType.find();
        // Assuming views/admin/coupons/new.ejs
        res.render('coupons/new', { ticketTypes });
    } catch (err) {
        console.error('GET /admin/coupons/new error:', err);
        res.status(500).send('Server Error');
    }
});

// Create Coupon
router.post('/coupons', authMiddleware, async (req, res) => {
    try {
         // Basic validation for required fields from schema (code, type, value, expiry_date)
         if (!req.body.code || !req.body.type || req.body.value === undefined || !req.body.expiry_date) {
              return res.status(400).send('Missing required fields for coupon');
         }
         // Ensure expiry_date is a valid Date
         if (isNaN(new Date(req.body.expiry_date).getTime())) {
             return res.status(400).send('Invalid expiry date format');
         }
         // TODO: Add server-side validation for coupon code uniqueness

        await Coupon.create(req.body);
        res.redirect('/admin/coupons');
    } catch (err) {
        console.error('POST /admin/coupons error:', err);
        // Handle potential duplicate code errors etc.
        res.status(500).send('Error creating coupon');
    }
});

// Edit Coupon Form
router.get('/coupons/:id/edit', authMiddleware, async (req, res) => {
    try {
        const coupon = await Coupon.findById(req.params.id);
        if (!coupon) {
            return res.status(404).send('Coupon not found');
        }
        // Need ticket types if the coupon can be restricted to one
        const ticketTypes = await TicketType.find();
        // Format expiry date for the form input (YYYY-MM-DD)
        const expiry_date_formatted = coupon.expiry_date ? coupon.expiry_date.toISOString().split('T')[0] : '';

        // Assuming views/admin/coupons/edit.ejs
        res.render('coupons/edit', { coupon, ticketTypes, expiry_date_formatted });
    } catch (err) {
        console.error(`GET /admin/coupons/${req.params.id}/edit error:`, err);
        res.status(500).send('Server Error');
    }
});

// Update Coupon
router.put('/coupons/:id', authMiddleware, async (req, res) => {
    try {
         // Basic validation for required fields
          if (!req.body.code || !req.body.type || req.body.value === undefined || !req.body.expiry_date) {
              return res.status(400).send('Missing required fields for coupon');
         }
          // Ensure expiry_date is a valid Date
         if (isNaN(new Date(req.body.expiry_date).getTime())) {
             return res.status(400).send('Invalid expiry date format');
         }

        const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true });
         if (!coupon) {
            return res.status(404).send('Coupon not found');
         }
        res.redirect('/admin/coupons');
    } catch (err) {
        console.error(`PUT /admin/coupons/${req.params.id} error:`, err);
        res.status(500).send('Error updating coupon');
    }
});

// Delete Coupon
router.delete('/coupons/:id', authMiddleware, async (req, res) => {
    try {
        const coupon = await Coupon.findByIdAndDelete(req.params.id);
         if (!coupon) {
            return res.status(404).send('Coupon not found');
         }
         // TODO: Consider if you need logic to handle coupons used in past orders
        res.redirect('/admin/coupons');
    } catch (err) {
        console.error(`DELETE /admin/coupons/${req.params.id} error:`, err);
        res.status(500).send('Error deleting coupon');
    }
});


module.exports = router;
