const mongoose = require('mongoose')

const ticketSchema = new mongoose.Schema(
  {
    // Purchaser Details
    purchaser_name: {
      type: String,
      required: [true, 'Purchaser name is required'],
      trim: true,
    },
    purchaser_email: {
      type: String,
      required: [true, 'Purchaser email is required'],
      trim: true,
      lowercase: true,
      match: [
        /^\S+@\S+\.\S+$/,
        'Please use a valid email address.',
      ],
    },
    purchaser_phone: {
      type: String,
      required: [
        true,
        'Purchaser phone number is required',
      ],
      trim: true,
    },

    // Link to the Ticket Type
    ticket_type: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TicketType',
      required: [true, 'Ticket type is required'],
    },

    // Ticket Details
    number_of_tickets: {
      type: Number,
      required: [true, 'Number of tickets is required'],
      min: [1, 'Must purchase at least 1 ticket'],
    },
    total_amount: {
      type: Number,
      required: [true, 'Total amount is required'],
      min: [0, 'Total amount cannot be negative'],
    },

    // Purchase Timestamps and Status
    // 'timestamp' and 'date and time of purchase' can be covered by Mongoose timestamps
    // Adding an explicit purchase_date field if you need to store a specific date/time separate from creation
    purchase_date: {
      type: Date,
      default: Date.now, // Defaults to the current date/time when the document is created
    },
    payment_status: {
      type: String,
      required: [true, 'Payment status is required'],
      enum: {
        values: ['pending', 'completed', 'failed'],
        message:
          'Payment status must be one of "pending", "completed", or "failed".',
      },
      default: 'pending',
    },

    // Ticket Reference Number
    ticket_reference_number: {
      type: String,
      required: [
        true,
        'Ticket reference number is required',
      ],
      unique: true,
      trim: true,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields automatically
  }
)

// Optional: Add an index for frequently queried fields like payment_status or ticket_reference_number
ticketSchema.index({ payment_status: 1 })
ticketSchema.index({ ticket_reference_number: 1 })
ticketSchema.index({ ticket_type: 1 }) // Indexing the foreign key


const Ticket = mongoose.model('Ticket', ticketSchema)

module.exports = Ticket
