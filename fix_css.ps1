param()

$file = "css/custom.css"
$content = [System.IO.File]::ReadAllText($file)

$marker = "`t.process-item::after {`r`n`t`tdisplay: none;`r`n`t}`r`n`r`n/* Mobile */"

if ($content.Contains($marker)) {
    $insert = "`t.process-item::after {`r`n`t`tdisplay: none;`r`n`t}`r`n`r`n/* Tablet */`r`n@media (max-width: 991px) and (min-width: 768px) {`r`n`r`n`t.process-icon {`r`n`t`twidth: 85px;`r`n`t`theight: 85px;`r`n`t}`r`n`r`n`t.process-icon i {`r`n`t`tfont-size: 32px;`r`n`t}`r`n`r`n`t.process-item h3 {`r`n`t`tfont-size: 11px;`r`n`t}`r`n`r`n}`r`n`r`n/* Mobile */"
    $content = $content.Replace($marker, $insert)
    [System.IO.File]::WriteAllText($file, $content)
    Write-Host "Done"
} else {
    Write-Host "Marker not found"
}
