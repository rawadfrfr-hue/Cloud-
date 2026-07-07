import fs from 'fs';
let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

code = code.replace(
  '  const [activeTab, setActiveTab] = useState<"files" | "starred" | "recent" | "trash" | "account">("files");',
  `  const location = useLocation();
  const navigate = useNavigate();

  const pathParts = location.pathname.split('/').filter(Boolean);
  
  let activeTab: "files" | "starred" | "recent" | "trash" | "account" = "files";
  let currentFolderIdState: string | null = null;

  if (pathParts[0] === 'folder' && pathParts[1]) {
    activeTab = "files";
    currentFolderIdState = pathParts[1];
  } else if (["starred", "recent", "trash", "account"].includes(pathParts[0])) {
    activeTab = pathParts[0] as any;
  }
`
);

code = code.replace(
  '  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);',
  `  const currentFolderId = currentFolderIdState;
  
  const setCurrentFolderId = (folderId: string | null) => {
    if (folderId) navigate(\`/folder/\${folderId}\`);
    else navigate('/');
  };`
);

fs.writeFileSync('src/components/Dashboard.tsx', code);
