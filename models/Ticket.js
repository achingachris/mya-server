const mongoose = require('mongoose')

const ticketSchema = new mongoose.Schema(
  {
    // Link the ticket instance to its type definition
    ticket_type: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TicketType', // Reference the TicketType model
      required: true,
    },
    // Information about the person who purchased/owns this specific ticket instance
    purchaser_name: {
      type: String,
      required: true,
      trim: true,
    },
    purchaser_email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      // Add basic email format validation if needed
    },
    purchaser_phone: {
      type: String,
      required: true,
      trim: true,
    },
    // A unique number or code for this specific ticket instance
    ticket_code: {
      // Using ticket_code as it was in previous iteration, or use ticket_number
      type: String,
      required: true,
      unique: true, // Ensure each ticket code is unique across all instances
      trim: true,
      // You would typically generate this code in your application logic when a ticket is created
    },
    // Status of this specific ticket instance (e.g., whether it's been used)
    status: {
      type: String,
      enum: ['unused', 'used', 'cancelled'], // Define possible statuses for an instance
      default: 'unused',
      required: true,
    },
    // --- Added Payment Status Field ---
    payment_status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'], // Define possible payment statuses
      default: 'pending', // Default to pending for manual entry
      required: true,
    },
    // Optional: Date when this specific ticket instance was used (if applicable)
    used_at: {
      type: Date,
    },
    // Automatically add createdAt and updatedAt timestamps (represents purchase/creation time)
  },
  {
    timestamps: true,
  }
)

module.exports = mongoose.model('Ticket', ticketSchema)
