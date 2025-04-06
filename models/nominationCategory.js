const mongoose = require('mongoose')

const nominationCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: String,
})

module.exports = mongoose.model(
  'NominationCategory',
  nominationCategorySchema
)
