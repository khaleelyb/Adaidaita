const express = require('express')
const router = express.Router()
const fetch = require('node-fetch')

router.post('/onesignal', async (req, res) => {
  const { heading, content, include_player_ids } = req.body
  const ONE_SIGNAL_API_KEY = process.env.ONE_SIGNAL_API_KEY
  const body = {
    app_id: process.env.ONE_SIGNAL_APP_ID,
    headings: { en: heading },
    contents: { en: content },
    include_player_ids
  }

  try{
    const r = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: { 'Authorization': `Basic ${ONE_SIGNAL_API_KEY}`, 'Content-Type':'application/json' },
      body: JSON.stringify(body)
    })
    const j = await r.json()
    res.json(j)
  }catch(err){
    res.status(500).json({ error: err.message })
  }
})

module.exports = router