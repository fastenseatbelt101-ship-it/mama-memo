@echo off
echo.
echo === Step 1/3: stage changes ===
git add .

echo.
echo === Step 2/3: commit ===
git commit -m "migrate to cloudflare pages"

echo.
echo === Step 3/3: push to github ===
git push

echo.
echo ===========================================
echo  Pushed. Cloudflare will auto-deploy
echo  once it's connected to this repo.
echo ===========================================
pause
