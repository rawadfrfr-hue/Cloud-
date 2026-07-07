import fs from 'fs';
let code = fs.readFileSync('src/components/ShortLinkPage.tsx', 'utf8');

code = code.replace(
  'import { doc, getDoc } from "firebase/firestore";',
  'import { useParams, useNavigate } from "react-router-dom";\nimport { doc, getDoc } from "firebase/firestore";'
);

code = code.replace(
  '  // Extract code from /s/CODE\n  const shortCode = window.location.pathname.split("/s/")[1]?.split("/")[0] || "";',
  '  const { shortCode } = useParams();\n  const navigate = useNavigate();'
);

code = code.replace(
  'onClick={() => window.location.href = "/"}',
  'onClick={() => navigate("/")}'
);

fs.writeFileSync('src/components/ShortLinkPage.tsx', code);
