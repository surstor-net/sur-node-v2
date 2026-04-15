# Install Covia as a Windows Task Scheduler task that runs at user login
# Run once as Administrator: powershell -ExecutionPolicy Bypass -File covia-autostart-install.ps1

$TaskName   = "CoviaAutostart"
$ScriptPath = "C:\Users\rich\PROJECTS\sur-v2\covia-start.bat"
$User       = $env:USERNAME

# Remove existing task if present
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# Build the action and trigger
$Action   = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$ScriptPath`""
$Trigger  = New-ScheduledTaskTrigger -AtLogOn -User $User
$Settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 2) `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable:$false

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -RunLevel Highest `
    -Description "Start Covia venue before Claude Desktop loads sur-node-v2" `
    -Force

Write-Host "Task '$TaskName' registered. Covia will start automatically at login."
Write-Host "  To test:   schtasks /run /tn $TaskName"
Write-Host "  To remove: Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false"
