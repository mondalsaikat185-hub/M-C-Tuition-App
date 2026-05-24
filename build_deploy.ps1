Set-Location "C:\Users\monda\Desktop\Tution Application"

Write-Host "=== BUILDING ===" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "BUILD FAILED! Check errors above." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "Build OK" -ForegroundColor Green

Write-Host "=== DEPLOYING ===" -ForegroundColor Cyan
npx firebase-tools deploy --only hosting
if ($LASTEXITCODE -ne 0) {
    Write-Host "DEPLOY FAILED!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "Deploy OK" -ForegroundColor Green

Write-Host "=== GIT PUSH ===" -ForegroundColor Cyan
if (Test-Path ".git\index.lock") { Remove-Item ".git\index.lock" -Force }
if (Test-Path ".git\HEAD.lock")  { Remove-Item ".git\HEAD.lock"  -Force }
git add -A
git commit -m "Quota fix FINAL: limit(300) on fetchFolderContent, limit(20) on batches, cache PDF chunks, clearCache on refresh, cache settings, sessionStorage exam join"
git push origin main
Write-Host "=== ALL DONE ===" -ForegroundColor Green
Read-Host "Press Enter to close"
