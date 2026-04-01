$f = 'D:\work\openclaw-workspace\LuxIso\README.md'
$c = [System.IO.File]::ReadAllText($f)

$old1 = "| P4 | **Performance** — instanced floor tile rendering; Pathfinder result cache (invalidate on collider change) |`r`n| P4 | **Performance** — Pathfinder min-heap open list (currently O(n) linear scan); _stringPull full line-of-sight simplification |"
$new1 = "| P4 | **Performance** — instanced floor tile rendering; Pathfinder min-heap open list (O(n)→O(log n)); _stringPull full LoS simplification; result cache |"

$c = $c.Replace($old1, $new1)
[System.IO.File]::WriteAllText($f, $c)
Write-Host "Done"
