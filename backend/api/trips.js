const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')

// Configuration provided by user
const SUPABASE_URL = "https://bqvhiorqxiomjinlngtv.supabase.co"
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxdmhpb3JxeGlvbWppbmxuZ3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3ODM3NzcsImV4cCI6MjA4MDM1OTc3N30.hbJ0a5JIQJ4RFR8E5U9P4dwPChpB9XJzl4a_NjkOnBA"

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// create trip
router.post('/create', async (req, res) => {
  const { rider_id, pickup_lat, pickup_lng, dest_lat, dest_lng, type='ride' } = req.body
  try{
    const { data, error } = await supabase.from('trips').insert([{
      rider_id, pickup_lat, pickup_lng, dest_lat, dest_lng, status: 'requested', type
    }]).select().single()
    if(error) return res.status(500).json({ error: error.message })
    return res.json({ trip: data })
  }catch(err){
    return res.status(500).json({ error: err.message })
  }
})

// accept trip
router.post('/:id/accept', async (req, res) => {
  const { id } = req.params
  const { driver_id } = req.body
  try{
    const { data, error } = await supabase.from('trips').update({ driver_id, status: 'accepted' }).eq('id', id).select().single()
    if(error) return res.status(500).json({ error: error.message })
    // Optionally broadcast to Supabase realtime or send push
    return res.json({ trip: data })
  }catch(err){
    return res.status(500).json({ error: err.message })
  }
})

module.exports = router