import fs from 'fs';

let verifyCode = fs.readFileSync('src/components/VerifyEmailPage.tsx', 'utf8');
verifyCode = verifyCode.replace(
  'import { Loader2, CheckCircle2, XCircle, Mail, ArrowRight } from "lucide-react";',
  'import { useNavigate } from "react-router-dom";\nimport { Loader2, CheckCircle2, XCircle, Mail, ArrowRight } from "lucide-react";'
);
verifyCode = verifyCode.replace(
  'export default function VerifyEmailPage() {',
  'export default function VerifyEmailPage() {\n  const navigate = useNavigate();'
);
verifyCode = verifyCode.replace(/window\.location\.href = '\/';/g, 'navigate("/");');
fs.writeFileSync('src/components/VerifyEmailPage.tsx', verifyCode);

let shareCode = fs.readFileSync('src/components/SharePage.tsx', 'utf8');
shareCode = shareCode.replace(
  'import NebulaLogo from "./NebulaLogo";',
  'import { useNavigate } from "react-router-dom";\nimport NebulaLogo from "./NebulaLogo";'
);
shareCode = shareCode.replace(
  'export default function SharePage({ explicitFileKey, explicitFileName }: { explicitFileKey?: string, explicitFileName?: string }) {',
  'export default function SharePage({ explicitFileKey, explicitFileName }: { explicitFileKey?: string, explicitFileName?: string }) {\n  const navigate = useNavigate();'
);
shareCode = shareCode.replace(/window\.location\.href = "\/"/g, 'navigate("/")');
fs.writeFileSync('src/components/SharePage.tsx', shareCode);

