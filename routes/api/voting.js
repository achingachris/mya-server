const express = require('express');
const router = express.Router();
const Paystack = require('paystack-api')(
  process.env.PAYSTACK_SECRET_KEY
);
// crypto is no longer needed here as webhook is moved
// const crypto = require('crypto')
const Admin = require('../../models/Admin');
const NominationCategory = require('../../models/NominationCategory');
const Nominee = require('../../models/Nominee');
const Vote = require('../../models/Vote');
const {
  apiAuthMiddleware,
} = require('../../middleware/auth');

const voteTiers = {
  10: 50,
  20: 100,
  30: 150,
  100: 500,
  200: 1000,
  400: 2000,
};

// Get all categories
router.get(
  '/categories',
  apiAuthMiddleware,
  async (req, res) => {
    try {
      const categories = await NominationCategory.find();
      res.json(categories);
    } catch (err) {
      console.error('GET /categories error:', err);
      res
        .status(500)
        .json({ error: 'Failed to fetch categories' });
    }
  }
);

// Get all nominees
router.get(
  '/nominees',
  apiAuthMiddleware,
  async (req, res) => {
    try {
      const nominees = await Nominee.find().populate(
        'category'
      );
      res.json(nominees);
    } catch (err) {
      console.error('GET /nominees error:', err);
      res
        .status(500)
        .json({ error: 'Failed to fetch nominees' });
    }
  }
);

// Get nominees by category
router.get(
  '/nominees/category/:categoryId',
  apiAuthMiddleware,
  async (req, res) => {
    const { categoryId } = req.params;

    try {
      const category = await NominationCategory.findById(
        categoryId
      );
      if (!category)
        return res
          .status(404)
          .json({ error: 'Category not found' });

      const nominees = await Nominee.find({
        category: categoryId,
      }).populate('category');
      res.json(nominees);
    } catch (err) {
      console.error(
        `GET /nominees/category/${categoryId} error:`,
        err
      );
      res.status(500).json({
        error: 'Failed to fetch nominees by category',
      });
    }
  }
);

// Initiate vote and payment
router.post(
  '/vote/initiate/:nomineeId',
  async (req, res) => { // Removed apiAuthMiddleware as per original code
    const { nomineeId } = req.params;
    const {
      numberOfVotes,
      voterName,
      voterEmail,
      voterPhone,
    } = req.body;

    if (
      !numberOfVotes ||
      !voterName ||
      !voterEmail ||
      !voterPhone
    ) {
      return res
        .status(400)
        .json({ error: 'All fields are required' });
    }

    if (!voteTiers[numberOfVotes]) {
      return res.status(400).json({
        error:
          'Invalid number of votes. Allowed options: 10 (50 KES), 20 (100), 30 (150), 100 (500), 200 (1000), 400 (2000).',
      });
    }

    try {
      const nominee = await Nominee.findById(nomineeId);
      if (!nominee)
        return res
          .status(404)
          .json({ error: 'Nominee not found' });

      const payment_amount = voteTiers[numberOfVotes];

      const vote = await Vote.create({
        nominee: nomineeId,
        voter_name: voterName,
        voter_email: voterEmail,
        voter_phone: voterPhone,
        number_of_votes: numberOfVotes,
        payment_amount,
        payment_status: 'pending',
      });

      const reference = `vote-${vote._id.toString()}`;
      const frontendUrl = process.env.FRONTEND_URL;

      const paystackResponse =
        await Paystack.transaction.initialize({
          email: voterEmail,
          amount: payment_amount * 100,
          reference,
          currency: 'KES',
          callback_url: `${frontendUrl}/vote-success?nominee=${encodeURIComponent(
            nominee.name
          )}&votes=${numberOfVotes}`,
        });

      vote.payment_reference = reference;
      await vote.save();

      res.json({
        authorization_url:
          paystackResponse.data.authorization_url,
      });
    } catch (err) {
      console.error(
        `POST /vote/initiate/${req.params.nomineeId} error:`,
        err
      );
      res.status(500).json({
        error: 'Failed to initiate vote and payment',
      });
    }
  }
);


module.exports = router; // Export the router
