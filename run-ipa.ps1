clear
robocopy "T:\main\development\Projects\ios-apps\eas-games" "$env:LOCALAPPDATA\eas-games-ipa-build\worktree" /MIR /XD node_modules .git dist .expo artifacts /NFL /NDL /NJH /NJS /NP
cd "$env:LOCALAPPDATA\eas-games-ipa-build\worktree"
& "$HOME\.pnpm-global\pnpm.cmd" install --node-linker=hoisted
npx expo start --go