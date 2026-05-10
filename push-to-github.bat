@echo off
echo.
echo === Step 1/7: git init ===
git init -b main

echo.
echo === Step 2/7: configure git user ===
git config user.email "fastenseatbelt101@gmail.com"
git config user.name "JoeQiao"

echo.
echo === Step 3/7: stage all files ===
git add .

echo.
echo === Step 4/7: first commit ===
git commit -m "init mama-memo"

echo.
echo === Step 5/7: remove old remote (if exists) ===
git remote remove origin 2>nul

echo.
echo === Step 6/7: add github remote ===
git remote add origin https://github.com/fastenseatbelt101-ship-it/mama-memo.git

echo.
echo === Step 7/7: push to github (browser will pop up for auth) ===
git push -u origin main

echo.
echo ===========================================
echo  ALL DONE. Check GitHub to verify.
echo  https://github.com/fastenseatbelt101-ship-it/mama-memo
echo ===========================================
pause
