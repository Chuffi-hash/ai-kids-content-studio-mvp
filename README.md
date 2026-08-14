# AI Kids Content Studio

MVP starter for an AI-assisted children's content production dashboard.

## Stack
- Frontend: React + TypeScript + Vite
- Backend: Node.js + TypeScript + Express
- API: REST
- Storage: local filesystem for MVP
- AI modules: stubbed service interfaces ready to connect to real providers

## Run

### Backend
```bash
cd backend
npm install
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:5173
Backend: http://localhost:5000

## Current modules
- Story Generator
- Character Manager
- Scene Generator
- Voice Generator
- Video Generator
- Thumbnail Generator
- YouTube Publisher
- Storage

The first version intentionally uses mock generators so the architecture can be developed before adding paid AI APIs.
