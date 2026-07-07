import fs from 'fs';
let code = fs.readFileSync('src/components/SharePage.tsx', 'utf8');
code = code.replace(
  'export default function SharePage({ explicitFileKey, explicitFileName }: SharePageProps = {}) {',
  'export default function SharePage({ explicitFileKey, explicitFileName }: SharePageProps = {}) {\n  const navigate = useNavigate();'
);
fs.writeFileSync('src/components/SharePage.tsx', code);
