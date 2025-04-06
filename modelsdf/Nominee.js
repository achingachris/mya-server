const mongoose = require('mongoose')

const nomineeSchema = new mongoose.Schema({
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'NominationCategory',
    required: true,
  },
  name: { type: String, required: true },
  number_of_votes: { type: Number, default: 0 },
})

module.exports = mongoose.model('Nominee', nomineeSchema)
