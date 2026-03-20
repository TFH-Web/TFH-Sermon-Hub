1. I cloned the dev branch from June

2. on the Frontend folder, I typed in the commands like "npm install" then "npm run dev". Just to test if it works and if you want to cancel the local host, do Ctlr C on the terminal.

3. I added the missing libraries that I made my modifications work, so I typed "npm install react-router-dom @tanstack/react-query axios".
	This adds the reach router, tanstack query, and axios all together
	React router dom is a routing library for React web apps and gives you things like useNavigate.
	Tanstack query is a data-fetching and caching library which fetch /api/search, cache the response, and manage loading and error states.
	Axios is the HTTP client that sends requests to the backend and talks to the Flask API.

4. I added server: {proxy: {'/api': {target: 'http://127.0.0.1:5000',changeOrigin: true,},},}, into vite.config.ts and this fixed my issue with the Frontend not communicating with Flask.

5. I modified the main.tsx by adding, import AISearchResults from './AISearchResults.tsx'; and <Route path="/ai-search/results" element={<AISearchResults />} />
	Also added const queryClient = new QueryClient(); and <QueryClientProvider client={queryClient}> </QueryClientProvider>
	const queryClient = new QueryClient(); <- this creates the React Query manager and allows TanStack to interact with the query cache also holds the cache/config for the queries.
	<QueryClientProvider client={queryClient}> <- makes the client available to the rest of React and will share it with all the components within it.

6. I added @app.get("/api/search") to the main.py that reads query parameters like q, type, speaker, and date.
	It filters the sermon, transcripts, and note results
	sorts them by ai_score
	then returns JSON

7. I used Poetry to install the backend dependencies and it should there in the backend called .venv

8. I modified the main.py so its "from flask import Flask, jsonify, request" and not "from flask import Flask"

Note: I used PowerShell terminal on vs code to execute these commands. I am sure it works with Git Bash too.
9. For the first terminal, I run .\.venv\Scripts\python.exe -m pip install Flask and .\.venv\Scripts\python.exe .\main.py on the Backend folder
	Second terminal, I run npm run dev on the Frontend folder
	This allows you to access the project on the web, it should be called "localhost:5173" and you either press it to follow link or just type it in your URL.

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
