import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Add router imports
code = code.replace(
  'import { \n  Cloud, Loader2',
  'import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";\nimport { \n  Cloud, Loader2'
);

// 2. Change `export default function App() {` to `function AppContent() {`
code = code.replace('export default function App() {', 'function AppContent() {\n');

// 3. We need to wrap the `verificationSent`, `!user` (landing page), and `Dashboard` into an inner component.
// First, find everything from `if (verificationSent) {` up to `return (\n    <div className="min-h-screen bg-[#0d1117]...` and the end.
// We can just use an IIFE inside the Route. Or define `AuthLayer` at the top of the file, but we need the state!
// It's much easier to just put a `return <Routes>...` at the top of the render block.

const topOfRender = `
  const renderAuthLayer = () => {
`;

code = code.replace('  if (verificationSent) {', topOfRender + '  if (verificationSent) {');

// Replace the end of AppContent
code = code.replace(
  '      <Dashboard user={user} />\n    </div>\n  );\n}',
  `      <Dashboard user={user} />\n    </div>\n  );\n  };\n\n  return (\n    <Routes>\n      <Route path="/share" element={<SharePage />} />\n      <Route path="/verify" element={<VerifyEmailPage />} />\n      <Route path="/s/:shortCode" element={<ShortLinkPage />} />\n      <Route path="*" element={renderAuthLayer()} />\n    </Routes>\n  );\n}\n\nexport default function App() {\n  return (\n    <Router>\n      <AppContent />\n    </Router>\n  );\n}`
);

// 4. Remove `const isShareView = ...`
code = code.replace(/  const isShareView = [^\n]+\n/g, '');
code = code.replace(/  const isVerifyView = [^\n]+\n/g, '');
code = code.replace(/  const isShortLinkView = [^\n]+\n/g, '');

// 5. Replace `if (isShareView) return <SharePage />;` block with the <Routes> structure.
const ifShareViewRegex = /  \/\/ Render the public SharePage view bypass for guests or users alike\n  if \(isShareView\) {\n    return <SharePage \/>;\n  }\n\n  if \(isVerifyView\) {\n    return <VerifyEmailPage \/>;\n  }\n\n  if \(isShortLinkView\) {\n    return <ShortLinkPage \/>;\n  }/g;

code = code.replace(ifShareViewRegex, '');

fs.writeFileSync('src/App.tsx', code);
