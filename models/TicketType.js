const mongoose = require('mongoose')

const ticketTypeSchema = new mongoose.Schema(
  {
    // The name of the ticket type (e.g., "Standard Entry", "VIP Ticket", "Raffle Ticket")
    name: {
      type: String,
      required: true,
      unique: true, // Each ticket type name should be unique
      trim: true,
    },
    // The price for one instance of this ticket type
    price: {
      type: Number,
      required: true,
      min: 0, // Price cannot be negative
    },
    // The total number of tickets of this type available for sale
    total_available: {
      type: Number,
      required: true,
      min: 0,
    },
    // The number of tickets of this type that have been sold
    tickets_sold: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Optional: A brief description of the ticket type
    description: {
      type: String,
    },
    // Automatically add createdAt and updatedAt timestamps
  },
  {
    timestamps: true,
  }
)

module.exports = mongoose.model(
  'TicketType',
  ticketTypeSchema
)
