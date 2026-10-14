import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './ui-details.css'
import './motion-premium.css'
import { initMotion } from './motion.ts'

// 高级动效引擎：3D 倾斜 / 磁性悬停 / 涟漪 / 滚动揭示 / 吸顶 / 光标光晕
initMotion();

// Global animation keyframes
const style = document.createElement('style');
style.textContent = `
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "HarmonyOS Sans SC", "Noto Sans SC", "Microsoft YaHei", sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }
  h1, h2, h3, h4 { letter-spacing: 0.02em; }
  button { letter-spacing: 0.01em; }
`;
document.head.appendChild(style);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
