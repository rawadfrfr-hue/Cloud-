import fs from 'fs';
let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

// Add imports
code = code.replace(
  'import { LogOut, Upload, File, ',
  'import { useLocation, useNavigate } from "react-router-dom";\nimport { LogOut, Upload, File, '
);

// Replace useState for activeTab and currentFolderId
code = code.replace(
  '  const [activeTab, setActiveTab] = useState<"files" | "starred" | "recent" | "trash" | "account">("files");\n  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);',
  `  const location = useLocation();
  const navigate = useNavigate();

  const pathParts = location.pathname.split('/').filter(Boolean);
  
  let activeTab = "files";
  let currentFolderId = null;

  if (pathParts[0] === 'folder' && pathParts[1]) {
    activeTab = "files";
    currentFolderId = pathParts[1];
  } else if (["starred", "recent", "trash", "account"].includes(pathParts[0])) {
    activeTab = pathParts[0];
  }

  const setActiveTab = (tab) => {
    if (tab === "files") navigate('/');
    else navigate(\`/\${tab}\`);
  };

  const setCurrentFolderId = (folderId) => {
    if (folderId) navigate(\`/folder/\${folderId}\`);
    else navigate('/');
  };`
);

// We should replace any calls that set both at the same time:
// `setActiveTab('files'); setCurrentFolderId(null);` -> `navigate('/');`
code = code.replace(/setActiveTab\('files'\);\s*setCurrentFolderId\(null\);/g, "navigate('/');");
code = code.replace(/setCurrentFolderId\(null\);\s*setActiveTab\('files'\);/g, "navigate('/');");

// `setActiveTab('recent'); setCurrentFolderId(null);` -> `navigate('/recent');`
code = code.replace(/setActiveTab\('recent'\);\s*setCurrentFolderId\(null\);/g, "navigate('/recent');");

// `setActiveTab('starred'); setCurrentFolderId(null);` -> `navigate('/starred');`
code = code.replace(/setActiveTab\('starred'\);\s*setCurrentFolderId\(null\);/g, "navigate('/starred');");

// `setActiveTab('trash'); setCurrentFolderId(null);` -> `navigate('/trash');`
code = code.replace(/setActiveTab\('trash'\);\s*setCurrentFolderId\(null\);/g, "navigate('/trash');");

// `setActiveTab('account'); setCurrentFolderId(null);` -> `navigate('/account');`
code = code.replace(/setActiveTab\('account'\);\s*setCurrentFolderId\(null\);/g, "navigate('/account');");

fs.writeFileSync('src/components/Dashboard.tsx', code);
