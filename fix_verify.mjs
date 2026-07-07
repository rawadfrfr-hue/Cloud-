import fs from 'fs';
let verifyCode = fs.readFileSync('src/components/VerifyEmailPage.tsx', 'utf8');
verifyCode = "import { useNavigate } from 'react-router-dom';\n" + verifyCode;
fs.writeFileSync('src/components/VerifyEmailPage.tsx', verifyCode);
