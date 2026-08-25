import re
with open('src/components/company/CompanyDeepDive.tsx', 'r') as f:
    c = f.read()

c = c.replace("import { X, ExternalLink, Activity, Building2, Wallet, Banknote, ShieldAlert, ArrowRight, CheckCircle2 } from 'lucide-react';",
"import { X, ExternalLink, Activity, Building2, Wallet, Banknote, ShieldAlert, ArrowRight, CheckCircle2, AlertTriangle } from 'lucide-react';")

with open('src/components/company/CompanyDeepDive.tsx', 'w') as f:
    f.write(c)

