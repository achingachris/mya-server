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
  if (!token)
    return res
      .status(401)
      .json({ error: 'No token provided' })

  try {
    jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' })
  }
}

module.exports = { authMiddleware, apiAuthMiddleware }
