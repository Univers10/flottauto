$pgHba = 'C:\Program Files\PostgreSQL\18\data\pg_hba.conf'
Copy-Item $pgHba "$pgHba.bak" -Force
(Get-Content $pgHba) | ForEach-Object {
    if ($_ -match '^host\s+') {
        if ($_ -match '127\.0\.0\.1/32' -or $_ -match '::1/128') {
            $_ -replace '\S+$', 'trust'
        } else {
            $_
        }
    } else {
        $_
    }
} | Set-Content $pgHba
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' reload -D 'C:\Program Files\PostgreSQL\18\data'
