const mongoose = require('mongoose')

const ticketTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Ticket type name is required'],
      trim: true,
      unique: true,
    },
    amount: {
      type: Number,
      required: [true, 'Ticket amount is required'],
      min: [0, 'Ticket amount cannot be negative'],
    },
    maximum_tickets: {
      type: Number,
      required: [
        true,
        'Maximum number of tickets is required',
      ],
      min: [
        0,
        'Maximum number of tickets cannot be negative',
      ],
    },
    tickets_sold: {
      type: Number,
      default: 0,
      min: [0, 'Tickets sold cannot be negative'],
    },
  },
  {
    timestamps: true,
  }
)

// pre-save hook to ensure tickets_sold does not exceed maximum_tickets
ticketTypeSchema.pre('save', function (next) {
  // 'this' refers to the document being saved
  if (this.tickets_sold > this.maximum_tickets) {
    // Create a Mongoose validation error
    const err = new mongoose.Error.ValidationError(this)
    err.addError(
      'tickets_sold',
      new mongoose.Error.ValidatorError({
        message: `Tickets sold (${this.tickets_sold}) cannot exceed maximum tickets (${this.maximum_tickets})`,
        path: 'tickets_sold',
        value: this.tickets_sold,
        kind: 'max',
        properties: {
          message: `Tickets sold ({VALUE}) cannot exceed maximum tickets ({MAX})`,
          type: 'user defined', // Indicate it's a custom validation
          min: 0, // Include other relevant properties if needed
          max: this.maximum_tickets,
          value: this.tickets_sold,
        },
      })
    )
    return next(err)
  }
  next()
})

const TicketType = mongoose.model(
  'TicketType',
  ticketTypeSchema
)

module.exports = TicketType
