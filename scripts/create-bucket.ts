/**
 * Creates the private "lecture-audio" storage bucket.
 *
 * NOTE: Supabase's FREE tier caps individual object size at 50 MB, so a
 * 200 MB fileSizeLimit is rejected by the API (HTTP 413). We therefore
 * create the bucket without an explicit limit (it inherits the plan max).
 * If you later move to Pro (1 GB object limit), set fileSizeLimit there.
 *
 * Usage: npx tsx scripts/create-bucket.ts
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

async function main() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set')
    process.exit(1)
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase.storage.createBucket('lecture-audio', {
    public: false,
  })
  if (error) {
    if (error.message.includes('already exists')) {
      console.log('Bucket "lecture-audio" already exists.')
      return
    }
    console.error('createBucket error:', error.message)
    process.exit(1)
  }
  console.log('Created bucket "lecture-audio":', data)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
