import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { ThemeProvider } from 'styled-components';
import * as euiVars from '@elastic/eui/dist/eui_theme_light.json';
import '@elastic/eui/dist/eui_theme_amsterdam_light.css';

ReactDOM.render(
    <React.StrictMode>
        <ThemeProvider theme={euiVars}>
            <App />
        </ThemeProvider>
    </React.StrictMode>,
    document.getElementById('root')
);

reportWebVitals();
