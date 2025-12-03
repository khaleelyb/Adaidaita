const express = require('express')
const router = express.Router()
const fetch = require('node-fetch')

// Endpoint to request Median TURN credentials or token
// Replace this with your Median API usage. This is a placeholder that
// returns the TURN server config derived from env vars.
router.get('/ice', async (req, res) => {
  const username = process.env.MEDIAN_USER || 'MEDIAN_USER'
  const credential = process.env.MEDIAN_PASS || 'MEDIAN_PASS'
  const ice = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'turn:global.turn.median.co:3478', username, credential }
  ]
  res.json({ ice })
})

module.exports = router