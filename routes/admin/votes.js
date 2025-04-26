const express = require('express')
const router = express.Router()
const NominationCategory = require('../../models/NominationCategory')
const Nominee = require('../../models/Nominee')
const Vote = require('../../models/Vote')

const { authMiddleware } = require('../../middleware/auth')

// Helper function to build filter object based on query parameters
const buildVoteFilter = async (query) => {
  let filter = {}
  const { nominee_name, payment_status, category_name } =
    query

  if (payment_status) {
    filter.payment_status = payment_status
  }

  // Fetch all nominees with category details to filter by name/category
  let nomineesQuery = Nominee.find().populate('category')
  if (nominee_name) {
    nomineesQuery = nomineesQuery.where(
      'name',
      new RegExp(nominee_name, 'i')
    )
  }
  const allNominees = await nomineesQuery.exec()

  // Filter nominees by category name if specified
  let filteredNomineeIds = allNominees.map((n) => n._id)
  if (category_name) {
    filteredNomineeIds = allNominees
      .filter((n) => n.category?.name === category_name)
      .map((n) => n._id)
  }

  // Apply nominee filter if any nominees were found after filtering
  if (filteredNomineeIds.length > 0) {
    // Only apply the filter if there are matching nominees, otherwise it would match nothing
    filter.nominee = { $in: filteredNomineeIds }
  } else if (nominee_name || category_name) {
    // If nominee_name or category_name was provided but no nominees matched,
    // set the filter to match no votes.
    filter.nominee = { $in: [] }
  }

  return filter
}

// GET votes list (paginated)
router.get('', authMiddleware, async (req, res) => {
  try {
    const { page = 1 } = req.query
    const limit = 20
    const skip = (parseInt(page) - 1) * limit

    // Build filter based on query parameters
    const filter = await buildVoteFilter(req.query)

    // Load all categories for dropdown
    const categories = await NominationCategory.find().sort(
      { name: 1 }
    )

    const totalVotes = await Vote.countDocuments(filter)
    const votes = await Vote.find(filter)
      .populate({
        path: 'nominee',
        populate: { path: 'category' },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)

    const totalPages = Math.ceil(totalVotes / limit)

    res.render('votes/index', {
      votes,
      currentPage: parseInt(page),
      totalPages,
      totalVotes,
      query: req.query,
      categories,
    })
  } catch (err) {
    console.error('GET /admin/votes error:', err)
    res.status(500).send('Server Error')
  }
})

// GET votes list (export to CSV)
router.get('/export', authMiddleware, async (req, res) => {
  try {
    // Build filter based on query parameters (same as the list view)
    const filter = await buildVoteFilter(req.query)

    // Fetch ALL votes matching the filter (no pagination for export)
    const votesToExport = await Vote.find(filter)
      .populate({
        path: 'nominee',
        populate: { path: 'category' },
      })
      .sort({ createdAt: -1 }) // Maintain consistent sorting

    // Generate CSV content
    let csvContent =
      'Nominee Name,Nominee Category,Voter Name,Voter Email,Voter Phone,Number of Votes,Amount (KES),Payment Status\n'

    votesToExport.forEach((vote) => {
      const nomineeName = vote.nominee
        ? `"${vote.nominee.name.replace(/"/g, '""')}"`
        : 'N/A' // Handle commas and quotes
      const nomineeCategory = vote.nominee?.category?.name
        ? `"${vote.nominee.category.name.replace(
            /"/g,
            '""'
          )}"`
        : 'No Category'
      const voterName = `"${vote.voter_name.replace(
        /"/g,
        '""'
      )}"`
      const voterEmail = `"${vote.voter_email.replace(
        /"/g,
        '""'
      )}"`
      const voterPhone = `"${vote.voter_phone.replace(
        /"/g,
        '""'
      )}"`
      const numberOfVotes = vote.number_of_votes
      const paymentAmount = vote.payment_amount
      const paymentStatus = vote.payment_status

      csvContent += `${nomineeName},${nomineeCategory},${voterName},${voterEmail},${voterPhone},${numberOfVotes},${paymentAmount},${paymentStatus}\n`
    })

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="votes_export.csv"'
    )

    // Send the CSV content
    res.status(200).send(csvContent)
  } catch (err) {
    console.error('GET /dashboard/votes/export error:', err)
    res.status(500).send('Server Error')
  }
})

module.exports = router
