const express = require('express')
const router = express.Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const Admin = require('../../models/Admin')
const NominationCategory = require('../../models/NominationCategory')
const Nominee = require('../../models/Nominee')
const Vote = require('../../models/Vote')


const Paystack = require('paystack-api')(
  process.env.PAYSTACK_SECRET_KEY
)
const { v4: uuidv4 } = require('uuid')

const { authMiddleware } = require('../../middleware/auth')
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY
const BASE_URL = process.env.FRONTEND_URL

if (!PAYSTACK_SECRET_KEY || !BASE_URL) {
  console.error(
    'FATAL ERROR: PAYSTACK_SECRET_KEY and FRONTEND_URL must be defined in your .env file.'
  )
  process.exit(1)
}

router.get('', authMiddleware, async (req, res) => {
    try {
      const { nominee_name, payment_status, category_name, page = 1 } = req.query;
      const limit = 20;
      const skip = (parseInt(page) - 1) * limit;
  
      let filter = {};
  
      if (payment_status) {
        filter.payment_status = payment_status;
      }
  
      // Load all categories for dropdown
      const categories = await NominationCategory.find().sort({ name: 1 });
  
      // Fetch all nominees with category details
      let nomineesQuery = Nominee.find().populate('category');
      if (nominee_name) {
        nomineesQuery = nomineesQuery.where('name', new RegExp(nominee_name, 'i'));
      }
      const allNominees = await nomineesQuery.exec();
  
      // Filter nominees by category name if specified
      let filteredNomineeIds = allNominees.map(n => n._id);
      if (category_name) {
        filteredNomineeIds = allNominees
          .filter(n => n.category?.name === category_name)
          .map(n => n._id);
      }
  
      filter.nominee = { $in: filteredNomineeIds };
  
      const totalVotes = await Vote.countDocuments(filter);
      const votes = await Vote.find(filter)
        .populate({
          path: 'nominee',
          populate: { path: 'category' },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
  
      const totalPages = Math.ceil(totalVotes / limit);
  
      res.render('votes/index', {
        votes,
        currentPage: parseInt(page),
        totalPages,
        totalVotes,
        query: req.query,
        categories,
      });
    } catch (err) {
      console.error('GET /admin/votes error:', err);
      res.status(500).send('Server Error');
    }
  });
  

module.exports = router
