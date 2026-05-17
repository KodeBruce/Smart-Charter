import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { FirebaseProvider } from './lib/FirebaseProvider';
import { VoiceProvider } from './contexts/VoiceContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FirebaseProvider>
      <VoiceProvider>
        <App />
      </VoiceProvider>
    </FirebaseProvider>
  </StrictMode>,
);
