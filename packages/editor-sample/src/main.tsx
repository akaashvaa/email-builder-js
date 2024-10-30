import React from 'react';
import ReactDOM from 'react-dom/client';

import { CssBaseline, ThemeProvider } from '@mui/material';

import App from './App';
import theme from './theme';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <DndProvider backend={HTML5Backend}>
        <App />
      </DndProvider>
    </ThemeProvider>
  </React.StrictMode>
);
