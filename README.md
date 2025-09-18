# Vibe-DJ - (Work In Progress)
AI-Centric music discovery platform fully integrated with the Spotify ecosystem. Currently available at https://vibedj.io/

<img width="1490" height="921" alt="image" src="https://github.com/user-attachments/assets/68f13134-9f75-4563-8613-675d6e902e3c" />

## How it works:
- OAuth login with your Spotify account via Supabase Auth while capturing your secret-token to be used for the API requests
- Your entire spotify "Liked Songs" library is fetched in the background via batched requests and cached via Tanstack Query
- Choose a model (GPT-5 / GPT-5-mini)
- You type a prompt into the input
- A request gets sent to my supabase edge function checking your usage tier and current remaining requests
- Edeg function hits openai and gives back the response to the client
- Client send a parellel request to the spotify api searching for the songs suggested by the LLM, and appends them to the user's queue
- The songs are then cached locally and compared against the spotify queue it gets from the spotify api queue endpoint to show only songs added by the service

## Other features:
- Full monetization via stripe, 3 tiers (Free, Pro, Ultra) connected with edge functions handling the stripe webhook and granting checkout / portal sessions
- Play/Pause Prev/Next support, and song scrubbing directly connected to the spotify API
- Spotify has an extremely agressive 1h oauth token expiration, which was a big limitation to the user experience, this is solved by caching the refresh token the inital supabase oauth flow in localStorage and when the web app detecs a session expiry via a 401 from the Spotify API it sends a request to my edge function that refreshes the session.
