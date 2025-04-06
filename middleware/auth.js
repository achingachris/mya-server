const jwt = require('jsonwebtoken')

const authMiddleware = (req, res, next) => {
  const token = req.cookies.token
  if (!token) return res.redirect('/admin/login')

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    )
    req.admin = decoded
    next()
  } catch (err) {
    res.redirect('/admin/login')
  }
}

const apiAuthMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]
  const hardcodedToken =
    'TOKENIZATION'

  if (!token) {
    return res
      .status(401)
      .json({ error: 'No token provided' })
  }
  if (token !== hardcodedToken) {
    return res.status(401).json({ error: 'Invalid token' })
  }
  next() // Proceed if the token matches
}

module.exports = { authMiddleware, apiAuthMiddleware }
