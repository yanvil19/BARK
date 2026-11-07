import React from 'react';
import ReactDOM from 'react-dom/client';
import { MathfieldElement } from 'mathlive';
import App from './App.jsx';
import './styles/global.css';
import { ToastProvider } from './components/Toast.jsx';

// MathLive's optional sound effects are not shipped with the app, so trying to
// load them only produces failed requests for /assets/sounds/*.wav.
MathfieldElement.soundsDirectory = null;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>
);
