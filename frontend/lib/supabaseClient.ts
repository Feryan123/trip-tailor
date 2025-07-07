import { createClient } from '@supabase/supabase-js'
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxmc3RoeWN0a251ZWRzZmppZndhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE4OTg0NjcsImV4cCI6MjA2NzQ3NDQ2N30.4Y_E_Q0XN0n8svTzVbZd4mAFk0iSNKvnpOftIisYPns'
const url = 'https://lfsthyctknuedsfjifwa.supabase.co'

const supabase = createClient(url, key)

export default supabase