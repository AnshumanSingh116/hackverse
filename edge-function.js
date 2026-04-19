// ============================================================
// Supabase Edge Function: create-team
// Deploy at: supabase/functions/create-team/index.ts
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No authorization header')

    // FIX 1: Use anon key + user token to verify identity (fixes ES256 JWT algorithm error)
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_ANON_KEY'),
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser()
    if (userErr || !user) throw new Error('Unauthorized: ' + (userErr?.message || 'no user'))
    if (!user.email.endsWith('@admin.com')) throw new Error('Not an admin')

    // Admin client for privileged operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )

    const { school_name, student1, student2, student3, team_id, password } = await req.json()

    // FIX 2: Always lowercase team_id so it matches the email Supabase auth generates
    const normalizedTeamId = team_id.toLowerCase()

    // 1. Create Auth user
    const { data: newUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: `${normalizedTeamId}@decagon.com`,
      password: password,
      email_confirm: true,
    })
    if (authErr) throw new Error('Auth user creation failed: ' + authErr.message)

    // 2. Insert teams row
    const { error: teamErr } = await supabaseAdmin.from('teams').insert({
      school_name,
      student1: student1 || null,
      student2: student2 || null,
      student3: student3 || null,
      team_id: normalizedTeamId,  // FIX 2: store lowercase
      password,
    })
    if (teamErr) {
      // FIX 3: Rollback using the user id directly (not by searching all users)
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
      throw new Error('Team insert failed: ' + teamErr.message)
    }

    return new Response(JSON.stringify({ success: true, team_id: normalizedTeamId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
