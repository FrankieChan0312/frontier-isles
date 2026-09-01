# Start Here

## Recommended workflow

1. Create or open an empty project repository folder.
2. Place this foundation bundle at the repository root.
3. Initialize Git if needed.
4. Open the repository in Codex.
5. Paste the full contents of `tasks/CODEX_TASK_00_PROMPT.txt` into Codex.
6. Review Codex's diff before accepting it.
7. Verify `npm run check` locally.
8. Commit Task 00 only after review.

## PowerShell example

```powershell
cd "C:\Users\user\Desktop\Fullstack Software Engineering\Project"
New-Item -ItemType Directory -Path ".\frontier-isles" -Force | Out-Null
cd ".\frontier-isles"
git init
```

Then copy the bundle contents into that folder and run the Codex task.

Do not run `npm create vite@latest .` manually after placing the documents unless you are prepared to handle the non-empty directory. Task 00 explicitly tells Codex to scaffold in a temporary directory and merge safely.
