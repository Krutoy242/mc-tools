# Watch when Peggy grammar is changed to apply formatting

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = ".\mc-tools\packages\format\src\"
$watcher.Filter = "zenscript.peggy"
$watcher.EnableRaisingEvents = $true

$action = {
    $log = "File changed at $(Get-Date)"
    Write-Output $log
    & esno "mc-tools\packages\format\src\cli" "scripts\process.zs" --nolint
}

$onChange = Register-ObjectEvent $watcher "Changed" -Action $action

while ($true) {
    if ($watcher.WaitForChanged([System.IO.WatcherChangeTypes]::Changed)) {
        $log = "Watcher detected change at $(Get-Date)"
        Write-Output $log
    }
}