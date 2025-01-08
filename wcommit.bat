@echo off
REM Change to the directory containing your git repository
REM Add all changes to the staging area
git add .

REM Commit the changes with a message
git commit -m "Malas"

REM Push the changes to the remote repository
git push origin main

REM Pause the script to see the output
pause