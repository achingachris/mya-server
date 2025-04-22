const mongoose = require('mongoose')

const couponSchema = new mongoose.Schema(
  {
    // The unique code users will enter
    code: {
      type: String,
      required: true,
      unique: true, // Ensure each coupon code is unique
      uppercase: true,
      trim: true,
    },
    // Type of discount (percentage or fixed amount) - Added back as essential for a coupon
    type: {
      type: String,
      enum: ['percentage', 'fixed'],
      required: true,
    },
    // The value of the discount (e.g., 10 for 10% or 10 for $10) - Added back as essential
    value: {
      type: Number,
      required: true,
      min: 0,
    },
    // Maximum number of times this coupon can be used in total (null for unlimited)
    max_uses: {
      type: Number,
      default: null, // Use null to indicate no limit
      min: 0,
    },
    // How many times this coupon has already been used
    uses_count: {
      type: Number,
      default: 0,
      min: 0,
    },
    // The date when the coupon expires
    expiry_date: {
      type: Date,
      required: true,
    },
    // Optional: Link the coupon to a specific TicketType it can be applied to
    // If null, it might be applicable to any ticket type or the total purchase value.
    applicable_ticket_type: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TicketType',
      default: null, // Coupon is not restricted to a specific type by default
    },
    // Optional: Brief description or name for the coupon
    description: {
      type: String,
      trim: true,
    },
    // Status of the coupon (active, inactive, expired) - Useful for management
    status: {
      type: String,
      enum: ['active', 'inactive', 'expired'],
      default: 'active',
      required: true,
    },
    // Automatically add createdAt and updatedAt timestamps
  },
  {
    timestamps: true,
  }
)

// You might add middleware or application logic to handle the 'expired' status based on expiry_date.

module.exports = mongoose.model('Coupon', couponSchema)
