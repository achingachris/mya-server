const express = require('express');
const router = express.Router();
const Paystack = require('paystack-api')(process.env.PAYSTACK_SECRET_KEY);
const crypto = require('crypto'); // Required for signature verification

// --- Import ALL models that might be affected by webhook events ---
// Ensure these paths are correct relative to where this file (paystack.js) is located
const Vote = require('../../models/Vote'); // Your Vote model
const Nominee = require('../../models/Nominee'); // Your Nominee model (updated by vote success)
const Ticket = require('../../models/Ticket'); // Your Ticket model
const TicketType = require('../../models/TicketType'); // Your TicketType model (updated by ticket success)

// Assuming apiAuthMiddleware is not needed for the webhook endpoint itself,
// as Paystack calls this endpoint directly.

// --- Combined Paystack Webhook ---
// This endpoint handles successful and failed payments for both votes and tickets.
// The route is defined as '/' because the router is mounted at the full path in server.js
router.post('/', async (req, res) => { // Route is '/' assuming mounted at /webhook/paystack in server.js
    // 1. Verify Paystack Signature
    // This is crucial for security to ensure the request is from Paystack
    const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(JSON.stringify(req.body)).digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
        console.error('Paystack Webhook: Invalid signature');
        // Return 401 Unauthorized if signature is invalid
        return res.status(401).send('Invalid signature');
    }

    // 2. Process the Paystack Event
    const event = req.body;
    console.log(`Paystack Webhook: Received event type "${event.event}" for reference "${event.data.reference}"`);

    // Handle successful charges
    if (event.event === 'charge.success') {
        const reference = event.data.reference;

        try {
            // Determine the type of transaction based on the reference prefix
            if (reference && reference.startsWith('vote-')) {
                // --- Handle Vote Payment Success ---
                console.log('Paystack Webhook: Processing successful vote payment for reference:', reference);
                const vote = await Vote.findOne({ payment_reference: reference });

                if (!vote) {
                    console.error('Paystack Webhook: Vote not found for reference:', reference);
                    // It's possible the vote record wasn't created correctly or was deleted.
                    // Acknowledge receipt to Paystack even if we can't find the record.
                    return res.sendStatus(200);
                }

                // Check if this payment has already been processed
                if (vote.payment_status === 'completed') {
                    console.log('Paystack Webhook: Vote already completed for reference:', reference);
                    return res.sendStatus(200); // Already processed, acknowledge receipt
                }

                // Update vote status
                vote.payment_status = 'completed';
                await vote.save();
                console.log('Paystack Webhook: Marked vote as completed:', reference);

                // Increment nominee vote count
                const nominee = await Nominee.findByIdAndUpdate(
                    vote.nominee,
                    { $inc: { number_of_votes: vote.number_of_votes } },
                    { new: true } // Return the updated nominee document
                );

                if (!nominee) {
                    console.error('Paystack Webhook: Nominee not found for vote:', vote._id);
                    // This indicates a data inconsistency - a vote points to a non-existent nominee.
                    // Log this for investigation.
                } else {
                    console.log(`Paystack Webhook: Updated nominee "${nominee.name}" vote count: +${vote.number_of_votes}. New total: ${nominee.number_of_votes}`);
                }

            } else if (reference && reference.startsWith('ticket-')) {
                // --- Handle Ticket Payment Success ---
                console.log('Paystack Webhook: Processing successful ticket payment for reference:', reference);
                // Extract ticket ID from the reference (e.g., 'ticket-60c72b2f9b1d4b001c8e4f8a')
                const ticketId = reference.substring('ticket-'.length);

                // Find the corresponding ticket using the ID
                const ticket = await Ticket.findById(ticketId);

                if (!ticket) {
                    console.error('Paystack Webhook: Ticket not found for ID extracted from reference:', ticketId);
                    // Acknowledge receipt to Paystack even if we can't find the record.
                    return res.sendStatus(200);
                }

                 // Important: Check if payment is already completed to prevent double processing
                if (ticket.payment_status === 'completed') {
                    console.log('Paystack Webhook: Ticket payment already completed for reference:', reference);
                    return res.sendStatus(200); // Already processed, acknowledge receipt
                }

                // Update the ticket payment status to completed
                ticket.payment_status = 'completed';
                // Update the ticket instance status if necessary (e.g., from 'pending' to 'unused' or 'issued')
                // Assuming 'unused' is the correct status after a successful purchase payment
                ticket.status = 'unused';
                await ticket.save();
                console.log('Paystack Webhook: Marked ticket as completed:', reference);


                // Increment the tickets_sold count AND Decrement the total_available count
                const ticketType = await TicketType.findByIdAndUpdate(
                    ticket.ticket_type, // Use the ticket_type ObjectId from the ticket
                    { $inc: { tickets_sold: 1, total_available: -1 } }, // Increment sold, Decrement available
                    { new: true } // Return the updated TicketType document
                );

                 if (!ticketType) {
                    console.error('Paystack Webhook: TicketType not found for ticket:', ticket._id);
                    // This indicates a data inconsistency - a ticket points to a non-existent ticket type.
                    // Log this for investigation.
                } else {
                    console.log(`Paystack Webhook: Updated ticket type "${ticketType.name}" counts: +1 sold, -1 available. New totals: sold=${ticketType.tickets_sold}, available=${ticketType.total_available}`);
                }

            } else {
                 // --- Handle Unrecognized Reference Format ---
                 console.warn('Paystack Webhook: Received charge.success event with unhandled reference format:', reference);
                 // This might be for other types of transactions or events you don't handle here.
                 // Acknowledge receipt.
            }

        } catch (err) {
            console.error('Paystack Webhook: Error processing charge.success event:', err);
            // Log the error but still return 200 to Paystack to avoid excessive retries,
            // unless you have specific logic to handle retries for certain errors.
            // A monitoring system should alert you to these errors.
        }

    } else if (event.event === 'charge.failed') {
        // Handle failed charges
        const reference = event.data.reference;
        console.log('Paystack Webhook: Processing charge.failed event for reference:', reference);

        try {
            // Determine the type of transaction based on the reference prefix
             if (reference && reference.startsWith('vote-')) {
                 // --- Handle Vote Payment Failed ---
                 const vote = await Vote.findOne({ payment_reference: reference });
                 if (vote) {
                     // Mark the vote as failed
                     vote.payment_status = 'failed';
                     await vote.save();
                     console.log('Paystack Webhook: Marked vote as failed:', reference);
                 } else {
                     console.warn('Paystack Webhook: Failed vote reference not found in DB:', reference);
                     // Acknowledge receipt even if not found.
                 }
             } else if (reference && reference.startsWith('ticket-')) {
                  // --- Handle Ticket Payment Failed ---
                 const ticketId = reference.substring('ticket-'.length);
                 const ticket = await Ticket.findById(ticketId);
                  if (ticket) {
                     // Mark the ticket payment as failed
                     ticket.payment_status = 'failed';
                     // Optionally update the ticket instance status, e.g., to 'cancelled' or 'payment_failed'
                     // ticket.status = 'cancelled';
                     await ticket.save();
                     console.log('Paystack Webhook: Marked ticket payment as failed:', reference);
                 } else {
                     console.warn('Paystack Webhook: Failed ticket reference not found in DB:', reference);
                     // Acknowledge receipt even if not found.
                 }
             } else {
                 // --- Handle Unrecognized Reference Format for Failed Charge ---
                 console.warn('Paystack Webhook: Received charge.failed event with unhandled reference format:', reference);
                 // Acknowledge receipt.
             }

        } catch (err) {
            console.error('Paystack Webhook: Error processing charge.failed event:', err);
            // Log the error but still return 200 to Paystack.
        }
    }
    // Add handlers for other Paystack events if needed (e.g., 'transfer.success', 'refund.created', etc.)
    // else if (event.event === '...') { ... }

    // 3. Acknowledge Receipt to Paystack
    // It is crucial to respond with a 200 OK status code to Paystack
    // within a reasonable time frame (usually < 20 seconds)
    // to indicate that you received the webhook successfully.
    // Failure to do so may cause Paystack to retry sending the webhook.
    res.sendStatus(200);
});

module.exports = router; // Export the router if this is in its own file
