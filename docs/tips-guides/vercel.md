# Vercel deployment [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/cgoinglove/mcp-client-chatbot&env=GOOGLE_GENERATIVE_AI_API_KEY&env=OPENAI_API_KEY&env=XAI_API_KEY&env=ANTHROPIC_API_KEY&env=POSTGRES_URL&env=AUTH_SECRET)

## How to deploy 
1. Click the button at the top of the page
2. Fill in postgres and auth secret
You can get postgres from vercel or neon or basically any provider. Get auth secret from [here](https://auth-secret-gen.vercel.app/). Then fill in the AI api you want and the ones you don't want - just spam your keyboard (they won't work - vercel just requires you to fill them in.)
## What is supported and was is not
- SSE based MCP servers
- STDIO based MCP servers are not supported 
- Every other feature. 
### If you need STDIO use docker (render should work)