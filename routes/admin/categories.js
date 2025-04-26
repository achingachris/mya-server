const express = require('express')
const router = express.Router()

const NominationCategory = require('../../models/NominationCategory')

const { authMiddleware } = require('../../middleware/auth')

// List Categories
router.get('', authMiddleware, async (req, res) => {
  try {
    const categories = await NominationCategory.find()
    // Assuming views/admin/categories/index.ejs
    res.render('categories/index', { categories })
  } catch (err) {
    console.error('GET /admin/categories error:', err)
    res.status(500).send('Server Error')
  }
})

// New Category Form
router.get('/new', authMiddleware, (req, res) =>
  // Assuming views/admin/categories/new.ejs
  res.render('categories/new')
)

// Create Category
router.post('', authMiddleware, async (req, res) => {
  try {
    // Basic validation - you might need more robust validation
    if (!req.body.name) {
      // Assuming 'name' is the primary field
      return res
        .status(400)
        .send('Category name is required')
    }
    await NominationCategory.create(req.body)
    res.redirect('')
  } catch (err) {
    console.error(
      'POST /dashboard/nomination-categories error:',
      err
    )
    // You might want to re-render the form again with error messages
    res.status(500).send('Error creating category')
  }
})

// Edit Category Form
router.get(
  '/:id/edit',
  authMiddleware,
  async (req, res) => {
    try {
      const category = await NominationCategory.findById(
        req.params.id
      )
      if (!category) {
        return res.status(404).send('Category not found')
      }
      // Assuming views/admin/categories/edit.ejs
      res.render('categories/edit', { category })
    } catch (err) {
      console.error(
        `GET /dashboard/nomination-categories/${req.params.id}/edit error`,
        err
      )
      res.status(500).send('Server Error')
    }
  }
)

// Update Category
router.put(
  '/dashboard/nomination-categories/:id',
  authMiddleware,
  async (req, res) => {
    try {
      // Basic validation - you might need more robust validation
      if (!req.body.name) {
        // Assuming 'name' is the primary field
        return res
          .status(400)
          .send('Category name is required')
      }
      const category =
        await NominationCategory.findByIdAndUpdate(
          req.params.id,
          req.body,
          { new: true } // Return the updated document
        )
      if (!category) {
        return res.status(404).send('Category not found')
      }
      res.redirect('/admin/categories')
    } catch (err) {
      console.error(
        `PUT /admin/categories/${req.params.id} error:`,
        err
      )
      res.status(500).send('Error updating category')
    }
  }
)

// Delete Category
router.delete(
  '/dashboard/nomination-categories/:id',
  authMiddleware,
  async (req, res) => {
    try {
      const category =
        await NominationCategory.findByIdAndDelete(
          req.params.id
        )
      if (!category) {
        return res.status(404).send('Category not found')
      }
      // TODO: Add logic to handle nominees linked to this category (e.g., prevent deletion if linked nominees exist, or nullify the reference)
      res.redirect('/admin/categories')
    } catch (err) {
      console.error(
        `DELETE /admin/categories/${req.params.id} error:`,
        err
      )
      res.status(500).send('Error deleting category')
    }
  }
)

module.exports = router
