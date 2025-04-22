const mongoose = require('mongoose')

const voteSchema = new mongoose.Schema(
  {
    nominee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Nominee',
      required: true,
    },
    voter_name: { type: String, required: true },
    voter_email: { type: String, required: true },
    voter_phone: { type: String, required: true },
    number_of_votes: {
      type: Number,
      required: true,
      enum: [10, 20, 30, 100, 200, 400],
    },
    payment_amount: {
      type: Number,
      required: true,
      enum: [50, 100, 150, 500, 1000, 2000],
    },
    payment_status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending',
    },
    payment_reference: String,
  },
  {
    timestamps: true,
  }
)

module.exports = mongoose.model('Vote', voteSchema)
