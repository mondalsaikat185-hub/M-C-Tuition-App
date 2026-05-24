Set-Location "C:\Users\monda\Desktop\Tution Application"
$filePath = "C:\Users\monda\Desktop\Tution Application\src\pages\AdminLibrary.tsx"
$content = Get-Content -Path $filePath -Raw -Encoding UTF8

# Replace onSnapshot collection query with 30-sec polling
$oldCode = '  useEffect(() => {
    const q = query(
      collection(db, ''examSessions''),
      where(''isActive'', ''=='', true)
    );
    const unsub = onSnapshot(q, snap => {
      setActiveSessionsList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);'

$newCode = '  useEffect(() => {
    // QUOTA FIX: replaced onSnapshot with getDocs + 30-sec polling
    const fetchActiveSessions = async () => {
      const q = query(
        collection(db, ''examSessions''),
        where(''isActive'', ''=='', true),
        limit(10)
      );
      const snap = await getDocs(q);
      setActiveSessionsList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetchActiveSessions();
    const interval = setInterval(fetchActiveSessions, 30 * 1000);
    return () => clearInterval(interval);
  }, []);'

if ($content.Contains($oldCode)) {
    $content = $content.Replace($oldCode, $newCode)
    Write-Host "SUCCESS: onSnapshot replaced with 30-sec polling."
} elseif ($content.Contains("fetchActiveSessions")) {
    Write-Host "Already fixed - fetchActiveSessions found."
} else {
    Write-Host "WARNING: Pattern not matched. Showing lines 55-70:"
    $lines = $content -split "`n"
    for ($i = 54; $i -lt 70 -and $i -lt $lines.Count; $i++) {
        Write-Host "$($i+1): $($lines[$i])"
    }
}

# Add limit to imports if missing
if (-not ($content -match "deleteField, limit")) {
    $content = $content.Replace(
        "import { collection, query, getDocs, doc, setDoc, deleteDoc, serverTimestamp, writeBatch, where, addDoc, updateDoc, onSnapshot, getDoc, deleteField } from 'firebase/firestore';",
        "import { collection, query, getDocs, doc, setDoc, deleteDoc, serverTimestamp, writeBatch, where, addDoc, updateDoc, onSnapshot, getDoc, deleteField, limit } from 'firebase/firestore';"
    )
    Write-Host "Added limit to imports."
}

[System.IO.File]::WriteAllText($filePath, $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "File saved."

# Verify fix
$check = Select-String -Path $filePath -Pattern "fetchActiveSessions"
if ($check) { Write-Host "VERIFIED: polling code present." } else { Write-Host "ERROR: fix not found!" }
