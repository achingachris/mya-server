const express = require('express');
const router = express.Router();
const Paystack = require('paystack-api')(process.env.PAYSTACK_SECRET_KEY);
const crypto = require('crypto');
const Admin = require('../models/Admin');
const NominationCategory = require('../models/NominationCategory');
const Nominee = require('../models/Nominee');
const Vote = require('../models/Vote');
const { apiAuthMiddleware } = require('../middleware/auth');

const voteTiers = {
  10: 50,
  20: 100,
  30: 150,
  400: 2000,
};

// Categories API
router.get('/categories', apiAuthMiddleware, async (req, res) => {
  const categories = await NominationCategory.find();
  res.json(categories);
});

// Nominees API
router.get('/nominees', apiAuthMiddleware, async (req, res) => {
  const nominees = await Nominee.find().populate('category');
  res.json(nominees);
});

// Initiate Vote with Dynamic Nominee ID
router.post('/vote/initiate/:nomineeId', async (req, res) => {
  const { nomineeId } = req.params; // Get nomineeId from URL
  const { numberOfVotes, voterName, voterEmail, voterPhone } = req.body;

  // Validation
  if (!numberOfVotes || !voterName || !voterEmail || !voterPhone) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (!voteTiers[numberOfVotes]) {
    return res.status(400).json({
      error: 'Invalid number of votes. Allowed options are: 10 votes (50 KES), 20 votes (100 KES), 30 votes (150 KES), or 400 votes (2000 KES).',
    });
  }

  const nominee = await Nominee.findById(nomineeId);
  if (!nominee) return res.status(404).json({ error: 'Nominee not found' });

  const payment_amount = voteTiers[numberOfVotes];
  const vote = await Vote.create({
    nominee: nomineeId,
    voter_name: voterName,
    voter_email: voterEmail,
    voter_phone: voterPhone,
    number_of_votes: numberOfVotes,
    payment_amount,
    payment_reference: null,
  });

  const paystackResponse = await Paystack.transaction.initialize({
    email: voterEmail,
    amount: payment_amount * 100, // Paystack uses kobo (cents)
    reference: vote._id.toString(),
    currency: 'KES',
  });

  vote.payment_reference = paystackResponse.data.reference;
  await vote.save();

  res.json({ authorization_url: paystackResponse.data.authorization_url });
});

// Paystack Webhook
router.post('/webhook/paystack', async (req, res) => {
  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (hash !== req.headers['x-paystack-signature']) {
    return res.status(401).send('Invalid signature');
  }

  const event = req.body;
  if (event.event === 'charge.success') {
    const vote = await Vote.findById(event.data.reference);
    if (vote) {
      vote.payment_status = 'completed';
      await vote.save();
      await Nominee.findByIdAndUpdate(vote.nominee, { $inc: { number_of_votes: vote.number_of_votes } });
    }
  } else if (event.event === 'charge.failed') {
    const vote = await Vote.findById(event.data.reference);
    if (vote) {
      vote.payment_status = 'failed';
      await vote.save();
    }
  }

  res.sendStatus(200);
});

module.exports = router;