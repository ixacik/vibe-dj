import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import OpenAI from 'https://deno.land/x/openai@v4.24.0/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  prompt: string;
  conversationHistory: Array<{ role: string; content: string }>;
  recentTracks: Array<{ artist: string; title: string }>;
  selectedSongs: Array<{ artist: string; title: string }>;
  model: 'gpt-5' | 'gpt-4' | 'gpt-3.5-turbo';
}

interface SongRecommendation {
  recommendations: Array<{
    artist: string;
    title: string;
    reason: string;
  }>;
  djMessage: string;
  promptSummary: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user JWT
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: RequestBody = await req.json();
    const { prompt, conversationHistory, recentTracks, selectedSongs, model } = body;

    // Initialize OpenAI
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const openai = new OpenAI({ apiKey: openaiApiKey });

    // Fetch user's loved songs from database
    const { data: lovedSongs } = await supabase
      .from('loved_songs')
      .select('name, artist')
      .eq('user_id', user.id)
      .order('loved_at', { ascending: false })
      .limit(50);

    // Build system prompt
    const systemPrompt = `You are VibeDJ, an AI music curator. Your goal is to recommend songs that match the user's request while maintaining a great listening experience.

${selectedSongs.length > 0 ? `User's selected favorite songs for context:\n${selectedSongs.map(s => `- ${s.artist} - ${s.title}`).join('\n')}` : ''}

${lovedSongs && lovedSongs.length > 0 ? `\nUser's recently loved songs:\n${lovedSongs.slice(0, 10).map(s => `- ${s.artist} - ${s.name}`).join('\n')}` : ''}

${recentTracks.length > 0 ? `\nRecently played/queued tracks:\n${recentTracks.slice(0, 10).map(t => `- ${t.artist} - ${t.title}`).join('\n')}` : ''}

Guidelines:
- Recommend 3-5 songs that match the request
- Consider the user's music taste from their loved songs
- Avoid recommending songs that were recently played
- Provide brief reasons for each recommendation
- Be conversational and engaging`;

    // Build messages array
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...conversationHistory.slice(-5), // Keep last 5 messages for context
      { role: 'user' as const, content: prompt }
    ];

    // Call OpenAI with structured output
    const completion = await openai.chat.completions.create({
      model: model === 'gpt-5' ? 'gpt-4-turbo-preview' : model, // Fallback since gpt-5 doesn't exist
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.8,
      max_tokens: 1000,
    });

    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error('No response from OpenAI');
    }

    const recommendations: SongRecommendation = JSON.parse(responseContent);

    // Store conversation in database
    const { data: session } = await supabase
      .from('user_sessions')
      .select('id, conversation_history')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (session) {
      // Update existing session
      const updatedHistory = [
        ...(session.conversation_history as any[]),
        { role: 'user', content: prompt, timestamp: new Date().toISOString() },
        { role: 'assistant', content: recommendations.djMessage, recommendations: recommendations.recommendations, timestamp: new Date().toISOString() }
      ];

      await supabase
        .from('user_sessions')
        .update({
          conversation_history: updatedHistory,
          updated_at: new Date().toISOString()
        })
        .eq('id', session.id);
    } else {
      // Create new session
      await supabase
        .from('user_sessions')
        .insert({
          user_id: user.id,
          conversation_history: [
            { role: 'user', content: prompt, timestamp: new Date().toISOString() },
            { role: 'assistant', content: recommendations.djMessage, recommendations: recommendations.recommendations, timestamp: new Date().toISOString() }
          ]
        });
    }

    return new Response(
      JSON.stringify(recommendations),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );

  } catch (error) {
    console.error('Error in get-recommendations:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }
});