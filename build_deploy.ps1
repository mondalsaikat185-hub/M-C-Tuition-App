Set-Location "C:\Users\monda\Desktop\Tution Application"

Write-Host "=== STEP 1: Building ===" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "BUILD FAILED!" -ForegroundColor Red; exit 1 }
Write-Host "Build SUCCESS" -ForegroundColor Green

Write-Host "=== STEP 2: Deploying to Firebase ===" -ForegroundColor Cyan
npx firebase-tools deploy --only hosting
if ($LASTEXITCODE -ne 0) { Write-Host "DEPLOY FAILED!" -ForegroundColor Red; exit 1 }
Write-Host "Deploy SUCCESS" -ForegroundColor Green

Write-Host "=== STEP 3: Git commit & push ===" -ForegroundColor Cyan
# Remove stale lock files
if (Test-Path ".git\index.lock") { Remove-Item ".git\index.lock" -Force }
if (Test-Path ".git\HEAD.lock") { Remove-Item ".git\HEAD.lock" -Force }

git add -A
git commit -m "Quota fix: cache settings/general read, sessionStorage for exam joins, cache simulated student"
git push origin main
if ($LASTEXITCODE -ne 0) { Write-Host "GIT PUSH FAILED!" -ForegroundColor Red; exit 1 }
Write-Host "Git push SUCCESS" -ForegroundColor Green

Write-Host ""
Write-Host "=== ALL DONE ===" -ForegroundColor Green
