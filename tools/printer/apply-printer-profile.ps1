# Re-apply the saved printer defaults (e.g. after a driver reinstall or on a new PC).
#   powershell -ExecutionPolicy Bypass -File apply-printer-profile.ps1 [-Profile brother-dcp-t830dw.json]
param([string]$Profile = (Join-Path $PSScriptRoot "brother-dcp-t830dw.json"))
$p = Get-Content $Profile -Raw | ConvertFrom-Json
if (-not (Get-Printer -Name $p.printer -ErrorAction SilentlyContinue)) { Write-Error "Printer '$($p.printer)' not installed"; exit 1 }
Set-PrintConfiguration -PrinterName $p.printer -PaperSize $p.defaults.PaperSize -DuplexingMode $p.defaults.DuplexingMode -Color $p.defaults.Color
$c = Get-PrintConfiguration -PrinterName $p.printer
"{0}: Paper={1} Duplex={2} Color={3}" -f $p.printer, $c.PaperSize, $c.DuplexingMode, $c.Color
if ($c.PaperSize -ne $p.defaults.PaperSize -or $c.DuplexingMode -ne $p.defaults.DuplexingMode) { Write-Error "Profile did not stick"; exit 1 }
