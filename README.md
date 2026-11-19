# Commerce Intelligence

A Vercel-ready e-commerce analytics workspace inspired by the E-Commerce Customer Behaviour Intelligence Using Hybrid RAG project.

## Showcase features
- Browser-side CSV upload and schema profiling.
- Product, visitor, event-funnel and time-trend analytics.
- Natural-language question shortcuts for supported analytical intents.
- Knowledge ingestion for TXT and Markdown documents.
- Lightweight browser-side keyword retrieval with source excerpts.
- Optional server-side grounded answer generation with Gemini 2.5 Flash.
- Responsive dashboard and chat interface.

## Local development
```bash
npm install
npm run dev
```

## Production build
```bash
npm run build
npm run preview
```

## Deploy to Vercel
Import this GitHub repository into Vercel. Vercel should detect Vite. Use:
- Build command: `npm run build`
- Output directory: `dist`

After import, pushes to the production branch trigger deployments. See [Vercel Git deployment docs](https://vercel.com/docs/git).

## Optional LLM answer generation
Add `GEMINI_API_KEY` as a server-side environment variable in Vercel Project Settings → Environment Variables, then redeploy. The API key must never be placed in browser code or committed to the repository. Without it, browser-side analytics and retrieval remain available, but generated LLM synthesis is disabled.

## Data and RAG transparency
- The built-in demonstration dataset is synthetic and labelled as such.
- Upload a real CSV to analyze its records in the browser.
- The hosted knowledge panel uses lightweight keyword-based chunk retrieval; it does not connect to the original local Qdrant index or the original Python hybrid retriever.
- The original Python Streamlit + Ollama + Qdrant application remains a separate local deployment target.
- Column matching is heuristic. Revenue and other commercial metrics require the corresponding fields in the uploaded data.
- The app does not claim unique-customer conversion or revenue unless the uploaded data supports those calculations.
