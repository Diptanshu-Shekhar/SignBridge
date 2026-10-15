const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  // Get token from request header
  const header = req.header('Authorization') || '';
  const token = header.replace('Bearer ', '').trim();

  if (!token || token === 'null' || token === 'undefined') {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    const message = error.name === 'TokenExpiredError'
      ? 'Token has expired, please log in again'
      : 'Token is not valid';
    res.status(401).json({ message });
  }
};

module.exports = authMiddleware;
